const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { createServer } = require('../src/server');
const { createClient } = require('../src/client');

const CONFIG = { password: 'secreto', macSide: 'left', mouseSpeed: 1, scrollSpeed: 1, invertScroll: false, edgeGraceMs: 0, modifiers: {} };

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

test('lo que viaja por la red va cifrado: ni la clave ni las teclas se ven', async () => {
  const win = fakeHelper();
  const server = createServer({ ...CONFIG, port: 0 }, win, () => {});
  const port = await server.listen(0, '127.0.0.1');

  // Un "espia" en medio que reenvia todo y guarda lo que ve pasar.
  const captured = [];
  const spy = net.createServer((mac) => {
    const winSide = net.connect(port, '127.0.0.1');
    mac.on('data', (d) => { captured.push(d); winSide.write(d); });
    winSide.on('data', (d) => { captured.push(d); mac.write(d); });
    mac.on('error', () => {}); winSide.on('error', () => {});
    mac.on('close', () => winSide.destroy()); winSide.on('close', () => mac.destroy());
  });
  await new Promise((r) => spy.listen(0, '127.0.0.1', r));

  const mac = fakeHelper();
  const client = createClient({ ...CONFIG, port: spy.address().port, serverHost: '127.0.0.1' }, mac, () => {});
  mac.say('READY 1440 900');
  await until(() => win.sent.includes('EDGE left'));
  win.say('ENTER 0.5');
  win.say('K 67 46 D 0');
  await until(() => mac.sent.includes('KEY 8 D'));

  const wire = Buffer.concat(captured).toString('latin1');
  for (const secret of ['secreto', '"key"', '"hello"', 'Mac', '1440']) {
    assert.ok(!wire.includes(secret), `no deberia verse ${secret}`);
  }
  client.stop();
  await server.close();
  await new Promise((r) => spy.close(r));
});

test('con otra clave no hay conexion y se avisa en los dos lados', async () => {
  const win = fakeHelper();
  const winLogs = [];
  const server = createServer({ ...CONFIG, port: 0 }, win, (m) => winLogs.push(m));
  const port = await server.listen(0, '127.0.0.1');
  const mac = fakeHelper();
  const logs = [];
  const client = createClient({ ...CONFIG, password: 'mala', port, serverHost: '127.0.0.1' }, mac, (m) => logs.push(m), { retryMs: 50 });
  mac.say('READY 100 100');
  await until(() => logs.some((l) => l.includes('clave')) && winLogs.some((l) => l.includes('clave no coincide')));
  assert.ok(!win.sent.includes('EDGE left'));
  client.stop();
  await server.close();
});
