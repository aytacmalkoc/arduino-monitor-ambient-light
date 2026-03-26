const { ipcMain, app, desktopCapturer, screen } = require('electron');
const {
  readSettingsFile,
  writeSettingsFile,
} = require('./settings-store');
const {
  getNightLightSnapshot,
  startNightLightWatch,
  stopNightLightWatch,
} = require('./nightlight');
const {
  SerialPort,
  enqueueSerialWrite,
  closeSerial,
  openSerialPort,
  prepareSerialOpen,
  isSerialOpen,
} = require('./serial');
const {
  ensureApiShape,
  generateApiKey,
  restartHttpApi,
  getHttpApiStatus,
  DEFAULT_API_PORT,
} = require('./api-server');

function registerIpcHandlers() {
  ipcMain.handle('desktop:getSources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 150, height: 150 },
    });
    return sources.map((s) => ({ id: s.id, name: s.name }));
  });

  ipcMain.handle('desktop:getPrimaryScreenSource', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 150, height: 150 },
    });
    if (!sources.length) return null;
    const primary = screen.getPrimaryDisplay();
    const pid = String(primary.id);
    let chosen =
      sources.find((s) => s.display_id && String(s.display_id) === pid) || null;
    if (!chosen && primary.label) {
      const label = primary.label.trim();
      if (label) {
        chosen =
          sources.find((s) => s.name && s.name.includes(label)) || null;
      }
    }
    if (!chosen) chosen = sources[0];
    return { id: chosen.id, name: chosen.name };
  });

  ipcMain.handle('serial:list', async () => {
    try {
      const ports = await SerialPort.list();
      return ports.map((p) => ({
        path: p.path,
        friendlyName: p.friendlyName || p.path,
        manufacturer: p.manufacturer || '',
      }));
    } catch (e) {
      console.error('serial:list', e);
      throw e;
    }
  });

  ipcMain.handle('serial:open', async (_event, opts) => {
    await prepareSerialOpen();
    return openSerialPort(opts);
  });

  ipcMain.handle('serial:write', async (_event, text) => {
    if (!isSerialOpen()) {
      throw new Error('Seri port açık değil');
    }
    await enqueueSerialWrite(text);
    return { ok: true };
  });

  ipcMain.handle('serial:close', () => closeSerial());

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('app:get-login-on-startup', () => {
    try {
      return app.getLoginItemSettings().openAtLogin;
    } catch {
      return false;
    }
  });

  ipcMain.handle('app:set-login-on-startup', (_event, open) => {
    app.setLoginItemSettings({
      openAtLogin: Boolean(open),
      openAsHidden: false,
    });
    return { ok: true };
  });

  ipcMain.handle('settings:load', () => readSettingsFile());

  ipcMain.handle('settings:save', (_event, partial) => {
    if (!partial || typeof partial !== 'object') return { ok: false };
    const cur = readSettingsFile();
    if (partial.led && typeof partial.led === 'object') {
      cur.led = { ...(cur.led || {}), ...partial.led };
    }
    if (Array.isArray(partial.presets)) {
      cur.presets = partial.presets;
    }
    if (partial.theme != null && typeof partial.theme === 'string') {
      cur.theme = partial.theme;
    }
    if (partial.api && typeof partial.api === 'object') {
      cur.api = { ...(cur.api || {}), ...partial.api };
    }
    writeSettingsFile(cur);
    return { ok: true };
  });

  ipcMain.handle('api:getStatus', () => {
    ensureApiShape();
    return getHttpApiStatus();
  });

  ipcMain.handle('api:save', async (_event, partial) => {
    if (!partial || typeof partial !== 'object') return { ok: false };
    ensureApiShape();
    const cur = readSettingsFile();
    const merged = { ...(cur.api || {}), ...partial };
    if (merged.apiPort != null) {
      const p = Number(merged.apiPort);
      merged.apiPort =
        Number.isFinite(p) && p >= 1 && p < 65536 ? Math.floor(p) : DEFAULT_API_PORT;
    }
    if (merged.apiEnabled != null && typeof merged.apiEnabled !== 'boolean') {
      merged.apiEnabled = Boolean(merged.apiEnabled);
    }
    cur.api = merged;
    writeSettingsFile(cur);
    await restartHttpApi();
    return { ok: true, status: getHttpApiStatus() };
  });

  ipcMain.handle('api:regenerateKey', async () => {
    ensureApiShape();
    const cur = readSettingsFile();
    cur.api = { ...(cur.api || {}), apiKey: generateApiKey() };
    writeSettingsFile(cur);
    await restartHttpApi();
    return { ok: true, status: getHttpApiStatus() };
  });

  ipcMain.handle('windows:getNightLightActive', async () => getNightLightSnapshot());

  ipcMain.handle('windows:setNightLightWatch', async (_event, { enabled }) => {
    if (enabled) {
      startNightLightWatch();
    } else {
      stopNightLightWatch();
    }
    return { ok: true };
  });
}

module.exports = { registerIpcHandlers };
