const { BrowserWindow } = require('electron');

/** Yalnızca Windows’ta yükle; diğer platformlarda paket yüklemesi tetiklenmez. */
function getWinregRegistry() {
  if (process.platform !== 'win32') return null;
  try {
    return require('winreg');
  } catch (_) {
    return null;
  }
}

/** @see https://github.com/nathanbabcock/nightlight-cli/blob/main/src/nightlight.ts */
const NIGHT_LIGHT_STATE_KEY_PATH =
  '\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate';

const NIGHT_LIGHT_SETTINGS_KEY_PATH =
  '\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.settings\\windows.data.bluelightreduction.settings';

function hexToBytes(hex) {
  if (!hex || typeof hex !== 'string') return [];
  const bytes = [];
  for (let c = 0; c < hex.length; c += 2) {
    bytes.push(parseInt(hex.substr(c, 2), 16));
  }
  return bytes;
}

function winregKeyExists(keyPath) {
  const Registry = getWinregRegistry();
  if (!Registry) return Promise.resolve(false);
  return new Promise((resolve) => {
    const reg = new Registry({ hive: Registry.HKCU, key: keyPath });
    reg.keyExists((err, exists) => {
      if (err) resolve(false);
      else resolve(!!exists);
    });
  });
}

function winregGetData(keyPath) {
  const Registry = getWinregRegistry();
  if (!Registry) return Promise.reject(new Error('winreg unavailable'));
  return new Promise((resolve, reject) => {
    const reg = new Registry({ hive: Registry.HKCU, key: keyPath });
    reg.get('Data', (err, item) => {
      if (err) reject(err);
      else resolve(item);
    });
  });
}

async function nightLightRegistrySupported() {
  const stateOk = await winregKeyExists(NIGHT_LIGHT_STATE_KEY_PATH);
  const settingsOk = await winregKeyExists(NIGHT_LIGHT_SETTINGS_KEY_PATH);
  return stateOk && settingsOk;
}

async function nightLightRegistryEnabled() {
  const item = await winregGetData(NIGHT_LIGHT_STATE_KEY_PATH);
  if (!item || item.value == null) return false;
  const bytes = hexToBytes(item.value);
  return bytes.length > 18 && bytes[18] === 0x15;
}

async function getNightLightSnapshot() {
  if (process.platform !== 'win32') {
    return { ok: true, active: false, supported: false };
  }
  try {
    const supported = await nightLightRegistrySupported();
    if (!supported) {
      return { ok: true, active: false, supported: false };
    }
    const active = await nightLightRegistryEnabled();
    return { ok: true, active, supported: true };
  } catch (e) {
    return {
      ok: false,
      active: false,
      supported: true,
      error: String(e && e.message ? e.message : e),
    };
  }
}

const NIGHT_LIGHT_WATCH_MS = 1200;
let nightLightWatchTimer = null;
let lastNightLightEmitKey = null;

function nightLightWatchSnapshotKey(snap) {
  return JSON.stringify({
    ok: snap.ok,
    supported: snap.supported,
    active: snap.active,
  });
}

function broadcastNightLightState(snap) {
  const wins = BrowserWindow.getAllWindows();
  for (const w of wins) {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send('windows:nightLightState', snap);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

async function runNightLightWatchTick() {
  const snap = await getNightLightSnapshot();
  const key = nightLightWatchSnapshotKey(snap);
  if (lastNightLightEmitKey !== null && key === lastNightLightEmitKey) {
    return;
  }
  lastNightLightEmitKey = key;
  broadcastNightLightState(snap);
}

function stopNightLightWatch() {
  if (nightLightWatchTimer != null) {
    clearInterval(nightLightWatchTimer);
    nightLightWatchTimer = null;
  }
  lastNightLightEmitKey = null;
}

function startNightLightWatch() {
  stopNightLightWatch();
  void runNightLightWatchTick();
  nightLightWatchTimer = setInterval(() => void runNightLightWatchTick(), NIGHT_LIGHT_WATCH_MS);
}

module.exports = {
  getNightLightSnapshot,
  startNightLightWatch,
  stopNightLightWatch,
};
