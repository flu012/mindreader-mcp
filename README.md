# MindReader MCP Server

Connect [MindReader](https://github.com/flu012/mindreaderv2) to Claude Code, Cursor, or any MCP-compatible client. Gives your AI assistant persistent memory backed by a knowledge graph.

## Prerequisites

- [MindReader V2](https://github.com/flu012/mindreaderv2) running locally (`npm start`)
- Node.js 18+

## Install

```bash
git clone https://github.com/flu012/mindreader-mcp.git
cd mindreader-mcp
npm install
```

## Setup with Claude Code

Add to your Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "mindreader": {
      "command": "node",
      "args": ["/path/to/mindreader-mcp/src/index.js"],
      "env": {
        "MINDREADER_URL": "http://localhost:18900"
      }
    }
  }
}
```

If MindReader has authentication enabled, add your token:

```json
{
  "mcpServers": {
    "mindreader": {
      "command": "node",
      "args": ["/path/to/mindreader-mcp/src/index.js"],
      "env": {
        "MINDREADER_URL": "http://localhost:18900",
        "MINDREADER_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Setup with Cursor

Add to Cursor's MCP settings (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "mindreader": {
      "command": "node",
      "args": ["/path/to/mindreader-mcp/src/index.js"],
      "env": {
        "MINDREADER_URL": "http://localhost:18900"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|---|---|
| `memory_search` | Search the knowledge graph for entities, facts, and relationships |
| `memory_store` | Store information using LLM preprocessing (auto-extracts entities) |
| `memory_create` | Create/update entities directly without LLM (precise control) |
| `memory_entities` | List entities in the knowledge graph |
| `memory_recall` | Recall relevant memories for a given context |
| `memory_stats` | Get knowledge graph statistics |

## Examples

Once configured, Claude Code can use the tools naturally:

- "Remember that Alice is a senior engineer at Acme Corp"
- "What do you know about the payments project?"
- "List all the entities in my knowledge graph"
- "Create an entity for the new API gateway project with tags backend, infrastructure"

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MINDREADER_URL` | `http://localhost:18900` | MindReader API base URL |
| `MINDREADER_TOKEN` | (empty) | Bearer token for authentication |

## License

MIT
