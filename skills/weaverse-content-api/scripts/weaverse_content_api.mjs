#!/usr/bin/env node
// Thin client for the Weaverse Content API.
// Reads WEAVERSE_API_KEY from the environment. Zero dependencies (Node 18+).
//
// Usage:
//   node weaverse_content_api.mjs projects
//   node weaverse_content_api.mjs languages <projectId>
//   node weaverse_content_api.mjs theme <projectId> [locale]
//   node weaverse_content_api.mjs theme-update <projectId> <theme.json>
//   node weaverse_content_api.mjs pages <projectId> [type]
//   node weaverse_content_api.mjs page <projectId> <type> [handle] [locale]   # reads with ?locale
//   node weaverse_content_api.mjs create-page <projectId> <type> <handle> [name]
//   node weaverse_content_api.mjs update <projectId> <type> [handle] <patch.json>
//   node weaverse_content_api.mjs delete <projectId> <type> <handle...>
//   node weaverse_content_api.mjs delete-ids <projectId> <pageId...>
//   node weaverse_content_api.mjs upload <file...>   # → Shopify Files via the admin proxy
//
// <patch.json> is a file containing the update body, e.g.
//   { "locale": "en-us", "items": [{ "id": "itm1", "data": { "heading": "Hi" } }] }
// Singleton page types (INDEX, ALL_PRODUCTS, …) have no handle: omit it, e.g.
//   update <projectId> INDEX patch.json
// <theme.json> holds the top-level theme keys to merge, e.g. { "headerText": "#000" }.

import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

// WEAVERSE_CONTENT_API_BASE overrides the API root for local contract testing only.
const BASE = process.env.WEAVERSE_CONTENT_API_BASE ?? "https://studio.weaverse.io/api/v1/content";
const ADMIN_GRAPHQL = "https://studio.weaverse.io/api/admin-graphql";
const KEY = process.env.WEAVERSE_API_KEY;
// The admin proxy rejects requests without a User-Agent (403); send one everywhere.
const USER_AGENT = "weaverse-content-api-skill";
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};

const [cmd, ...rest] = process.argv.slice(2);

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    [
      "Usage:",
      "  projects",
      "  languages <projectId>",
      "  theme <projectId> [locale]",
      "  theme-update <projectId> <theme.json>",
      "  pages <projectId> [type]",
      "  page <projectId> <type> [handle] [locale]",
      "  create-page <projectId> <type> <handle> [name]",
      "  update <projectId> <type> [handle] <patch.json>",
      "  delete <projectId> <type> <handle...>",
      "  delete-ids <projectId> <pageId...>",
      "  upload <file...>",
    ].join("\n"),
  );
  process.exit(1);
}

if (!cmd) usage();
if (!KEY) usage("WEAVERSE_API_KEY is not set in the environment.");

async function parseResponse(res) {
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

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "User-Agent": USER_AGENT,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return parseResponse(res);
}

