// Cliente: se ejecuta en la Mac. Recibe el raton y el teclado de la Windows.
const net = require('node:net');
const os = require('node:os');
const { jsonChannel } = require('./lines');
const { NO_POWER } = require('./mac-power');

/**
 * @param {object} config
 * @param {object} helper  ayudante de Mac (send(linea), eventos 'line')
 */
function createClient(config, helper, log = console.log, { power = NO_POWER, serverTimeoutMs = 5000, retryMs = 2000 } = {}) {
  let screen = null;
  let socket = null;
  let stopped = false;
  let retry = null;
  let welcomed = false;
  let lastSeen = 0;

  const watchdog = setInterval(() => {
    if (!welcomed || Date.now() - lastSeen <= serverTimeoutMs) return;
    log('Sin respuesta de la Windows: reconectando...');
    welcomed = false;
    socket.destroy();
  }, Math.min(1000, serverTimeoutMs));

  const toHelper = (msg) => {
    switch (msg.t) {
      case 'move': helper.send(`MOVE ${msg.x} ${msg.y}`); break;
      case 'btn': helper.send(`BTN ${msg.b} ${msg.d ? 'D' : 'U'}`); break;
      case 'wheel': helper.send(`WHEEL ${msg.dy} ${msg.dx}`); break;
      case 'key': helper.send(`KEY ${msg.code} ${msg.d ? 'D' : 'U'}`); break;
      case 'leave': helper.send('RESET'); log('<- control devuelto a Windows'); break;
      case 'enter': power.wakeDisplay(); log('-> recibiendo el control'); break;
      case 'welcome':
        welcomed = true;
        power.hold();
        log(`Conectado a ${config.serverHost}:${config.port}.`);
        break;
      case 'denied': log(`El servidor rechazo la conexion: ${msg.reason}`); stopped = true; break;
    }
  };

  const connect = () => {
    if (stopped) return;
    socket = net.connect({ host: config.serverHost, port: config.port });
    socket.setNoDelay(true);
    const send = jsonChannel(socket, (msg) => {
      lastSeen = Date.now();
      if (msg.t === 'ping') send({ t: 'pong' });
      else toHelper(msg);
    });
    socket.on('connect', () => {
      socket.setKeepAlive(true, 2000);
      send({ t: 'hello', password: config.password, name: os.hostname(), width: screen.width, height: screen.height, heartbeat: true });
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      welcomed = false;
      power.release();
      helper.send('RESET');
      if (stopped) return;
      retry = setTimeout(connect, retryMs);
    });
  };

  helper.on('line', (line) => {
    const p = line.split(' ');
    if (p[0] === 'READY' && !screen) {
      screen = { width: Number(p[1]), height: Number(p[2]) };
      log(`Pantalla de la Mac: ${screen.width}x${screen.height}. Conectando con ${config.serverHost}...`);
      connect();
    } else if (p[0] === 'NOACCESS') {
      log(`Falta el permiso de Accesibilidad: activalo en Ajustes del Sistema > Privacidad y seguridad > Accesibilidad (en segundo plano es para "node": ${process.execPath}).`);
    }
  });

  return {
    stop() {
      stopped = true;
      clearTimeout(retry);
      clearInterval(watchdog);
      power.release();
      if (socket) socket.destroy();
    },
  };
}

module.exports = { createClient };

if (require.main === module) {
  const { loadConfig } = require('./config');
  const { startHelper } = require('./helper');
  const config = loadConfig();
  if (!config.serverHost) {
    console.error('Falta "serverHost" en config.json: pon la IP de la Windows.');
    process.exit(1);
  }
  const { waitForLock } = require('./single-instance');
  let running = null;
  const stop = () => {
    if (running) { running.client.stop(); running.helper.stop(); }
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  waitForLock(config.port + 1, { onBusy: () => console.log('Ya hay otro ControlMause abierto en esta Mac: este espera a que se cierre.') })
    .then(() => {
      const helper = startHelper('mac');
      helper.on('exit', (code) => { console.log(`El ayudante de Mac termino (codigo ${code}).`); process.exit(1); });
      const { createPower } = require('./mac-power');
      const power = createPower({ keepAwake: config.keepMacAwake !== false });
      running = { helper, client: createClient(config, helper, console.log, { power }) };
    })
    .catch((err) => {
      console.error(`No se pudo comprobar si hay otro ControlMause abierto: ${err.message}`);
      process.exit(1);
    });
}
