import { state } from '../state.js';
import {
  hideScreenAmbientDebugPanel,
  chkWinNightLightLed,
} from '../dom.js';
import { buildPayload, clampByte, getBaseRgb255, getBaseBrightnessPct } from '../color-utils.js';

export function animThrottleMinMs(mode) {
  if (mode === 'strobe' || mode === 'police') return 22;
  if (mode === 'neonGlitch' || mode === 'pwmDither') return 20;
  if (mode === 'flicker' || mode === 'lightning' || mode === 'tvGlow') return 24;
  if (mode === 'candleFlame') return 36;
  if (mode === 'sos') return 28;
  if (mode === 'lavaMorph') return 28;
  if (mode === 'screenAmbient') return 50;
  return 42;
}

export function sendAnimFrame(r, g, b, p, now, force = false) {
  if (!state.connected || !window.arduino || state.ledAnimMode == null) return;
  const gap = animThrottleMinMs(state.ledAnimMode);
  const t =
    state.ledAnimMode === 'screenAmbient' ? performance.now() : now;
  if (!force && t - state.lastAnimSendT < gap) return;
  state.lastAnimSendT = t;
  window.arduino
    .write(`${clampByte(r)},${clampByte(g)},${clampByte(b)},${Math.min(100, Math.max(0, Math.round(p)))}\n`)
    .catch(() => {});
}

export function updateAnimUiActive(mode) {
  document.querySelectorAll('.anim-preset-btn').forEach((el) => {
    el.classList.toggle('anim-active', el.getAttribute('data-anim') === mode);
  });
  const stopBtn = document.getElementById('btnStopAnimation');
  if (stopBtn) {
    stopBtn.classList.toggle('is-off', !mode);
  }
  const hint = document.getElementById('animActiveHint');
  if (hint) {
    const btn = mode ? document.querySelector(`[data-anim="${mode}"]`) : null;
    const label = btn?.getAttribute('data-label')?.trim() || btn?.textContent?.trim() || mode;
    hint.textContent = mode ? `Çalışıyor: ${label}` : '';
  }
  const statusAnim = document.getElementById('activeAnimLine');
  if (statusAnim) {
    if (mode) {
      const btn = document.querySelector(`[data-anim="${mode}"]`);
      const label = btn?.getAttribute('data-label')?.trim() || btn?.textContent?.trim() || mode;
      statusAnim.textContent = `Aktif animasyon: ${label}`;
      statusAnim.classList.remove('hidden');
    } else {
      statusAnim.textContent = '';
      statusAnim.classList.add('hidden');
    }
  }
}

export function stopLedAnimation(options = {}) {
  const restore = options.restore !== false;
  const hadAnim = state.ledAnimMode !== null || state.screenAmbientCleanupFn != null;
  state.screenAmbientSession += 1;
  hideScreenAmbientDebugPanel();
  if (state.ledAnimRafId != null) {
    cancelAnimationFrame(state.ledAnimRafId);
    state.ledAnimRafId = null;
  }
  if (state.ledAnimIntervalId != null) {
    clearInterval(state.ledAnimIntervalId);
    clearTimeout(state.ledAnimIntervalId);
    state.ledAnimIntervalId = null;
  }
  if (state.screenAmbientCleanupFn) {
    state.screenAmbientCleanupFn();
    state.screenAmbientCleanupFn = null;
  }
  state.ledAnimMode = null;
  state.lastAnimSendT = 0;
  updateAnimUiActive(null);
  const sw = document.getElementById('strobeWarning');
  if (sw) sw.hidden = true;
  clearTimeout(state.sendTimer);
  state.sendTimer = null;
  if (restore && state.connected && window.arduino) {
    state.sendTimer = setTimeout(() => {
      window.arduino.write(buildPayload()).catch(() => {});
    }, 20);
  }
  if (hadAnim && chkWinNightLightLed && chkWinNightLightLed.checked) {
    void import('../core/windows-nightlight.js').then((m) => m.tickWindowsNightLightLed());
  }
}

export { getBaseRgb255, getBaseBrightnessPct };
