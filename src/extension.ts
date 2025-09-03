
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as os from 'os';

type LogLevel = 'off' | 'info' | 'debug';

interface Settings {
  enabled: boolean;
  scriptPath: string;
  sendText: string;
  matchTerminalName?: string;
  debounceMs: number;
  runOnStartupActive: boolean;
  logLevel: LogLevel;
}

let output: vscode.OutputChannel | undefined;
let lastRunPerName = new Map<string, number>();

export function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('Terminal Focus Hook');
  log('info', 'Extension activated.');

  context.subscriptions.push(
    vscode.commands.registerCommand('terminalFocusHook.runNow', async () => {
      const term = vscode.window.activeTerminal;
      if (!term) {
        log('info', 'No active terminal.');
        return;
      }
      await runHook(term);
    })
  );

  const sub = vscode.window.onDidChangeActiveTerminal(async (term) => {
    if (term) {
      await runHook(term);
    } else {
      log('debug', 'Active terminal changed to: <none>');
    }
  });
  context.subscriptions.push(sub);

  // Optional: run on startup for the current active terminal
  const cfg = readSettings();
  if (cfg.runOnStartupActive && vscode.window.activeTerminal) {
    runHook(vscode.window.activeTerminal);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('terminalFocusHook')) {
        log('info', 'Settings changed; reloading configuration.');
        lastRunPerName.clear();
      }
    })
  );
}

export function deactivate() {
  output?.dispose();
}

function readSettings(): Settings {
  const c = vscode.workspace.getConfiguration('terminalFocusHook');
  return {
    enabled: c.get<boolean>('enabled', true),
    scriptPath: (c.get<string>('scriptPath', '') || '').trim(),
    sendText: (c.get<string>('sendText', '') || '').toString(),
    matchTerminalName: (c.get<string>('matchTerminalName', '') || '').trim(),
    debounceMs: Math.max(0, c.get<number>('debounceMs', 400)),
    runOnStartupActive: c.get<boolean>('runOnStartupActive', false),
  logLevel: c.get<LogLevel>('logLevel', 'info')
  };
}

async function runHook(term: vscode.Terminal) {
  const cfg = readSettings();
  if (!cfg.enabled) {
    log('debug', 'Hook disabled; skipping.');
    return;
  }

  const name = (term.name ?? 'unknown').toString();
  log('debug', `Active terminal: ${name}`);

  if (cfg.matchTerminalName) {
    try {
      const re = new RegExp(cfg.matchTerminalName);
      if (!re.test(name)) {
        log('debug', `Name "${name}" did not match /${cfg.matchTerminalName}/; skipping.`);
        return;
      }
    } catch (err) {
      log('info', `Invalid regex in setting "matchTerminalName": ${cfg.matchTerminalName}`);
      return;
    }
  }

  const now = Date.now();
  const last = lastRunPerName.get(name) ?? 0;
  if (cfg.debounceMs > 0 && now - last < cfg.debounceMs) {
    log('debug', `Debounced (last ${now - last}ms < ${cfg.debounceMs}ms) for "${name}".`);
    return;
    }
  lastRunPerName.set(name, now);

  let didSomething = false;

  if (cfg.scriptPath) {
    // Expand $HOME/~ first so absolute paths are detected correctly, then resolve relative-to-workspace
    const script = resolvePathPossiblyWorkspaceRelative(expandHome(cfg.scriptPath));
  // Extract argument from terminal name: value inside the last pair of parentheses
  const argFromName = extractArgFromTerminalName(name);
    if (argFromName) {
      log('info', `Extracted argument from terminal name: ${argFromName}`);
      runExternalScript(script, argFromName ? [argFromName] : [], term);
      didSomething = true;
    } else {
      log('debug', 'No argument extracted from terminal name.');
    }
  }

  if (cfg.sendText) {
    term.sendText(cfg.sendText, true);
    log('info', `Sent text to "${name}".`);
    didSomething = true;
  }

  if (!didSomething) {
    log('info', 'No action configured (both "scriptPath" and "sendText" are empty).');
  }
}

