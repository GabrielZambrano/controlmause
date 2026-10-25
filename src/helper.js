// Arranca el ayudante nativo (PowerShell en Windows, osascript en Mac) y habla con el
// por stdin/stdout, una linea por orden o evento.
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { onLines } = require('./lines');

const HELPERS = path.join(__dirname, '..', 'helpers');

function commandFor(kind) {
  if (kind === 'windows') {
    return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(HELPERS, 'win-hook.ps1')]];
  }
  if (kind === 'mac') {
    return ['osascript', ['-l', 'JavaScript', path.join(HELPERS, 'mac-inject.js')]];
  }
  throw new Error(`Ayudante desconocido: ${kind}`);
}

/**
 * Devuelve un objeto con send(linea) que emite 'line' por cada linea recibida y
 * 'exit' cuando el proceso termina. CONTROLMAUSE_HELPER permite sustituirlo en pruebas.
 */
function startHelper(kind) {
  const [cmd, args] = process.env.CONTROLMAUSE_HELPER
    ? [process.execPath, [process.env.CONTROLMAUSE_HELPER, kind]]
    : commandFor(kind);
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  const helper = new EventEmitter();
  helper.send = (line) => {
    if (child.stdin.writable) child.stdin.write(line + '\n');
  };
  helper.stop = () => {
    helper.send('QUIT');
    child.stdin.end();
  };
  onLines(child.stdout, (line) => helper.emit('line', line));
  child.on('exit', (code) => helper.emit('exit', code));
  child.on('error', (err) => helper.emit('error', err));
  return helper;
}

module.exports = { startHelper };
