import {
  SCREEN_AMBIENT_KELVIN_MAX,
  SCREEN_AMBIENT_BRIGHTNESS_PCT,
  SCREEN_AMBIENT_ANALYSIS_SIZE,
} from '../constants.js';
import { state } from '../state.js';
import {
  brightness,
  brightPctDisplay,
  cctRange,
  kelvinDisplay,
  colorPick,
  hideScreenAmbientDebugPanel,
  showScreenAmbientDebugPanel,
} from '../dom.js';
import {
  kelvinToRgb,
  rgbToHex,
  normalizeStoredHex,
  clampByte,
} from '../color-utils.js';
import { syncSwatch, setStatus } from '../led-connection.js';
import {
  sendAnimFrame,
  updateAnimUiActive,
  stopLedAnimation,
} from './throttle-send.js';

function applyScreenAmbientUiDefaults() {
  if (state.screenAmbientUiRestore) return;
  state.screenAmbientUiRestore = {
    brightness: brightness ? String(brightness.value) : '100',
    cct: cctRange ? String(cctRange.value) : '5200',
    hex: normalizeStoredHex(colorPick?.value) || '#ffffff',
  };
  if (brightness) brightness.value = String(SCREEN_AMBIENT_BRIGHTNESS_PCT);
  if (brightPctDisplay) brightPctDisplay.textContent = `${SCREEN_AMBIENT_BRIGHTNESS_PCT}%`;
  if (cctRange) {
    cctRange.value = String(SCREEN_AMBIENT_KELVIN_MAX);
    const k = SCREEN_AMBIENT_KELVIN_MAX;
    if (kelvinDisplay) kelvinDisplay.textContent = `${k}K`;
    const { r, g, b } = kelvinToRgb(k);
    if (colorPick) colorPick.value = rgbToHex(r, g, b);
  }
  syncSwatch();
}

function restoreScreenAmbientUiSnapshot() {
  if (!state.screenAmbientUiRestore) return;
  const snap = state.screenAmbientUiRestore;
  state.screenAmbientUiRestore = null;
  if (brightness) brightness.value = snap.brightness;
  if (brightPctDisplay && brightness) brightPctDisplay.textContent = `${brightness.value}%`;
  if (cctRange) cctRange.value = snap.cct;
  if (kelvinDisplay && cctRange) kelvinDisplay.textContent = `${cctRange.value}K`;
  if (colorPick && snap.hex) colorPick.value = snap.hex;
  syncSwatch();
}

function analyzeScreenAmbientFrame(imageData, prev) {
  const d = imageData.data;
  const n = imageData.width * imageData.height;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let sumL = 0;
  let sumSqL = 0;
  let wSum = 0;
  let wrSum = 0;
  let wgSum = 0;
  let wbSum = 0;
  const LUM_FLOOR = 4;
  const LUM_WEIGHT_GAMMA = 1.5;
  const MIX_SIMPLE = 0.14;
  for (let i = 0; i < d.length; i += 4) {
    const R = d[i];
    const G = d[i + 1];
    const B = d[i + 2];
    rSum += R;
    gSum += G;
    bSum += B;
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    sumL += y;
    sumSqL += y * y;
    const w = Math.pow(Math.max(0, y - LUM_FLOOR), LUM_WEIGHT_GAMMA);
    wSum += w;
    wrSum += R * w;
    wgSum += G * w;
    wbSum += B * w;
  }
  const k = n > 0 ? n : 1;
  const rSimple = rSum / k;
  const gSimple = gSum / k;
  const bSimple = bSum / k;
  let r = rSimple;
  let g = gSimple;
  let b = bSimple;
  if (wSum > 1e-6) {
    const rw = wrSum / wSum;
    const gw = wgSum / wSum;
    const bw = wbSum / wSum;
    r = rw * (1 - MIX_SIMPLE) + rSimple * MIX_SIMPLE;
    g = gw * (1 - MIX_SIMPLE) + gSimple * MIX_SIMPLE;
    b = bw * (1 - MIX_SIMPLE) + bSimple * MIX_SIMPLE;
  }
  const meanLum = sumL / k;
  const varianceLum = Math.max(0, sumSqL / k - meanLum * meanLum);
  const prevLum = prev.meanLum;
  const frameDelta = prevLum == null ? 0 : Math.min(1, Math.abs(meanLum - prevLum) / 255);
  prev.meanLum = meanLum;
  let colorDelta = 0;
  if (prev.rgb) {
    const dr = r - prev.rgb.r;
    const dg = g - prev.rgb.g;
    const db = b - prev.rgb.b;
    colorDelta = Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 200);
  }
  prev.rgb = { r, g, b };
  const varianceNorm = 1 - Math.exp(-varianceLum / 520);
  const deltaNorm = Math.min(1, frameDelta * 8);
  const colorNorm = Math.min(1, colorDelta * 1.15);
  const activity = Math.min(
    1,
    0.28 * varianceNorm + 0.34 * deltaNorm + 0.44 * colorNorm
  );
  return { r, g, b, meanLum, varianceLum, activity, frameDelta, colorDelta };
}

