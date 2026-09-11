#!/usr/bin/env node
// Fetch a specific page from Weaverse docs via the Mintlify MCP endpoint
import { parseArgs } from "util";

const { positionals } = parseArgs({ allowPositionals: true });
const page = positionals[0];

if (!page) {
  console.error(
    "Usage: node get_weaverse_page.mjs <page-path>\n" +
      'Example: node get_weaverse_page.mjs "development-guide/component-schema"'
  );
  process.exit(1);
}

// The docs MCP server reads pages through a shell-like filesystem tool, so the
// page path is interpolated into a remote command string. Only accept the doc
// path syntax the docs site actually uses — lowercase-ish slugs separated by
// slashes — so metacharacters, whitespace, control characters and `..`
// traversal can never reach that command.
const DOC_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const docPath = page.replace(/^\/+/, "").replace(/\.mdx$/, "");

if (!DOC_PATH.test(docPath) || docPath.split("/").includes("..")) {
  console.error(
    `Invalid page path: ${JSON.stringify(page)}\n` +
      'Expected a docs path such as "development-guide/component-schema".'
  );
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
      name: "query_docs_filesystem_weaverse",
      arguments: { command: `cat /${docPath}.mdx` },
    },
    id: 1,
  }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);

// Parse SSE response
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
// would let an empty or failed lookup look like a successful docs read.
if (data.error) {
  console.error(`Docs request failed: ${data.error.message || "unknown error"}`);
  process.exit(1);
}

const results = data.result?.content || [];

if (data.result?.isError) {
  for (const item of results) {
    if (item.type === "text") console.error(item.text);
  }
  console.error(`Docs lookup failed for: ${docPath}`);
  process.exit(1);
}

const output = results
  .filter((item) => item.type === "text")
  .map((item) => item.text)
  .join("");

// The filesystem tool runs `cat` remotely and reports the result as a *successful*
// tool call whose text carries the shell exit code: `exit: N` followed by a
// `--- stdout ---` / `--- stderr ---` section. A missing page therefore has no
// JSON-RPC error and no `isError`, so the exit line is the only failure signal.
const envelope = /^exit: (\d+)\n([\s\S]*)$/.exec(output);

if (!envelope) {
  console.log(output);
  process.exit(0);
}

const [, code, sections] = envelope;

if (code !== "0") {
  console.error(sections.trimEnd());
  console.error(`Docs lookup failed for: ${docPath}`);
  process.exit(1);
}

console.log(sections.replace(/^--- stdout ---\n/, "").trimEnd());
