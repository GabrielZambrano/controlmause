const test = require('node:test');
const assert = require('node:assert');
const { RemoteCursor } = require('../src/layout');

test('Mac a la izquierda: se entra por la derecha a la misma altura', () => {
  const c = new RemoteCursor({ side: 'left' });
  c.setScreen(1440, 900);
  assert.deepStrictEqual(c.enter(0.5), { x: 1439, y: 450 });
});

test('Mac a la izquierda: moverse a la derecha del todo vuelve a Windows', () => {
  const c = new RemoteCursor({ side: 'left' });
  c.setScreen(1000, 101);
  c.enter(0);
  assert.deepStrictEqual(c.move(-100, 50), { x: 899, y: 50 });
  assert.deepStrictEqual(c.move(99, 0), { x: 998, y: 50 });
  const r = c.move(5, 0);
  assert.strictEqual(r.leave, 0.5);
  assert.strictEqual(c.active, false);
});

test('el cursor no se sale por arriba, abajo ni por el borde izquierdo', () => {
  const c = new RemoteCursor({ side: 'left' });
  c.setScreen(800, 600);
  c.enter(0.5);
  assert.deepStrictEqual(c.move(-5000, -5000), { x: 0, y: 0 });
  assert.deepStrictEqual(c.move(0, 9000), { x: 0, y: 599 });
});

test('Mac a la derecha y velocidad configurable', () => {
  const c = new RemoteCursor({ side: 'right', speed: 2 });
  c.setScreen(800, 600);
  assert.deepStrictEqual(c.enter(1), { x: 0, y: 599 });
  assert.deepStrictEqual(c.move(10, -10), { x: 20, y: 579 });
  assert.ok('leave' in c.move(-11, 0));
});
