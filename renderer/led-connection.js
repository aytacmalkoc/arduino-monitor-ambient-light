import {
  STORAGE,
  MAX_SERIAL_LOG_CHARS,
  DEFAULT_BAUD,
  VALID_BAUD_RATES,
  LED_KELVIN_MIN,
  LED_KELVIN_MAX,
} from './constants.js';
import { state } from './state.js';
import {
  portSelect,
  baudSelect,
  btnRefresh,
  btnConnect,
  btnDisconnect,
  statusEl,
  colorPick,
  swatch,
  brightness,
  cctRange,
  connectionBadge,
  connectionDot,
  connectionLabel,
  serialLogOutput,
  chkCircadian,
  chkWinNightLightLed,
  chkCheckUpdates,
  kelvinDisplay,
  brightPctDisplay,
} from './dom.js';
import {
  buildPayload,
  buildPayloadFromPersistedStorage,
  normalizeStoredHex,
  kelvinToRgb,
  rgbToHex,
} from './color-utils.js';
import { stopLedAnimation } from './animations/throttle-send.js';
import {
  stopWelcomeLedAnimation,
  maybeStartWelcomeLedAnimation,
} from './screens/welcome.js';

const BAUD_SET = new Set(VALID_BAUD_RATES);

function normalizeBaud(v) {
  const n = Number(v);
  return BAUD_SET.has(n) ? n : null;
}

/** Windows: COM3 ile \\.\COM3 veya büyük/küçük harf farkını tolere eder. */
function normalizeSerialPath(p) {
  if (p == null || typeof p !== 'string') return '';
  let s = p.trim();
  if (/^\\\\\.\\/i.test(s)) s = s.slice(4);
  return s.toUpperCase();
}

function portPathsMatch(a, b) {
  return normalizeSerialPath(a) === normalizeSerialPath(b);
}

export function persistSerialBaud(baudNum) {
  if (!BAUD_SET.has(baudNum)) return;
  try {
    localStorage.setItem(STORAGE.BAUD, String(baudNum));
  } catch (_) {
    /* quota / private mode */
  }
  if (window.appSettings) {
    window.appSettings.save({ serial: { baudRate: baudNum } }).catch(() => {});
  }
}

async function persistSerialAfterConnect(portPath, baudNum) {
  if (!BAUD_SET.has(baudNum)) return;
  try {
    localStorage.setItem(STORAGE.PORT, portPath);
    localStorage.setItem(STORAGE.BAUD, String(baudNum));
  } catch (_) {
    /* quota / private mode */
  }
  if (window.appSettings) {
    try {
      await window.appSettings.save({
        serial: { baudRate: baudNum, lastPortPath: portPath },
      });
    } catch (_) {
      /* disk yazılamadı */
    }
  }
}

/** Açılışta otomatik bağlan — diske await ile yaz (kapanmadan önce kayıp olmasın). */
export async function persistAutoConnectPreferenceAsync(enabled) {
  const v = enabled ? '1' : '0';
  try {
    localStorage.setItem(STORAGE.AUTO, v);
  } catch (_) {
    /* quota / private mode */
  }
  const el = document.getElementById('chkAutoConnect');
  if (el) el.checked = enabled;
  if (window.appSettings) {
    try {
      await window.appSettings.save({
        serial: { autoConnect: Boolean(enabled) },
      });
    } catch (_) {
      /* disk yazılamadı */
    }
  }
}

export async function hydrateAutoConnectFromDisk() {
  if (localStorage.getItem(STORAGE.AUTO) !== null) return;
  if (!window.appSettings) return;
  try {
    const disk = await window.appSettings.load();
    if (disk.serial && disk.serial.autoConnect === true) {
      localStorage.setItem(STORAGE.AUTO, '1');
      const el = document.getElementById('chkAutoConnect');
      if (el) el.checked = true;
    }
  } catch (_) {
    /* ignore */
  }
}

