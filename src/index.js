#!/usr/bin/env node
/**
 * MindReader MCP Server
 *
 * Connects Claude Code (or any MCP client) to a running MindReader instance.
 * Communicates over stdio using the Model Context Protocol.
 *
 * Environment variables:
 *   MINDREADER_URL  — MindReader API base URL (default: http://localhost:18900)
 *   MINDREADER_TOKEN — Bearer token for authentication (optional)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.MINDREADER_URL || "http://localhost:18900";
const TOKEN = process.env.MINDREADER_TOKEN || "";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`MindReader API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const server = new McpServer({
  name: "mindreader",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: memory_search
// ---------------------------------------------------------------------------
server.tool(
  "memory_search",
  "Search the knowledge graph for entities, facts, and relationships. Returns matching entities with summaries and related facts.",
  {
    query: z.string().describe("Natural language search query"),
    limit: z.number().optional().default(10).describe("Maximum number of results (default: 10)"),
  },
  async ({ query, limit }) => {
    try {
      const data = await api(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      const entities = (data.entities || []).map(e => {
        const tags = (e.tags || []).join(", ");
        return `- ${e.name} [${e.category || "other"}]: ${e.summary || "(no summary)"}${tags ? ` | Tags: ${tags}` : ""}`;
      });
      const facts = (data.facts || []).map(f =>
        `- [${f.relation}] ${f.source} → ${f.target}: ${f.fact}`
      );

      let text = "";
      if (entities.length > 0) text += `Entities (${entities.length}):\n${entities.join("\n")}`;
      if (facts.length > 0) text += `${text ? "\n\n" : ""}Facts (${facts.length}):\n${facts.join("\n")}`;
      if (!text) text = "No results found.";

      return { content: [{ type: "text", text }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: memory_store
// ---------------------------------------------------------------------------
server.tool(
  "memory_store",
  "Store a fact or piece of information in the knowledge graph. Uses LLM preprocessing to extract entities and relationships automatically.",
  {
    content: z.string().describe("The fact or information to remember"),
    source: z.string().optional().default("claude-code").describe("Source identifier"),
    project: z.string().optional().describe("Associate with a project name"),
  },
  async ({ content, source, project }) => {
    try {
      const body = { content, source };
      if (project) body.project = project;
      const data = await api("/api/cli/store", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return { content: [{ type: "text", text: data.output || "Memory stored." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Store failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: memory_create
// ---------------------------------------------------------------------------
server.tool(
  "memory_create",
  "Create or update entities directly in the knowledge graph without LLM processing. Use for precise, deterministic memory management. Supports batch creation and relationships.",
  {
    entities: z.array(z.object({
      name: z.string().describe("Entity name (primary identifier)"),
      summary: z.string().optional().describe("Entity description"),
      category: z.string().optional().describe("Category (person, project, company, technology, location, etc.)"),
      tags: z.array(z.string()).optional().describe("Lowercase descriptive tags"),
      relationships: z.array(z.object({
        target: z.string().describe("Target entity name"),
        type: z.string().describe("Relationship type (e.g. works_at, leads, uses, depends_on)"),
        fact: z.string().optional().describe("Human-readable description of the relationship"),
      })).optional().describe("Relationships to create from this entity"),
    })).describe("Array of entities to create or update"),
  },
  async ({ entities }) => {
    try {
      const data = await api("/api/entities", {
        method: "POST",
        body: JSON.stringify({ entities }),
      });
      const lines = [`Created: ${data.created}, Updated: ${data.updated}, Relationships: ${data.relationships}`];
      for (const e of data.entities || []) {
        lines.push(`  - ${e.name}: ${e.status}`);
      }
      if (data.errors?.length > 0) {
        lines.push(`Errors:`);
        for (const err of data.errors) {
          lines.push(`  - ${err.name}: ${err.error}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Create failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: memory_entities
// ---------------------------------------------------------------------------
server.tool(
  "memory_entities",
  "List entities in the knowledge graph. Returns names, summaries, and categories.",
  {
    limit: z.number().optional().default(30).describe("Maximum entities to return (default: 30)"),
  },
  async ({ limit }) => {
    try {
      const data = await api(`/api/cli/entities?limit=${limit}`);
      return { content: [{ type: "text", text: data.output || "No entities found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `List failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: memory_recall
// ---------------------------------------------------------------------------
server.tool(
  "memory_recall",
  "Recall relevant memories for a given context or prompt. Returns structured memory context that can be used to inform responses.",
  {
    prompt: z.string().describe("The context or prompt to recall memories for"),
    limit: z.number().optional().default(5).describe("Maximum memories to recall (default: 5)"),
  },
  async ({ prompt, limit }) => {
    try {
      const data = await api("/api/cli/recall", {
        method: "POST",
        body: JSON.stringify({ prompt, limit }),
      });
      if (data.context) {
        return { content: [{ type: "text", text: data.context }] };
      }
      return { content: [{ type: "text", text: "No relevant memories found." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Recall failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: memory_stats
// ---------------------------------------------------------------------------
server.tool(
  "memory_stats",
  "Get statistics about the knowledge graph — entity count, relationship count, categories.",
  {},
  async () => {
    try {
      const data = await api("/api/stats");
      const lines = [];
      if (data.nodes) {
        lines.push("Nodes:");
        for (const n of data.nodes) lines.push(`  ${n.label}: ${n.count}`);
      }
      if (data.relationships) {
        lines.push("Relationships:");
        for (const r of data.relationships) lines.push(`  ${r.type}: ${r.count}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") || "No stats available." }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Stats failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