function applyScreenAmbientDynamic(r, g, b, activity, tSec, frameDelta, colorDelta) {
  const raw = activity > 0.06 ? activity : 0;
  const d = Math.min(1, raw * 1.08);
  const spike = Math.min(
    1,
    (frameDelta || 0) * 14 + (colorDelta || 0) * 1.85
  );
  const pulseA = 0.5 + 0.5 * Math.sin(tSec * (1.4 + 7 * d));
  const pulseB = 0.5 + 0.5 * Math.sin(tSec * (0.35 + 4 * d));
  const pulseC = 0.5 + 0.5 * Math.sin(tSec * (4.2 + 11 * d));
  const pulse = 0.38 * pulseA + 0.32 * pulseB + 0.3 * pulseC;
  const lumMult =
    1 +
    (pulse - 0.5) * 0.88 * d +
    spike * 0.42 * Math.max(0.25, d);
  let rr = r * lumMult;
  let gg = g * lumMult;
  let bb = b * lumMult;
  const warm = Math.min(1, Math.max(0, (r - Math.min(g, b)) / 255));
  if (warm > 0.08 && d > 0.08) {
    const kick = (pulse - 0.5) * 2 * d;
    const kpos = Math.max(0, kick);
    rr += 48 * warm * kpos + 22 * warm * spike;
    gg += 16 * warm * kpos + 8 * warm * spike;
    bb -= 10 * warm * Math.abs(kick) + 6 * warm * spike;
  }
  return { r: rr, g: gg, b: bb };
}

async function getDesktopMediaStream(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    },
  });
}

function bindScreenAmbientTrackEnded(stream) {
  const t = stream.getVideoTracks()[0];
  if (!t) return;
  t.addEventListener('ended', () => {
    if (state.ledAnimMode === 'screenAmbient') {
      stopLedAnimation({ restore: true });
      setStatus('Ekran paylaşımı sonlandı.', false);
    }
  });
}

