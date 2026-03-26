import { STORAGE } from './constants.js';
import {
  brightness,
  colorPick,
  cctRange,
  kelvinDisplay,
} from './dom.js';

export function kelvinToRgb(kelvin) {
  let k = kelvin / 100;
  let r;
  let g;
  let b;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * (k - 60) ** -0.1332047592;
    g = 288.1221695283 * (k - 60) ** -0.0755148492;
    b = 255;
  }
  return {
    r: Math.round(Math.min(255, Math.max(0, r))),
    g: Math.round(Math.min(255, Math.max(0, g))),
    b: Math.round(Math.min(255, Math.max(0, b))),
  };
}

export function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

export function normalizeStoredHex(hex) {
  if (hex == null || typeof hex !== 'string') return null;
  let h = hex.trim();
  if (h === '') return null;
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9A-Fa-f]{6}$/i.test(h)) return h.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/i.test(h)) {
    const r = h[1];
    const g = h[2];
    const b = h[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

export function isValidHexColor(hex) {
  return normalizeStoredHex(hex) !== null;
}

export function clampByte(n) {
  return Math.min(255, Math.max(0, Math.round(Number(n))));
}

export function buildPayloadFromRgbBrightness(hexInput, brightnessStr) {
  const hexNorm = normalizeStoredHex(hexInput) || '#ffffff';
  let { r, g, b } = hexToRgb(hexNorm);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    r = 255;
    g = 255;
    b = 255;
  } else {
    r = clampByte(r);
    g = clampByte(g);
    b = clampByte(b);
  }
  let p = Number(brightnessStr);
  if (!Number.isFinite(p)) p = 100;
  p = Math.min(100, Math.max(0, Math.round(p)));
  return `${r},${g},${b},${p}\n`;
}

export function buildPayload() {
  return buildPayloadFromRgbBrightness(colorPick?.value, brightness ? brightness.value : '100');
}

export function buildPayloadFromPersistedStorage() {
  const hex = localStorage.getItem(STORAGE.LED_COLOR);
  const br = localStorage.getItem(STORAGE.LED_BRIGHTNESS);
  return buildPayloadFromRgbBrightness(hex, br != null && br !== '' ? br : '100');
}

export function rgbToHsv255(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, v };
}

export function hsvToRgb255(h, s, v) {
  const c = v * s;
  const hh = ((h % 360) + 360) % 360;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

export function getBaseRgb255() {
  const hex = normalizeStoredHex(colorPick?.value) || '#ffffff';
  return hexToRgb(hex);
}

export function getBaseBrightnessPct() {
  const n = Number(brightness?.value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 100;
}

export async function loadLedState() {
  let disk = {};
  if (window.appSettings) {
    try {
      disk = await window.appSettings.load();
    } catch (_) {
      disk = {};
    }
  }
  const led = disk.led && typeof disk.led === 'object' ? disk.led : {};

  let hex = led.color;
  if (hex == null || String(hex).trim() === '') {
    hex = localStorage.getItem(STORAGE.LED_COLOR);
  }
  const normHex = normalizeStoredHex(hex);
  if (normHex && colorPick) {
    colorPick.value = normHex;
  }

  let brRaw = led.brightness;
  if (brRaw == null || brRaw === '') {
    brRaw = localStorage.getItem(STORAGE.LED_BRIGHTNESS);
  }
  if (brRaw != null && brightness) {
    const n = Number(brRaw);
    if (Number.isFinite(n)) {
      brightness.value = String(Math.min(100, Math.max(0, Math.round(n))));
    }
  }

  let kvRaw = led.kelvin;
  if (kvRaw == null || kvRaw === '') {
    kvRaw = localStorage.getItem(STORAGE.LED_KELVIN);
  }
  if (kvRaw != null && cctRange && kelvinDisplay) {
    const n = Number(kvRaw);
    if (Number.isFinite(n)) {
      const stepped = Math.round((Math.min(6500, Math.max(3000, n)) - 3000) / 50) * 50 + 3000;
      cctRange.value = String(stepped);
      kelvinDisplay.textContent = `${stepped}K`;
    }
  }

  if (!normHex && cctRange && colorPick) {
    const k = Number(cctRange.value);
    if (Number.isFinite(k)) {
      const { r, g, b } = kelvinToRgb(k);
      colorPick.value = rgbToHex(r, g, b);
    }
  }
}
