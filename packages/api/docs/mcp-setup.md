# MCP Setup Guide for MultiplAI

This guide explains how to set up and use the Model Context Protocol (MCP) with MultiplAI, enabling seamless integration with AI chat interfaces like Cursor and VS Code Continue.

## What is MCP?

MCP (Model Context Protocol) is a standard for connecting AI models to external tools and data sources. For MultiplAI, it allows chat interfaces to execute code, analyze repositories, manage memory, and interact with databases directly through natural language commands.

## Prerequisites

Before setting up MCP, ensure you have:
- Node.js and Bun installed
- Access to LLM APIs (OpenAI, Anthropic, etc.)
- A GitHub token for repository access
- A database connection (e.g., PostgreSQL)
- Cursor IDE or VS Code with Continue extension

## Cursor Configuration

1. Create the MCP configuration file at `~/.cursor/mcp.json`.
2. Copy the contents from `examples/cursor-mcp.json` and update the environment variables with your actual values.
3. Restart Cursor to apply the changes.

Example configuration:

```json
{
  "mcpServers": {
    "multiplai": {
      "command": "bun",
      "args": ["run", "src/mcp-server.ts"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key",
        "GITHUB_TOKEN": "your-github-token",
        "DATABASE_URL": "your-database-url"
      }
    }
  }
}
```

## VS Code Continue Configuration

1. Create the configuration file at `.continue/config.json` in your workspace root.
2. Copy the contents from `examples/continue-config.json` and update the environment variables with your actual values.
3. Reload the Continue extension in VS Code.

Example configuration:

```json
{
  "mcpServers": {
    "multiplai": {
      "command": "bun",
      "args": ["run", "src/mcp-server.ts"],
      "env": {
        "OPENAI_API_KEY": "your-openai-api-key",
        "ANTHROPIC_API_KEY": "your-anthropic-api-key",
        "GITHUB_TOKEN": "your-github-token",
        "DATABASE_URL": "your-database-url"
      }
    }
  }
}
```

## Environment Variables

The following environment variables are required for MCP to function:

- `OPENAI_API_KEY`: Your OpenAI API key for accessing GPT models.
- `ANTHROPIC_API_KEY`: Your Anthropic API key for accessing Claude models.
- `GITHUB_TOKEN`: A GitHub personal access token for repository analysis and operations.
- `DATABASE_URL`: Connection string for your database (e.g., PostgreSQL URL).

Ensure these are set securely and not committed to version control.

## How to Test the Connection

1. Open your chat interface (Cursor or VS Code Continue).
2. Start a new chat session.
3. Type a simple command like "List available tools" and send it.
4. Check the chat response for tool listings.
5. Verify logs in the terminal/console for any errors.
6. Expected output: A list of MCP tools provided by MultiplAI.

## Usage Examples

Here are some practical examples of using MCP with MultiplAI in chat:

1. **Analyze a repository**: "Analyze the current repository and summarize the main components."
2. **Execute code**: "Run the test suite and report any failures."
3. **Check status**: "What is the current status of the CI/CD pipeline?"
4. **Memory management**: "Store this conversation summary in memory for later reference."

## Troubleshooting

### Common Issues and Solutions

1. **Server not found**: Ensure the `src/mcp-server.ts` file exists and Bun is installed. Check the command path.
2. **Environment variables missing**: Verify all required env vars are set in the config. Use echo to confirm.
3. **Command execution failures**: Check Bun version and ensure dependencies are installed via `bun install`.
4. **Connection timeouts**: Increase timeout settings in your editor's MCP configuration if available.
5. **Tool execution errors**: Review tool-specific logs; ensure API keys have necessary permissions.
6. **Editor-specific issues**: For Cursor, check `~/.cursor/logs`; for VS Code, check Continue extension logs.

If issues persist, consult the MultiplAI documentation or open an issue on GitHub.