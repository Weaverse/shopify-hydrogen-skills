#!/usr/bin/env node
// Boundary checks for the shared docs helpers. Runs the real CLI entrypoints as
// child processes with a preloaded fetch stub, so no request leaves the machine.
//
//   node skills/shopify-hydrogen/scripts/check_docs_helpers.mjs
//
// Node built-ins only — the skill pack ships no test dependency.
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "get_weaverse_page.mjs");
const SEARCH = path.join(HERE, "search_weaverse_docs.mjs");

const stubDir = mkdtempSync(path.join(tmpdir(), "docs-helper-check-"));
const stub = path.join(stubDir, "stub-fetch.mjs");
writeFileSync(
  stub,
  `globalThis.fetch = async (_url, init) => {
  console.error("SENT " + init.body);
  const mode = process.env.DOCS_STUB_MODE;
  // The filesystem tool wraps every reply in the shell envelope captured from
  // the live endpoint: "exit: N" then a stdout/stderr section. The search tool
  // returns plain result text. Both arrive as HTTP 200.
  const filesystem = init.body.includes("query_docs_filesystem_weaverse");
  const text = filesystem
    ? mode === "command-failed"
      ? "exit: 1\\n--- stderr ---\\ncat: /development-guide/agent-skills-missing-readonly-probe.mdx: No such file or directory\\n"
      : "exit: 0\\n--- stdout ---\\nPAGE BODY\\n"
    : "PAGE BODY";
  const body =
    mode === "rpc-error"
      ? { jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid params" } }
      : mode === "tool-error"
        ? { jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "File not found" }] } }
        : { jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } };
  return new Response("data: " + JSON.stringify(body) + "\\n", { status: 200 });
};
`
);

function run(script, args, mode) {
  return spawnSync(process.execPath, ["--import", stub, script, ...args], {
    encoding: "utf8",
    env: { ...process.env, DOCS_STUB_MODE: mode ?? "ok" },
  });
}

// 1. A valid path succeeds and prints the document without the shell envelope.
const ok = run(PAGE, ["development-guide/component-schema"]);
assert.equal(ok.status, 0, "valid page path must exit 0");
assert.match(ok.stdout, /PAGE BODY/);
assert.equal(
  ok.stdout.includes("--- stdout ---"),
  false,
  "successful read must print the document, not the shell envelope"
);
assert.match(ok.stderr, /cat \/development-guide\/component-schema\.mdx/);

// 2. The filesystem tool reports a failed `cat` inside a successful result: no
// JSON-RPC error, no `isError`, just a non-zero exit in the response text.
// Fixture is the live response captured for a missing page.
const missing = run(
  PAGE,
  ["development-guide/agent-skills-missing-readonly-probe"],
  "command-failed"
);
assert.equal(missing.status, 1, "non-zero remote command exit must exit 1");
assert.match(missing.stderr, /No such file or directory/);
assert.equal(
  missing.stdout.includes("No such file or directory"),
  false,
  "a failed lookup must not be printed as document content"
);

// 3. Command metacharacters are rejected before any request is made.
for (const bad of [
  "development-guide/component-schema; echo marker #",
  "development-guide/$(id)",
  "../../etc/passwd",
  "development-guide/component schema",
  "development-guide/comp\nonent",
]) {
  const result = run(PAGE, [bad]);
  assert.equal(result.status, 1, `must reject: ${JSON.stringify(bad)}`);
  assert.equal(
    result.stderr.includes("SENT "),
    false,
    `must not fetch for: ${JSON.stringify(bad)}`
  );
}

// 4. HTTP 200 carrying a JSON-RPC error or an MCP tool error is a failure.
for (const [script, args] of [
  [PAGE, ["development-guide/component-schema"]],
  [SEARCH, ["component schema"]],
]) {
  for (const mode of ["rpc-error", "tool-error"]) {
    const result = run(script, args, mode);
    assert.equal(
      result.status,
      1,
      `${path.basename(script)} must exit 1 on ${mode}`
    );
  }
}

// 5. Search still prints results on success.
const search = run(SEARCH, ["component schema"]);
assert.equal(search.status, 0);
assert.match(search.stdout, /PAGE BODY/);

console.log("✓ docs helper boundary checks passed");