async function adminGraphql(query, variables = {}) {
  const res = await fetch(ADMIN_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await parseResponse(res);
  if (json.errors) {
    console.error(JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }
  return json.data ?? json;
}

function enc(s) {
  return encodeURIComponent(s);
}

// Splat handles may contain slashes: encode each segment, keep the separators.
function pagePath(projectId, type, handle = "") {
  const splat = handle.split("/").filter(Boolean).map(enc).join("/");
  return `/projects/${enc(projectId)}/pages/${enc(type)}${splat ? `/${splat}` : ""}`;
}

const STAGED_UPLOADS_CREATE = `mutation ($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`;
const FILE_CREATE = `mutation ($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files { id fileStatus }
    userErrors { field message }
  }
}`;
const FILE_NODES = `query ($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on MediaImage { id fileStatus image { url width height altText } }
    ... on GenericFile { id fileStatus url }
    ... on Video { id fileStatus sources { url mimeType } }
  }
}`;

// Staged upload → multipart POST → fileCreate → poll until READY.
// Prints the permanent Shopify CDN URL (and image size) for each file.
async function uploadFiles(paths) {
  const files = await Promise.all(
    paths.map(async (path) => {
      const mimeType = MIME_TYPES[extname(path).toLowerCase()];
      if (!mimeType) usage(`unsupported file type: ${path}`);
      const bytes = await readFile(path);
      const resource = mimeType.startsWith("image/") && mimeType !== "image/svg+xml"
        ? "IMAGE"
        : mimeType.startsWith("video/")
          ? "VIDEO"
          : "FILE";
      return { path, filename: basename(path), mimeType, bytes, resource };
    }),
  );

  const staged = await adminGraphql(STAGED_UPLOADS_CREATE, {
    input: files.map((f) => ({
      filename: f.filename,
      mimeType: f.mimeType,
      fileSize: String(f.bytes.length),
      resource: f.resource,
      httpMethod: "POST",
    })),
  });
  const { stagedTargets, userErrors } = staged.stagedUploadsCreate;
  if (userErrors.length) usage(JSON.stringify(userErrors));

  for (const [i, target] of stagedTargets.entries()) {
    const form = new FormData();
    for (const { name, value } of target.parameters) form.append(name, value);
    form.append("file", new Blob([files[i].bytes], { type: files[i].mimeType }), files[i].filename);
    const res = await fetch(target.url, { method: "POST", body: form });
    if (!res.ok) usage(`staged upload failed for ${files[i].path}: HTTP ${res.status}`);
  }

  const created = await adminGraphql(FILE_CREATE, {
    files: stagedTargets.map((target, i) => ({
      originalSource: target.resourceUrl,
      filename: files[i].filename,
      contentType: files[i].resource,
      alt: "",
    })),
  });
  if (created.fileCreate.userErrors.length) {
    usage(JSON.stringify(created.fileCreate.userErrors));
  }

  const ids = created.fileCreate.files.map((f) => f.id);
  let nodes = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    nodes = (await adminGraphql(FILE_NODES, { ids })).nodes;
    if (nodes.every((n) => n.fileStatus === "READY" || n.fileStatus === "FAILED")) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return nodes.map((node, i) => ({
    file: files[i].path,
    id: node.id,
    status: node.fileStatus,
    url: node.image?.url ?? node.url ?? node.sources?.[0]?.url ?? null,
    width: node.image?.width,
    height: node.image?.height,
  }));
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
  case "theme-update": {
    const [projectId, themeFile] = rest;
    if (!projectId || !themeFile) usage("theme-update needs <projectId> <theme.json>");
    const theme = JSON.parse(await readFile(themeFile, "utf8"));
    // Revision CAS: replay the GET revision so a concurrent Studio change is
    // refused with 409 STALE_PROJECT instead of being overwritten.
    const current = await call(`/projects/${enc(projectId)}/theme-settings`);
    out = await call(`/projects/${enc(projectId)}/theme-settings`, {
      method: "PATCH",
      body: { theme, expectedRevision: current.revision ?? null },
    });
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
    // Always pass a locale when given — without it the resolver only tries ""
    // and legacy en-us, so non-en-us / market-first pages 404. The default
    // weaverse format already returns item ids, so no ?meta=true is needed.
    const q = locale ? `?locale=${enc(locale)}` : "";
    out = await call(`${pagePath(projectId, type, handle)}${q}`);
    break;
  }
  case "create-page": {
    const [projectId, type, handle, name] = rest;
    if (!projectId || !type || !handle)
      usage("create-page needs <projectId> <type> <handle> [name]");
    out = await call(`/projects/${enc(projectId)}/pages`, {
      method: "POST",
      body: { type, handle, ...(name ? { name } : {}) },
    });
    break;
  }
  case "update": {
    // Handle is optional so singleton types (INDEX, …) can be updated.
    const patchFile = rest.at(-1);
    const [projectId, type] = rest;
    const handle = rest.length === 4 ? rest[2] : "";
    if (rest.length < 3 || rest.length > 4)
      usage("update needs <projectId> <type> [handle] <patch.json>");
    const body = JSON.parse(await readFile(patchFile, "utf8"));
    out = await call(pagePath(projectId, type, handle), {
      method: "PATCH",
      body,
    });
    break;
  }
  case "delete": {
    const [projectId, type, ...handles] = rest;
    if (!projectId || !type || handles.length === 0)
      usage("delete needs <projectId> <type> <handle...>");
    // No locale is sent: the API defaults to the stored default locale and
    // rejects an empty-string locale. Use delete-ids for locale-less projects.
    out = await call(`/projects/${enc(projectId)}/pages`, {
      method: "DELETE",
      body: { handles, type },
    });
    break;
  }
  case "delete-ids": {
    const [projectId, ...pageIds] = rest;
    if (!projectId || pageIds.length === 0)
      usage("delete-ids needs <projectId> <pageId...>");
    out = await call(`/projects/${enc(projectId)}/pages`, {
      method: "DELETE",
      body: { pageIds },
    });
    break;
  }
  case "upload": {
    if (rest.length === 0) usage("upload needs <file...>");
    out = await uploadFiles(rest);
    break;
  }
  default:
    usage(`unknown command: ${cmd}`);
}

console.log(JSON.stringify(out, null, 2));
