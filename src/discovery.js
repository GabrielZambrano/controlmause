// La Windows avisa cada pocos segundos en la red local "aqui estoy, en el puerto X".
// La Mac escucha ese aviso y asi encuentra la IP sola, aunque cambie.
// El aviso lleva una marca sacada de la clave, para que la Mac ignore otras Windows.
const crypto = require('node:crypto');
const dgram = require('node:dgram');
const os = require('node:os');

const APP = 'controlmause';

function tagFor(password) {
  return crypto.createHmac('sha256', String(password)).update('controlmause-beacon-v1').digest('hex').slice(0, 16);
}

/**
 * Las redes de esta computadora. Windows puede fallar al leerlas justo cuando una red
 * aparece o desaparece (VPN, Wi-Fi): en ese caso se devuelve una lista vacia.
 */
function networkInterfaces() {
  try {
    return os.networkInterfaces();
  } catch {
    return {};
  }
}

/** Direcciones de difusion de cada red a la que esta conectada esta computadora. */
function broadcastAddresses(interfaces = networkInterfaces()) {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(interfaces)) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || !i.netmask) continue;
      const ip = i.address.split('.').map(Number);
      const mask = i.netmask.split('.').map(Number);
      out.add(ip.map((b, n) => (b | (~mask[n] & 255))).join('.'));
    }
  }
  return [...out];
}

function createBeacon({ password, port, discoveryPort, intervalMs = 2000, targets = broadcastAddresses, log = () => {} }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const message = Buffer.from(JSON.stringify({ app: APP, v: 1, port, tag: tagFor(password) }));
  let timer = null;
  let warned = false;
  const announce = () => {
    let addresses;
    try {
      addresses = targets();
    } catch (err) {
      addresses = ['255.255.255.255'];
      if (!warned) { warned = true; log(`No se pudieron leer las redes: ${err.message}`); }
    }
    for (const address of addresses) {
      socket.send(message, discoveryPort, address, (err) => {
        if (err && !warned) { warned = true; log(`Aviso en la red no enviado a ${address}: ${err.message}`); }
      });
    }
  };
  socket.on('error', (err) => log(`Error del aviso en la red: ${err.message}`));
  socket.bind(() => {
    socket.setBroadcast(true);
    announce();
    timer = setInterval(announce, intervalMs);
  });
  return {
    announce,
    stop() {
      clearInterval(timer);
      try { socket.close(); } catch {}
    },
  };
}

function createFinder({ password, discoveryPort, onFound, log = () => {} }) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const tag = tagFor(password);
  socket.on('message', (data, rinfo) => {
    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch { return; }
    if (!msg || msg.app !== APP || msg.tag !== tag || !Number.isInteger(msg.port)) return;
    onFound(rinfo.address, msg.port);
  });
  socket.on('error', (err) => log(`No se pudo escuchar los avisos de la Windows: ${err.message}`));
  socket.bind(discoveryPort);
  return {
    ready: new Promise((resolve) => socket.once('listening', resolve)),
    stop() {
      try { socket.close(); } catch {}
    },
  };
}

module.exports = { createBeacon, createFinder, broadcastAddresses, networkInterfaces, tagFor };
