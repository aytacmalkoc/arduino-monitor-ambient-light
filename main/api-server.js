const crypto = require('crypto');
const express = require('express');
const http = require('http');
const { readSettingsFile, writeSettingsFile } = require('./settings-store');
const { getMainWindow } = require('./window');
const {
  enqueueSerialWrite,
  isSerialOpen,
} = require('./serial');
const {
  buildSerialLineFromHexBrightness,
  mergeLedState,
} = require('./led-payload');

const DEFAULT_API_PORT = 37890;

const ANIMATION_MODES = [
  'breathing',
  'heartbeat',
  'flicker',
  'crossfade',
  'randomJump',
  'pastelCycle',
  'strobe',
  'police',
  'sos',
  'sineWave',
  'sawtooth',
  'squareWave',
  'analogCycle',
  'complementaryJump',
  'lightning',
  'tvGlow',
  'candleFlame',
  'lavaMorph',
  'neonGlitch',
  'pwmDither',
  'screenAmbient',
];

const THEME_MODES = ['system', 'light', 'dark'];

let httpServer = null;
let lastListenError = null;

function generateApiKey() {
  return crypto.randomBytes(32).toString('base64url');
}

function ensureApiShape() {
  const cur = readSettingsFile();
  if (!cur.api || typeof cur.api !== 'object') cur.api = {};
  let changed = false;
  if (!cur.api.apiKey || typeof cur.api.apiKey !== 'string') {
    cur.api.apiKey = generateApiKey();
    changed = true;
  }
  if (cur.api.apiPort == null || !Number.isFinite(Number(cur.api.apiPort))) {
    cur.api.apiPort = DEFAULT_API_PORT;
    changed = true;
  }
  if (typeof cur.api.apiEnabled !== 'boolean') {
    cur.api.apiEnabled = false;
    changed = true;
  }
  if (changed) writeSettingsFile(cur);
  return cur;
}

function getBearerOrKey(req) {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const x = req.headers['x-api-key'];
  return typeof x === 'string' ? x.trim() : '';
}

function authMiddleware(req, res, next) {
  const settings = readSettingsFile();
  const expected = settings.api?.apiKey;
  if (!expected || typeof expected !== 'string') {
    return res.status(503).json({ error: 'API anahtarı yapılandırılmamış' });
  }
  const token = getBearerOrKey(req);
  if (token !== expected) {
    return res.status(401).json({ error: 'Geçersiz veya eksik API anahtarı' });
  }
  return next();
}

function broadcastLed(led) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('led:sync-from-api', led);
  }
}

function broadcastTheme(theme) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('theme:sync-from-api', theme);
  }
}

function broadcastAnimation(payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('api:animation-command', payload);
  }
}

function applyLedAndPersist(patch) {
  const cur = readSettingsFile();
  const merged = mergeLedState(patch, cur.led || {});
  cur.led = merged;
  writeSettingsFile(cur);

  broadcastLed(merged);

  if (isSerialOpen()) {
    const line = buildSerialLineFromHexBrightness(merged.color, merged.brightness);
    enqueueSerialWrite(line).catch(() => {});
  }

  return merged;
}

