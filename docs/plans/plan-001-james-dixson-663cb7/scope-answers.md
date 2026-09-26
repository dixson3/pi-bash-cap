---
type: Notes
okf_spec: OKF-PLAN
plan_id: plan-001-james-dixson-663cb7
description: Scoping decisions — in/out-of-scope, rejected alternatives, lifecycle, defaults
date: 2026-09-26
---

# Scope Answers

Captured: 2026-09-26

## Q1: What is the primary deliverable?

A single-file pi coding-agent extension (`index.ts`) that mechanically caps oversized Bash tool output. No npm dependencies beyond what the pi runtime provides.

## Q2: What tool scopes are in and out?

**In scope:**
- `bash` tool results (`BashToolResultEvent`)
- `powershell` tool results (`PowerShellToolResultEvent` — shares `BashToolDetails` type)
- Environment variable configuration (`PI_BASH_CAP_*`)
- `nocap` escape hatch
- `PI_BASH_CAP_OFF` kill switch

**Explicitly out of scope:**
- Windows PowerShell native execution environment support (only type compatibility via `PowerShellToolDetails`)
- Interactive / TTY tools (`htop`, `vim`, `ssh`) — these never complete, so `tool_result` never fires for them
- Limiting Bash command output BEFORE it runs (that's a `tool_call` handler, not a `tool_result` handler; wrong layer)
- Other tool types (`read`, `grep`, `find`, `ls`, custom tools)
- Concurrency handling — pi supports parallel tool execution, but spill files are per-toolCallId so concurrent writes are naturally sharded. No explicit locking needed.
- Non-text content (images) — explicitly skipped, per bash-output-cap.sh pattern
- Session-scoped configuration (only global env vars)

## Q3: What was considered and rejected?

**Considered:** `tool_call` (PreToolUse) hook instead of `tool_result` (PostToolUse).
- **Rejected:** PreToolUse cannot know the output size — it only sees the command string. Estimating output from the command is unreliable and would block legitimate large outputs that the model needs complete (e.g., failing test output). PostToolUse has the actual output bytes.

**Considered:** Registering a custom tool that replaces Bash.
- **Rejected:** The extension should be transparent to the model — it interposes at the result layer, not by replacing the tool itself. A custom tool would break existing workflows and system prompts.

**Considered:** Using pi's built-in `truncateHead`/`truncateTail` utilities.
- **Rejected for the cap display:** The cap notice format from bash-output-cap.sh (separator block with line counts, spill path, recovery commands) is more informative than a simple `[Output truncated]` line. Those utilities are fine for the raw mechanics but the model should see the full cap-notice block.

**Considered:** `~/.pi/bash-cap-spill/<session-id>/` directory structure for spill files.
- **Replaced with:** `~/.pi/bash-cap-spill/<toolCallId>.txt` — toolCallId is universally unique per execution, naturally shards concurrent calls, and avoids plumbing session ID from the extension context. Same approach as bash-output-cap.sh's fallback when `tool_use_id` is present but `session_id` is unavailable.

## Q4: What is the extension lifecycle?

- Extension loads at pi startup via `pi --extension ./index.ts` or as part of a pi package
- Factory function is synchronous (no async setup needed)
- Handler fires on every `tool_result` event; guards restrict it to `bash`/`powershell`
- No resources to clean up — no timers, sockets, watchers, or persistent state
- `session_shutdown` hook not needed (no scoped resources)

## Q5: What are the default threshold values?

From the bash-output-cap.sh defaults, unchanged:

| Variable | Default | Meaning |
| :-- | :-- | :-- |
| `PI_BASH_CAP_LINES` | 400 | Trigger threshold, lines |
| `PI_BASH_CAP_BYTES` | 20000 | Trigger threshold, bytes |
| `PI_BASH_CAP_HEAD` | 100 | Lines kept from top |
| `PI_BASH_CAP_TAIL` | 40 | Lines kept from bottom |
| `PI_BASH_CAP_OFF` | unset | Disable entirely when `1` |

These are lower than pi's built-in 2000/50KB limits, so the extension cap will fire before pi's built-in truncation in normal usage. The extension still handles the case where pi's built-in truncation already fired (C2 in review).