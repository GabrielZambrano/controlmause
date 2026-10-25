const { loadConfig } = require('../config');
const { logFile, tail } = require('./paths');

const PLATFORMS = { win32: './windows', darwin: './mac' };
const CHECK_DELAY_MS = 5000;

function platform() {
  const file = PLATFORMS[process.platform];
  if (!file) throw new Error('El inicio automatico solo funciona en Windows y macOS.');
  return require(file);
}

function printStatus(target) {
  target.status();
  const lines = tail(logFile());
  console.log(`Registro: ${logFile()}`);
  if (lines.length) console.log(lines.map((l) => `  ${l}`).join('\n'));
}

function main(action) {
  const target = platform();
  if (action === 'on') {
    const config = loadConfig();
    if (process.platform === 'darwin' && !config.serverHost) {
      throw new Error('Falta "serverHost" en config.json: pon la IP de la Windows.');
    }
    target.install();
    console.log('Comprobando que arranco...');
    setTimeout(() => printStatus(target), CHECK_DELAY_MS);
  } else if (action === 'off') {
    target.uninstall();
  } else {
    printStatus(target);
  }
}

try {
  main(process.argv[2]);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
}
