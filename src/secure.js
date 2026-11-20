// Conexion cifrada con la clave de config.json (TLS con clave compartida, sin certificados).
// Si la clave no coincide, la conexion no llega a abrirse: nadie en la red puede
// leer lo que escribes ni hacerse pasar por la Windows.
const crypto = require('node:crypto');
const tls = require('node:tls');

const IDENTITY = 'controlmause';
const CIPHERS = 'ECDHE-PSK-CHACHA20-POLY1305:DHE-PSK-AES256-GCM-SHA384:PSK-AES256-GCM-SHA384';
const cache = new Map();

/** Llave de 32 bytes derivada de la clave; scrypt la hace lenta de adivinar. */
function keyFor(password) {
  if (!cache.has(password)) cache.set(password, crypto.scryptSync(String(password), 'controlmause-psk-v1', 32));
  return cache.get(password);
}

function serverOptions(password) {
  const key = keyFor(password);
  return {
    ciphers: CIPHERS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',   // la clave compartida (PSK) de Node solo funciona con TLS 1.2
    pskCallback: (_socket, identity) => (identity === IDENTITY ? key : null),
  };
}

function connect({ host, port, password }) {
  const key = keyFor(password);
  return tls.connect({
    host,
    port,
    ciphers: CIPHERS,
    minVersion: 'TLSv1.2',
    maxVersion: 'TLSv1.2',
    pskCallback: () => ({ psk: key, identity: IDENTITY }),
    checkServerIdentity: () => undefined,   // no hay certificado: la clave es la identidad
  });
}

function createSecureServer(password, onConnection) {
  return tls.createServer(serverOptions(password), onConnection);
}

module.exports = { connect, createSecureServer, keyFor };
