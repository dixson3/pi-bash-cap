---
type: Review
okf_spec: OKF-PLAN
plan_id: plan-001-james-dixson-663cb7
description: Red-team adversarial review pass 2 — APPROVE; all pass-1 concerns verified resolved
pass: 2
date: 2026-09-26
verdict: APPROVE
---

# Red-Team Pass 2

## Verdict: APPROVE
**Mode:** reading

## Strengths
- All five pass-1 concerns addressed cleanly with plan text changes and a new scope-answers.md. No resolution created a new problem.
- The Capability Gate removal (C1) is the right call — a 2-issue plan with an unresolvable gate was architecturally broken. Start Gate + Reconcile Gate is proportionate.
- The pre-truncation handling (C2) is now a three-tier strategy: `truncation` metadata (free) → `fullOutputPath` file read (cheap, single file stat + read) → content measurement (fallback). Correct priority order.
- `toolCallId` (C4) is a better filename key than session-ID — it is guaranteed unique per execution, requires zero plumbing from extension context, and naturally shards concurrent parallel-tool calls. The scope-answers Q3 records the rejected alternative.
- Type narrowing note (C5) is specific enough that an implementer won't hit the `Record<string, unknown>` wall.
- scope-answers.md (C3) covers in/out-of-scope, rejected alternatives with rationale, lifecycle, and default thresholds. The rejected-alternatives section (Q3) is particularly useful — it explains why PreToolUse and custom-tool approaches don't work, preventing someone from re-proposing them.

## Concerns
| # | Severity | Basis | Concern | Recommendation |
| :-- | :-- | :-- | :-- | :-- |
| C1 | low | inferred: all 9 SC Verification cells are prose instructions | Success Criteria verification cells are all `manual:` prose, not runnable commands. An execution pass (pass 3+) would have zero commands to extract and run for SC discharge verification. This is proportionate for a 2-issue plan and does not block approval, but it means no SC can be mechanically discharged by a gate or an execution-pass reviewer. | Consider converting SC2-SC7 to runnable verification commands (e.g. `PI_BASH_CAP_LINES=5 PI_BASH_CAP_BYTES=100 bash -c 'yes x | head -20' | ...`). Not required before execution — `manual:` is acceptable at this scale. |

## Measurements
| Check | Command | Exit | Note |
| :-- | :-- | --: | :-- |
| — | — | — | Reading pass — no commands executed. |

## Missing
- None. Pass-1 gaps (scope-answers.md) filled.

## Gate Assessment

**Start Gate**: Standard human approval. No issues.

**Reconcile Gate**: Standard auto gate (all execution beads closed). No issues.

The Capability Gate was removed (C1 resolution). Only the two mandatory gates remain — appropriate for a 2-issue plan.

## Upstream Assessment
- `no-upstream-issues` with evidence: `gh issue list --search "bash cap" --limit 20` returned zero matches on 2026-09-26.
- Clean. No upstream issues to reconcile.

## Resolutions
| Concern | Severity | Resolution | Actor | Status |
| :-- | :-- | :-- | :-- | :-- |
| C1 | high | Capability Gate removed. Only Start Gate + Reconcile Gate remain. | main-session | resolved |
| C2 | medium | Approach steps 3, 7 now handle pi's built-in truncation: `truncation.totalLines`/`totalBytes` metadata checked first (free), then `fullOutputPath` file used for dimensions + as spill source (avoids re-spilling truncated content), then content measurement fallback. | main-session | resolved |
| C3 | low-medium | `scope-answers.md` created. Covers in/out-of-scope, rejected alternatives with rationale, extension lifecycle, and default thresholds. | main-session | resolved |
| C4 | low | Spill path changed to `~/.pi/bash-cap-spill/<toolCallId>.txt`. `toolCallId` is unique per execution, requires no session-ID plumbing, naturally shards concurrent calls. | main-session | resolved |
| C5 | low | Approach step 1 now documents `BashToolResultEvent \| PowerShellToolResultEvent` narrowing before accessing `event.input.command`. | main-session | resolved |