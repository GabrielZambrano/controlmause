const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

function logDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ControlMause');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Logs', 'ControlMause');
  return path.join(os.homedir(), '.controlmause');
}

const logFile = () => path.join(logDir(), 'controlmause.log');

function tail(file, count = 12) {
  try {
    return fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-count);
  } catch {
    return [];
  }
}

module.exports = { ROOT, logDir, logFile, tail };
