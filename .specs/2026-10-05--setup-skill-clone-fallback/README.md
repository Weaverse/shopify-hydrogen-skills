# Feature: Setup Skill Clone Fallback Cleanup

| Field            | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| **Status**       | in-progress                                                             |
| **Owner**        | @hta218                                                                 |
| **Issue**        | [#4](https://github.com/Weaverse/shopify-hydrogen-skills/issues/4)      |
| **Branch**       | `fix/setup-skill-clone-fallback`                                        |
| **Created**      | 2026-10-05                                                              |
| **Last Updated** | 2026-10-05                                                              |

## Initiating Requirement

> `Weaverse/pilot` will carry Weaverse-internal workflows in `.github/workflows/` (the live demo's Oxygen deployment, `ci.yml`, `claude-code-review.yml`) that need Weaverse's secrets. `@weaverse/cli@5.6.5` strips `.github/` and `.weaverse/` when creating a project (`Weaverse/weaverse#533`).
>
> `skills/setup-weaverse-project/SKILL.md` Phase 1 falls back to clone/degit when the CLI is unavailable, and that fallback keeps `.github/`, `.weaverse/`, and (for clone) `.git/` with `origin` pointing at the theme repo, which breaks Phase 3's `gh repo create --source=. --remote=origin`.
>
> - In the Phase 1 fallback rule, remove `.git .github .weaverse` after a clone/degit download, then `git init`, so the result matches the CLI path.
> - Acceptance: a project scaffolded through the fallback path has no `.github/`, `.weaverse/`, or upstream git history.
>
> Parent: `Weaverse/pilot#182`.

## Summary

The setup skill's clone/degit fallback now strips the theme repo's history, internal workflows, and internal specs, so it produces the same clean project as `@weaverse/cli`.
