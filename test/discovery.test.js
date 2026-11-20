const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { createBeacon, createFinder, broadcastAddresses } = require('../src/discovery');
const { createServer } = require('../src/server');
const { createClient } = require('../src/client');

const CONFIG = { password: 'secreto', macSide: 'left', mouseSpeed: 1, scrollSpeed: 1, invertScroll: false, modifiers: {} };
const quiet = () => {};

function fakeHelper() {
  const h = new EventEmitter();
  h.sent = [];
  h.send = (line) => h.sent.push(line);
  h.say = (line) => h.emit('line', line);
  return h;
}

function until(check, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('tiempo agotado'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function freeUdpPort() {
  const dgram = require('node:dgram');
  return new Promise((resolve) => {
    const s = dgram.createSocket('udp4');
    s.bind(0, () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

test('direcciones de difusion de cada red', () => {
  const list = broadcastAddresses({
    wifi: [{ family: 'IPv4', address: '192.168.100.7', netmask: '255.255.255.0', internal: false }],
    lo: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', internal: true }],
    vpn: [{ family: 'IPv4', address: '10.8.3.2', netmask: '255.255.0.0', internal: false }],
  });
  assert.deepStrictEqual(list, ['255.255.255.255', '192.168.100.255', '10.8.255.255']);
});

test('la Mac encuentra el aviso de su Windows e ignora el de otra clave', async () => {
  const discoveryPort = await freeUdpPort();
  const seen = [];
  const finder = createFinder({ password: 'secreto', discoveryPort, onFound: (host, port) => seen.push(`${host}:${port}`) });
  await finder.ready;
  const other = createBeacon({ password: 'otra', port: 1111, discoveryPort, targets: () => ['127.0.0.1'], intervalMs: 50 });
  const mine = createBeacon({ password: 'secreto', port: 24810, discoveryPort, targets: () => ['127.0.0.1'], intervalMs: 50 });
  await until(() => seen.length >= 2);
  assert.ok(seen.every((s) => s === '127.0.0.1:24810'));
  other.stop(); mine.stop(); finder.stop();
});

test('sin IP en config.json la Mac se conecta a la Windows que encontro en la red', async () => {
  const win = fakeHelper();
  const server = createServer({ ...CONFIG, port: 0 }, win, quiet);
  const port = await server.listen(0, '127.0.0.1');
  const mac = fakeHelper();
  const logs = [];
  const client = createClient({ ...CONFIG, port: 24810, serverHost: 'auto' }, mac, (m) => logs.push(m), { retryMs: 50 });
  mac.say('READY 100 100');
  await until(() => logs.some((l) => l.includes('Buscando la Windows')));
  client.found('127.0.0.1', port);
  await until(() => win.sent.includes('EDGE left'));
  assert.ok(logs.some((l) => l.includes('conexion cifrada')));
  client.stop();
  await server.close();
});

test('si la IP fija ya no sirve, la Mac cambia a la que anuncia la Windows', async () => {
  const dead = await new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
  const win = fakeHelper();
  const server = createServer({ ...CONFIG, port: 0 }, win, quiet);
  const port = await server.listen(0, '127.0.0.1');
  const mac = fakeHelper();
  const logs = [];
  const client = createClient({ ...CONFIG, port: dead, serverHost: '127.0.0.1' }, mac, (m) => logs.push(m), { retryMs: 50 });
  mac.say('READY 100 100');
  await until(() => logs.some((l) => l.includes('no responde')));
  client.found('127.0.0.1', port);
  await until(() => win.sent.includes('EDGE left'));
  client.stop();
  await server.close();
});
