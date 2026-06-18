#!/usr/bin/env node
// Thin client for the Weaverse Content API.
// Reads WEAVERSE_API_KEY from the environment. Zero dependencies (Node 18+).
//
// Usage:
//   node weaverse_content_api.mjs projects
//   node weaverse_content_api.mjs languages <projectId>
//   node weaverse_content_api.mjs theme <projectId> [locale]
//   node weaverse_content_api.mjs pages <projectId> [type]
//   node weaverse_content_api.mjs page <projectId> <type> [handle] [locale]   # reads with ?locale
//   node weaverse_content_api.mjs update <projectId> <type> <handle> <patch.json>
//   node weaverse_content_api.mjs delete <projectId> <type> <handle...>
//
// <patch.json> is a file containing the update body, e.g.
//   { "locale": "en-us", "items": [{ "id": "itm1", "data": { "heading": "Hi" } }] }

import { readFile } from "node:fs/promises";

const BASE = "https://studio.weaverse.io/api/v1/content";
const KEY = process.env.WEAVERSE_API_KEY;

const [cmd, ...rest] = process.argv.slice(2);

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    [
      "Usage:",
      "  projects",
      "  languages <projectId>",
      "  theme <projectId> [locale]",
      "  pages <projectId> [type]",
      "  page <projectId> <type> [handle] [locale]",
      "  update <projectId> <type> <handle> <patch.json>",
      "  delete <projectId> <type> <handle...>",
    ].join("\n")
  );
  process.exit(1);
}

if (!cmd) usage();
if (!KEY) usage("WEAVERSE_API_KEY is not set in the environment.");

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (!res.ok) {
    console.error(`HTTP ${res.status}`);
    console.log(typeof json === "string" ? json : JSON.stringify(json, null, 2));
    process.exit(1);
  }
  return json;
}

function enc(s) {
  return encodeURIComponent(s);
}

let out;
switch (cmd) {
  case "projects":
    out = await call("/projects");
    break;
  case "languages": {
    const [projectId] = rest;
    if (!projectId) usage("languages needs <projectId>");
    out = await call(`/projects/${enc(projectId)}/languages`);
    break;
  }
  case "theme": {
    const [projectId, locale] = rest;
    if (!projectId) usage("theme needs <projectId>");
    const q = locale ? `?locale=${enc(locale)}` : "";
    out = await call(`/projects/${enc(projectId)}/theme-settings${q}`);
    break;
  }
  case "pages": {
    const [projectId, type] = rest;
    if (!projectId) usage("pages needs <projectId>");
    const q = type ? `?type=${enc(type)}` : "";
    out = await call(`/projects/${enc(projectId)}/pages${q}`);
    break;
  }
  case "page": {
    const [projectId, type, handle = "", locale] = rest;
    if (!projectId || !type)
      usage("page needs <projectId> <type> [handle] [locale]");
    // splat handle may contain slashes — encode each segment, keep separators
    const splat = handle
      .split("/")
      .filter(Boolean)
      .map(enc)
      .join("/");
    const path = `/projects/${enc(projectId)}/pages/${enc(type)}${splat ? `/${splat}` : ""}`;
    // Always pass a locale when given — without it the resolver only tries ""
    // and legacy en-us, so non-en-us / market-first pages 404. The default
    // weaverse format already returns item ids, so no ?meta=true is needed.
    const q = locale ? `?locale=${enc(locale)}` : "";
    out = await call(`${path}${q}`);
    break;
  }
  case "update": {
    const [projectId, type, handle, patchFile] = rest;
    if (!projectId || !type || !handle || !patchFile)
      usage("update needs <projectId> <type> <handle> <patch.json>");
    const body = JSON.parse(await readFile(patchFile, "utf8"));
    const splat = handle.split("/").filter(Boolean).map(enc).join("/");
    out = await call(
      `/projects/${enc(projectId)}/pages/${enc(type)}/${splat}`,
      { method: "PATCH", body }
    );
    break;
  }
  case "delete": {
    const [projectId, type, ...handles] = rest;
    if (!projectId || !type || handles.length === 0)
      usage("delete needs <projectId> <type> <handle...>");
    out = await call(`/projects/${enc(projectId)}/pages`, {
      method: "DELETE",
      body: { handles, type },
    });
    break;
  }
  default:
    usage(`unknown command: ${cmd}`);
}

console.log(JSON.stringify(out, null, 2));