async function runScreenAmbientPipeline(stream, session, label) {
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:0;';
  document.body.appendChild(video);

  try {
    await video.play();
  } catch (playErr) {
    stream.getTracks().forEach((tr) => tr.stop());
    video.remove();
    throw playErr;
  }

  for (let i = 0; i < 180 && video.videoWidth === 0; i += 1) {
    if (session !== state.screenAmbientSession) {
      stream.getTracks().forEach((tr) => tr.stop());
      video.remove();
      return;
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  if (video.videoWidth === 0) {
    stream.getTracks().forEach((tr) => tr.stop());
    video.remove();
    setStatus(
      'Ekran akışında kare yok. DRM içerik siyah olabilir; “Tüm ekranı” paylaşmayı veya başka monitörü deneyin.',
      true
    );
    updateAnimUiActive(null);
    return;
  }

  const canvas = document.createElement('canvas');
  const aw = SCREEN_AMBIENT_ANALYSIS_SIZE;
  const ah = SCREEN_AMBIENT_ANALYSIS_SIZE;
  canvas.width = aw;
  canvas.height = ah;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;

  const stripCanvas = document.getElementById('screenAmbientStripPreview');
  const sampleCanvas = document.getElementById('screenAmbientSamplePreview');
  const stripCtx = stripCanvas?.getContext('2d');
  const sampleCtx = sampleCanvas?.getContext('2d');
  const dbgRgb = document.getElementById('screenAmbientDebugRgb');
  const dbgVideo = document.getElementById('screenAmbientDebugVideo');
  const dbgSerial = document.getElementById('screenAmbientDebugSerial');

  applyScreenAmbientUiDefaults();

  state.screenAmbientCleanupFn = () => {
    restoreScreenAmbientUiSnapshot();
    hideScreenAmbientDebugPanel();
    stream.getTracks().forEach((tr) => tr.stop());
    video.srcObject = null;
    video.remove();
    state.screenAmbientCleanupFn = null;
  };

  showScreenAmbientDebugPanel();

  state.ledAnimMode = 'screenAmbient';
  updateAnimUiActive('screenAmbient');
  const strobeW = document.getElementById('strobeWarning');
  if (strobeW) strobeW.hidden = true;
  setStatus(
    `Ekran ortam rengi: ${label} · analiz ${aw}×${ah} (tam kare küçültme) · seri en fazla ~20 Hz`
  );

  const ambientPrev = { meanLum: null };
  let activitySm = 0;

  const drawAndSend = () => {
    if (video.videoWidth < 2 || !ctx) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    ctx.drawImage(video, 0, 0, vw, vh, 0, 0, aw, ah);
    const img = ctx.getImageData(0, 0, aw, ah);
    const analyzed = analyzeScreenAmbientFrame(img, ambientPrev);
    activitySm = activitySm * 0.28 + analyzed.activity * 0.72;
    const tSec = performance.now() * 0.001;
    const dyn = applyScreenAmbientDynamic(
      analyzed.r,
      analyzed.g,
      analyzed.b,
      activitySm,
      tSec,
      analyzed.frameDelta,
      analyzed.colorDelta
    );
    const { r, g, b } = dyn;

    if (stripCtx && stripCanvas) {
      const sw = stripCanvas.width;
      const shPrev = stripCanvas.height;
      stripCtx.fillStyle = '#000';
      stripCtx.fillRect(0, 0, sw, shPrev);
      stripCtx.imageSmoothingEnabled = true;
      const ar = vw / vh;
      const car = sw / shPrev;
      let dw;
      let dh;
      let dx;
      let dy;
      if (ar > car) {
        dw = sw;
        dh = sw / ar;
        dx = 0;
        dy = (shPrev - dh) / 2;
      } else {
        dh = shPrev;
        dw = shPrev * ar;
        dx = (sw - dw) / 2;
        dy = 0;
      }
      stripCtx.drawImage(video, 0, 0, vw, vh, dx, dy, dw, dh);
    }
    if (sampleCtx && sampleCanvas) {
      sampleCtx.imageSmoothingEnabled = true;
      sampleCtx.drawImage(canvas, 0, 0, aw, ah, 0, 0, sampleCanvas.width, sampleCanvas.height);
    }
    const pr = clampByte(r);
    const pg = clampByte(g);
    const pb = clampByte(b);
    const pp = SCREEN_AMBIENT_BRIGHTNESS_PCT;
    const actPct = Math.round(activitySm * 100);
    if (dbgRgb) {
      dbgRgb.textContent = `LED RGB (${pr}, ${pg}, ${pb}) · aktivite ${actPct}% · parlaklık ${pp}% · ${SCREEN_AMBIENT_KELVIN_MAX}K`;
    }
    if (dbgVideo) {
      dbgVideo.textContent = `Video ${vw}×${vh} · analiz ${aw}×${ah} · luma Δ ${(analyzed.frameDelta * 100).toFixed(0)}% · renk Δ ${(analyzed.colorDelta * 100).toFixed(0)}%`;
    }
    if (dbgSerial) {
      dbgSerial.textContent = `Gönderilen satır: ${pr},${pg},${pb},${pp}`;
    }

    sendAnimFrame(r, g, b, SCREEN_AMBIENT_BRIGHTNESS_PCT, performance.now());
  };

  const tick = () => {
    if (state.ledAnimMode !== 'screenAmbient') return;
    drawAndSend();
    state.ledAnimRafId = requestAnimationFrame(tick);
  };
  state.ledAnimRafId = requestAnimationFrame(tick);
}

export async function beginScreenAmbientCapture() {
  const session = state.screenAmbientSession;
  let stream = null;
  let label = '';

  try {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('getDisplayMedia desteklenmiyor');
    }
    setStatus(
      'Ekran seçin: açılan sistem penceresinde “Tüm ekranı” veya LED’e bağlamak istediğiniz monitörü seçin (iptal = yedek yöntem).'
    );
    stream = await navigator.mediaDevices.getDisplayMedia({
      audio: false,
      video: {
        frameRate: { ideal: 30, max: 60 },
      },
    });
    if (session !== state.screenAmbientSession) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    label = stream.getVideoTracks()[0]?.label || 'Paylaşılan ekran';
    bindScreenAmbientTrackEnded(stream);
  } catch (dmErr) {
    if (session !== state.screenAmbientSession) return;
    if (!window.desktopCapture?.getPrimaryScreenSource) {
      setStatus(dmErr.message || String(dmErr), true);
      updateAnimUiActive(null);
      return;
    }
    setStatus('Sistem paylaşımı kullanılamadı; otomatik ekran yakalama deneniyor…', false);
    try {
      const primary = await window.desktopCapture.getPrimaryScreenSource();
      if (session !== state.screenAmbientSession) return;
      if (!primary?.id) {
        setStatus('Ekran kaynağı bulunamadı.', true);
        updateAnimUiActive(null);
        return;
      }
      stream = await getDesktopMediaStream(primary.id);
      if (session !== state.screenAmbientSession) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      label = primary.name || 'ekran';
      bindScreenAmbientTrackEnded(stream);
    } catch (e) {
      setStatus(e.message || String(e), true);
      updateAnimUiActive(null);
      return;
    }
  }

  if (session !== state.screenAmbientSession) {
    stream?.getTracks().forEach((t) => t.stop());
    return;
  }
  if (!stream) {
    setStatus('Ekran akışı alınamadı.', true);
    updateAnimUiActive(null);
    return;
  }

  try {
    await runScreenAmbientPipeline(stream, session, label);
  } catch (e) {
    setStatus(e.message || String(e), true);
    updateAnimUiActive(null);
  }
}
