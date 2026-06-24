---
name: setup-weaverse-project
description: "Set up, create, scaffold, or clone a new Weaverse Hydrogen storefront locally from the Pilot theme — boot a live preview on the demo store first, then make it the merchant's own (env, GitHub repo, dev server, preview connection). Use when a user wants to start a brand-new project, run a theme locally for the first time, or move from Weaverse Builder to local development."
---

# Set Up a Weaverse Project — Agent Skill

> Take a user from **nothing** to a **running, connected** Weaverse Hydrogen storefront.
> This is the front door. Every other Weaverse skill assumes the project already exists — this one creates it.

## The One Rule That Fixes Onboarding

**Boot a live preview on the demo store BEFORE asking for any credentials.**

Most users quit onboarding because they hit a wall (GitHub, Shopify tokens, CLI) before they ever see anything work. Pilot ships with a working demo store's tokens in `.env.example`, so you can show a real, running storefront in ~2 minutes with **zero** credentials. Do that first. Get the "wow." *Then* make it theirs.

Do not make the user create a GitHub repo, link a Shopify store, or paste tokens before they have seen the storefront running. If you do, you have failed the onboarding even if every command succeeds.

## You Drive the CLI — The User Never Types It

The user (merchant or developer) should never have to type a CLI command. **You** run `shopify hydrogen` and `@weaverse/cli` under the hood. The Shopify CLI does real work (env pull, dev server, codegen, deploy) — drive it, do not reimplement it. `npm run dev` itself shells out to `shopify hydrogen dev`, so the CLI is always involved; just keep it invisible to the user.

---

## Phase 0 — Detect the Environment

Before doing anything, detect and record (do not assume):

```bash
node --version            # need >= 18
git --version
gh --version 2>/dev/null && gh auth status 2>/dev/null   # is GitHub CLI present AND authed?
npx shopify version 2>/dev/null                          # Shopify CLI availability
ls package-lock.json pnpm-lock.yaml yarn.lock 2>/dev/null # infer package manager
```

Branch all later steps off this. If `gh` is missing or not authed, you will use the manual repo fallback in Phase 5. If node < 18, stop and tell the user to upgrade.

---

## Phase 1 — Clone the Theme and Make It a Fresh Repo

Weaverse themes are public GitHub repos at `https://github.com/Weaverse/{theme-handle}`
(e.g. `pilot`, `naturelle`, …). Use the theme handle from your project details
(the setup prompt includes it; default is `pilot`). Clone it, then detach from
Weaverse's git history so it becomes the user's own project.

```bash
# Replace {theme-handle} with the theme from your project (e.g. pilot, naturelle)
git clone https://github.com/Weaverse/{theme-handle} my-storefront
cd my-storefront
rm -rf .git
git init
```

Use clone/degit-style download — do not hand-roll a file downloader. If the theme
handle is missing, default to `pilot`.

---

## Phase 2 — THE WOW MOMENT (boot on the demo store)

This is the centerpiece. Get a live preview running with the demo credentials that ship in `.env.example`.

```bash
cp .env.example .env          # ships working demo-store tokens + a demo WEAVERSE_PROJECT_ID
npm install                   # or pnpm/yarn per Phase 0 detection
npm run dev                   # boots `shopify hydrogen dev` on http://localhost:3456
```

Then **verify it actually came up** before saying anything succeeded:

```bash
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3456   # expect 200
```

Tell the user, in plain language:
> "Your storefront is running locally at http://localhost:3456 — this is the Weaverse demo store. Next we'll make it *yours*."

Do not proceed to credentials until the preview is up and verified.

---

## Phase 3 — Make It Theirs (Shopify credentials)

Now swap the demo store for the user's store. The **minimum vars needed to render a Weaverse preview** are:

