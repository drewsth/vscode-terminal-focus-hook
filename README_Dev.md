# Quick start

1. **Install deps**
   ```bash
   npm install
   ```
2. **Build**
   ```bash
   npm run compile
   ```
3. **Launch** the extension host
   Press `F5` in VS Code (using the provided launch config) to open a new Extension Development Host.

4. **Configure** (in the dev host):
   - Open **Settings** and search for “Terminal Focus Hook”.
   - Set `terminalFocusHook.scriptPath` to a script (e.g. `./demo-scripts/on-terminal-focus.sh` or `.ps1` on Windows), or set `terminalFocusHook.sendText` to some command like `echo "Activated!"`.

5. **Test**
   - Open a few terminals (bash, zsh, PowerShell, etc.).
   - Click between terminal tabs; watch the **Output: Terminal Focus Hook** channel for logs.

# Packaging

To produce a `.vsix`:
```bash
npm run compile
npm run package
```

Install via: **Extensions** → `...` (More) → **Install from VSIX...`

## Notes
- If you prefer keybinding‑driven behavior instead of automatic hooks, you can bind a key to focus the terminal and then run a task/command using `terminalFocus` when‑clauses.