export async function hydratePortFromDisk() {
  if (localStorage.getItem(STORAGE.PORT)) return;
  if (!window.appSettings) return;
  try {
    const disk = await window.appSettings.load();
    const p = disk.serial && disk.serial.lastPortPath;
    if (typeof p === 'string' && p.trim()) {
      localStorage.setItem(STORAGE.PORT, p.trim());
    }
  } catch (_) {
    /* ignore */
  }
}

export function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function appendSerialLog(chunk) {
  if (chunk == null || chunk === '') return;
  if (serialLogOutput && serialLogOutput.getAttribute('data-empty') === 'true') {
    serialLogOutput.removeAttribute('data-empty');
    state.serialLogBuffer = '';
  }
  state.serialLogBuffer += chunk;
  if (state.serialLogBuffer.length > MAX_SERIAL_LOG_CHARS) {
    state.serialLogBuffer = state.serialLogBuffer.slice(-MAX_SERIAL_LOG_CHARS);
  }
  if (serialLogOutput) {
    serialLogOutput.textContent = state.serialLogBuffer;
    serialLogOutput.scrollTop = serialLogOutput.scrollHeight;
  }
}

export function clearSerialLog() {
  state.serialLogBuffer = '';
  if (serialLogOutput) {
    serialLogOutput.textContent = 'Günlük temizlendi. Yeni veriler burada görünecek.';
    serialLogOutput.setAttribute('data-empty', 'true');
  }
}

export function setStatus(msg, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.classList.toggle('text-error', isError);
  statusEl.classList.toggle('text-on-surface-variant', !isError);
  statusEl.setAttribute('role', isError ? 'alert' : 'status');
}

export function updateConnectionBadge() {
  if (connectionBadge) {
    connectionBadge.className = state.connected
      ? 'connection-badge flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-200/60 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/35'
      : 'connection-badge flex items-center gap-2 px-3 py-1.5 rounded-full border border-outline-variant/20 bg-surface-container-high';
  }
  if (state.connected) {
    if (connectionDot) connectionDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
    if (connectionLabel) {
      connectionLabel.textContent = 'Bağlandı';
      connectionLabel.className =
        'font-headline uppercase tracking-widest text-[10px] font-bold text-emerald-800 dark:text-emerald-200';
    }
  } else {
    if (connectionDot) connectionDot.className = 'w-2 h-2 rounded-full bg-outline-variant shrink-0';
    if (connectionLabel) {
      connectionLabel.textContent = 'Çevrimdışı';
      connectionLabel.className =
        'font-headline uppercase tracking-widest text-[10px] font-bold text-on-surface-variant';
    }
  }
}

export function syncSwatch() {
  if (!swatch || !colorPick) return;
  swatch.style.background = colorPick.value;
}

export function touchUserLedControl() {
  if (state.applyingAutomationSync) return;
  if (window.automationApi && typeof window.automationApi.notifyManual === 'function') {
    window.automationApi.notifyManual().catch(() => {});
  }
}

/**
 * Ana süreç otomasyonundan gelen LED; seri zaten yazıldı — yalnızca UI ve disk eşlemesi.
 */
export function applyLedFromAutomationPatch(led) {
  if (!led) return;
  state.applyingAutomationSync = true;
  try {
    if (led.kelvin != null && cctRange && kelvinDisplay) {
      const raw = Number(led.kelvin);
      if (Number.isFinite(raw)) {
        const k = Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, raw));
        const stepped =
          Math.round((k - LED_KELVIN_MIN) / 50) * 50 + LED_KELVIN_MIN;
        cctRange.value = String(stepped);
        kelvinDisplay.textContent = `${stepped}K`;
        const { r, g, b } = kelvinToRgb(stepped);
        if (colorPick) colorPick.value = rgbToHex(r, g, b);
      }
    } else if (led.color && colorPick) {
      const col = normalizeStoredHex(led.color);
      if (col) colorPick.value = col;
    }
    if (led.brightness != null && brightness && brightPctDisplay) {
      const b = Math.min(100, Math.max(0, Math.round(Number(led.brightness))));
      brightness.value = String(b);
      brightPctDisplay.textContent = `${b}%`;
    }
    syncSwatch();
    persistLedState();
  } finally {
    state.applyingAutomationSync = false;
  }
}

