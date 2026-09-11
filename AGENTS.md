# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## What This Repo Is

A collection of agent skills for building, maintaining, and upgrading Shopify Hydrogen storefronts with Weaverse. Skills are markdown knowledge bases that agents (Claude Code, Cursor, Copilot, OpenCode, OpenClaw, Gemini CLI, etc.) load to gain context before working on a Hydrogen project.

## Installation

```bash
npx skills add Weaverse/shopify-hydrogen-skills
```

See [INSTALL.md](INSTALL.md) for manual per-agent setup.

## Repository Structure

```
package.json                       # Node ESM config for running scripts
INSTALL.md                         # Detailed per-agent installation guide
AGENTS.md                          # This file — repo guidance for agents
.cursorrules                       # Cursor rules (synced with skill content)
skills/
  setup-weaverse-project/          # New project setup from zero to local preview
    SKILL.md                       # CLI-first scaffold, demo-store boot, env/GitHub/Builder connection
  shopify-hydrogen/                # Core Hydrogen APIs (live + offline)
    SKILL.md
    references/                    # 3 reference files (cached API docs)
    scripts/                       # Shared live-doc helpers, installed with the pack
      search_shopify_docs.mjs      # Live Shopify Hydrogen API docs search
      search_weaverse_docs.mjs     # Live Weaverse docs search
      get_weaverse_page.mjs        # Fetch a specific Weaverse doc page
      check_docs_helpers.mjs       # Boundary checks for the helpers (no network)
  weaverse-hydrogen/               # Weaverse CMS + Hydrogen fundamentals
    SKILL.md
    references/                    # 13 deep-dive reference files
    examples/                      # 4 production-ready code examples
  hydrogen-cookbooks/              # Feature implementation guides
    SKILL.md
    references/                    # One file per feature/cookbook
  hydrogen-upgrades/               # Version migration guides
    SKILL.md
    references/                    # One file per version jump
  theme-update/                    # Pilot theme update procedure
    SKILL.md
    scripts/
      check_pilot_updates.mjs      # Version check script
  weaverse-integration/            # Integrate into existing Hydrogen projects
    SKILL.md                       # Full 6-phase integration guide
  cloning-websites-to-weaverse/    # Clone reference sites into Weaverse pages
    SKILL.md
  figma-to-weaverse/               # Build Weaverse sections from a Figma design
    SKILL.md
    references/
  generating-weaverse-project-json/ # Generate Weaverse import JSON files
    SKILL.md
    references/
    scripts/
  weaverse-content-api/            # Read/update live Weaverse content over REST
    SKILL.md
    references/
    scripts/
  hydrogen-markets-localization/    # End-to-end markets/localization workflow
    SKILL.md
    references/                    # Verification checklist
```

## Live Docs Strategy

Instead of baking static API docs into skill files (which go stale), this repo ships scripts that query official sources at runtime:

| Script | Source | What it does |
|--------|--------|--------------|
| `skills/shopify-hydrogen/scripts/search_shopify_docs.mjs` | `shopify.dev/assistant/search` | Search Hydrogen API docs |
| `skills/shopify-hydrogen/scripts/search_weaverse_docs.mjs` | `weaverse.io/docs/mcp` | Search Weaverse docs (Mintlify) |
| `skills/shopify-hydrogen/scripts/get_weaverse_page.mjs` | `weaverse.io/docs/mcp` | Fetch a full doc page by path |

Usage:
```bash
node skills/shopify-hydrogen/scripts/search_shopify_docs.mjs "createHydrogenContext"
node skills/shopify-hydrogen/scripts/search_weaverse_docs.mjs "component schema"
node skills/shopify-hydrogen/scripts/get_weaverse_page.mjs "development-guide/component-schema"
```

The helpers live inside the `shopify-hydrogen` skill so that a native skill
installation still ships them, and sibling skills reference them as
`../shopify-hydrogen/scripts/<file>.mjs`.

The installer copies only the selected skill folders, so those sibling paths
resolve when the whole pack is installed (`--skill '*'`, or the default
`npx skills add Weaverse/shopify-hydrogen-skills`). Installing a single dependent
skill on its own leaves them dangling; each dependent `SKILL.md` says so and
gives the one-line fix, `npx skills add Weaverse/shopify-hydrogen-skills --skill
shopify-hydrogen`. The helpers are deliberately not duplicated into each skill:
six copies would drift, and the `skills` CLI has no dependency manifest to
declare instead.

Each helper exits non-zero when the docs endpoint reports a failure, including an
HTTP 200 carrying a JSON-RPC `error` or a tool-level `result.isError`, so a caller
never mistakes a missing page for an empty one. `get_weaverse_page.mjs` composes a
shell command for the docs filesystem tool, so it accepts only
`[A-Za-z0-9._/-]` page paths (no `..`) and rejects anything else before any
request. Verify both contracts without network access:

```bash
node skills/shopify-hydrogen/scripts/check_docs_helpers.mjs
```

All scripts use Node.js built-ins only (no dependencies needed). Require Node.js 18+.

## Content Sources

| Skill | Authoritative Source |
|-------|---------------------|
| `setup-weaverse-project/` | Authored in this repo · Cross-check CLI behavior with `@weaverse/cli` and current docs |
| `shopify-hydrogen/` | Live: `shopify.dev` via search script · Offline: `references/` |
| `weaverse-hydrogen/` | This repo — authored directly · Live: `docs.weaverse.io` via scripts |
| `hydrogen-cookbooks/` | Authored in this repo with Weaverse-specific patterns |
| `hydrogen-upgrades/` | Authored in this repo · Cross-check with `shopify.dev` via scripts |
| `cloning-websites-to-weaverse/` | Authored in this repo with Weaverse-specific migration workflow |
| `figma-to-weaverse/` | Authored in this repo · Figma MCP extraction; reuses cloning skill's matching rules |
| `generating-weaverse-project-json/` | Authored in this repo with import schema references and validator |
| `weaverse-content-api/` | Authored in this repo from builder `docs/content-api.md` · Live: `/openapi.json` |
| `hydrogen-markets-localization/` | Authored in this repo from verified Hydrogen + Weaverse implementation evidence · Cross-check platform APIs with live Shopify/Weaverse docs |

**Rule:** Never write API docs from memory or training data. Use the scripts to fetch authoritative content.

## Skill File Format

Each `SKILL.md` has YAML frontmatter:

```yaml
---
name: skill-name
description: "One-line description of what this skill covers and when to use it."
---
```

Followed by:
- Live Documentation section (script usage)
- Brief intro explaining the skill's scope
- Table of available references with short descriptions
- Usage notes for when/how to load the skill

## .cursorrules

Kept in sync with the skill content. Update when skills change.
