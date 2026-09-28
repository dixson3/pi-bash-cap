# pi-bash-cap

Pi coding-agent extension: mechanical Bash output capping. Caps oversized Bash results before they enter the model's context window, spilling full output to a recoverable file.

Modeled on the same pattern as [Claude Code's `bash-output-cap.sh`](https://github.com/dixson3/rc-files/blob/main/claude/hooks/bash-output-cap.sh) hook, adapted for pi's `tool_result` extension event.

## How it works

Registers a `tool_result` handler on the `bash` and `powershell` tools. When output exceeds configured thresholds (lines or bytes), the handler:

1. Spills the full output to `~/.pi/bash-cap-spill/<toolCallId>.txt`
2. Replaces the result content with a truncated view (head + cap notice + tail)
3. The model sees the capped version; the full output is recoverable via `grep`/`sed` on the spill file

The handler is fail-open: any error leaves the original result untouched.

## Installation

```bash
pi install npm:pi-bash-cap
```

Or add to `settings.json` packages:

```json
{
  "packages": ["npm:pi-bash-cap"]
}
```

For development, load directly:

```bash
pi --extension ./index.ts
```

## Configuration

No configuration needed — sensible defaults. Tunable via environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `PI_BASH_CAP_LINES` | 400 | Trigger threshold, lines |
| `PI_BASH_CAP_BYTES` | 20000 | Trigger threshold, bytes |
| `PI_BASH_CAP_HEAD` | 100 | Lines kept from the top |
| `PI_BASH_CAP_TAIL` | 40 | Lines kept from the bottom |
| `PI_BASH_CAP_OFF` | (unset) | Set to `1` to disable entirely |

## Escape hatch

Per-command escape hatch: include the string `nocap` anywhere in the command (e.g. `# nocap` at the end) when completeness is the point — a failing test's error, a full set of linter findings, a verification whose value is that nothing was missed.

## Recovering capped output

When output is capped, the model receives a notice block with:

- Total lines and bytes
- Which lines were omitted
- Path to the full spill file
- Recovery commands: `grep -n <pattern>` or `sed -n <start>,<end>p` on the spill file
- Instruction to re-run uncapped with `# nocap`

## License

MIT © 2026 James Dixson