const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { onLines } = require('./lines');
const { ROOT, logFile } = require('./autostart/paths');

const MAX_LOG_BYTES = 1024 * 1024;
const MIN_DELAY = 2000;
const MAX_DELAY = 60000;
const STABLE_MS = 60000;

function createLog(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return (line) => {
    try {
      if (fs.existsSync(file) && fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`);
      fs.appendFileSync(file, `[${new Date().toLocaleString('sv-SE')}] ${line}\n`);
    } catch {}
  };
}

function supervise(role, log) {
  const script = path.join(ROOT, 'src', `${role}.js`);
  let child = null;
  let delay = MIN_DELAY / 2;
  let stopping = false;
  let timer = null;

  const start = () => {
    const startedAt = Date.now();
    log(`Iniciando ${role}.`);
    child = spawn(process.execPath, [script], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    onLines(child.stdout, log);
    onLines(child.stderr, log);
    child.on('error', (err) => log(`No se pudo iniciar ${role}: ${err.message}`));
    child.on('exit', (code, signal) => {
      child = null;
      if (stopping) return;
      delay = Date.now() - startedAt > STABLE_MS ? MIN_DELAY : Math.min(delay * 2, MAX_DELAY);
      log(`El ${role} termino (${signal || code}). Reinicio en ${delay / 1000} s.`);
      timer = setTimeout(start, delay);
    });
  };

  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    if (!child) return process.exit(0);
    child.once('exit', () => process.exit(0));
    child.kill('SIGTERM');
    setTimeout(() => process.exit(0), 3000).unref();
  };

  start();
  return { stop };
}

if (require.main === module) {
  const role = process.argv[2] === 'client' ? 'client' : 'server';
  const service = supervise(role, createLog(logFile()));
  process.on('SIGINT', service.stop);
  process.on('SIGTERM', service.stop);
}

module.exports = { supervise, createLog };
