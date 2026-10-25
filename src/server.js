// Servidor: se ejecuta en la Windows (la que tiene el teclado y el raton).
const net = require('node:net');
const crypto = require('node:crypto');
const { jsonChannel } = require('./lines');
const { RemoteCursor } = require('./layout');
const { windowsToMac } = require('./keymap');

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * @param {object} config  ver config.example.json
 * @param {object} helper  ayudante de Windows (send(linea), eventos 'line')
 * @param {(msg:string)=>void} log
 */
function createServer(config, helper, log = console.log) {
  const cursor = new RemoteCursor({ side: config.macSide, speed: config.mouseSpeed });
  let client = null;       // { send, socket, name }
  let remote = false;      // true mientras el raton controla la Mac
  const wheelRest = { W: 0, H: 0 };   // restos de la rueda (touchpads envian pasos pequenos)

  const leaveMac = (fraction) => {
    if (!remote) return;
    remote = false;
    cursor.active = false;
    if (client) client.send({ t: 'leave' });
    helper.send(`RELEASE ${fraction.toFixed(4)}`);
    log('<- de vuelta en Windows');
  };

  helper.on('line', (line) => {
    const p = line.split(' ');
    switch (p[0]) {
      case 'READY':
        log(`Ayudante de Windows listo (escritorio ${p[3]}x${p[4]}).`);
        break;
      case 'ERROR':
        log(`Error del ayudante de Windows: ${line.slice(6)}`);
        break;
      case 'ENTER': {
        if (!client) { helper.send('RELEASE 0.5'); break; }
        remote = true;
        const pos = cursor.enter(Number(p[1]));
        client.send({ t: 'enter' });
        client.send({ t: 'move', ...pos });
        log(`-> controlando ${client.name}`);
        break;
      }
      case 'RELEASED':
        if (remote) {
          remote = false;
          cursor.active = false;
          if (client) client.send({ t: 'leave' });
          log('<- de vuelta en Windows (atajo Ctrl+Alt+F12 o seguridad)');
        }
        break;
      case 'M': {
        if (!remote || !client) break;
        const r = cursor.move(Number(p[1]), Number(p[2]));
        if ('leave' in r) leaveMac(r.leave);
        else client.send({ t: 'move', x: r.x, y: r.y });
        break;
      }
      case 'B':
        if (remote && client) client.send({ t: 'btn', b: p[1], d: p[2] === 'D' });
        break;
      case 'W':
      case 'H': {
        if (!remote || !client) break;
        wheelRest[p[0]] += (Number(p[1]) / 40) * config.scrollSpeed;
        let lines = Math.trunc(wheelRest[p[0]]);
        if (!lines) break;
        wheelRest[p[0]] -= lines;
        if (config.invertScroll) lines = -lines;
        // Windows: H positivo = derecha. Mac: eje X positivo = izquierda.
        client.send(p[0] === 'W' ? { t: 'wheel', dy: lines, dx: 0 } : { t: 'wheel', dy: 0, dx: -lines });
        break;
      }
      case 'K': {
        if (!remote || !client) break;
        const code = windowsToMac({ vk: Number(p[1]), scan: Number(p[2]), extended: p[4] === '1' }, config.modifiers);
        if (code !== null) client.send({ t: 'key', code, d: p[3] === 'D' });
        break;
      }
    }
  });

  const server = net.createServer((socket) => {
    socket.setNoDelay(true);
    let me = null;
    const send = jsonChannel(socket, (msg) => {
      if (msg.t !== 'hello' || me) return;
      if (!sameSecret(msg.password, config.password)) {
        send({ t: 'denied', reason: 'clave incorrecta' });
        log(`Conexion rechazada desde ${socket.remoteAddress}: clave incorrecta.`);
        socket.end();
        return;
      }
      if (client) {
        log(`Reemplazando la conexion anterior de ${client.name}.`);
        client.socket.destroy();
      }
      me = { send, socket, name: String(msg.name || 'Mac') };
      client = me;
      cursor.setScreen(Number(msg.width), Number(msg.height));
      send({ t: 'welcome' });
      helper.send(`EDGE ${cursor.windowsEdge()}`);
      log(`Conectado: ${me.name} (${msg.width}x${msg.height}). Mueve el raton al borde ${config.macSide === 'left' ? 'izquierdo' : 'derecho'}.`);
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      if (client !== me || !me) return;
      client = null;
      if (remote) { remote = false; helper.send('RELEASE 0.5'); }
      helper.send('EDGE none');
      log(`Desconectado: ${me.name}.`);
    });
  });

  // Le decimos al ayudante que Node sigue vivo; si se cuelga, suelta el control solo.
  const ping = setInterval(() => helper.send('PING'), 1000);
  server.on('close', () => clearInterval(ping));

  return {
    server,
    listen: (port = config.port, host) => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { clearInterval(ping); if (client) client.socket.destroy(); server.close(resolve); }),
    get remote() { return remote; },
  };
}

module.exports = { createServer };

if (require.main === module) {
  const os = require('node:os');
  const { loadConfig } = require('./config');
  const { startHelper } = require('./helper');
  const config = loadConfig();
  const helper = startHelper('windows');
  helper.on('exit', (code) => { console.log(`El ayudante de Windows termino (codigo ${code}).`); process.exit(1); });
  helper.on('error', (err) => { console.error(`No se pudo iniciar PowerShell: ${err.message}`); process.exit(1); });
  const app = createServer(config, helper);
  app.listen(config.port).then((port) => {
    const ips = Object.values(os.networkInterfaces()).flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
    console.log(`ControlMause servidor escuchando en el puerto ${port}.`);
    console.log(`En la Mac, pon "serverHost" con una de estas IP: ${ips.join(', ') || '(sin red)'}`);
    console.log('Atajo de emergencia para volver a Windows: Ctrl+Alt+F12.');
  });
  const stop = () => { helper.stop(); app.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
