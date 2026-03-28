import { STORAGE } from '../constants.js';
import {
  colorPick,
  cctRange,
  brightness,
  activeProfileName,
} from '../dom.js';
import { normalizeStoredHex } from '../color-utils.js';
import { setStatus, persistLedState } from '../led-connection.js';

export function loadPresetsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE.PRESETS);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

export function savePresetsArray(presets) {
  try {
    localStorage.setItem(STORAGE.PRESETS, JSON.stringify(presets));
  } catch (_) {
    /* quota */
  }
  if (window.appSettings) {
    window.appSettings.save({ presets }).catch(() => {});
  }
  try {
    window.dispatchEvent(new CustomEvent('led-presets-changed'));
  } catch (_) {
    /* ignore */
  }
}

export async function hydratePresetsFromDisk() {
  if (!window.appSettings) return;
  try {
    const disk = await window.appSettings.load();
    if (Array.isArray(disk.presets) && disk.presets.length > 0) {
      const local = loadPresetsFromStorage();
      if (local.length === 0) {
        savePresetsArray(disk.presets);
      }
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {object} o
 * @param {string} [o.id] - Yoksa yeni kayıt
 * @param {string} o.name
 * @param {string} o.color
 * @param {string|number} o.brightness
 * @param {string|number} o.kelvin
 */
export function addOrUpdatePreset({ id, name, color, brightness, kelvin }) {
  const n = String(name || '').trim();
  if (!n) throw new Error('Ad gerekli');
  const presets = loadPresetsFromStorage();
  const normColor = normalizeStoredHex(color) || '#ffffff';
  const b = String(brightness ?? '100');
  const k = String(kelvin ?? '5200');
  const entry = {
    id: id || `p_${Date.now()}`,
    name: n,
    color: normColor,
    brightness: b,
    kelvin: k,
    savedAt: Date.now(),
  };
  if (id) {
    const i = presets.findIndex((p) => p && p.id === id);
    if (i >= 0) presets[i] = entry;
    else presets.push(entry);
  } else {
    presets.push(entry);
  }
  savePresetsArray(presets);
  return entry;
}

export function deletePresetById(id) {
  if (!id) return;
  const presets = loadPresetsFromStorage().filter((p) => p && p.id !== id);
  savePresetsArray(presets);
}

export function savePresetFromUi() {
  const name = window.prompt('Ön ayar adı (örn. Akşam)')?.trim();
  if (!name) return;
  persistLedState();
  addOrUpdatePreset({
    name,
    color: colorPick?.value,
    brightness: brightness?.value ?? '100',
    kelvin: cctRange?.value ?? '5200',
  });
  if (activeProfileName) activeProfileName.textContent = `«${name}»`;
  setStatus(`Ön ayar kaydedildi: ${name}`);
}
