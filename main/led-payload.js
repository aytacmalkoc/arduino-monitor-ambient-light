/**
 * Renderer color-utils ile aynı formül; seri satırı üretimi (r,g,b,p\n).
 */

const LED_KELVIN_MIN = 3000;
const LED_KELVIN_MAX = 6500;

function kelvinToRgb(kelvin) {
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

function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function normalizeStoredHex(hex) {
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

function clampByte(n) {
  return Math.min(255, Math.max(0, Math.round(Number(n))));
}

function clampKelvin(k) {
  const n = Number(k);
  if (!Number.isFinite(n)) return 5200;
  const stepped = Math.round((Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, n)) - 3000) / 50) * 50 + 3000;
  return stepped;
}

function clampBrightnessPct(b) {
  const n = Number(b);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function buildSerialLineFromHexBrightness(hexNorm, brightnessStr) {
  const hex = hexNorm || '#ffffff';
  let { r, g, b } = hexToRgb(hex);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    r = 255;
    g = 255;
    b = 255;
  } else {
    r = clampByte(r);
    g = clampByte(g);
    b = clampByte(b);
  }
  const p = clampBrightnessPct(brightnessStr);
  return `${r},${g},${b},${p}\n`;
}

/**
 * @param {object} patch - color?, brightness?, kelvin?
 * @param {object} currentLed - { color, brightness, kelvin } string alanları
 */
function mergeLedState(patch, currentLed) {
  const cur = {
    color: normalizeStoredHex(currentLed?.color) || '#ffffff',
    brightness: String(clampBrightnessPct(currentLed?.brightness ?? 100)),
    kelvin: String(clampKelvin(currentLed?.kelvin ?? 5200)),
  };

  if (patch.brightness != null) {
    cur.brightness = String(clampBrightnessPct(patch.brightness));
  }

  if (patch.kelvin != null) {
    const k = clampKelvin(patch.kelvin);
    cur.kelvin = String(k);
    const { r, g, b } = kelvinToRgb(k);
    cur.color = rgbToHex(r, g, b);
  }

  if (patch.color != null) {
    const n = normalizeStoredHex(patch.color);
    if (n) cur.color = n;
  }

  return cur;
}

module.exports = {
  kelvinToRgb,
  rgbToHex,
  normalizeStoredHex,
  buildSerialLineFromHexBrightness,
  mergeLedState,
  clampKelvin,
  clampBrightnessPct,
  LED_KELVIN_MIN,
  LED_KELVIN_MAX,
};
