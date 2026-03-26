import {
  colorPick,
  brightness,
  cctRange,
  kelvinDisplay,
  brightPctDisplay,
} from './dom.js';
import { persistLedState, scheduleSend, syncSwatch } from './led-connection.js';
import { stopLedAnimation } from './animations/throttle-send.js';
import { startLedAnimation } from './animations/modes.js';
import { setThemeMode } from './theme.js';
import { savePresetsArray } from './core/presets.js';

export function setupHttpApiRemoteListeners() {
  if (!window.ledHttpApi) return;
  window.ledHttpApi.onLedSync((led) => {
    if (!led || typeof led !== 'object') return;
    stopLedAnimation({ restore: false });
    if (led.color && colorPick) colorPick.value = led.color;
    if (brightness && led.brightness != null) brightness.value = String(led.brightness);
    if (cctRange && led.kelvin != null) cctRange.value = String(led.kelvin);
    if (kelvinDisplay && led.kelvin != null) kelvinDisplay.textContent = `${led.kelvin}K`;
    if (brightPctDisplay && brightness) {
      brightPctDisplay.textContent = `${brightness.value}%`;
    }
    syncSwatch();
    persistLedState();
    scheduleSend();
  });
  window.ledHttpApi.onThemeSync((theme) => {
    if (theme) setThemeMode(theme);
  });
  window.ledHttpApi.onAnimationCommand((payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (payload.action === 'stop') {
      stopLedAnimation();
      return;
    }
    if (payload.action === 'start' && payload.mode) {
      startLedAnimation(payload.mode);
    }
  });
  window.ledHttpApi.onPresetsSync((presets) => {
    if (Array.isArray(presets)) savePresetsArray(presets);
  });
}

function setStatusText(el, running, err) {
  if (!el) return;
  if (err) {
    el.textContent = `Hata: ${err}`;
    el.classList.add('text-error');
    return;
  }
  el.classList.remove('text-error');
  el.textContent = running ? 'Sunucu çalışıyor (127.0.0.1)' : 'Sunucu kapalı';
}

export async function initHttpApiSettingsPanel() {
  const chk = document.getElementById('chkApiEnabled');
  const portInput = document.getElementById('inpApiPort');
  const keyField = document.getElementById('inpApiKey');
  const baseUrlEl = document.getElementById('apiBaseUrl');
  const statusEl = document.getElementById('apiServerStatus');
  const btnCopy = document.getElementById('btnCopyApiKey');
  const btnRegen = document.getElementById('btnRegenerateApiKey');

  if (!window.ledHttpApi || !chk || !portInput || !keyField) return;

  async function refresh() {
    try {
      const s = await window.ledHttpApi.getStatus();
      chk.checked = Boolean(s.enabled);
      portInput.value = String(s.port ?? 37890);
      keyField.value = s.apiKey || '';
      if (baseUrlEl) baseUrlEl.textContent = s.baseUrl || '';
      setStatusText(statusEl, s.running, s.lastError);
    } catch (e) {
      setStatusText(statusEl, false, e.message || String(e));
    }
  }

  chk.addEventListener('change', async () => {
    const want = chk.checked;
    chk.disabled = true;
    try {
      await window.ledHttpApi.save({ apiEnabled: want });
      await refresh();
    } catch (_) {
      chk.checked = !want;
    } finally {
      chk.disabled = false;
    }
  });

  portInput.addEventListener('change', async () => {
    const p = Number(portInput.value);
    portInput.disabled = true;
    try {
      await window.ledHttpApi.save({ apiPort: p });
      await refresh();
    } catch (_) {
      await refresh();
    } finally {
      portInput.disabled = false;
    }
  });

  btnCopy?.addEventListener('click', async () => {
    const t = keyField.value || '';
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      btnCopy.textContent = 'Kopyalandı';
      setTimeout(() => {
        btnCopy.textContent = 'Kopyala';
      }, 1600);
    } catch (_) {
      keyField.select();
      document.execCommand('copy');
    }
  });

  btnRegen?.addEventListener('click', async () => {
    if (!window.confirm('Yeni anahtar oluşturulsun mu? Eski anahtar geçersiz olur.')) return;
    btnRegen.disabled = true;
    try {
      await window.ledHttpApi.regenerateKey();
      await refresh();
    } finally {
      btnRegen.disabled = false;
    }
  });

  await refresh();
}
