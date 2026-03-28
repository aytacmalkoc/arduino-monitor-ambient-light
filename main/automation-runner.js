const { powerMonitor } = require('electron');
const { readSettingsFile } = require('./settings-store');
const { isSerialOpen, enqueueSerialWrite } = require('./serial');
const { getMainWindow } = require('./window');
const {
  buildSerialLineFromHexBrightness,
  normalizeStoredHex,
  clampBrightnessPct,
  clampKelvin,
  kelvinToRgb,
  rgbToHex,
} = require('./led-payload');

/** Ön plan uygulaması değişince LED gecikmesini hissedilir kılmamak için ~3 Hz */
const TICK_MS = 350;
const MANUAL_OVERRIDE_MS = 5 * 60 * 1000;

const DEFAULT_AUTOMATION = {
  enabled: false,
  powerSchedule: {
    enabled: false,
    onTime: '07:00',
    offTime: '23:00',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  timeProfiles: [],
  appRules: [],
  idle: {
    enabled: false,
    thresholdSec: 300,
    presetId: null,
  },
  extras: {
    batteryPresetEnabled: false,
    batteryPresetId: null,
    lockedPresetEnabled: false,
    lockedPresetId: null,
  },
};

let intervalId = null;
let manualOverrideUntil = 0;
let lastLineSent = '';
let lastBroadcastKey = '';
let onBattery = false;
/** @type {((opts?: object) => Promise<object|undefined>) | null} */
let activeWinFn = null;
try {
  activeWinFn = require('active-win');
} catch (e) {
  console.warn('[automation] active-win yüklenemedi:', e && e.message);
}

function mergeAutomation(raw) {
  const d = DEFAULT_AUTOMATION;
  const a = raw && typeof raw === 'object' ? raw : {};
  const next = {
    ...d,
    ...a,
    powerSchedule: { ...d.powerSchedule, ...(a.powerSchedule || {}) },
    idle: { ...d.idle, ...(a.idle || {}) },
    extras: { ...d.extras, ...(a.extras || {}) },
  };
  if (!Array.isArray(next.powerSchedule.days)) next.powerSchedule.days = [...d.powerSchedule.days];
  if (!Array.isArray(next.timeProfiles)) next.timeProfiles = [];
  if (!Array.isArray(next.appRules)) next.appRules = [];
  return next;
}

function parseTimeHHMM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesNowLocal() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function dayOfWeekLocal() {
  return new Date().getDay();
}

function isInMinutesRange(nowMin, start, end) {
  if (start === end) return false;
  if (start < end) return nowMin >= start && nowMin < end;
  return nowMin >= start || nowMin < end;
}

function isPowerScheduleAllowed(power, nowMin, day) {
  if (!power || !power.enabled) return true;
  const days = Array.isArray(power.days) ? power.days : [];
  if (days.length === 0) return false;
  if (!days.includes(day)) return false;
  const onT = parseTimeHHMM(power.onTime);
  const offT = parseTimeHHMM(power.offTime);
  if (onT == null || offT == null) return true;
  if (onT === offT) return true;
  if (onT < offT) {
    return nowMin >= onT && nowMin < offT;
  }
  return nowMin >= onT || nowMin < offT;
}

function findPreset(settings, presetId) {
  if (!presetId || !Array.isArray(settings.presets)) return null;
  return settings.presets.find((p) => p && p.id === presetId) || null;
}

function presetToLine(preset) {
  if (!preset) return null;
  const hex = normalizeStoredHex(preset.color) || '#ffffff';
  const b = clampBrightnessPct(preset.brightness);
  return buildSerialLineFromHexBrightness(hex, String(b));
}

function presetToLedPatch(preset) {
  if (!preset) return null;
  const k = clampKelvin(preset.kelvin != null ? preset.kelvin : 5200);
  const { r, g, b } = kelvinToRgb(k);
  return {
    color: normalizeStoredHex(preset.color) || rgbToHex(r, g, b),
    brightness: String(clampBrightnessPct(preset.brightness ?? 100)),
    kelvin: String(k),
  };
}

function lineFromBrightnessZero() {
  return buildSerialLineFromHexBrightness('#000000', '0');
}

async function getForegroundHint() {
  if (!activeWinFn) return null;
  try {
    const w = await activeWinFn();
    if (!w) return null;
    const owner = w.owner || {};
    const name = (owner.name && String(owner.name)) || '';
    const path = (owner.path && String(owner.path)) || '';
    const base = path.split(/[/\\]/).pop() || '';
    return {
      name: name.toLowerCase(),
      base: base.toLowerCase(),
    };
  } catch (e) {
    console.warn('[automation] active-win okunamadı:', e && e.message);
    return null;
  }
}

/** .exe vb. kaldırıp karşılaştırma için sadeleştirir */
function normalizeAppMatchToken(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/\.(exe|msi|bat|cmd|msc)$/i, '');
}

