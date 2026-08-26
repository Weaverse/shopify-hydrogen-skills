# Shopify Hydrogen Skills — Installer

You are an AI agent. Read this file carefully and follow every step in order.
Do **not** skip ahead — wait for the user's response before proceeding.

---

## Quick Install (Recommended)

The fastest way to install:

```bash
npx skills add Weaverse/shopify-hydrogen-skills
```

This auto-detects which coding agents you have installed (Claude Code, Cursor, OpenCode, OpenClaw, Codex, Windsurf, Gemini CLI, GitHub Copilot, and 40+ more) and installs the skills to all of them. Powered by [skills.sh](https://skills.sh).

If `npx skills add` works, you're done — skip to [Step 4](#step-4--confirm-installation).

If you prefer manual per-agent setup or `npx skills` isn't available, continue below.

---

## Step 1 — Choose Installation Scope

Ask the user:

> "Where would you like to install the Shopify Hydrogen skills?
>
> 1. **Global** — available across all your projects (installed into each agent's global skills directory)
> 2. **Local** — only for the current project (installed into the project's `skills/` directory)"

Store the answer as `SCOPE` (`global` or `local`).

---

## Step 2 — Choose Agent(s)

Ask the user which AI agent(s) they want to install the skills for (they can pick multiple):

> "Which agent(s) do you use? (you can select more than one)
>
> 1. Claude Code
> 2. Cursor
> 3. GitHub Copilot
> 4. Windsurf
> 5. OpenCode
> 6. OpenClaw
> 7. Gemini CLI
> 8. Other (I'll describe it)"

Store the selections as `AGENTS`.

If the user selects **Other**, ask them to describe their agent's config file location and format, then adapt Step 3 accordingly.

---

## Step 3 — Install for Each Selected Agent

For each agent in `AGENTS`, follow the relevant section below.

The **skills source** is: `https://github.com/Weaverse/shopify-hydrogen-skills`

Clone it temporarily, then copy the skill folders **and** the scripts directory:

```
shopify-hydrogen/
hydrogen-cookbooks/
hydrogen-upgrades/
weaverse-hydrogen/
scripts/          ← live doc fetching scripts
```

These should land flat inside the destination — **not** wrapped in a subfolder.

### General Install Command

```bash
git clone https://github.com/Weaverse/shopify-hydrogen-skills /tmp/h-skills --depth=1
```

Then copy based on scope (see each agent below for specific paths).

> **Note:** The `theme-update` skill includes its own `scripts/check_pilot_updates.mjs` inside `skills/theme-update/scripts/`. This gets copied along with the skill automatically.

---

### Claude Code

**Skills destination:**
| Scope    | Path                        |
| -------- | --------------------------- |
| `global` | `~/.claude/skills/`         |
| `local`  | `./skills/`                 |

**Copy the skills:**
```bash
# Global
cp -r /tmp/h-skills/skills/shopify-hydrogen    ~/.claude/skills/
cp -r /tmp/h-skills/skills/hydrogen-cookbooks  ~/.claude/skills/
cp -r /tmp/h-skills/skills/hydrogen-upgrades   ~/.claude/skills/
cp -r /tmp/h-skills/skills/weaverse-hydrogen   ~/.claude/skills/
cp -r /tmp/h-skills/skills/theme-update        ~/.claude/skills/
cp -r /tmp/h-skills/skills/weaverse-integration  ~/.claude/skills/
cp -r /tmp/h-skills/skills/cloning-websites-to-weaverse  ~/.claude/skills/
cp -r /tmp/h-skills/skills/figma-to-weaverse    ~/.claude/skills/
cp -r /tmp/h-skills/skills/generating-weaverse-project-json  ~/.claude/skills/
cp -r /tmp/h-skills/skills/weaverse-content-api  ~/.claude/skills/
cp -r /tmp/h-skills/skills/hydrogen-markets-localization  ~/.claude/skills/
cp -r /tmp/h-skills/scripts                    ~/.claude/skills/

# Local
cp -r /tmp/h-skills/skills/shopify-hydrogen    ./skills/
cp -r /tmp/h-skills/skills/hydrogen-cookbooks  ./skills/
cp -r /tmp/h-skills/skills/hydrogen-upgrades   ./skills/
cp -r /tmp/h-skills/skills/weaverse-hydrogen   ./skills/
cp -r /tmp/h-skills/skills/theme-update        ./skills/
cp -r /tmp/h-skills/skills/weaverse-integration  ./skills/
cp -r /tmp/h-skills/skills/cloning-websites-to-weaverse  ./skills/
cp -r /tmp/h-skills/skills/figma-to-weaverse    ./skills/
cp -r /tmp/h-skills/skills/generating-weaverse-project-json  ./skills/
cp -r /tmp/h-skills/skills/weaverse-content-api  ./skills/
cp -r /tmp/h-skills/skills/hydrogen-markets-localization  ./skills/
cp -r /tmp/h-skills/scripts                    ./skills/
```

**Config file to update:**
| Scope    | File                  |
| -------- | --------------------- |
| `global` | `~/.claude/CLAUDE.md` |
| `local`  | `./CLAUDE.md`         |

**Append** this block (create the file if it doesn't exist):

```markdown
## Shopify Hydrogen Skills

Before working on any Shopify Hydrogen or Weaverse-related task, read:

- {SKILLS_DESTINATION}/shopify-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-cookbooks/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-upgrades/SKILL.md
- {SKILLS_DESTINATION}/weaverse-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/theme-update/SKILL.md
- {SKILLS_DESTINATION}/weaverse-integration/SKILL.md
- {SKILLS_DESTINATION}/cloning-websites-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/figma-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/generating-weaverse-project-json/SKILL.md
- {SKILLS_DESTINATION}/weaverse-content-api/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-markets-localization/SKILL.md

For live docs, use the scripts in {SKILLS_DESTINATION}/scripts/:
- `node {SKILLS_DESTINATION}/scripts/search_shopify_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/search_weaverse_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/get_weaverse_page.mjs "<page-path>"`
```

Replace `{SKILLS_DESTINATION}` with the actual destination path from the table above.

---

### Cursor

**Skills destination:**
| Scope    | Path                        |
| -------- | --------------------------- |
| `global` | `~/.cursor/skills/`         |
| `local`  | `./skills/`                 |

**Copy the skills** (same pattern as Claude Code, adjust destination path).

**Config file to update:**
| Scope    | File                                          |
| -------- | --------------------------------------------- |
| `global` | `~/.cursor/rules/shopify-hydrogen.mdc`        |
| `local`  | `./.cursor/rules/shopify-hydrogen.mdc`        |

Create the file with this content:

```markdown
---
description: Shopify Hydrogen and Weaverse skills
alwaysApply: true
---

Before working on any Shopify Hydrogen or Weaverse-related task, read:

- {SKILLS_DESTINATION}/shopify-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-cookbooks/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-upgrades/SKILL.md
- {SKILLS_DESTINATION}/weaverse-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/theme-update/SKILL.md
- {SKILLS_DESTINATION}/weaverse-integration/SKILL.md
- {SKILLS_DESTINATION}/cloning-websites-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/figma-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/generating-weaverse-project-json/SKILL.md
- {SKILLS_DESTINATION}/weaverse-content-api/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-markets-localization/SKILL.md

For live docs, use the scripts in {SKILLS_DESTINATION}/scripts/:
- `node {SKILLS_DESTINATION}/scripts/search_shopify_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/search_weaverse_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/get_weaverse_page.mjs "<page-path>"`
```

Replace `{SKILLS_DESTINATION}` with the actual destination path.

---

### GitHub Copilot

GitHub Copilot instructions are project-scoped only. If the user selected `global`, inform them that Copilot doesn't support global instructions and proceed with a local install.

**Skills destination:** `./skills/`

**Copy the skills** (local variant from Claude Code section above).

**Config file to update:** `./.github/copilot-instructions.md`

Create `.github/` if it doesn't exist, then **append**:

```markdown
## Shopify Hydrogen Skills

Before working on any Shopify Hydrogen or Weaverse-related task, refer to:

- ./skills/shopify-hydrogen/SKILL.md
- ./skills/hydrogen-cookbooks/SKILL.md
- ./skills/hydrogen-upgrades/SKILL.md
- ./skills/weaverse-hydrogen/SKILL.md
- ./skills/theme-update/SKILL.md
- ./skills/weaverse-integration/SKILL.md
- ./skills/cloning-websites-to-weaverse/SKILL.md
- ./skills/generating-weaverse-project-json/SKILL.md
- ./skills/hydrogen-markets-localization/SKILL.md

For live docs, use the scripts in ./skills/scripts/:
- `node ./skills/scripts/search_shopify_docs.mjs "<query>"`
- `node ./skills/scripts/search_weaverse_docs.mjs "<query>"`
- `node ./skills/scripts/get_weaverse_page.mjs "<page-path>"`
```

---

### Windsurf

**Skills destination:**
| Scope    | Path                        |
| -------- | --------------------------- |
| `global` | `~/.windsurf/skills/`       |
| `local`  | `./skills/`                 |

**Copy the skills** (same pattern as Claude Code, adjust destination).

**Config file to update:**
| Scope    | File                                     |
| -------- | ---------------------------------------- |
| `global` | `~/.windsurf/rules/shopify-hydrogen.md`  |
| `local`  | `./.windsurfrules`                       |

**Append** this block (create the file if it doesn't exist):

```markdown
## Shopify Hydrogen Skills

Before working on any Shopify Hydrogen or Weaverse-related task, read:

- {SKILLS_DESTINATION}/shopify-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-cookbooks/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-upgrades/SKILL.md
- {SKILLS_DESTINATION}/weaverse-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/theme-update/SKILL.md
- {SKILLS_DESTINATION}/weaverse-integration/SKILL.md
- {SKILLS_DESTINATION}/cloning-websites-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/figma-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/generating-weaverse-project-json/SKILL.md
- {SKILLS_DESTINATION}/weaverse-content-api/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-markets-localization/SKILL.md

For live docs, use the scripts in {SKILLS_DESTINATION}/scripts/:
- `node {SKILLS_DESTINATION}/scripts/search_shopify_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/search_weaverse_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/get_weaverse_page.mjs "<page-path>"`
```

---

### OpenCode

**Skills destination:**
| Scope    | Path                        |
| -------- | --------------------------- |
| `global` | `~/.opencode/skills/`       |
| `local`  | `./skills/`                 |

**Copy the skills** (same pattern as Claude Code, adjust destination).

**Config file to update:**
| Scope    | File                    |
| -------- | ----------------------- |
| `global` | `~/.opencode/AGENTS.md` |
| `local`  | `./AGENTS.md`           |

**Append** this block (create the file if it doesn't exist):

```markdown
## Shopify Hydrogen Skills

Before working on any Shopify Hydrogen or Weaverse-related task, read:

- {SKILLS_DESTINATION}/shopify-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-cookbooks/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-upgrades/SKILL.md
- {SKILLS_DESTINATION}/weaverse-hydrogen/SKILL.md
- {SKILLS_DESTINATION}/theme-update/SKILL.md
- {SKILLS_DESTINATION}/weaverse-integration/SKILL.md
- {SKILLS_DESTINATION}/cloning-websites-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/figma-to-weaverse/SKILL.md
- {SKILLS_DESTINATION}/generating-weaverse-project-json/SKILL.md
- {SKILLS_DESTINATION}/weaverse-content-api/SKILL.md
- {SKILLS_DESTINATION}/hydrogen-markets-localization/SKILL.md

For live docs, use the scripts in {SKILLS_DESTINATION}/scripts/:
- `node {SKILLS_DESTINATION}/scripts/search_shopify_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/search_weaverse_docs.mjs "<query>"`
- `node {SKILLS_DESTINATION}/scripts/get_weaverse_page.mjs "<page-path>"`
```

---

### OpenClaw

**Skills destination:**
| Scope    | Path                          |
| -------- | ----------------------------- |
| `global` | `~/.openclaw/workspace/skills/` |
| `local`  | `./skills/`                   |

**Copy the skills:**
```bash
# Global
cp -r /tmp/h-skills/skills/shopify-hydrogen    ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/hydrogen-cookbooks  ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/hydrogen-upgrades   ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/weaverse-hydrogen   ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/theme-update        ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/weaverse-integration  ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/cloning-websites-to-weaverse  ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/generating-weaverse-project-json  ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/skills/hydrogen-markets-localization  ~/.openclaw/workspace/skills/
cp -r /tmp/h-skills/scripts                    ~/.openclaw/workspace/skills/

# Local — same as Claude Code local above
```

OpenClaw auto-discovers skills from the workspace skills directory. No config file update needed.

---

### Gemini CLI

**Skills destination:**
| Scope    | Path                        |
| -------- | --------------------------- |
| `global` | `~/.gemini/skills/`         |
| `local`  | `./skills/`                 |

**Copy the skills** (same pattern as Claude Code, adjust destination).

**Config file to update:**
| Scope    | File                              |
| -------- | --------------------------------- |
| `global` | `~/.gemini/settings.json`         |
| `local`  | `./.gemini/settings.json`         |

Add or update the skills reference in the Gemini CLI configuration following their docs.

---

## Step 4 — Confirm Installation

After completing all changes, report back to the user with a summary:

```
✅ Shopify Hydrogen Skills installed!

Method:   npx skills add / manual
Scope:    global / local
Agents:   Claude Code, Cursor, ...

Skills copied to:
  - ~/.claude/skills/          (Claude Code, global)
  - ~/.cursor/skills/          (Cursor, global)
  - ... (list all destinations)

  Each destination now contains:
  ├── shopify-hydrogen/
  ├── hydrogen-cookbooks/
  ├── hydrogen-upgrades/
  ├── weaverse-hydrogen/
  ├── theme-update/
  ├── weaverse-integration/
  ├── hydrogen-markets-localization/
  └── scripts/
      ├── search_shopify_docs.mjs
      ├── search_weaverse_docs.mjs
      └── get_weaverse_page.mjs

Config files updated:
  - ~/.claude/CLAUDE.md
  - ~/.cursor/rules/shopify-hydrogen.mdc
  - ... (list all files touched)

You're ready to build Hydrogen storefronts with live doc support.
```
