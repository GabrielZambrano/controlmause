// Utilidades para leer flujos linea por linea.
const { StringDecoder } = require('node:string_decoder');

function onLines(stream, callback) {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).replace(/\r$/, '');
      buffer = buffer.slice(i + 1);
      if (line) callback(line);
    }
  });
}

/** Mensajes JSON separados por saltos de linea sobre un socket TCP. */
function jsonChannel(socket, onMessage) {
  onLines(socket, (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    onMessage(msg);
  });
  return (msg) => {
    if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
  };
}

module.exports = { onLines, jsonChannel };
