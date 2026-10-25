const test = require('node:test');
const assert = require('node:assert');
const { windowsToMac } = require('../src/keymap');

test('letras y numeros por posicion fisica', () => {
  assert.strictEqual(windowsToMac({ vk: 0x41, scan: 0x1e, extended: false }), 0x00); // A
  assert.strictEqual(windowsToMac({ vk: 0x5a, scan: 0x2c, extended: false }), 0x06); // Z
  assert.strictEqual(windowsToMac({ vk: 0x31, scan: 0x02, extended: false }), 0x12); // 1
});

test('flechas y Supr usan el prefijo extendido', () => {
  assert.strictEqual(windowsToMac({ vk: 0x25, scan: 0x4b, extended: true }), 0x7b);
  assert.strictEqual(windowsToMac({ vk: 0x25, scan: 0x4b, extended: false }), 0x56); // 4 numerico
  assert.strictEqual(windowsToMac({ vk: 0x2e, scan: 0x53, extended: true }), 0x75);
});

test('Ctrl se vuelve Cmd por defecto y se puede cambiar', () => {
  assert.strictEqual(windowsToMac({ vk: 0xa2, scan: 0x1d, extended: false }), 0x37);
  assert.strictEqual(windowsToMac({ vk: 0xa2, scan: 0x1d, extended: false }, { ctrl: 'control' }), 0x3b);
  assert.strictEqual(windowsToMac({ vk: 0x5b, scan: 0x5b, extended: true }), 0x3b);
  assert.strictEqual(windowsToMac({ vk: 0xa5, scan: 0x38, extended: true }), 0x3d); // AltGr -> Option der.
});

test('se ignora el Ctrl falso que envia AltGr', () => {
  assert.strictEqual(windowsToMac({ vk: 0xa2, scan: 0x21d, extended: false }), null);
});

test('teclas multimedia por codigo virtual', () => {
  assert.strictEqual(windowsToMac({ vk: 0xaf, scan: 0, extended: false }), 0x48);
});
