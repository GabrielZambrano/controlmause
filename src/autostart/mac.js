const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ROOT, logDir } = require('./paths');

const LABEL = 'com.controlmause.client';
const APP_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ControlMause');
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const APP_FILES = ['package.json', 'config.json', 'src', 'helpers'];

const xml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plist({ node, appDir, logs }) {
  const args = [node, path.posix.join(appDir, 'src', 'service.js'), 'client'];
  const launchdLog = xml(path.posix.join(logs, 'launchd.log'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args.map((a) => `    <string>${xml(a)}</string>`).join('\n')}
  </array>
  <key>WorkingDirectory</key><string>${xml(appDir)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Interactive</string>
  <key>StandardOutPath</key><string>${launchdLog}</string>
  <key>StandardErrorPath</key><string>${launchdLog}</string>
</dict>
</plist>
`;
}

function findNode() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const candidate = path.join(dir, 'node');
    if (dir && !dir.includes('node_modules') && fs.existsSync(candidate)) return candidate;
  }
  return process.execPath;
}

const target = () => `gui/${process.getuid()}/${LABEL}`;

function launchctl(args) {
  try {
    return { ok: true, out: execFileSync('launchctl', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (err) {
    return { ok: false, out: String(err.stderr || err.message) };
  }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function clientHelpers() {
  const out = execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,command='], { encoding: 'utf8' });
  return out.split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match && match[3].includes('osascript') && match[3].includes('mac-inject.js'))
    .map((match) => ({ pid: Number(match[1]), parent: Number(match[2]) }));
}

function stopAllClients() {
  for (const { parent } of clientHelpers()) {
    try { process.kill(parent, 'SIGTERM'); } catch {}
  }
}

function disableOtherAgents() {
  const dir = path.dirname(PLIST);
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.plist') && name !== path.basename(PLIST));
  } catch {
    return [];
  }
  const disabled = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const text = fs.readFileSync(file, 'utf8');
    if (!/controlmause/i.test(text)) continue;
    const label = (text.match(/<key>Label<\/key>\s*<string>([^<]+)<\/string>/) || [])[1] || name.replace(/\.plist$/, '');
    launchctl(['bootout', `gui/${process.getuid()}/${label}`]);
    fs.renameSync(file, `${file}.disabled`);
    disabled.push(name);
  }
  return disabled;
}

function copyApp() {
  if (path.resolve(ROOT) === path.resolve(APP_DIR)) {
    throw new Error('Ejecuta "npm run autostart" desde la carpeta del repo, no desde la copia instalada.');
  }
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  for (const file of APP_FILES) fs.cpSync(path.join(ROOT, file), path.join(APP_DIR, file), { recursive: true });
}

function load() {
  let result = { ok: false, out: '' };
  for (let attempt = 0; attempt < 10 && !result.ok; attempt++) {
    if (attempt) sleep(500);
    result = launchctl(['bootstrap', `gui/${process.getuid()}`, PLIST]);
  }
  if (!result.ok) throw new Error(`launchctl no pudo cargar el agente: ${result.out.trim()}`);
}

function install() {
  for (const name of disableOtherAgents()) {
    console.log(`Se desactivo otro inicio automatico de ControlMause: ~/Library/LaunchAgents/${name} (renombrado a .disabled).`);
  }
  launchctl(['bootout', target()]);
  stopAllClients();
  copyApp();
  fs.mkdirSync(logDir(), { recursive: true });
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  const node = findNode();
  fs.writeFileSync(PLIST, plist({ node, appDir: APP_DIR, logs: logDir() }));
  load();
  console.log('Inicio automatico activado: ControlMause arranca solo al iniciar sesion en la Mac.');
  console.log('Importante: en Ajustes del Sistema > Privacidad y seguridad > Accesibilidad activa "node".');
  console.log(`Si no aparece, agregalo con + (Cmd+Shift+G y pega esta ruta): ${fs.realpathSync(node)}`);
  console.log('Cada vez que cambies config.json o hagas git pull, vuelve a correr "npm run autostart".');
}

function uninstall() {
  launchctl(['bootout', target()]);
  fs.rmSync(PLIST, { force: true });
  fs.rmSync(APP_DIR, { recursive: true, force: true });
  console.log('Inicio automatico desactivado y ControlMause detenido.');
}

function status() {
  const info = launchctl(['print', target()]);
  const state = info.ok && (info.out.match(/^\s*state = (\S+)/m) || [])[1];
  const pid = info.ok && (info.out.match(/^\s*pid = (\d+)/m) || [])[1];
  console.log(`Inicio automatico: ${fs.existsSync(PLIST) ? 'activado' : 'desactivado'}`);
  console.log(`En ejecucion: ${state === 'running' ? `si (PID ${pid})` : 'no'}`);
  const clients = clientHelpers().length;
  if (clients > 1) console.log(`Ojo: hay ${clients} clientes de ControlMause abiertos. Corre "npm run autostart" para dejar solo uno.`);
}

module.exports = { install, uninstall, status, plist };
