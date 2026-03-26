import {
  LED_KELVIN_MIN,
  LED_KELVIN_MAX,
  NIGHT_LIGHT_KELVIN_TRANSITION_MS,
} from '../constants.js';
import { state } from '../state.js';
import {
  cctRange,
  kelvinDisplay,
  colorPick,
  chkWinNightLightLed,
  winNightLightLedStatus,
} from '../dom.js';
import { kelvinToRgb, rgbToHex } from '../color-utils.js';
import { scheduleSend, syncSwatch, persistLedState } from '../led-connection.js';
import { stopLedAnimation } from '../animations/throttle-send.js';

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function cancelNightLightKelvinTransition() {
  if (state.nightLightKelvinRafId != null) {
    cancelAnimationFrame(state.nightLightKelvinRafId);
    state.nightLightKelvinRafId = null;
  }
  state.nightLightTransitionCurrentK = null;
  state.nightLightPendingTarget = null;
}

function applyNightLightKelvinUi(kFloat) {
  const k = Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, kFloat));
  const stepped =
    Math.round((k - LED_KELVIN_MIN) / 50) * 50 + LED_KELVIN_MIN;
  if (!cctRange || !kelvinDisplay || !colorPick) return;
  cctRange.value = String(stepped);
  kelvinDisplay.textContent = `${Math.round(k)}K`;
  const { r, g, b } = kelvinToRgb(k);
  colorPick.value = rgbToHex(r, g, b);
  syncSwatch();
  scheduleSend();
}

function startNightLightKelvinTransition(targetStepped) {
  if (state.nightLightKelvinRafId != null && state.nightLightPendingTarget === targetStepped) {
    return;
  }
  const startK =
    state.nightLightTransitionCurrentK != null
      ? state.nightLightTransitionCurrentK
      : Number(cctRange?.value);
  if (!Number.isFinite(startK)) return;

  if (state.nightLightKelvinRafId == null && state.nightLightTransitionCurrentK == null) {
    const startStepped =
      Math.round((startK - LED_KELVIN_MIN) / 50) * 50 + LED_KELVIN_MIN;
    if (startStepped === targetStepped) return;
  }

  if (state.nightLightKelvinRafId != null) {
    cancelAnimationFrame(state.nightLightKelvinRafId);
    state.nightLightKelvinRafId = null;
  }

  state.nightLightPendingTarget = targetStepped;
  stopLedAnimation();

  const dur = NIGHT_LIGHT_KELVIN_TRANSITION_MS;
  const t0 = performance.now();

  function frame(now) {
    const t = Math.min(1, (now - t0) / dur);
    const eased = easeInOutCubic(t);
    const k = startK + (targetStepped - startK) * eased;
    state.nightLightTransitionCurrentK = k;
    applyNightLightKelvinUi(k);
    if (t < 1) {
      state.nightLightKelvinRafId = requestAnimationFrame(frame);
    } else {
      state.nightLightKelvinRafId = null;
      state.nightLightTransitionCurrentK = null;
      state.nightLightPendingTarget = null;
      applyNightLightKelvinUi(targetStepped);
      persistLedState();
    }
  }
  state.nightLightKelvinRafId = requestAnimationFrame(frame);
}

function shouldSkipWindowsNightLightSync() {
  if (state.welcomeSplashActive) return true;
  if (state.ledAnimMode !== null) return true;
  return false;
}

function setWinNightLightLedStatus(text) {
  if (winNightLightLedStatus) winNightLightLedStatus.textContent = text;
}

function applyNightLightSnapshot(res) {
  if (!chkWinNightLightLed || !chkWinNightLightLed.checked) return;
  if (!window.appApi) {
    setWinNightLightLedStatus('Bu özellik yalnızca masaüstü uygulamasında kullanılabilir.');
    return;
  }
  if (res && res.supported === false) {
    setWinNightLightLedStatus('Bu özellik yalnızca Windows’ta kullanılabilir.');
    return;
  }
  if (!res || !res.ok) {
    setWinNightLightLedStatus('Gece ışığı durumu okunamadı.');
    return;
  }
  const active = !!res.active;
  setWinNightLightLedStatus(
    active
      ? 'Ekran Gece Işığı şu an açık — LED 3000K (en sıcak).'
      : 'Ekran Gece Işığı kapalı — LED 6500K (en soğuk beyaz).'
  );
  state.lastWinNightLightActive = active;

  if (shouldSkipWindowsNightLightSync()) return;

  const wantK = active ? LED_KELVIN_MIN : LED_KELVIN_MAX;
  const stepped =
    Math.round((Math.min(LED_KELVIN_MAX, Math.max(LED_KELVIN_MIN, wantK)) - LED_KELVIN_MIN) / 50) * 50 +
    LED_KELVIN_MIN;

  if (state.nightLightKelvinRafId != null && state.nightLightPendingTarget === stepped) {
    return;
  }
  const curK = cctRange ? Number(cctRange.value) : NaN;
  if (Number.isFinite(curK) && curK === stepped && state.nightLightKelvinRafId == null) {
    return;
  }

  startNightLightKelvinTransition(stepped);
}

export function ensureNightLightMainSubscription() {
  if (state.nightLightMainSubscribed) return;
  if (!window.appApi || typeof window.appApi.onNightLightState !== 'function') return;
  window.appApi.onNightLightState((snap) => {
    applyNightLightSnapshot(snap);
  });
  state.nightLightMainSubscribed = true;
}

export async function tickWindowsNightLightLed() {
  if (!chkWinNightLightLed || !chkWinNightLightLed.checked) return;
  if (!window.appApi || typeof window.appApi.getWindowsNightLightActive !== 'function') {
    setWinNightLightLedStatus('Bu özellik yalnızca masaüstü uygulamasında kullanılabilir.');
    return;
  }
  let res;
  try {
    res = await window.appApi.getWindowsNightLightActive();
  } catch {
    setWinNightLightLedStatus('Gece ışığı durumu okunamadı.');
    return;
  }
  applyNightLightSnapshot(res);
}

export function startWindowsNightLightPolling() {
  stopWindowsNightLightPolling();
  state.lastWinNightLightActive = null;
  ensureNightLightMainSubscription();
  if (window.appApi && typeof window.appApi.setNightLightWatch === 'function') {
    window.appApi.setNightLightWatch(true).catch(() => {
      void tickWindowsNightLightLed();
    });
  } else {
    void tickWindowsNightLightLed();
  }
}

export function stopWindowsNightLightPolling() {
  cancelNightLightKelvinTransition();
  if (window.appApi && typeof window.appApi.setNightLightWatch === 'function') {
    window.appApi.setNightLightWatch(false).catch(() => {});
  }
  state.lastWinNightLightActive = null;
  if (winNightLightLedStatus) winNightLightLedStatus.textContent = '';
}

export function initWindowsNightLightLedSync() {
  if (!chkWinNightLightLed) return;
  if (chkWinNightLightLed.checked) startWindowsNightLightPolling();
  else stopWindowsNightLightPolling();
}
