# Micro Agent

A simple, powerful, and extensible command-line AI agent that uses tools to accomplish tasks.

## Overview

Micro Agent is a Node.js-based AI assistant that operates in your terminal. You can give it complex tasks, and it will use its available tools—such as web search, file system operations, and command execution—to achieve your goals. It intelligently chains tool calls together, making it capable of performing multi-step operations.

## Features

- **Interactive CLI:** A simple and familiar command-line interface.
- **Powered by OpenAI:** Leverages the function-calling capabilities of modern GPT models (e.g., `gpt-4o-mini`).
- **Extensible Toolset:** Comes with a set of powerful core tools and can be easily extended with your own custom JavaScript tools.
- **Core & Dynamic Tools:**
  - `web_search`: Search Google for up-to-date information.
  - `scrape`: Fetches the content of a web page from a URL. Useful for reading articles or documentation pages directly.
  - `file_system`: Read, write, and delete files and directories.
  - `execute_command`: Run any shell command in your project's root directory.
  - `execute_code`: Execute sandboxed JavaScript code for complex logic or data manipulation.

## Setup and Installation

### 1. Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later recommended)
- `npm` (usually included with Node.js)

### 2. Install Dependencies

Navigate to the `micro-agnt` directory and install the required `npm` packages:

```bash
cd micro-agnt
npm install
```

### 3. Environment Variables

The agent requires API keys to function. Create a `.env` file in the `micro-agnt` directory:

```bash
touch .env
```

Add the following environment variables to your `.env` file:

```env
OPENAI_API_KEY="sk-..."
GOOGLE_SEARCH_API_KEY="AIza..."
GOOGLE_SEARCH_ENGINE_ID="..."
```

#### How to get the API Keys:

- **`OPENAI_API_KEY`**: Get your key from the [OpenAI API keys page](https://platform.openai.com/api-keys).
- **`GOOGLE_SEARCH_API_KEY` & `GOOGLE_SEARCH_ENGINE_ID`**:
    1.  Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
    2.  Enable the **Custom Search API**.
    3.  Create an API Key under "Credentials". This is your `GOOGLE_SEARCH_API_KEY`.
    4.  Go to the [Programmable Search Engine](https://programmablesearchengine.google.com/) control panel.
    5.  Create a new search engine. You can configure it to search the entire web.
    6.  In the search engine's "Setup" page, find the "Search engine ID". This is your `GOOGLE_SEARCH_ENGINE_ID`.

## How to Run

Once setup is complete, you can start the agent from within the `micro-agnt` directory:

```bash
node ai.js
```

You'll see a prompt `> ` when the agent is ready for your command. To exit, type `exit` and press Enter.

## Example Usage

Here are a few examples of what you can ask the agent to do.

### Simple Web Search

> **You:** `What is the most popular JavaScript framework in 2024?`
>
> **Agent:** (Uses `web_search`) → `web_search: { "query": "most popular JavaScript framework 2024" }`
> ...
> ✓ Based on recent surveys and developer trends, React continues to be the most popular JavaScript framework in 2024, followed closely by Vue.js and Svelte.

### File System Operations

> **You:** `Create a file named 'hello.txt' with the content "Hello from the agent!"`
>
> **Agent:** (Uses `file_system`) → `file_system: { "operation": "write", "path": "hello.txt", "content": "Hello from the agent!" }`
> ...
> ✓ I have created the file `hello.txt` with the specified content.

### Command Execution

> **You:** `What node packages are we using in this project?`
>
> **Agent:** I can check the `package.json` file.
> → `file_system: { "operation": "read", "path": "package.json" }`
> ...
> ✓ The project uses the following packages: `openai`, `dotenv`.

### Multi-step Task

> **You:** `Find the current weather in New York, and write a summary to 'weather_report.txt'.`
>
> **Agent:**
> → `web_search: { "query": "weather in New York" }`
> ... (gets weather data)
> → `file_system: { "operation": "write", "path": "weather_report.txt", "content": "The current weather in New York is... (summary)" }`
> ...
> ✓ I have saved the weather report for New York to `weather_report.txt`.

## Multi-Agent Collaboration

You can run multiple instances of the agent in separate terminal windows to create a multi-agent system. Since they all operate within the same project directory, they can collaborate on tasks by using the shared file system.

For example, you could have:
- **Agent 1 (Researcher):** Searches the web and scrapes relevant articles, saving the content to files.
- **Agent 2 (Writer):** Reads the files created by the researcher, synthesizes the information, and writes a final report.

This parallel approach allows for more complex and efficient problem-solving.

## Extending with Custom Tools

You can add your own tools by creating new `.js` files in the `micro-agnt/tools/` directory. The agent will automatically load them on startup.

Each tool file must have a `default export` containing an object with three properties:
- `description` (string): A clear description of what the tool does and when to use it. This is crucial for the AI to know when to use your tool.
- `parameters` (object): A [JSON Schema object](https://json-schema.org/understanding-json-schema/) describing the tool's arguments.
- `execute` (async function): The function to run when the tool is called. It receives an object with the arguments defined in `parameters`.

### Example Custom Tool

Here's an example of a simple tool that provides the current date.

**`micro-agnt/tools/getDate.js`**:
```javascript
export default {
  description: 'Returns the current date and time.',
  parameters: {
    type: 'object',
    properties: {}, // No parameters needed
    required: []
  },
  async execute() {
    return new Date().toISOString();
  }
};
```

After adding this file, you can start the agent and ask:
> **You:** `What is the current date?`
>
> **Agent:** → `getDate: {}`
> ...
> ✓ The current date is `2024-XX-XXTXX:XX:XX.XXXZ`. 
