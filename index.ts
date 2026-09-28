/**
 * pi-bash-cap — Pi coding-agent extension that mechanically caps oversized
 * Bash tool output before it enters the model context window.
 *
 * Modeled on dixson3/rc-files `bash-output-cap.sh` claude-code PostToolUse
 * hook, adapted for pi's `tool_result` extension event.
 *
 * The model sees a truncated view (head + cap notice + tail); full output
 * spills to a recoverable file. The extension is transparent — it never
 * replaces the tool, only the result the model sees.
 *
 * Fail-open: any error returns undefined (original result preserved).
 *
 * Tunables (env):
 *   PI_BASH_CAP_LINES  trigger threshold, lines   (default 400)
 *   PI_BASH_CAP_BYTES  trigger threshold, bytes   (default 20000)
 *   PI_BASH_CAP_HEAD   lines kept from the top    (default 100)
 *   PI_BASH_CAP_TAIL   lines kept from the bottom (default 40)
 *   PI_BASH_CAP_OFF=1  disable entirely
 *
 * Per-command escape hatch: include `nocap` in the command string
 * (e.g. `# nocap`).
 *
 * @author James Dixson (dixson3)
 * @license MIT
 * @copyright 2026 James Dixson
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BashToolResultEvent, ExtensionAPI, PowerShellToolResultEvent, ToolResultEventResult } from "@earendil-works/pi-coding-agent";

// ── Configuration ────────────────────────────────────────

const CAP_LINES = parseInt(process.env.PI_BASH_CAP_LINES || "400", 10) || 400;
const CAP_BYTES = parseInt(process.env.PI_BASH_CAP_BYTES || "20000", 10) || 20000;
const HEAD_LINES = parseInt(process.env.PI_BASH_CAP_HEAD || "100", 10) || 100;
const TAIL_LINES = parseInt(process.env.PI_BASH_CAP_TAIL || "40", 10) || 40;
const MAX_ERR_LINES = 200;

const SPILL_DIR = join(homedir(), ".pi", "bash-cap-spill");

// ── Helpers ──────────────────────────────────────────────

function splitLines(text: string): string[] {
  if (text.length === 0) return [];
  const lines = text.split("\n");
  if (text.endsWith("\n")) lines.pop();
  return lines;
}

/** Check for `nocap` anywhere in the command string (case-sensitive). */
function hasNocap(command: string): boolean {
  return command.includes("nocap");
}

/** Check if any content block is an image. */
function hasImageContent(content: { type: string }[]): boolean {
  return content.some((c) => c.type === "image");
}

