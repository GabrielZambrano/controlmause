// Prueba completa en una sola maquina: servidor y cliente reales por TCP,
// con ayudantes falsos en lugar de PowerShell y osascript.
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const { createServer } = require('../src/server');
const { createClient } = require('../src/client');

function fakeHelper() {
  const h = new EventEmitter();
  h.sent = [];
  h.send = (line) => { h.sent.push(line); h.emit('sent', line); };
  h.say = (line) => h.emit('line', line);
  return h;
}

function waitFor(helper, pattern) {
  return new Promise((resolve) => {
    const found = helper.sent.find((l) => pattern.test(l));
    if (found) return resolve(found);
    const on = (line) => { if (pattern.test(line)) { helper.off('sent', on); resolve(line); } };
    helper.on('sent', on);
  });
}

const quiet = () => {};

async function setup(extra = {}) {
  const config = { port: 0, password: 'secreto', macSide: 'left', mouseSpeed: 1, scrollSpeed: 1,
    invertScroll: false, modifiers: {}, serverHost: '127.0.0.1', ...extra };
  const win = fakeHelper();
  const mac = fakeHelper();
  const server = createServer(config, win, quiet);
  config.port = await server.listen(0, '127.0.0.1');
  const client = createClient(config, mac, quiet);
  mac.say('READY 1440 900');
  return { win, mac, server, client, config };
}

test('cruzar a la Mac, mover, hacer clic, escribir y volver', async () => {
  const { win, mac, server, client } = await setup();
  await waitFor(win, /^EDGE left$/);

  win.say('ENTER 0.5');
  await waitFor(mac, /^MOVE 1439 450$/);

  win.say('M -40 10');
  await waitFor(mac, /^MOVE 1399 460$/);

  win.say('B L D');
  win.say('B L U');
  await waitFor(mac, /^BTN L U$/);

  win.say('K 162 29 D 0'); // Ctrl izq.
  win.say('K 67 46 D 0');  // C
  await waitFor(mac, /^KEY 8 D$/);
  assert.ok(mac.sent.includes('KEY 55 D'), 'Ctrl llega como Cmd');

  win.say('W 120');
  await waitFor(mac, /^WHEEL 3 0$/);

  win.say('M 100 0'); // sale por la derecha
  await waitFor(win, /^RELEASE 0\.5111$/);
  await waitFor(mac, /^RESET$/);
  assert.strictEqual(server.remote, false);

  client.stop();
  await server.close();
});

test('la rueda de un touchpad acumula pasos pequenos', async () => {
  const { win, mac, server, client } = await setup();
  await waitFor(win, /^EDGE left$/);
  win.say('ENTER 0.5');
  await waitFor(mac, /^MOVE/);
  for (let i = 0; i < 4; i++) win.say('W 10');
  await waitFor(mac, /^WHEEL 1 0$/);
  client.stop();
  await server.close();
});

test('si la Mac se desconecta mientras se controla, Windows recupera el raton', async () => {
  const { win, mac, server, client } = await setup();
  await waitFor(win, /^EDGE left$/);
  win.say('ENTER 0.2');
  await waitFor(mac, /^MOVE/);
  client.stop();
  await waitFor(win, /^RELEASE 0\.5$/);
  await waitFor(win, /^EDGE none$/);
  assert.strictEqual(server.remote, false);
  await server.close();
});

test('una clave incorrecta se rechaza', async () => {
  const config = { port: 0, password: 'buena', macSide: 'left', mouseSpeed: 1, scrollSpeed: 1, modifiers: {} };
  const win = fakeHelper();
  const server = createServer(config, win, quiet);
  const port = await server.listen(0, '127.0.0.1');
  const mac = fakeHelper();
  const logs = [];
  const client = createClient({ ...config, port, password: 'mala', serverHost: '127.0.0.1' }, mac, (m) => logs.push(m));
  mac.say('READY 100 100');
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(logs.some((l) => l.includes('rechazo')));
  assert.ok(!win.sent.includes('EDGE left'));
  client.stop();
  await server.close();
});