export function persistLedState() {
  const col = normalizeStoredHex(colorPick?.value);
  const brStr = brightness ? String(brightness.value) : '100';
  const kvStr = cctRange ? String(cctRange.value) : '5200';
  try {
    if (col) localStorage.setItem(STORAGE.LED_COLOR, col);
    localStorage.setItem(STORAGE.LED_BRIGHTNESS, brStr);
    if (cctRange) localStorage.setItem(STORAGE.LED_KELVIN, kvStr);
  } catch (_) {
    /* quota / private mode */
  }
  if (window.appSettings) {
    window.appSettings
      .save({
        led: {
          color: col || '#ffffff',
          brightness: brStr,
          kelvin: kvStr,
        },
      })
      .catch(() => {});
  }
}

export function getBaud() {
  const v = baudSelect ? Number(baudSelect.value) : NaN;
  if (Number.isFinite(v) && BAUD_SET.has(v)) return v;
  const saved = normalizeBaud(localStorage.getItem(STORAGE.BAUD));
  if (saved != null) return saved;
  return DEFAULT_BAUD;
}

export async function hydrateBaudSettings() {
  if (!baudSelect) return;
  let baud = normalizeBaud(localStorage.getItem(STORAGE.BAUD));
  if (baud == null && window.appSettings) {
    try {
      const disk = await window.appSettings.load();
      baud = normalizeBaud(disk.serial && disk.serial.baudRate);
      if (baud != null) {
        try {
          localStorage.setItem(STORAGE.BAUD, String(baud));
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* ignore */
    }
  }
  if (baud == null) baud = DEFAULT_BAUD;
  baudSelect.value = String(baud);
  try {
    localStorage.setItem(STORAGE.BAUD, String(baud));
  } catch (_) {
    /* quota / private mode */
  }
}

export function scheduleSend() {
  if (!state.connected || !window.arduino) return;
  clearTimeout(state.sendTimer);
  state.sendTimer = setTimeout(async () => {
    try {
      await window.arduino.write(buildPayload());
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  }, 30);
}

export function loadStoredSettings() {
  const autoEl = document.getElementById('chkAutoConnect');
  if (autoEl) {
    autoEl.checked = localStorage.getItem(STORAGE.AUTO) === '1';
  }
  if (chkCircadian) {
    chkCircadian.checked = localStorage.getItem(STORAGE.CIRCADIAN) === '1';
  }
  if (chkWinNightLightLed) {
    chkWinNightLightLed.checked = localStorage.getItem(STORAGE.WIN_NIGHT_LIGHT_LED) === '1';
  }
  if (chkCheckUpdates) {
    const u = localStorage.getItem(STORAGE.UPDATES);
    if (u === '0') chkCheckUpdates.checked = false;
    if (u === '1') chkCheckUpdates.checked = true;
  }
}

export async function refreshPorts() {
  const select = portSelect || document.getElementById('portSelect');
  if (!select) {
    console.error('refreshPorts: portSelect bulunamadı');
    return;
  }
  if (!window.arduino) {
    setStatus('Seri port API kullanılamıyor.', true);
    return;
  }
  setStatus('Portlar taranıyor…');
  try {
    const ports = await window.arduino.listPorts();
    select.innerHTML = '';
    if (ports.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Port bulunamadı';
      select.appendChild(opt);
      setStatus('Seri cihaz bulunamadı.');
      return;
    }
    for (const p of ports) {
      const opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = p.friendlyName ? `${p.path} — ${p.friendlyName}` : p.path;
      select.appendChild(opt);
    }
    const last = localStorage.getItem(STORAGE.PORT);
    if (last) {
      const match = Array.from(select.options).find(
        (o) => o.value && portPathsMatch(o.value, last)
      );
      if (match) select.value = match.value;
    }
    setStatus(`${ports.length} port bulundu.`);
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

export async function connect() {
  const select = portSelect || document.getElementById('portSelect');
  if (!select) {
    setStatus('Port seçici bulunamadı.', true);
    return;
  }
  const path = select.value;
  if (!path) {
    setStatus('Önce bir port seçin.', true);
    return;
  }
  const baudRate = getBaud();
  setStatus('Bağlanılıyor…');
  try {
    persistLedState();
    await window.arduino.open({ path, baudRate });
    state.connected = true;
    await persistSerialAfterConnect(path, baudRate);
    if (btnConnect) btnConnect.disabled = true;
    if (btnDisconnect) btnDisconnect.disabled = false;
    select.disabled = true;
    if (btnRefresh) btnRefresh.disabled = true;
    setStatus(`Bağlandı: ${path} (${baudRate} baud)`);
    updateConnectionBadge();
    await delay(200);
    const restoreLine = buildPayloadFromPersistedStorage();
    await window.arduino.write(restoreLine);
    await delay(150);
    await window.arduino.write(buildPayload());
    maybeStartWelcomeLedAnimation();
  } catch (e) {
    state.connected = false;
    setStatus(e.message || String(e), true);
    updateConnectionBadge();
  }
}

/** Açılışta: port listesini güncelle, kayıtlı porta seç ve (isteğe bağlı) bağlan. */
export async function maybeAutoConnectLastPort() {
  if (!window.arduino) return;

  let disk = {};
  if (window.appSettings) {
    try {
      disk = await window.appSettings.load();
    } catch (_) {
      disk = {};
    }
  }
  const serial = disk.serial && typeof disk.serial === 'object' ? disk.serial : {};
  const wantAuto =
    serial.autoConnect === true || localStorage.getItem(STORAGE.AUTO) === '1';
  if (!wantAuto) return;

  if (
    serial.autoConnect !== true &&
    localStorage.getItem(STORAGE.AUTO) === '1' &&
    window.appSettings
  ) {
    try {
      await window.appSettings.save({ serial: { autoConnect: true } });
    } catch (_) {
      /* ignore */
    }
  }

  try {
    await hydrateBaudSettings();
    loadStoredSettings();
  } catch (_) {
    /* ignore */
  }

  let lastPort = (localStorage.getItem(STORAGE.PORT) || '').trim();
  if (!lastPort && typeof serial.lastPortPath === 'string') {
    lastPort = serial.lastPortPath.trim();
  }
  if (!lastPort) return;
  try {
    localStorage.setItem(STORAGE.PORT, lastPort);
  } catch (_) {
    /* ignore */
  }

  const select = portSelect || document.getElementById('portSelect');
  if (!select) return;

  const pickMatchingOption = () =>
    Array.from(select.options).find(
      (o) => o.value && portPathsMatch(o.value, lastPort)
    );

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await delay(500);
    await refreshPorts();
    const match = pickMatchingOption();
    if (match) {
      select.value = match.value;
      await connect();
      return;
    }
  }
}

export async function disconnect() {
  stopWelcomeLedAnimation();
  stopLedAnimation({ restore: false });
  try {
    await window.arduino.close();
  } catch (_) {
    /* ignore */
  }
  state.connected = false;
  const selectEl = portSelect || document.getElementById('portSelect');
  if (btnConnect) btnConnect.disabled = false;
  if (btnDisconnect) btnDisconnect.disabled = true;
  if (selectEl) selectEl.disabled = false;
  if (btnRefresh) btnRefresh.disabled = false;
  setStatus('Bağlantı kesildi.');
  updateConnectionBadge();
}