function runExternalScript(scriptPath: string, args: string[] = [], targetTerminal?: vscode.Terminal) {
  const isPs1 = scriptPath.toLowerCase().endsWith('.ps1');
  let command = scriptPath;
  let commandArgs: string[] = [];

  if (isPs1) {
    // Prefer PowerShell 7 (pwsh). Fall back to Windows PowerShell if needed.
    command = 'pwsh';
    commandArgs = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args];
  } else {
    command = scriptPath;
    commandArgs = args;
  }

  log('info', `Running script: ${scriptPath}${args.length ? ' ' + args.map(a => JSON.stringify(a)).join(' ') : ''}`);

  const child = spawn(command, commandArgs, {
    shell: !isPs1, // don't wrap pwsh invocations in another shell
    env: process.env
  });

  let stderrBuf = '';
  child.stdout?.on('data', (d) => log('debug', `[stdout] ${d.toString().trimEnd()}`));
  child.stderr?.on('data', (d) => {
    const text = d.toString();
    log('debug', `[stderr] ${text.trimEnd()}`);
    // Accumulate up to 4000 chars to avoid huge prints
    stderrBuf = (stderrBuf + text).slice(-4000);
  });
  child.on('close', (code) => {
    log('info', `Script exited with code ${code}`);
    if (typeof code === 'number' && code !== 0) {
      const snippet = stderrBuf.trim().split(/\r?\n/).slice(-5).join(' | ');
      const detail = snippet ? ` Error: ${snippet}` : '';
      printErrorToTerminal(targetTerminal, `Script failed (exit code ${code}): ${scriptPath}.${detail}`);
    }
  });
  child.on('error', (err) => {
    // Retry with Windows PowerShell if pwsh isn't found
    if (isPs1 && (err as any)?.code === 'ENOENT') {
      log('info', 'pwsh not found; retrying with Windows PowerShell.');
      const fallback = spawn('powershell', ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
        shell: false,
        env: process.env
      });
      let fbStderrBuf = '';
      fallback.stdout?.on('data', (d) => log('debug', `[stdout] ${d.toString().trimEnd()}`));
      fallback.stderr?.on('data', (d) => {
        const text = d.toString();
        log('debug', `[stderr] ${text.trimEnd()}`);
        fbStderrBuf = (fbStderrBuf + text).slice(-4000);
      });
      fallback.on('close', (code) => {
        log('info', `Script (fallback) exited with code ${code}`);
        if (typeof code === 'number' && code !== 0) {
          const snippet = fbStderrBuf.trim().split(/\r?\n/).slice(-5).join(' | ');
          const detail = snippet ? ` Error: ${snippet}` : '';
          printErrorToTerminal(targetTerminal, `Script failed (exit code ${code}) via fallback: ${scriptPath}.${detail}`);
        }
      });
      fallback.on('error', (e2) => {
        log('info', `Failed to start script (fallback): ${e2}`);
        const detail = (e2 as any)?.message ? ` Error: ${(e2 as any).message}` : '';
        printErrorToTerminal(targetTerminal, `Failed to start script (fallback): ${scriptPath}.${detail}`);
      });
      return;
    }
    log('info', `Failed to start script: ${err}`);
    const detail = (err as any)?.message ? ` Error: ${(err as any).message}` : '';
    printErrorToTerminal(targetTerminal, `Failed to start script: ${scriptPath}.${detail}`);
  });
}

function printErrorToTerminal(term: vscode.Terminal | undefined, message: string) {
  if (!term) return;
  // Use echo for a cross-shell print (works in PowerShell, bash, cmd)
  // Quote the message to prevent token parsing (e.g., 'exit:' or parentheses) in PowerShell
  const escaped = message.replace(/"/g, '\\"');
  const text = `echo "[Terminal Focus Hook] ERROR: ${escaped}"`;
  try {
    term.sendText(text, true);
  } catch {
    // ignore send errors
  }
}

function extractArgFromTerminalName(name: string): string | undefined {
  // Grab the content inside the last pair of parentheses, e.g. "CTM AAPI (hor-143)" => "hor-143"
  const close = name.lastIndexOf(')');
  if (close === -1) return undefined;
  const open = name.lastIndexOf('(', close);
  if (open === -1 || open >= close) return undefined;
  const value = name.substring(open + 1, close).trim();
  return value || undefined;
}

function resolvePathPossiblyWorkspaceRelative(p: string) {
  if (path.isAbsolute(p)) return p;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return path.join(folders[0].uri.fsPath, p);
  }
  return p; // fallback
}

function expandHome(p: string): string {
  // Support $HOME and ~ prefixes
  const home = os.homedir();
  if (!p) return p;
  if (p.startsWith('~')) {
    return path.join(home, p.slice(1));
  }
  // Replace $HOME or ${HOME}
  let result = p.replace(/^\$(HOME|\{HOME\})(\\|\/)?/i, (_m, _g1, sep) => home + (sep ?? path.sep));
  // Replace %USERPROFILE% (Windows) if present
  result = result.replace(/%USERPROFILE%/i, process.env.USERPROFILE ?? home);
  // Replace $env:HOME (PowerShell style)
  result = result.replace(/^\$env:HOME(\\|\/)?/i, (_m, sep) => home + (sep ?? path.sep));
  return result;
}

function log(level: LogLevel, msg: string) {
  const c = vscode.workspace.getConfiguration('terminalFocusHook');
  const cfgLevel = c.get<LogLevel>('logLevel', 'info');
  const order: LogLevel[] = ['off', 'info', 'debug'];
  if (order.indexOf(level) <= order.indexOf(cfgLevel) && cfgLevel !== 'off') {
    output?.appendLine(`[${level}] ${msg}`);
  }
}