- `SESSION_SECRET` — any random string
- `PUBLIC_STORE_DOMAIN` — `their-store.myshopify.com`
- `PUBLIC_STOREFRONT_API_TOKEN` — Storefront API access token
- `WEAVERSE_PROJECT_ID` — see Phase 4 (this is the only var that can't come from Shopify)

Everything else (`SHOP_ID`, `PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID`, `PUBLIC_CHECKOUT_DOMAIN`, `PUBLIC_STOREFRONT_ID`, analytics, reviews) is **feature-complete extra** — set it *after* first success, never block on it.

### Decision tree: is the store already linked to a Hydrogen channel?

```bash
npx shopify hydrogen env pull   # works ONLY if the storefront is already linked
```

- **Linked** → `env pull` populates `.env`. Done.
- **Not linked** (the common case for a brand-new merchant) → guide them through ONE of:
  - **Hydrogen sales channel** (https://apps.shopify.com/hydrogen) — provides `PUBLIC_STORE_DOMAIN`, `PUBLIC_STOREFRONT_API_TOKEN`, `SHOP_ID`. Best when they want Oxygen hosting later.
  - **Headless app** (https://apps.shopify.com/headless) — provides Storefront API tokens for a dev/custom store. Best for connecting an existing store quickly.

  Walk them to the exact screen, have them copy each token, and you write it into `.env`. Re-run the Phase 2 verify after swapping.

Docs: https://docs.weaverse.io/quickstart and https://shopify.dev/docs/storefronts/headless

---

## Phase 4 — Project Identity (`WEAVERSE_PROJECT_ID` + API key)

`WEAVERSE_PROJECT_ID` is the one value that lives only in Weaverse Builder and cannot be derived from Shopify.

**Path A — available today (default):**
The setup prompt generated by Weaverse Builder embeds the project's `WEAVERSE_PROJECT_ID` (and theme name). Read it from the prompt you were given and write it into `.env`. If you were not given one, ask the user to copy it from Builder → Project Settings.

**Path B — local auth handshake (milestone, may not be live yet):**
When available, you can run a local authentication handshake that returns the user's `WEAVERSE_PROJECT_ID`, `WEAVERSE_API_KEY`, and the ability to register a preview URL and use the Content API directly. If the handshake tooling is present, prefer it. If not, fall back to Path A. **Do not assume `WEAVERSE_API_KEY` exists** unless the handshake provided it. Once you have the key, you can also give the agent the Weaverse MCP (Phase 8).

---

## Phase 5 — Create the User's Repo and Push

**Default (if `gh` present and authed from Phase 0):**

```bash
git add -A
git commit -m "Initial commit: Weaverse Pilot storefront"
gh repo create my-storefront --private --source=. --remote=origin --push
```

**Fallback (no `gh`):** give numbered manual steps —
1. Create a new empty repo at https://github.com/new (no README).
2. Then run (you fill in their URL):
   ```bash
   git add -A && git commit -m "Initial commit: Weaverse Pilot storefront"
   git remote add origin https://github.com/<user>/<repo>.git
   git branch -M main && git push -u origin main
   ```

Never present "agent does it" and "user does it" as the same step — pick the default from Phase 0 detection, state which path you're taking.

---

## Phase 6 — Connect the Preview to Weaverse Builder

- **Today:** guide the user — Builder → **Project Settings** → **Manage URLs** (Preview URLs section) → add `http://localhost:3456` → save.
- **Milestone (Path B auth):** when the handshake/API is live, register the preview URL automatically via the authenticated endpoint so the user never leaves the agent. Prefer this when available.

---

## Phase 7 — Verify (the success oracle)

**Do not claim success without all green checks:**

```bash
curl -sf -o /dev/null -w "%{http_code}" http://localhost:3456   # 200
npm run typecheck                                               # passes
npm run build                                                   # passes (optional but recommended)
```

Plus confirm the Weaverse preview shows **connected** in Builder. If any check fails, fix it before reporting done — and report exactly which check failed if you cannot.

---

## Phase 8 — (Optional) Give the agent the Weaverse MCP

Once the project has a `WEAVERSE_API_KEY` (the Phase 4 Path B handshake, or a Content API
key from Builder → Settings → API Keys), offer to add the **Weaverse MCP server** so the
agent can work with *this* project directly — search the Weaverse docs and read the
account's projects, pages (as Portable Text), theme settings, and locales.

- Ships as `npx -y @weaverse/mcp` over stdio. **Account tools need v2.2.0+**; docs search
  works with no key.
- Put `WEAVERSE_API_KEY` in the MCP client's `env` block — never in a tracked file.
- The config shape differs per client (Cursor, Claude Code, Codex, opencode, VS Code, pi, …);
  exact per-client snippets are in the docs:
  **https://weaverse.io/docs/developer-tools/weaverse-mcp**

This is a convenience for *future* work — not required to finish setup. Skip it if the user
isn't on an MCP-capable agent.

---

## Full Sequence (cheat sheet)

1. Detect env (node, gh+auth, shopify CLI, package manager).
2. Clone the theme (`https://github.com/Weaverse/{theme-handle}`, default `pilot`) → `rm -rf .git` → `git init`.
3. **Boot on demo store** (`cp .env.example .env`, install, `npm run dev`, verify 200). ← wow moment.
4. Swap to user's store (linked → `env pull`; not linked → Hydrogen channel / Headless app, write the 4 minimum vars).
5. Set `WEAVERSE_PROJECT_ID` (Path A from prompt today / Path B handshake later).
6. Create repo + push (`gh repo create` default, manual fallback).
7. Connect preview URL (manual paste today / auto-register later).
8. Verify (200 + typecheck + build + Builder shows connected).
9. *(Optional)* Wire up the Weaverse MCP for the user's agent (`npx -y @weaverse/mcp` + `WEAVERSE_API_KEY`) — see Phase 8.

## Required vars quick reference

| Var | Needed to render? | Source |
|-----|-------------------|--------|
| `SESSION_SECRET` | yes | any random string |
| `PUBLIC_STORE_DOMAIN` | yes | Shopify (channel/headless app) |
| `PUBLIC_STOREFRONT_API_TOKEN` | yes | Shopify (channel/headless app) |
| `WEAVERSE_PROJECT_ID` | yes | Weaverse Builder (prompt / handshake) |
| `SHOP_ID`, customer-account, checkout, storefront-id, analytics | no (feature-complete) | Shopify / later |
