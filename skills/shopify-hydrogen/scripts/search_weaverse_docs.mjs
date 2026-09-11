#!/usr/bin/env node
// Search Weaverse documentation via the Mintlify MCP endpoint
import { parseArgs } from "util";

const { positionals } = parseArgs({ allowPositionals: true });
const query = positionals[0];

if (!query) {
  console.error("Usage: node search_weaverse_docs.mjs <query>");
  process.exit(1);
}

const response = await fetch("https://weaverse.io/docs/mcp", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: "search_weaverse",
      arguments: { query },
    },
    id: 1,
  }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);

// Parse SSE response — the data is in an event stream
const text = await response.text();
const dataLine = text
  .split("\n")
  .find((line) => line.startsWith("data: "));

if (!dataLine) {
  console.error("No data in response");
  process.exit(1);
}

const data = JSON.parse(dataLine.slice(6));

// A JSON-RPC error or an MCP tool error both arrive as HTTP 200. Exiting 0 here
// would let a failed search look like an empty-but-successful docs read.
if (data.error) {
  console.error(`Docs request failed: ${data.error.message || "unknown error"}`);
  process.exit(1);
}

const results = data.result?.content || [];

if (data.result?.isError) {
  for (const item of results) {
    if (item.type === "text") console.error(item.text);
  }
  console.error(`Docs search failed for: ${query}`);
  process.exit(1);
}

// Format results for readability
for (const item of results) {
  if (item.type === "text") {
    console.log(item.text);
    console.log("---");
  }
}
