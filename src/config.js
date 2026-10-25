const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = {
  port: 24810,
  password: '',
  serverHost: '',
  macSide: 'left',
  mouseSpeed: 1,
  scrollSpeed: 1,
  invertScroll: false,
  keepMacAwake: true,
  modifiers: { ctrl: 'command', win: 'control', alt: 'option' },
};

function loadConfig(file = process.env.CONTROLMAUSE_CONFIG || path.join(__dirname, '..', 'config.json')) {
  let user = {};
  if (fs.existsSync(file)) user = JSON.parse(fs.readFileSync(file, 'utf8'));
  const config = { ...DEFAULTS, ...user, modifiers: { ...DEFAULTS.modifiers, ...(user.modifiers || {}) } };
  if (!config.password) {
    throw new Error(`Falta "password" en ${file}. Copia config.example.json a config.json y pon una clave.`);
  }
  return config;
}

module.exports = { loadConfig, DEFAULTS };
