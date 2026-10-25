const { spawn } = require('node:child_process');

function caffeinate(args) {
  const child = spawn('caffeinate', args, { stdio: 'ignore' });
  child.on('error', () => {});
  return child;
}

function createPower({ keepAwake = true, run = caffeinate } = {}) {
  let assertion = null;
  return {
    hold() {
      if (!keepAwake || assertion) return;
      const child = run(['-i', '-w', String(process.pid)]);
      child.on('exit', () => {
        if (assertion === child) assertion = null;
      });
      assertion = child;
    },
    release() {
      if (!assertion) return;
      assertion.kill();
      assertion = null;
    },
    wakeDisplay() {
      run(['-u', '-t', '2']);
    },
  };
}

const NO_POWER = { hold() {}, release() {}, wakeDisplay() {} };

module.exports = { createPower, NO_POWER };
