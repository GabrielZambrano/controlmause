// Cliente: se ejecuta en la Mac. Recibe el raton y el teclado de la Windows.
const os = require('node:os');
const { jsonChannel } = require('./lines');
const secure = require('./secure');
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
  // Direccion de la Windows: la fija de config.json, o la que anuncia en la red.
  const fixedHost = config.serverHost && config.serverHost !== 'auto' ? config.serverHost : null;
  let found = null;        // { host, port } del ultimo aviso recibido
  let current = null;      // a donde se esta conectando ahora
  let lastProblem = '';
  const target = () => found || (fixedHost ? { host: fixedHost, port: config.port } : null);
  const problem = (text) => {
    if (text === lastProblem) return;
    lastProblem = text;
    log(text);
  };

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
        lastProblem = '';
        log(`Conectado a la Windows (${current.host}:${current.port}), conexion cifrada.`);
        break;
    }
  };

  const connect = () => {
    retry = null;
    if (stopped || socket) return;
    current = target();
    if (!current) {
      problem('Buscando la Windows en la red...');
      retry = setTimeout(connect, retryMs);
      return;
    }
    const me = secure.connect({ host: current.host, port: current.port, password: config.password });
    socket = me;
    me.setNoDelay(true);
    const send = jsonChannel(me, (msg) => {
      lastSeen = Date.now();
      if (msg.t === 'ping') send({ t: 'pong' });
      else toHelper(msg);
    });
    me.on('secureConnect', () => {
      me.setKeepAlive(true, 2000);
      send({ t: 'hello', name: os.hostname(), width: screen.width, height: screen.height, heartbeat: true });
    });
    me.on('error', (err) => {
      if (/SSL|TLS|alert|handshake/i.test(`${err.code} ${err.message}`)) {
        problem('La Windows rechazo la conexion cifrada: revisa que la clave sea la misma en las dos (y que las dos tengan la version nueva).');
      } else if (['ECONNREFUSED', 'EHOSTUNREACH', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTDOWN'].includes(err.code)) {
        problem(`La Windows no responde en ${current.host}:${current.port}. ${fixedHost && !found ? 'Revisa la IP o pon "serverHost": "auto".' : 'Esperando...'}`);
      }
    });
    me.on('close', () => {
      if (socket === me) socket = null;
      welcomed = false;
      helper.send('RESET');
      if (stopped || retry) return;
      retry = setTimeout(connect, retryMs);
    });
  };

  helper.on('line', (line) => {
    const p = line.split(' ');
    if (p[0] === 'READY' && !screen) {
      screen = { width: Number(p[1]), height: Number(p[2]) };
      // La Mac no entra en reposo mientras ControlMause corre, aunque la Windows se
      // apague o reinicie: si se durmiera, sin teclado propio nadie podria despertarla
      // y no volveria a conectarse sola.
      power.hold();
      log(`Pantalla de la Mac: ${screen.width}x${screen.height}. ${fixedHost ? `Conectando con ${fixedHost}...` : 'Buscando la Windows en la red...'}`);
      connect();
    } else if (p[0] === 'NOACCESS') {
      log(`Falta el permiso de Accesibilidad: activalo en Ajustes del Sistema > Privacidad y seguridad > Accesibilidad (en segundo plano es para "node": ${process.execPath}).`);
    }
  });

  return {
    /** La Windows se anuncio en la red. */
    found(host, port) {
      const changed = !found || found.host !== host || found.port !== port;
      found = { host, port };
      if (!changed) return;
      log(`Windows encontrada en la red: ${host}:${port}.`);
      // Si estamos conectados a otra direccion que no responde, cambiamos ya.
      if (screen && !welcomed) {
        if (socket) socket.destroy();
        else { clearTimeout(retry); connect(); }
      }
    },
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
      const client = createClient(config, helper, console.log, { power });
      const { createFinder } = require('./discovery');
      createFinder({ password: config.password, discoveryPort: config.discoveryPort, onFound: client.found, log: console.log });
      running = { helper, client };
    })
    .catch((err) => {
      console.error(`No se pudo comprobar si hay otro ControlMause abierto: ${err.message}`);
      process.exit(1);
    });
}
