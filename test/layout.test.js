const test = require('node:test');
const assert = require('node:assert');
const { RemoteCursor } = require('../src/layout');

test('Mac a la izquierda: se entra por la derecha a la misma altura', () => {
  const c = new RemoteCursor({ side: 'left', graceMs: 0 });
  c.setScreen(1440, 900);
  assert.deepStrictEqual(c.enter(0.5), { x: 1439, y: 450 });
});

test('Mac a la izquierda: moverse a la derecha del todo vuelve a Windows', () => {
  const c = new RemoteCursor({ side: 'left', graceMs: 0 });
  c.setScreen(1000, 101);
  c.enter(0);
  assert.deepStrictEqual(c.move(-100, 50), { x: 899, y: 50 });
  assert.deepStrictEqual(c.move(99, 0), { x: 998, y: 50 });
  const r = c.move(5, 0);
  assert.strictEqual(r.leave, 0.5);
  assert.strictEqual(c.active, false);
});

test('el cursor no se sale por arriba, abajo ni por el borde izquierdo', () => {
  const c = new RemoteCursor({ side: 'left', graceMs: 0 });
  c.setScreen(800, 600);
  c.enter(0.5);
  assert.deepStrictEqual(c.move(-5000, -5000), { x: 0, y: 0 });
  assert.deepStrictEqual(c.move(0, 9000), { x: 0, y: 599 });
});

test('Mac a la derecha y velocidad configurable', () => {
  const c = new RemoteCursor({ side: 'right', speed: 2, graceMs: 0 });
  c.setScreen(800, 600);
  assert.deepStrictEqual(c.enter(1), { x: 0, y: 599 });
  assert.deepStrictEqual(c.move(10, -10), { x: 20, y: 579 });
  assert.ok('leave' in c.move(-11, 0));
});

test('Mac arriba: se entra por su borde de abajo a la misma altura horizontal', () => {
  const c = new RemoteCursor({ side: 'top', graceMs: 0 });
  c.setScreen(1921, 1080);
  assert.deepStrictEqual(c.enter(0.25), { x: 480, y: 1079 });
  assert.deepStrictEqual(c.move(100, -500), { x: 580, y: 579 });
  assert.deepStrictEqual(c.move(-5000, 0), { x: 0, y: 579 });   // no se sale por los lados
  assert.deepStrictEqual(c.move(0, -9000), { x: 0, y: 0 });     // ni por arriba
});

test('Mac arriba: bajar del todo vuelve a Windows en la misma posicion horizontal', () => {
  const c = new RemoteCursor({ side: 'top', graceMs: 0 });
  c.setScreen(1001, 600);
  c.enter(0.5);
  assert.deepStrictEqual(c.move(250, 0), { x: 750, y: 599 });
  const r = c.move(0, 1);
  assert.strictEqual(r.leave, 0.75);
  assert.strictEqual(c.active, false);
});

test('Mac abajo: se entra por arriba y se vuelve subiendo', () => {
  const c = new RemoteCursor({ side: 'bottom', graceMs: 0 });
  c.setScreen(1001, 600);
  assert.deepStrictEqual(c.enter(0), { x: 0, y: 0 });
  assert.deepStrictEqual(c.move(0, 10), { x: 0, y: 10 });
  assert.ok('leave' in c.move(0, -11));
});

test('un lado que no existe da un error claro', () => {
  assert.throws(() => new RemoteCursor({ side: 'arriba', graceMs: 0 }), /macSide/);
});

test('justo despues de entrar a la Mac, un temblor hacia atras no rebota a Windows', () => {
  let t = 1000;
  const c = new RemoteCursor({ side: 'top', graceMs: 400, now: () => t });
  c.setScreen(1001, 600);
  c.enter(0.5);
  assert.deepStrictEqual(c.move(0, 3), { x: 500, y: 599 });   // tiembla hacia abajo: se queda en la Mac
  t += 100;
  assert.deepStrictEqual(c.move(0, -50), { x: 500, y: 549 });
  t += 400;
  assert.deepStrictEqual(c.move(0, 50), { x: 500, y: 599 });
  assert.ok('leave' in c.move(0, 5));                         // pasado el margen, bajar si vuelve a Windows
});
