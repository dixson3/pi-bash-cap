---
type: Plan
okf_spec: OKF-PLAN
description: Implement pi-bash-cap pi extension for mechanical Bash output capping
id: plan-001-james-dixson-663cb7
author: james-dixson
created: '2026-09-26'
status: drafting
---
# Plan: Implement pi-bash-cap pi extension for mechanical Bash output capping

**ID:** plan-001-james-dixson-663cb7
**Author:** james-dixson
**Created:** 2026-09-26
**Status:** drafting

## Objective

Implement a pi coding-agent extension (`pi-bash-cap`) that mechanically caps oversized Bash tool output before it enters the model's context window, spilling the full output to a recoverable file. This is the pi equivalent of the claude-code `PostToolUse` hook `bash-output-cap.sh` (in `dixson3/rc-files`, `claude/hooks/`).

## Motivation

Claude Code has a mechanical safety net for context management: a `PostToolUse` hook (`bash-output-cap.sh`) that caps oversized Bash output after the tool runs, regardless of what the model chose to do. If the model uses `Bash` instead of a sandboxed `ctx_execute`, the hook still catches oversized output and truncates it before it burns context.

Pi's context-mode extension provides instruction-based routing (telling the model to prefer `ctx_execute` over `bash`) and mechanical blocking of unsafe patterns (curl/wget/fetch), but it does NOT implement mechanical output capping. A `bash` call that produces 50KB of output enters the model's context in full — there is no safety net.

This extension closes that gap. It is a companion to context-mode, not a replacement: context-mode routes and sessions, pi-bash-cap caps what slips through.

## Upstream Issues

None — this is a new package with no existing upstream issues.

## Investigation Findings

_Confirmed from prior research:_

1. **Pi's `tool_result` event supports result modification.** The `ToolResultEventResult` return type includes `content?: (TextContent | ImageContent)[]` — equivalent to claude-code's `hookSpecificOutput.updatedOutput`. A handler returning `{ content: [cappedVersion] }` replaces what the model sees. Confirmed in `pi/dist/core/extensions/types.d.ts`.

2. **The context-mode pi extension already uses `tool_result`** (read-only, for SessionDB capture) — demonstrating the event fires reliably for all built-in tools including `bash`.

3. **Pi package publishing requirements** (from `docs/packages.md`):
   - Must be an npm package with the `pi-package` keyword for gallery discovery
   - Extension entry point at `extensions/` (conventional) or declared in `package.json` `pi.extensions`
   - Skills go in `skills/` (conventional) or declared in `pi.skills`
   - Dependencies on pi runtime packages (`@earendil-works/pi-coding-agent` etc.) go in `peerDependencies` with `"*"` range

4. **No external npm dependencies needed.** The extension uses only Node.js built-ins (`fs`, `os`, `path`) and pi runtime types. Zero production dependencies.

5. **Reference implementation exists.** `claude/hooks/bash-output-cap.sh` in `dixson3/rc-files` provides the spill-and-cap logic pattern (tunables, fail-open, nocap escape hatch, recoverable spill path).

## Approach

A single-file TypeScript extension (`index.ts`) with a companion skill file (`SKILL.md`).

The extension registers one `tool_result` handler on the `bash` tool via `pi.on("tool_result", ...)`. When Bash output exceeds configurable thresholds, the handler spills the full output to `~/.pi/context-mode/bash-spill/<sessionId>/<toolCallId>.txt` and replaces the result content with a truncated view (head + cap notice + tail). The handler is fail-open — any exception leaves the original result untouched.

No other lifecycle hooks. No MCP bridge. No SessionDB. Just one handler, one job.

Extension structure:
```
pi-bash-cap/
├── package.json          # name: pi-bash-cap, pi-package keyword, pi.extensions
├── index.ts              # Extension entry point — default export function(pi: ExtensionAPI)
├── SKILL.md              # Skill file: describes the extension for the model
├── README.md             # Human-facing docs
└── LICENSE               # MIT
```

## Epics

### Epic 1: Core extension implementation

