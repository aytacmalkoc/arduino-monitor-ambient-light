import { STORAGE, THEME_MODES } from './constants.js';

let systemThemeListenerBound = false;

function readStoredThemeMode() {
  try {
    const v = localStorage.getItem(STORAGE.THEME);
    if (v != null && v !== '' && THEME_MODES.includes(v)) return v;
  } catch (_) {
    /* ignore */
  }
  return 'system';
}

function getResolvedDark(mode) {
  const m = THEME_MODES.includes(mode) ? mode : 'system';
  if (m === 'dark') return true;
  if (m === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeMode(mode) {
  const m = THEME_MODES.includes(mode) ? mode : 'system';
  document.documentElement.classList.toggle('dark', getResolvedDark(m));
}

function persistThemeMode(mode) {
  const m = THEME_MODES.includes(mode) ? mode : 'system';
  try {
    localStorage.setItem(STORAGE.THEME, m);
  } catch (_) {
    /* ignore */
  }
  if (window.appSettings) {
    window.appSettings.save({ theme: m }).catch(() => {});
  }
}

function ensureSystemThemeListener() {
  if (systemThemeListenerBound) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', () => {
    if (readStoredThemeMode() === 'system') applyThemeMode('system');
  });
  systemThemeListenerBound = true;
}

function syncThemeRadios() {
  const mode = readStoredThemeMode();
  document.querySelectorAll('input[name="themeMode"]').forEach((el) => {
    el.checked = el.value === mode;
  });
}

export function setThemeMode(mode) {
  persistThemeMode(mode);
  applyThemeMode(mode);
  if (mode === 'system') ensureSystemThemeListener();
  syncThemeRadios();
}

export function initThemeUi() {
  applyThemeMode(readStoredThemeMode());
  if (readStoredThemeMode() === 'system') ensureSystemThemeListener();
  syncThemeRadios();
}

export async function hydrateThemeFromDisk() {
  if (!window.appSettings) return;
  try {
    const disk = await window.appSettings.load();
    const t = disk.theme;
    if (!THEME_MODES.includes(t)) return;
    try {
      if (localStorage.getItem(STORAGE.THEME) == null) {
        localStorage.setItem(STORAGE.THEME, t);
        applyThemeMode(t);
        if (t === 'system') ensureSystemThemeListener();
        syncThemeRadios();
      }
    } catch (_) {
      /* ignore */
    }
  } catch (_) {
    /* ignore */
  }
}