function buildStateSnapshot() {
  const cur = readSettingsFile();
  return {
    serialConnected: isSerialOpen(),
    led: cur.led || { color: '#ffffff', brightness: '100', kelvin: '5200' },
    theme: typeof cur.theme === 'string' ? cur.theme : 'system',
    presets: Array.isArray(cur.presets) ? cur.presets : [],
    api: {
      enabled: Boolean(cur.api?.apiEnabled),
      port: Number(cur.api?.apiPort) || DEFAULT_API_PORT,
    },
  };
}

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'monitor-ambient-light-api' });
  });

  app.get('/api/v1/state', authMiddleware, (_req, res) => {
    res.json(buildStateSnapshot());
  });

  app.put('/api/v1/led', authMiddleware, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const merged = applyLedAndPersist(body);
      res.json({ ok: true, led: merged });
    } catch (e) {
      res.status(400).json({ error: e.message || String(e) });
    }
  });

  app.put('/api/v1/theme', authMiddleware, (req, res) => {
    const theme = req.body?.theme;
    if (typeof theme !== 'string' || !THEME_MODES.includes(theme)) {
      return res.status(400).json({ error: `theme şunlardan biri olmalı: ${THEME_MODES.join(', ')}` });
    }
    const cur = readSettingsFile();
    cur.theme = theme;
    writeSettingsFile(cur);
    broadcastTheme(theme);
    return res.json({ ok: true, theme });
  });

  app.put('/api/v1/presets', authMiddleware, (req, res) => {
    const presets = req.body?.presets;
    if (!Array.isArray(presets)) {
      return res.status(400).json({ error: 'presets bir dizi olmalı' });
    }
    const cur = readSettingsFile();
    cur.presets = presets;
    writeSettingsFile(cur);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('presets:sync-from-api', presets);
    }
    return res.json({ ok: true, count: presets.length });
  });

  app.get('/api/v1/animations', authMiddleware, (_req, res) => {
    res.json({ modes: ANIMATION_MODES });
  });

  app.post('/api/v1/animation', authMiddleware, (req, res) => {
    const action = req.body?.action;
    const mode = req.body?.mode;
    if (action === 'stop') {
      broadcastAnimation({ action: 'stop' });
      return res.json({ ok: true, action: 'stop' });
    }
    if (action === 'start') {
      if (typeof mode !== 'string' || !ANIMATION_MODES.includes(mode)) {
        return res.status(400).json({
          error: 'Geçersiz mod',
          modes: ANIMATION_MODES,
        });
      }
      broadcastAnimation({ action: 'start', mode });
      return res.json({ ok: true, action: 'start', mode });
    }
    return res.status(400).json({ error: 'action "start" veya "stop" olmalı' });
  });

  app.use('/api/v1', (_req, res) => {
    res.status(404).json({ error: 'Bulunamadı' });
  });

  app.use((err, _req, res, _next) => {
    console.error('HTTP API:', err);
    res.status(500).json({ error: err.message || 'Sunucu hatası' });
  });

  return app;
}

function stopHttpApi() {
  return new Promise((resolve) => {
    if (!httpServer) {
      resolve();
      return;
    }
    httpServer.close(() => {
      httpServer = null;
      resolve();
    });
  });
}

function getHttpApiStatus() {
  const cur = readSettingsFile();
  const port = Number(cur.api?.apiPort) || DEFAULT_API_PORT;
  const enabled = Boolean(cur.api?.apiEnabled);
  const key = cur.api?.apiKey;
  return {
    running: !!httpServer?.listening,
    enabled,
    port,
    apiKey: typeof key === 'string' ? key : '',
    lastError: lastListenError,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

async function startHttpApi() {
  await stopHttpApi();
  lastListenError = null;
  ensureApiShape();
  const cur = readSettingsFile();
  if (!cur.api?.apiEnabled) {
    return { ok: false, reason: 'disabled' };
  }
  const port = Number(cur.api.apiPort) || DEFAULT_API_PORT;
  const app = createApp();
  httpServer = http.createServer(app);
  return new Promise((resolve) => {
    httpServer.once('error', (err) => {
      lastListenError = err.message || String(err);
      console.error('HTTP API listen:', err);
      httpServer = null;
      resolve({ ok: false, error: lastListenError });
    });
    httpServer.listen(port, '127.0.0.1', () => {
      lastListenError = null;
      console.log(`HTTP API: http://127.0.0.1:${port}`);
      resolve({ ok: true, port });
    });
  });
}

async function restartHttpApi() {
  await stopHttpApi();
  return startHttpApi();
}

module.exports = {
  ensureApiShape,
  generateApiKey,
  startHttpApi,
  stopHttpApi,
  restartHttpApi,
  getHttpApiStatus,
  DEFAULT_API_PORT,
  ANIMATION_MODES,
};
