const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./paths');

const SHORTCUT = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'ControlMause.lnk');

const FIND_PROCESSES = `
$root = $env:CM_ROOT.ToLower()
$all = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine })
$services = @($all | Where-Object { $_.CommandLine.ToLower().Contains($root + '\\src\\service.js') })
$helpers = @($all | Where-Object { $_.CommandLine.ToLower().Contains($root + '\\helpers\\win-hook.ps1') })
$ids = @(@($services.ProcessId) + @($helpers.ParentProcessId) + @($helpers.ProcessId) | Where-Object { $_ } | Select-Object -Unique)
`;

const CREATE_SHORTCUT = `
$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CM_LNK)
$s.TargetPath = $env:CM_TARGET
$s.Arguments = $env:CM_ARGS
$s.WorkingDirectory = $env:CM_ROOT
$s.WindowStyle = 7
$s.Description = 'ControlMause'
$s.Save()
Start-Process -FilePath $env:CM_LNK
`;

function launchCommand(node = process.execPath, root = ROOT, systemRoot = process.env.SystemRoot || 'C:\\Windows') {
  return {
    target: path.win32.join(systemRoot, 'System32', 'conhost.exe'),
    args: `--headless "${node}" "${path.win32.join(root, 'src', 'service.js')}" server`,
  };
}

function powershell(script, env = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, CM_ROOT: ROOT, ...env },
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

function running() {
  const out = powershell(`${FIND_PROCESSES}\n$ids -join ' '`);
  return out ? out.split(/\s+/).map(Number) : [];
}

function stop() {
  const out = powershell(`${FIND_PROCESSES}\nif ($ids.Count) { Stop-Process -Id $ids -Force -ErrorAction SilentlyContinue }\n$ids.Count`);
  return Number(out) || 0;
}

function install() {
  const stopped = stop();
  if (stopped) console.log('Se cerro el ControlMause que estaba abierto para dejarlo en segundo plano.');
  const { target, args } = launchCommand();
  powershell(CREATE_SHORTCUT, { CM_LNK: SHORTCUT, CM_TARGET: target, CM_ARGS: args });
  console.log('Inicio automatico activado: ControlMause arranca solo al entrar a Windows, sin ventana.');
}

function uninstall() {
  fs.rmSync(SHORTCUT, { force: true });
  const stopped = stop();
  console.log(`Inicio automatico desactivado${stopped ? ' y ControlMause detenido' : ''}.`);
}

function status() {
  const ids = running();
  console.log(`Inicio automatico: ${fs.existsSync(SHORTCUT) ? 'activado' : 'desactivado'}`);
  console.log(`En ejecucion: ${ids.length ? `si (PID ${ids.join(', ')})` : 'no'}`);
}

module.exports = { install, uninstall, status, launchCommand };
