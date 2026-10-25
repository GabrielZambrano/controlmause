const test = require('node:test');
const assert = require('node:assert');
const { plist } = require('../src/autostart/mac');
const { launchCommand } = require('../src/autostart/windows');

test('el agente de la Mac arranca el cliente y escapa las rutas', () => {
  const xml = plist({ node: '/opt/homebrew/bin/node', appDir: '/Users/a&b/Application Support/ControlMause', logs: '/Users/a&b/Logs' });
  assert.match(xml, /<string>\/opt\/homebrew\/bin\/node<\/string>/);
  assert.match(xml, /<string>\/Users\/a&amp;b\/Application Support\/ControlMause\/src\/service\.js<\/string>\s*<string>client<\/string>/);
  assert.match(xml, /<key>KeepAlive<\/key><true\/>/);
  assert.ok(!xml.includes('a&b'));
});

test('el acceso directo de Windows arranca el servidor sin ventana', () => {
  const { target, args } = launchCommand('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\x\\controlmause', 'C:\\Windows');
  assert.strictEqual(target, 'C:\\Windows\\System32\\conhost.exe');
  assert.strictEqual(args, '--headless "C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\x\\controlmause\\src\\service.js" server');
});
