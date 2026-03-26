const { SerialPort } = require('serialport');
const { getMainWindow } = require('./window');

/** Arduino reset sonrası ilk yazı için bekleme (node-serialport önerisi ~400ms) */
const SERIAL_SETTLE_MS = 450;

let serialPort = null;

/** serialPort.write aynı anda birden fazla çağrılmamalı; tüm yazımlar sıraya alınır */
let serialWriteQueue = Promise.resolve();

function enqueueSerialWrite(text) {
  const done = serialWriteQueue.then(
    () =>
      new Promise((resolve, reject) => {
        if (!serialPort || !serialPort.isOpen) {
          reject(new Error('Seri port açık değil'));
          return;
        }
        serialPort.write(text, (err) => {
          if (err) {
            reject(err);
            return;
          }
          serialPort.drain((drainErr) => {
            if (drainErr) reject(drainErr);
            else resolve();
          });
        });
      })
  );
  serialWriteQueue = done.catch(() => {});
  return done;
}

function closeSerial() {
  return new Promise((resolve) => {
    serialWriteQueue
      .catch(() => {})
      .finally(() => {
        if (!serialPort || !serialPort.isOpen) {
          serialPort = null;
          serialWriteQueue = Promise.resolve();
          resolve();
          return;
        }
        serialPort.close((err) => {
          if (err) console.error('Serial close:', err);
          serialPort = null;
          serialWriteQueue = Promise.resolve();
          resolve();
        });
      });
  });
}

/** Uygulama kapanırken LED'leri kapat (firmware: p=0 → sönük) */
function closeSerialWithLedsOff() {
  return new Promise((resolve) => {
    if (!serialPort || !serialPort.isOpen) {
      serialPort = null;
      serialWriteQueue = Promise.resolve();
      resolve();
      return;
    }
    const p = serialPort;
    serialWriteQueue
      .catch(() => {})
      .finally(() => {
        enqueueSerialWrite('0,0,0,0\n')
          .catch(() => {})
          .finally(() => {
            p.close((closeErr) => {
              if (closeErr) console.error('Serial close:', closeErr);
              serialPort = null;
              serialWriteQueue = Promise.resolve();
              resolve();
            });
          });
      });
  });
}

function openSerialPort({ path: portPath, baudRate = 115200 }) {
  return new Promise((resolve, reject) => {
    serialPort = new SerialPort(
      {
        path: portPath,
        baudRate,
      },
      (err) => {
        if (err) {
          serialPort = null;
          reject(err);
          return;
        }
        serialPort.on('data', (buf) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('serial:data', buf.toString('utf8'));
          }
        });
        serialPort.on('error', (e) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) {
            win.webContents.send('serial:error', e.message);
          }
        });
        try {
          serialPort.set({ dtr: false, rts: false }, (setErr) => {
            if (setErr) console.warn('serial set dtr/rts:', setErr);
          });
        } catch (e) {
          console.warn('serial set:', e);
        }
        setTimeout(() => resolve({ ok: true }), SERIAL_SETTLE_MS);
      }
    );
  });
}

async function prepareSerialOpen() {
  await closeSerial();
  serialWriteQueue = Promise.resolve();
}

function isSerialOpen() {
  return !!(serialPort && serialPort.isOpen);
}

module.exports = {
  SerialPort,
  enqueueSerialWrite,
  closeSerial,
  closeSerialWithLedsOff,
  openSerialPort,
  prepareSerialOpen,
  isSerialOpen,
};
