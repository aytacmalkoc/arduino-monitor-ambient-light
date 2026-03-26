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

export function savePresetFromUi() {
  const name = window.prompt('Ön ayar adı (örn. Akşam)')?.trim();
  if (!name) return;
  persistLedState();
  const presets = loadPresetsFromStorage();
  presets.push({
    id: `p_${Date.now()}`,
    name,
    color: normalizeStoredHex(colorPick?.value) || '#ffffff',
    brightness: String(brightness?.value ?? '100'),
    kelvin: String(cctRange?.value ?? '5200'),
    savedAt: Date.now(),
  });
  savePresetsArray(presets);
  if (activeProfileName) activeProfileName.textContent = `«${name}»`;
  setStatus(`Ön ayar kaydedildi: ${name}`);
}
