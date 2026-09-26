---
type: Context
okf_spec: OKF-PLAN
plan_id: plan-001-james-dixson-663cb7
captured: '2026-09-26'
hostname: byid-mba-dixson3
---

# Context

## Project environment

- **Repository:** dixson3/pi-bash-cap
- **Working directory:** `~/workspace/dixson3/pi-bash-cap`
- **Current branch:** main

## Tool inventory

| Tool | Available |
| :-- | :-- |
| `pi` | yes (coding agent) |
| `git` | yes |
| `bd` | yes (beads ≥ 1.1.0) |
| `d2` | yes |
| `tsx` | yes |
| `npm` | yes |
| `yf` | yes |
| `uv` | yes |

## Paths

- `~/_dotfiles/rc-files/claude/hooks/bash-output-cap.sh` — claude-code PostToolUse hook (cap logic reference)
- `~/.pi/agent/npm/node_modules/context-mode/build/adapters/pi/extension.js` — pi extension pattern
- `~/.nvm/versions/node/v24.20.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md` — pi extension conventions
- `~/.nvm/versions/node/v24.20.0/lib/node_modules/@earendil-works/pi-coding-agent/docs/packages.md` — pi package conventions
- `~/.nvm/versions/node/v24.20.0/lib/node_modules/@earendil-works/pi-coding-agent/examples/extensions/truncated-tool.ts` — pi truncation utilities example
- `~/.nvm/versions/node/v24.20.0/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — pi extension type definitions

## Operator identity

- **Author:** James Dixson (dixson3)
- **Host:** byid-mba-dixson3 (macOS)
- **Organization:** Yoshiko Studios LLC

## Runtime assumptions

- pi coding-agent ≥ 0.73.x installed via npm
- TypeScript support via jiti (pi's built-in transpiler)
- Node.js ≥ 24.x
- No external npm dependencies required beyond pi runtime packages