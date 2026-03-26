import { state } from '../state.js';
import { buildPayload } from '../color-utils.js';

export function stopWelcomeLedAnimation() {
  if (state.welcomeLedInterval) {
    clearInterval(state.welcomeLedInterval);
    state.welcomeLedInterval = null;
  }
}

export function restoreLedFromUiIfConnected() {
  if (state.connected && window.arduino) {
    window.arduino.write(buildPayload()).catch(() => {});
  }
}

export function maybeStartWelcomeLedAnimation() {
  if (!state.welcomeSplashActive || !state.connected || !window.arduino) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stopWelcomeLedAnimation();
  const steps = [
    [86, 94, 116],
    [74, 82, 104],
    [82, 96, 116],
    [100, 108, 128],
  ];
  let i = 0;
  const p = 100;
  state.welcomeLedInterval = setInterval(() => {
    if (!state.welcomeSplashActive || !state.connected) {
      stopWelcomeLedAnimation();
      restoreLedFromUiIfConnected();
      return;
    }
    const [r, g, b] = steps[i % steps.length];
    i += 1;
    window.arduino.write(`${r},${g},${b},${p}\n`).catch(() => {});
  }, 340);
}

export function setupWelcomeSplash() {
  const el = document.getElementById('welcomeSplash');
  if (!el) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.remove();
    return;
  }

  state.welcomeSplashActive = true;

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    state.welcomeSplashActive = false;
    stopWelcomeLedAnimation();
    restoreLedFromUiIfConnected();
    el.setAttribute('aria-hidden', 'true');
    el.classList.add('welcome-splash--out');
    const finish = () => el.remove();
    el.addEventListener('transitionend', (e) => {
      if (e.target === el && e.propertyName === 'opacity') finish();
    });
    setTimeout(finish, 900);
  };

  el.addEventListener('click', (e) => {
    if (e.target === el) dismiss();
  });
  setTimeout(dismiss, 2800);
}
