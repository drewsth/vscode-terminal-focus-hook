
# Terminal Focus Hook

Run a script or inject text **whenever the active integrated terminal changes** (i.e., when a terminal tab becomes focused).

# Features
- Run an **external script** (`terminalFocusHook.scriptPath`), or
- **Send text** into the active terminal (`terminalFocusHook.sendText`)
- Optional **regex filter** by terminal name
- **Debounce** rapid UI changes to avoid duplicate triggers
- Manual command: **Terminal Focus Hook: Run Hook Now (Active Terminal)**

### New: PowerShell arg from terminal name
If your terminal is named like `CTM AAPI (hor-143)`, the extension extracts the text inside the last parentheses (here: `hor-143`) and passes it as the first argument to your script. By default, the script path is `$HOME\\Set-CtmEnv.ps1`.

# Settings

| Setting | Default | Description |
| --- | --- | --- |
| `terminalFocusHook.enabled` | `true` | Master enable/disable |
| `terminalFocusHook.scriptPath` | `""` | Absolute or workspace-relative script path <super>†</super> |
| `terminalFocusHook.sendText` | `""` | Text to send to the activated terminal (Enter auto-added) |
| `terminalFocusHook.matchTerminalName` | `""` | Only run if terminal name matches this RegExp (no slashes) |
| `terminalFocusHook.debounceMs` | `400` | Minimum ms between runs per terminal name |
| `terminalFocusHook.runOnStartupActive` | `false` | Also trigger for the active terminal at startup |
| `terminalFocusHook.logLevel` | `"info"` | `off` \| `info` \| `debug` |

† Notes
- Leave `terminalFocusHook.scriptPath` as default to call `$HOME\\Set-CtmEnv.ps1`
- For PowerShell scripts, the extension uses `pwsh` when available, otherwise Windows PowerShell.

