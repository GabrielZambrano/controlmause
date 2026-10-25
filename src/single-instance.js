const net = require('node:net');

function waitForLock(port, { retryMs = 5000, onBusy = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const lock = net.createServer((socket) => socket.destroy());
    let warned = false;
    const onError = (err) => {
      if (err.code !== 'EADDRINUSE') return reject(err);
      if (!warned) {
        warned = true;
        onBusy();
      }
      setTimeout(attempt, retryMs);
    };
    const attempt = () => {
      lock.once('error', onError);
      lock.listen(port, '127.0.0.1', () => {
        lock.off('error', onError);
        resolve(lock);
      });
    };
    attempt();
  });
}

module.exports = { waitForLock };
