import { createInterface } from 'readline';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { runInNewContext } from 'vm';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadTools() {
  const tools = {};
  const toolsDir = join(__dirname, 'tools');
  try {
    const toolFiles = await fs.readdir(toolsDir);
    for (const file of toolFiles) {
      if (file.endsWith('.js')) {
        const toolName = file.replace('.js', '');
        const module = await import(`file://${join(toolsDir, file)}`);
        if (module.default) {
          tools[toolName] = module.default;
        } else {
          console.warn(`Tool ${file} does not have a default export and will be skipped.`);
        }
      }
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('Error loading tools:', e);
  }
  return tools;
}

class Agent {
  constructor() {
    this.openai = new OpenAI();
    this.tools = {};
  }

  async initialize() {
    const staticTools = {
      web_search: {
        description: 'Search Google for information. Use this to find articles, documentation, or answers to questions.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'The search query. Be specific for better results. E.g., "how to use react hooks".' } },
          required: ['query']
        },
        execute: async ({ query }) => {
          const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`);
          const { items = [] } = await res.json();
          return items.slice(0, 5).map(({ title, link, snippet }) => ({ title, link, snippet }));
        }
      },
      file_system: {
        description: "Performs operations on the file system: reading, writing, or deleting files/directories. For 'write', `content` is required. For 'delete', it recursively removes directories.",
        parameters: {
          type: 'object',
          properties: {
            operation: { type: 'string', description: 'The operation to perform: "read" to view file content, "write" to save content to a file, "delete" to remove a file or directory.', enum: ['read', 'write', 'delete'] },
            path: { type: 'string', description: 'Path to the file or directory, e.g., `src/components/MyComponent.js` or `output/results.txt`.' },
            content: { type: 'string', description: 'The string content to write to the file. Only used with the "write" operation.' }
          },
          required: ['operation', 'path']
        },
        execute: async ({ operation, path, content }) => {
          switch (operation) {
            case 'read':
              return fs.readFile(path, 'utf8');
            case 'write':
              if (content === undefined) throw new Error('`content` is required for "write" operation.');
              await fs.mkdir(dirname(path), { recursive: true });
              await fs.writeFile(path, content);
              return `Written: ${path}`;
            case 'delete':
              await fs.rm(path, { recursive: true, force: true });
              return `Deleted: ${path}`;
            default:
              throw new Error(`Invalid operation: ${operation}. Must be 'read', 'write', or 'delete'.`);
          }
        }
      },
      execute_command: {
        description: 'Execute a single, non-interactive shell command. Useful for file system navigation (`ls -F`), directory creation (`mkdir -p`), or downloading web pages (`curl -sL https://example.com > page.html`). The command runs in the project root.',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string', description: 'The shell command to execute, e.g., `ls -l ./src`.' } },
          required: ['command']
        },
        execute: async ({ command }) => {
          const execAsync = promisify(exec);
          const { stdout, stderr } = await execAsync(command);
          return stdout || stderr || 'Command executed';
        }
      },
      execute_code: {
        description: 'Executes a block of sandboxed JavaScript code. This is powerful but should be used for complex data processing or logic that cannot be handled by other tools. Globals available: `fetch`, `Buffer`, `console`, and `fs` (with `readFile`, `writeFile`). No `require()`. Top-level `await` is supported. Example: `const data = JSON.parse(await fs.readFile("in.json", "utf8")); console.log(data.length);`',
        parameters: {
          type: 'object',
          properties: { code: { type: 'string', description: 'The JavaScript code to execute. E.g., `await fs.writeFile("out.txt", "done");`' } },
          required: ['code']
        },
        execute: async ({ code }) => {
          const output = [];
          const sandbox = {
            fetch,
            fs: { writeFile: fs.writeFile, readFile: fs.readFile },
            console: { log: (...args) => output.push(args.join(' ')) },
            Buffer
          };
          
          try {
            const result = await runInNewContext(`(async()=>{${code}})()`, sandbox, { timeout: 10000 });
            return { output, result };
          } catch (error) {
            return { output, error: error.message };
          }
        }
      }
    };

    const dynamicTools = await loadTools();
    this.tools = { ...staticTools, ...dynamicTools };
  }

  async run() {
    await this.initialize();
    const openaiTools = Object.entries(this.tools).map(([name, { description, parameters }]) => ({
      type: 'function',
      function: { name, description, parameters }
    }));

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    console.log('AI Agent Ready\n');

    const ask = () => {
      rl.question('> ', async (input) => {
        if (input.toLowerCase() === 'exit') {
          rl.close();
          return;
        }

        try {
          const messages = [
            { role: 'system', content: `You are a helpful AI assistant that uses tools to accomplish tasks. Analyze the user's request and the available tools, then select the most appropriate tool for each step by referencing the provided schemas. Think step-by-step and chain tool calls to solve complex problems. When you have a final answer, provide it directly to the user.` },
            { role: 'user', content: input }
          ];

          while (true) {
            const { choices: [{ message }] } = await this.openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages,
              tools: openaiTools
            });

            messages.push(message);

            if (!message.tool_calls) {
              console.log('\n✓', message.content);
              break;
            }

            for (const { id, function: { name, arguments: args } } of message.tool_calls) {
              console.log(`→ ${name}:`, args);
              try {
                const result = await this.tools[name].execute(JSON.parse(args));
                let output = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                
                const MAX_OUTPUT_LENGTH = 30000;
                if (output.length > MAX_OUTPUT_LENGTH) {
                  output = output.slice(0, MAX_OUTPUT_LENGTH) + `\n... (output truncated, original length: ${output.length} chars)`;
                }

                console.log('←', output.slice(0, 1000) + (output.length > 1000 ? '...' : ''));
                messages.push({ role: 'tool', tool_call_id: id, content: output });
              } catch (e) {
                console.log('← Error:', e.message);
                messages.push({ role: 'tool', tool_call_id: id, content: `Error: ${e.message}` });
              }
            }
          }
        } catch (e) {
          console.error('Error:', e.message);
        }
        ask();
      });
    };
    ask();
  }
}

async function start() {
  const agent = new Agent();
  await agent.run();
}

start();
