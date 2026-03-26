import { STORAGE, MAX_SERIAL_LOG_CHARS } from './constants.js';
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
  chkAutoConnect,
  chkCircadian,
  chkWinNightLightLed,
  chkCheckUpdates,
} from './dom.js';
import {
  buildPayload,
  buildPayloadFromPersistedStorage,
  normalizeStoredHex,
} from './color-utils.js';
import { stopLedAnimation } from './animations/throttle-send.js';
import {
  stopWelcomeLedAnimation,
  maybeStartWelcomeLedAnimation,
} from './screens/welcome.js';

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
  if (Number.isFinite(v)) return v;
  const saved = Number(localStorage.getItem(STORAGE.BAUD));
  return Number.isFinite(saved) ? saved : 115200;
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
  const baud = localStorage.getItem(STORAGE.BAUD);
  if (baud && baudSelect) {
    baudSelect.value = baud;
  }
  if (chkAutoConnect) {
    chkAutoConnect.checked = localStorage.getItem(STORAGE.AUTO) === '1';
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
    if (last && Array.from(select.options).some((o) => o.value === last)) {
      select.value = last;
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
    localStorage.setItem(STORAGE.PORT, path);
    if (baudSelect) localStorage.setItem(STORAGE.BAUD, String(baudRate));
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
