---
type: Review
okf_spec: OKF-PLAN
plan_id: plan-001-james-dixson-663cb7
description: Red-team adversarial review pass 1 — reading pass
pass: 1
date: 2026-09-26
verdict: REVISE
---

# Red-Team Pass 1

## Verdict: REVISE
**Mode:** reading

## Strengths
- Clear, well-scoped objective: a single-file pi extension mechanically mirroring an existing, proven claude-code hook. No mission creep.
- Reference implementations for both the target API shape (context-mode extension.js + types.d.ts) and the cap algorithm (bash-output-cap.sh) are cited with concrete paths; verified the cited API types match the plan's claims — `BashToolResultEvent` shape, `ToolResultEventResult` return type, `content`/`details`/`isError` fields, and `PowerShellToolDetails = BashToolDetails`.
- Fail-open design (return `undefined` on error) is the correct posture for a context-capping interceptor. `nocap` escape hatch and `PI_BASH_CAP_OFF` kill switch provide both fine-grained and global override. No data-destructive paths.
- R1 (cap hides needed content) is the central risk, and the mitigation — explicit cap notice with spill path, grep/sed recovery commands, and `# nocap` re-run — is battle-tested from the bash-output-cap.sh deployment.
- Environment variable naming (`PI_*` prefix, same tunable names) is consistent with pi conventions and discoverable to users coming from claude-code.

## Concerns
| # | Severity | Basis | Concern | Recommendation |
| :-- | :-- | :-- | :-- | :-- |
| C1 | high | inferred: reachability cycle in gate graph | Capability Gate blocks 1.1 and 1.2 but its condition depends on the extension existing. The gate condition requires `pi --extension ./index.ts` to load and `npx --yes tsx smoke-test.ts` to pass, but the extension (`index.ts`) and smoke test are the artifacts 1.1 and 1.2 produce. A gate cannot block the steps that build the evidence it needs to resolve — gate the mutating step, not the step producing the evidence. | Move the Capability Gate to block a post-implementation step (e.g. a "Publish" or "Release" epic), or split it into a developmental gate that blocks 1.1 → 1.2 progression rather than 1.1 start. At minimum, the gate must not block 1.1. |
| C2 | medium | inferred: extension may operate on already-truncated content | pi's built-in bash truncation pre-truncates before the `tool_result` handler fires. When bash output exceeds 2000 lines or 50KB, pi truncates it, writes the full output to `BashToolDetails.fullOutputPath`, and passes only the truncated head to `event.content`. The extension measures lines/bytes from this already-truncated content and reports those numbers in the cap notice as "total" — e.g. 2000 lines when the real output was 10000. The model gets misleading line counts in the cap notice and the extension spills the truncated version (not the full original) to its own spill file. | When `event.details?.fullOutputPath` is present, read that file to get the true total lines/bytes for the cap notice, and use it as the extension's spill rather than re-spilling `event.content`. When `event.details.truncation` is present, its `totalLines`/`totalBytes` fields carry the original dimensions. |
| C3 | low-medium | inferred: missing scope-answers.md | The plan folder has no `scope-answers.md`. OKF-PLAN convention and the scoping phase record scope decisions there. | Add `scope-answers.md` documenting explicit out-of-scope items, what was considered and rejected, and the scoping-time decision record. |
| C4 | low | inferred: unspecified session-ID derivation | The spill path uses `<session-id>` but the plan does not specify how to obtain it. | Use toolCallId as the filename key (no session ID needed — the toolCallId is unique per execution and naturally shards concurrent calls). Same approach as bash-output-cap.sh fallback. |
| C5 | low | inferred: `event.input.command` requires narrowing | `ToolResultEventBase.input` is typed `Record<string, unknown>`. Accessing `.command` requires narrowing to `BashToolResultEvent | PowerShellToolResultEvent` first. | Note in the approach section that the handler narrows `event` by `toolName` before accessing `event.input.command`. |

## Measurements
| Check | Command | Exit | Note |
| :-- | :-- | --: | :-- |
| — | — | — | Reading pass — no commands executed. |

## Missing
- `scope-answers.md` — scoping decisions, explicit out-of-scope items, rejection rationale

## Gate Assessment

**Start Gate**: Standard human approval gate. No issues.

**Capability Gate**: REACHABILITY CYCLE (C1). The gate blocks epics 1.1 and 1.2 but its test requires the extension to exist — the extension is produced by 1.1.

**Reconcile Gate**: Standard auto gate. No issues.

## Upstream Assessment
- Plan states `no-upstream-issues` with evidence: `gh issue list --search "bash cap" --limit 20` returned zero matches on 2026-09-26.
- Clean. No upstream issues to reconcile.

## Resolutions
| Concern | Severity | Resolution | Actor | Status |
| :-- | :-- | :-- | :-- | :-- |
| C1 | high | Removed Capability Gate (reachability cycle). 2-issue plan uses Start Gate + Success Criteria for verification. Gate was blocking the issues that produce its own evidence — unresolvable by construction. | main-session | resolved |
| C2 | medium | Updated approach section: handler now detects pi's built-in truncation via `event.details.fullOutputPath` and `event.details.truncation`. When present, uses the spill file or truncation metadata for true line/byte counts; uses fullOutputPath file directly as the extension's spill rather than re-spilling already-truncated content. | main-session | resolved |
| C3 | low-medium | Created `scope-answers.md` documenting explicit out-of-scope items (Windows PowerShell, TTY tools, concurrency), rejected alternatives (PreToolUse, custom tool, built-in truncation utilities), extension lifecycle, and default thresholds. | main-session | resolved |
| C4 | low | Updated approach and scope-answers: spill path uses `toolCallId` as filename key (`~/.pi/bash-cap-spill/<toolCallId>.txt`) — universally unique per execution, naturally shards concurrent calls, no session-ID plumbing needed. | main-session | resolved |
| C5 | low | Updated approach with explicit note: "The handler narrows `event` to `BashToolResultEvent | PowerShellToolResultEvent` before accessing `event.input.command`, since `ToolResultEventBase.input` is typed `Record<string, unknown>`." | main-session | resolved |