- Issue 1.1: Write `index.ts` — extension entry point with `tool_result` handler for bash output capping
  - Implements fail-open pattern: all logic wrapped in try/catch, errors leave result untouched
  - Tunable via environment variables: PI_BASH_CAP_LINES (400), PI_BASH_CAP_BYTES (20000), PI_BASH_CAP_HEAD (100), PI_BASH_CAP_TAIL (40), PI_BASH_CAP_OFF
  - Per-command `nocap` escape hatch
  - Never touches image payloads
  - Spills full output to `~/.pi/context-mode/bash-spill/<session>/<toolCallId>.txt`
  - Replaces `event.content` with truncated view (head + banner + tail)
  - Banner is recoverable: shows line count, bytes, spill path, grep/sed recovery commands
  - Bound stderr too (capped at 200 lines)

### Epic 2: Package scaffolding

- Issue 2.1: Create `package.json` conforming to pi package requirements
  - `name`: `pi-bash-cap`
  - `keywords`: `["pi-package"]`
  - `pi.extensions`: `["./index.ts"]`
  - `pi.skills`: `["./skills"]`
  - `peerDependencies`: `@earendil-works/pi-coding-agent` at `"*"`
  - `files`: includes `index.ts`, `SKILL.md`, `README.md`, `LICENSE`
- Issue 2.2: Write `SKILL.md` skill file describing the extension to the model
  - Documents env-var tunables and nocap escape hatch
  - Explains the recoverable spill pattern
  - Notes this is a mechanical safety net, not a routing mechanism
- Issue 2.3: Write `LICENSE` (MIT, Copyright 2025 James Dixson)
- Issue 2.4: Write comprehensive `README.md` with install instructions, configuration, and usage

### Epic 3: Validation and publish

- Issue 3.1: Test the extension locally with pi (`pi --extension ./index.ts`)
  - Verify output under threshold passes through unmodified
  - Verify output over threshold is capped with recoverable banner
  - Verify `PI_BASH_CAP_OFF=1` disables capping
  - Verify `nocap` in command bypasses capping
  - Verify image results pass through unmodified
- Issue 3.2: Publish to npm (`npm publish`)
- Issue 3.3: Verify install works end-to-end (`pi install npm:pi-bash-cap`)

## Gates

### Start Gate (mandatory)
- Type: human
- Approvers: operator

### Capability Gate: Local test passes
- Type: auto
- Condition: All Issue 3.1 tests pass
- Test: bash scripts/test-extension.sh

### Reconcile Gate
- Type: auto (all execution beads closed)
- Blocks: reconcile step

## Risks & Mitigations

| # | Risk | Severity | Mitigation |
| :-- | :-- | :-- | :-- |
| R1 | Pi's `tool_result` event shape differs from documented types at runtime | low | Extension uses defensive property access (`event?.toolName`, `event?.content?.[0]?.text`); any mismatch returns undefined which the fail-open catch block handles |
| R2 | Pi's `isBashToolResult` type guard is not exported at runtime | low | Extension checks `event.toolName === "bash"` as a simple string comparison — does not depend on pi-internal type guards |
| R3 | Extension interferes with context-mode's `tool_result` handler | low | Pi's handler composition model means each handler runs independently; context-mode reads from the result, pi-bash-cap may modify `content` — the modified content is what context-mode captures, which is the correct behavior (capture what the model sees) |

## Success Criteria

| # | Criterion | Verification | Discharged-by |
| :-- | :-- | :-- | :-- |
| SC1 | Extension loads in pi without errors via `pi --extension ./index.ts` | Run `pi --extension ./index.ts --help` — no error output | 1.1, 2.1 |
| SC2 | Bash output under threshold passes through unmodified | Create a small output (e.g., `echo hello`) — result content is unchanged | 1.1, 3.1 |
| SC3 | Bash output over threshold is capped with recoverable banner | Run `seq 1 1000` — result shows head + banner + tail, full output at spill path | 1.1, 3.1 |
| SC4 | `PI_BASH_CAP_OFF=1` disables all capping | Set env var, run large-output command — full output in context | 1.1, 3.1 |
| SC5 | `nocap` in command string bypasses capping | Run `seq 1 1000 # nocap` — full output in context | 1.1, 3.1 |
| SC6 | Image results pass through unmodified | Read an image file — result is unchanged | 1.1, 3.1 |
| SC7 | Package installs via `pi install` from npm | `pi install npm:pi-bash-cap` succeeds, extension loads in next session | 3.2, 3.3 |