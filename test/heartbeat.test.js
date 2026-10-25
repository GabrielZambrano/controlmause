const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { createServer } = require('../src/server');
const { createClient } = require('../src/client');
const { createPower } = require('../src/mac-power');
const { jsonChannel } = require('../src/lines');

const CONFIG = { password: 'secreto', macSide: 'left', mouseSpeed: 1, scrollSpeed: 1, invertScroll: false, modifiers: {}, serverHost: '127.0.0.1' };
const quiet = () => {};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function rawMac(port, hello) {
  const socket = net.connect({ port, host: '127.0.0.1' });
  socket.on('error', () => {});
  const send = jsonChannel(socket, () => {});
  socket.on('connect', () => send({ t: 'hello', password: 'secreto', name: 'Mac', width: 100, height: 100, ...hello }));
  return socket;
}

test('la Mac se reconecta si la Windows deja de responder, como al despertar del reposo', async () => {
  let connections = 0;
  const silent = net.createServer((socket) => {
    connections++;
    socket.on('error', () => {});
    const send = jsonChannel(socket, (msg) => {
      if (msg.t === 'hello') send({ t: 'welcome' });
    });
  });
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const logs = [];
  const mac = fakeHelper();
  const client = createClient({ ...CONFIG, port: silent.address().port }, mac, (m) => logs.push(m), { serverTimeoutMs: 200, retryMs: 50 });
  mac.say('READY 100 100');
  await until(() => connections >= 2);
  assert.ok(logs.some((l) => l.includes('Sin respuesta de la Windows')));
  client.stop();
  await new Promise((resolve) => silent.close(resolve));
});

test('la Windows suelta una Mac que dejo de responder', async () => {
  const win = fakeHelper();
  const logs = [];
  const server = createServer({ ...CONFIG, port: 0 }, win, (m) => logs.push(m), { heartbeatMs: 50, clientTimeoutMs: 200 });
  const port = await server.listen(0, '127.0.0.1');
  const socket = rawMac(port, { heartbeat: true });
  await until(() => win.sent.includes('EDGE none'));
  assert.ok(logs.some((l) => l.includes('Sin respuesta de Mac')));
  socket.destroy();
  await server.close();
});

test('una Mac con la version anterior no se desconecta por no responder al latido', async () => {
  const win = fakeHelper();
  const server = createServer({ ...CONFIG, port: 0 }, win, quiet, { heartbeatMs: 50, clientTimeoutMs: 200 });
  const port = await server.listen(0, '127.0.0.1');
  const socket = rawMac(port, {});
  await until(() => win.sent.includes('EDGE left'));
  await wait(400);
  assert.ok(!win.sent.includes('EDGE none'));
  socket.destroy();
  await server.close();
});

test('con el latido la conexion se mantiene y la Mac no se duerme mientras esta conectada', async () => {
  const calls = [];
  const power = { hold: () => calls.push('hold'), release: () => calls.push('release'), wakeDisplay: () => calls.push('wake') };
  const win = fakeHelper();
  const mac = fakeHelper();
  const logs = [];
  const server = createServer({ ...CONFIG, port: 0 }, win, quiet, { heartbeatMs: 50, clientTimeoutMs: 200 });
  const port = await server.listen(0, '127.0.0.1');
  const client = createClient({ ...CONFIG, port }, mac, (m) => logs.push(m), { power, serverTimeoutMs: 200 });
  mac.say('READY 100 100');
  await until(() => win.sent.includes('EDGE left'));
  await wait(600);
  assert.ok(!logs.some((l) => l.includes('Sin respuesta')));
  assert.ok(!win.sent.includes('EDGE none'));
  assert.deepStrictEqual(calls, ['hold']);
  win.say('ENTER 0.5');
  await until(() => calls.includes('wake'));
  client.stop();
  assert.strictEqual(calls.at(-1), 'release');
  await server.close();
});

test('caffeinate: uno solo mientras esta conectada, se suelta al desconectar y despierta la pantalla', () => {
  const runs = [];
  const run = (args) => {
    const child = new EventEmitter();
    child.kill = () => { child.killed = true; child.emit('exit'); };
    runs.push({ args, child });
    return child;
  };
  const power = createPower({ run });
  power.hold();
  power.hold();
  assert.strictEqual(runs.length, 1);
  assert.deepStrictEqual(runs[0].args, ['-i', '-w', String(process.pid)]);
  power.release();
  assert.ok(runs[0].child.killed);
  power.wakeDisplay();
  assert.deepStrictEqual(runs[1].args, ['-u', '-t', '2']);
  createPower({ keepAwake: false, run }).hold();
  assert.strictEqual(runs.length, 2);
});