/** Concatenate all text content blocks into one string. */
function concatText(content: { type: string; text?: string }[]): string {
  return content
    .filter((c): c is { type: "text"; text: string } => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

/** Read full output from pi's built-in spill file when available. */
function readFullOutput(fullOutputPath: string): string | null {
  try {
    return readFileSync(fullOutputPath, "utf-8");
  } catch {
    return null;
  }
}

/** Measure lines and bytes of a string. */
function measure(text: string): { lines: number; bytes: number } {
  const lines = splitLines(text);
  return { lines: lines.length, bytes: Buffer.byteLength(text, "utf-8") };
}

/**
 * Build the cap notice block in bash-output-cap.sh format.
 * The notice is a separator block that tells the model:
 * - what was capped and how much
 * - where to find the full output
 * - how to recover specific sections
 * - how to re-run uncapped
 */
function buildCapNotice(
  totalLines: number,
  totalBytes: number,
  headLines: number,
  tailLines: number,
  spillPath: string,
): string {
  const cutFrom = headLines + 1;
  const cutTo = totalLines - tailLines;
  const kept = headLines + tailLines;

  const lines = [
    "",
    "========================================================================",
    `OUTPUT CAPPED — ${totalLines} lines / ${totalBytes} bytes total; showing first ${headLines} + last ${tailLines}.`,
    `Lines ${cutFrom}-${cutTo} are NOT shown. This is a truncation, not an empty result —`,
    "do not conclude anything from what is missing here.",
    `FULL OUTPUT: ${spillPath}`,
    `Recover: grep -n <pattern> ${spillPath}`,
    `         sed -n ${cutFrom},${cutTo}p ${spillPath}`,
    "Re-run uncapped by adding `# nocap` to the command.",
    "========================================================================",
    "",
  ];

  return lines.join("\n");
}

/** Bound stderr (max 200 lines). Mirrors bash-output-cap.sh behavior. */
function boundStderr(stderr: string): string {
  if (!stderr) return "";

  const errLines = splitLines(stderr);
  if (errLines.length <= MAX_ERR_LINES) {
    return `\n--- stderr ---\n${stderr}`;
  }

  const truncated = errLines.slice(0, MAX_ERR_LINES).join("\n");
  return `\n--- stderr ---\n${truncated}\n[stderr capped at ${MAX_ERR_LINES} of ${errLines.length} lines]\n`;
}

// ── Extension entry point ────────────────────────────────

export default function piBashCap(pi: ExtensionAPI): void {
  // Global kill switch.
  if (process.env.PI_BASH_CAP_OFF === "1") return;

  // Ensure spill directory exists (fail-silent — errors mean no spilling,
  // but the handler stays fail-open).
  try {
    mkdirSync(SPILL_DIR, { recursive: true });
  } catch {
    // Disk is the spill target — if we can't create the directory, we
    // can't write files either. The handler will produce a capped notice
    // without a recoverable spill path, which is still better than silent
    // full-output delivery.
  }

  pi.on("tool_result", (event): ToolResultEventResult | undefined => {
    try {
      // Guard: only bash/powershell.
      if (event.toolName !== "bash" && event.toolName !== "powershell") return;

      const e = event as BashToolResultEvent | PowerShellToolResultEvent;

      // Guard: skip on error results.
      if (e.isError) return;

      // Guard: skip if content includes images.
      if (hasImageContent(e.content)) return;

      // Guard: skip empty content.
      if (!e.content || e.content.length === 0) return;

      // Guard: skip on `nocap` in the command.
      const command: string = (e.input as Record<string, unknown>)?.command as string ?? "";
      if (hasNocap(command)) return;

      // ── Get the real dimensions ──────────────────────────
      // Pi's built-in truncation runs before this handler fires, so
      // event.content is already capped to ~2000 lines/50KB. We need the
      // true total dimensions to decide whether our (lower) thresholds are
      // exceeded. Priority:
      //   1. event.details.truncation (pi 0.73.x+ — carries totalLines/totalBytes)
      //   2. event.details.fullOutputPath (pi spills full output to a file)
      //   3. measure from event.content directly (fallback — already truncated)

      let fullText: string;
      let totalLines: number;
      let totalBytes: number;

      const details = e.details;

      if (details?.truncation) {
        // Pi already truncated and reported the original dimensions.
        totalLines = details.truncation.totalLines;
        totalBytes = details.truncation.totalBytes;
        // Use the full spill file if available, else the (already-truncated) content.
        if (details.fullOutputPath) {
          const fromFile = readFullOutput(details.fullOutputPath);
          fullText = fromFile ?? concatText(e.content);
          // If we got the full file, re-measure to be certain.
          if (fromFile) {
            const m = measure(fromFile);
            totalLines = m.lines;
            totalBytes = m.bytes;
          }
        } else {
          fullText = concatText(e.content);
        }
      } else if (details?.fullOutputPath) {
        // Pi spilled the full output but didn't attach truncation metadata.
        const fromFile = readFullOutput(details.fullOutputPath);
        if (fromFile) {
          fullText = fromFile;
          const m = measure(fromFile);
          totalLines = m.lines;
          totalBytes = m.bytes;
        } else {
          fullText = concatText(e.content);
          const m = measure(fullText);
          totalLines = m.lines;
          totalBytes = m.bytes;
        }
      } else {
        // No built-in spill or truncation info — measure from content directly.
        fullText = concatText(e.content);
        const m = measure(fullText);
        totalLines = m.lines;
        totalBytes = m.bytes;
      }

      // ── Threshold check ──────────────────────────────────
      if (totalLines <= CAP_LINES && totalBytes <= CAP_BYTES) {
        return; // pass-through
      }

      // ── Spill full output ────────────────────────────────
      const toolCallId = e.toolCallId;
      const spillPath = join(SPILL_DIR, `${toolCallId}.txt`);

      try {
        writeFileSync(spillPath, fullText, "utf-8");
      } catch {
        // Disk full or permissions — still produce a capped notice.
        // The model gets the notice without a recoverable path, which
        // is better than silent full delivery.
      }

      // ── Build capped view: head + notice + tail ──────────
      const allLines = splitLines(fullText);
      const effectiveHead = Math.min(HEAD_LINES, allLines.length);
      const effectiveTail = Math.min(TAIL_LINES, Math.max(0, allLines.length - effectiveHead));

      const headLines = allLines.slice(0, effectiveHead);
      const tailLines = allLines.slice(allLines.length - effectiveTail);

      const notice = buildCapNotice(totalLines, totalBytes, effectiveHead, effectiveTail, spillPath);

      let cappedText = [...headLines, notice, ...tailLines].join("\n");

      // ── Bound stderr ─────────────────────────────────────
      // Pi does not expose stderr as a separate field on
      // BashToolResultEvent (unlike the claude-code hook input which
      // carries stderr alongside stdout). The content array may contain
      // stderr appended to a text block, but we don't have a reliable
      // separator. Skip stderr bounding for now — the cap notice
      // already covers stdout, and pi's built-in truncation also
      // bounds the combined output.
      //
      // If pi later adds a stderr field to BashToolDetails, add
      // bounding here with boundStderr().

      return {
        content: [{ type: "text", text: cappedText }],
      };
    } catch {
      // Fail-open: any error leaves the original result untouched.
      return;
    }
  });
}