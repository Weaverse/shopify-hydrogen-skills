#!/usr/bin/env node
// Search Shopify developer docs for Hydrogen-related content
import { parseArgs } from "util";

const { positionals } = parseArgs({ allowPositionals: true });
const query = positionals[0];

if (!query) {
  console.error("Usage: node scripts/search_shopify_docs.mjs <query>");
  process.exit(1);
}

const response = await fetch("https://shopify.dev/assistant/search", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ query, api_name: "hydrogen" }),
});

if (!response.ok) throw new Error(`HTTP ${response.status}`);

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