/** "Google Chrome" → googlechrome; msedge.exe ile eşlemek için */
function compactAlphaNum(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function matchAppRule(matchRaw, hint) {
  if (!hint || !matchRaw) return false;
  const q = normalizeAppMatchToken(matchRaw);
  if (!q) return false;

  const base = normalizeAppMatchToken(hint.base);
  const nameLower = String(hint.name || '').toLowerCase();

  if (base) {
    if (base === q || base.includes(q) || q.includes(base)) return true;
  }
  if (nameLower) {
    if (nameLower.includes(q) || q.includes(normalizeAppMatchToken(nameLower))) return true;
  }
  if (nameLower && q.length >= 3) {
    const cn = compactAlphaNum(nameLower);
    const cq = compactAlphaNum(q);
    if (cn.length >= 3 && cq.length >= 3 && cn.includes(cq)) return true;
  }
  return false;
}

function evaluateAutomation(settings, fore, idleSec, nowMin, day) {
  const auto = mergeAutomation(settings.automation);
  if (!auto.enabled) return { kind: 'none', line: null, led: null, source: null };

  const power = auto.powerSchedule;
  if (!isPowerScheduleAllowed(power, nowMin, day)) {
    return {
      kind: 'off',
      line: lineFromBrightnessZero(),
      led: { color: '#000000', brightness: '0', kelvin: String(clampKelvin(5200)) },
      source: 'powerSchedule',
    };
  }

  const rules = [...auto.appRules]
    .filter((r) => r && r.enabled !== false && r.match && r.presetId)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));

  for (const r of rules) {
    if (matchAppRule(r.match, fore)) {
      const pr = findPreset(settings, r.presetId);
      if (pr) {
        return {
          kind: 'preset',
          line: presetToLine(pr),
          led: presetToLedPatch(pr),
          source: 'appRule',
        };
      }
    }
  }

  for (const tp of auto.timeProfiles) {
    if (!tp || !tp.presetId) continue;
    const days =
      Array.isArray(tp.days) && tp.days.length > 0
        ? tp.days
        : [0, 1, 2, 3, 4, 5, 6];
    if (!days.includes(day)) continue;
    const start = parseTimeHHMM(tp.start);
    const end = parseTimeHHMM(tp.end);
    if (start == null || end == null) continue;
    if (isInMinutesRange(nowMin, start, end)) {
      const pr = findPreset(settings, tp.presetId);
      if (pr) {
        return {
          kind: 'preset',
          line: presetToLine(pr),
          led: presetToLedPatch(pr),
          source: 'timeProfile',
        };
      }
    }
  }

  const idle = auto.idle;
  if (
    idle &&
    idle.enabled &&
    idle.presetId &&
    Number(idle.thresholdSec) > 0 &&
    idleSec >= Number(idle.thresholdSec)
  ) {
    const pr = findPreset(settings, idle.presetId);
    if (pr) {
      return {
        kind: 'preset',
        line: presetToLine(pr),
        led: presetToLedPatch(pr),
        source: 'idle',
      };
    }
  }

  const extras = auto.extras || {};
  if (extras.lockedPresetEnabled && extras.lockedPresetId) {
    try {
      const st = powerMonitor.getSystemIdleState(1);
      if (st === 'locked') {
        const pr = findPreset(settings, extras.lockedPresetId);
        if (pr) {
          return {
            kind: 'preset',
            line: presetToLine(pr),
            led: presetToLedPatch(pr),
            source: 'locked',
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (
    extras.batteryPresetEnabled &&
    onBattery &&
    extras.batteryPresetId
  ) {
    const pr = findPreset(settings, extras.batteryPresetId);
    if (pr) {
      return {
        kind: 'preset',
        line: presetToLine(pr),
        led: presetToLedPatch(pr),
        source: 'battery',
      };
    }
  }

  return { kind: 'none', line: null, led: null, source: null };
}

function broadcast(payload) {
  const w = getMainWindow();
  if (w && !w.isDestroyed()) {
    w.webContents.send('automation:state', payload);
  }
}

function broadcastIfChanged(payload) {
  const key = JSON.stringify(payload);
  if (key === lastBroadcastKey) return;
  lastBroadcastKey = key;
  broadcast(payload);
}

async function tick() {
  const settings = readSettingsFile();
  const auto = mergeAutomation(settings.automation);
  if (!auto.enabled) {
    lastBroadcastKey = '';
    if (lastLineSent !== '') lastLineSent = '';
    broadcastIfChanged({ active: false, source: null, led: null });
    return;
  }

  if (Date.now() < manualOverrideUntil) {
    broadcastIfChanged({
      active: false,
      source: null,
      led: null,
      manualBypass: true,
    });
    return;
  }

  let idleSec = 0;
  try {
    idleSec = powerMonitor.getSystemIdleTime();
  } catch {
    idleSec = 0;
  }

  const nowMin = minutesNowLocal();
  const day = dayOfWeekLocal();
  const fore = await getForegroundHint();

  const result = evaluateAutomation(settings, fore, idleSec, nowMin, day);

  if (result.kind === 'none' || !result.line) {
    if (lastLineSent !== '') {
      lastLineSent = '';
    }
    broadcastIfChanged({ active: false, source: null, led: null });
    return;
  }

  if (!isSerialOpen()) {
    broadcastIfChanged({
      active: true,
      source: result.source,
      led: result.led,
      pendingSerial: true,
    });
    return;
  }

  if (result.line === lastLineSent) {
    broadcastIfChanged({
      active: true,
      source: result.source,
      led: result.led,
    });
    return;
  }

  try {
    await enqueueSerialWrite(result.line);
    lastLineSent = result.line;
    broadcastIfChanged({
      active: true,
      source: result.source,
      led: result.led,
    });
  } catch {
    broadcastIfChanged({
      active: true,
      source: result.source,
      led: result.led,
      writeError: true,
    });
  }
}

function wirePowerMonitor() {
  try {
    powerMonitor.on('on-battery', () => {
      onBattery = true;
    });
    powerMonitor.on('on-ac', () => {
      onBattery = false;
    });
  } catch {
    /* ignore */
  }
}

function startAutomationRunner() {
  if (intervalId) clearInterval(intervalId);
  wirePowerMonitor();
  intervalId = setInterval(() => {
    tick().catch((e) => console.error('automation tick', e));
  }, TICK_MS);
  tick().catch((e) => console.error('automation tick', e));
}

function stopAutomationRunner() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function notifyManualOverride() {
  manualOverrideUntil = Date.now() + MANUAL_OVERRIDE_MS;
  lastLineSent = '';
  broadcastIfChanged({ active: false, source: null, led: null, manualBypass: true });
}

function reloadAutomationConfig() {
  lastLineSent = '';
  tick().catch((e) => console.error('automation tick', e));
}

module.exports = {
  DEFAULT_AUTOMATION,
  mergeAutomation,
  startAutomationRunner,
  stopAutomationRunner,
  notifyManualOverride,
  reloadAutomationConfig,
};
