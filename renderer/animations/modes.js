import { state } from '../state.js';
import { setStatus } from '../led-connection.js';
import { stopWelcomeLedAnimation } from '../screens/welcome.js';
import {
  stopLedAnimation,
  sendAnimFrame,
  updateAnimUiActive,
  getBaseRgb255,
  getBaseBrightnessPct,
} from './throttle-send.js';
import { beginScreenAmbientCapture } from './screen-ambient.js';
import { rgbToHsv255, hsvToRgb255, clampByte } from '../color-utils.js';

function sosLightOn(tMs) {
  const T = tMs % 6800;
  const seg = [
    [0, 200],
    [400, 600],
    [800, 1000],
    [1600, 2200],
    [2400, 3000],
    [3200, 3800],
    [4400, 4600],
    [4800, 5000],
    [5200, 5400],
  ];
  return seg.some(([a, b]) => T >= a && T < b);
}

const PASTEL_RGB = [
  [255, 228, 236],
  [228, 236, 255],
  [218, 252, 240],
  [244, 232, 255],
  [255, 248, 220],
];

function randomMorphTargetRgb() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  };
}

export function startLedAnimation(mode) {
  if (!window.arduino) {
    setStatus('Seri port kullanılamıyor.', true);
    return;
  }
  if (!state.connected) {
    setStatus('Animasyon için önce Gelişmiş ekrandan bağlantı kurun.', true);
    return;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setStatus('Sistemde hareket azaltma açık; animasyonlar devre dışı.', true);
    return;
  }

  stopWelcomeLedAnimation();
  stopLedAnimation({ restore: false });

  if (mode === 'screenAmbient') {
    void beginScreenAmbientCapture();
    return;
  }

  state.ledAnimMode = mode;
  updateAnimUiActive(mode);
  const strobeW = document.getElementById('strobeWarning');
  if (strobeW) {
    strobeW.hidden = !['strobe', 'police', 'lightning', 'complementaryJump', 'neonGlitch'].includes(mode);
  }

  const { r: br, g: bg, b: bb } = getBaseRgb255();
  const pMax = getBaseBrightnessPct();

  if (mode === 'breathing') {
    const t0 = performance.now();
    const tick = (now) => {
      if (state.ledAnimMode !== 'breathing') return;
      const phase = ((now - t0) / 1000) * (Math.PI * 2) / 4.2;
      const w = 0.5 + 0.5 * Math.sin(phase);
      const lo = Math.max(5, Math.min(25, pMax * 0.12));
      const p = lo + w * (pMax - lo);
      sendAnimFrame(br, bg, bb, p, now);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'heartbeat') {
    const pattern = [100, 38, 100, 38, 28, 28, 28, 28, 28, 28];
    let i = 0;
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'heartbeat') return;
      const p = (pattern[i % pattern.length] / 100) * pMax;
      i += 1;
      sendAnimFrame(br, bg, bb, p, performance.now());
    }, 130);
    return;
  }

  if (mode === 'flicker') {
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'flicker') return;
      const lo = Math.max(12, pMax * 0.15);
      const p = lo + Math.random() * (pMax - lo);
      sendAnimFrame(br, bg, bb, p, performance.now());
    }, 55 + Math.floor(Math.random() * 45));
    return;
  }

  if (mode === 'sineWave') {
    const t0 = performance.now();
    const periodSec = 5.5;
    const tick = (now) => {
      if (state.ledAnimMode !== 'sineWave') return;
      const ph = ((now - t0) / 1000) * ((Math.PI * 2) / periodSec);
      const w = 0.5 + 0.5 * Math.sin(ph);
      const lo = Math.max(4, pMax * 0.035);
      const p = lo + w * (pMax - lo);
      sendAnimFrame(br, bg, bb, p, now);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'sawtooth') {
    const t0 = performance.now();
    const periodSec = 2.4;
    let lastU = 0;
    const tick = (now) => {
      if (state.ledAnimMode !== 'sawtooth') return;
      const u = (((now - t0) / 1000) % periodSec) / periodSec;
      const lo = Math.max(5, pMax * 0.07);
      const p = lo + u * (pMax - lo);
      const force = lastU > 0.85 && u < 0.12;
      lastU = u;
      sendAnimFrame(br, bg, bb, p, now, force);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'squareWave') {
    const t0 = performance.now();
    const periodSec = 1.85;
    const duty = 0.48;
    let lastHigh = null;
    const tick = (now) => {
      if (state.ledAnimMode !== 'squareWave') return;
      const u = (((now - t0) / 1000) % periodSec) / periodSec;
      const high = u < duty;
      const force = lastHigh !== high;
      lastHigh = high;
      const p = high ? pMax : Math.max(4, pMax * 0.05);
      sendAnimFrame(br, bg, bb, p, now, force);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'crossfade') {
    const hsv = rgbToHsv255(br, bg, bb);
    const h2 = (hsv.h + 148) % 360;
    const rgb2 =
      hsv.s < 0.06
        ? { r: 255, g: 200, b: 120 }
        : hsvToRgb255(h2, Math.min(1, Math.max(0.2, hsv.s + 0.1)), hsv.v);
    const t0 = performance.now();
    const tick = (now) => {
      if (state.ledAnimMode !== 'crossfade') return;
      const u = 0.5 + 0.5 * Math.sin(((now - t0) / 1000) * (Math.PI * 2) / 7);
      const r = br * (1 - u) + rgb2.r * u;
      const g = bg * (1 - u) + rgb2.g * u;
      const b = bb * (1 - u) + rgb2.b * u;
      sendAnimFrame(r, g, b, pMax, now);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'randomJump') {
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'randomJump') return;
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      sendAnimFrame(r, g, b, pMax, performance.now());
    }, 1000);
    return;
  }

  if (mode === 'pastelCycle') {
    const t0 = performance.now();
    const durSec = 4.5;
    const c = PASTEL_RGB.length;
    const tick = (now) => {
      if (state.ledAnimMode !== 'pastelCycle') return;
      const elapsed = (now - t0) / 1000;
      const pos = (elapsed / durSec) % c;
      const i0 = Math.floor(pos) % c;
      const i1 = (i0 + 1) % c;
      const blend = pos - Math.floor(pos);
      const a = PASTEL_RGB[i0];
      const b = PASTEL_RGB[i1];
      const r = a[0] * (1 - blend) + b[0] * blend;
      const g = a[1] * (1 - blend) + b[1] * blend;
      const bch = a[2] * (1 - blend) + b[2] * blend;
      sendAnimFrame(r, g, bch, pMax, now);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'analogCycle') {
    const hsv = rgbToHsv255(br, bg, bb);
    const h0 = hsv.h;
    const s = Math.max(0.62, Math.min(1, hsv.s < 0.08 ? 0.82 : hsv.s + 0.08));
    const v = Math.min(1, Math.max(0.45, hsv.v));
    const t0 = performance.now();
    const tick = (now) => {
      if (state.ledAnimMode !== 'analogCycle') return;
      const t = (now - t0) / 1000;
      const swing = 44;
      let hh = h0 + swing * Math.sin(t * ((Math.PI * 2) / 8));
      hh = ((hh % 360) + 360) % 360;
      const rgb = hsvToRgb255(hh, s, v);
      sendAnimFrame(rgb.r, rgb.g, rgb.b, pMax, now);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'complementaryJump') {
    const hsv = rgbToHsv255(br, bg, bb);
    const h0 = ((hsv.h % 360) + 360) % 360;
    const s = Math.max(0.72, Math.min(1, hsv.s < 0.1 ? 0.9 : hsv.s + 0.12));
    const v = Math.min(1, Math.max(0.5, hsv.v));
    let flip = false;
    const apply = () => {
      if (state.ledAnimMode !== 'complementaryJump') return;
      const h = flip ? (h0 + 180) % 360 : h0;
      flip = !flip;
      const rgb = hsvToRgb255(h, s, v);
      sendAnimFrame(rgb.r, rgb.g, rgb.b, pMax, performance.now(), true);
    };
    apply();
    state.ledAnimIntervalId = setInterval(apply, 880);
    return;
  }

  if (mode === 'lightning') {
    const waitThenFlash = () => {
      if (state.ledAnimMode !== 'lightning') return;
      state.ledAnimIntervalId = setTimeout(() => {
        if (state.ledAnimMode !== 'lightning') return;
        sendAnimFrame(232, 248, 255, pMax, performance.now(), true);
        state.ledAnimIntervalId = setTimeout(() => {
          if (state.ledAnimMode !== 'lightning') return;
          sendAnimFrame(0, 0, 0, 0, performance.now(), true);
          waitThenFlash();
        }, 42 + Math.random() * 78);
      }, 320 + Math.random() * 3100);
    };
    sendAnimFrame(0, 0, 0, 0, performance.now(), true);
    waitThenFlash();
    return;
  }

  if (mode === 'tvGlow') {
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'tvGlow') return;
      const roll = Math.random();
      let r;
      let g;
      let b;
      if (roll < 0.34) {
        r = 150;
        g = 200;
        b = 255;
      } else if (roll < 0.67) {
        r = 235;
        g = 242;
        b = 255;
      } else {
        r = 95;
        g = 105;
        b = 118;
      }
      const p = 22 + Math.floor(Math.random() * 58);
      sendAnimFrame(r, g, b, p, performance.now());
    }, 160);
    return;
  }

  if (mode === 'candleFlame') {
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'candleFlame') return;
      const g = 125 + Math.random() * 55;
      const b = 18 + Math.random() * 42;
      let p = 70 + Math.random() * 28;
      if (Math.random() < 0.18) p *= 0.5 + Math.random() * 0.35;
      sendAnimFrame(255, g, b, p, performance.now());
    }, 72);
    return;
  }

  if (mode === 'lavaMorph') {
    const DURATION_MS = 2000;
    let from = { r: br, g: bg, b: bb };
    let to = randomMorphTargetRgb();
    let segStart = performance.now();
    const tick = (now) => {
      if (state.ledAnimMode !== 'lavaMorph') return;
      const elapsed = now - segStart;
      const u = Math.min(1, elapsed / DURATION_MS);
      const r = from.r + (to.r - from.r) * u;
      const g = from.g + (to.g - from.g) * u;
      const b = from.b + (to.b - from.b) * u;
      sendAnimFrame(r, g, b, pMax, now);
      if (u >= 1) {
        from = { r: to.r, g: to.g, b: to.b };
        to = randomMorphTargetRgb();
        segStart = now;
      }
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
    return;
  }

  if (mode === 'neonGlitch') {
    const nextGlitch = () => {
      if (state.ledAnimMode !== 'neonGlitch') return;
      const roll = Math.random();
      if (roll < 0.07) {
        sendAnimFrame(255, 255, 255, Math.min(100, pMax + 2), performance.now(), true);
        state.ledAnimIntervalId = setTimeout(() => {
          if (state.ledAnimMode !== 'neonGlitch') return;
          sendAnimFrame(br, bg, bb, pMax, performance.now(), true);
          state.ledAnimIntervalId = setTimeout(nextGlitch, 90 + Math.random() * 420);
        }, 10 + Math.random() * 24);
      } else if (roll < 0.38) {
        const dipP = Math.random() < 0.5 ? 10 : 20;
        sendAnimFrame(br, bg, bb, dipP, performance.now(), true);
        state.ledAnimIntervalId = setTimeout(() => {
          if (state.ledAnimMode !== 'neonGlitch') return;
          sendAnimFrame(br, bg, bb, pMax, performance.now(), true);
          state.ledAnimIntervalId = setTimeout(nextGlitch, 140 + Math.random() * 900);
        }, 20 + Math.random() * 48);
      } else {
        sendAnimFrame(br, bg, bb, pMax, performance.now(), true);
        state.ledAnimIntervalId = setTimeout(nextGlitch, 220 + Math.random() * 1600);
      }
    };
    sendAnimFrame(br, bg, bb, pMax, performance.now(), true);
    nextGlitch();
    return;
  }

  if (mode === 'pwmDither') {
    const pCenter = Math.max(6, Math.min(100, Math.round(pMax * 0.44)));
    let flip = false;
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'pwmDither') return;
      flip = !flip;
      const p = Math.min(100, Math.max(1, pCenter + (flip ? 1 : 0)));
      let r = br;
      let g = bg;
      let b = bb;
      if (flip) {
        r = clampByte(br + (Math.random() < 0.5 ? 1 : -1));
        g = clampByte(bg + (Math.random() < 0.5 ? 1 : -1));
        b = clampByte(bb + (Math.random() < 0.5 ? 1 : -1));
      }
      sendAnimFrame(r, g, b, p, performance.now(), true);
    }, 22);
    return;
  }

  if (mode === 'strobe') {
    let on = true;
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'strobe') return;
      on = !on;
      if (on) sendAnimFrame(br, bg, bb, pMax, performance.now());
      else sendAnimFrame(br, bg, bb, 0, performance.now());
    }, 55);
    return;
  }

  if (mode === 'police') {
    let step = 0;
    state.ledAnimIntervalId = setInterval(() => {
      if (state.ledAnimMode !== 'police') return;
      const red = step % 4 < 2;
      step += 1;
      if (red) sendAnimFrame(255, 0, 0, 100, performance.now());
      else sendAnimFrame(0, 40, 255, 100, performance.now());
    }, 85);
    return;
  }

  if (mode === 'sos') {
    const t0 = performance.now();
    let lastOn = null;
    const tick = (now) => {
      if (state.ledAnimMode !== 'sos') return;
      const t = now - t0;
      const on = sosLightOn(t);
      const force = lastOn !== on;
      lastOn = on;
      if (on) sendAnimFrame(255, 255, 255, 100, now, force);
      else sendAnimFrame(0, 0, 0, 0, now, force);
      state.ledAnimRafId = requestAnimationFrame(tick);
    };
    state.ledAnimRafId = requestAnimationFrame(tick);
  }
}
