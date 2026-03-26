const { app, BrowserWindow, session } = require('electron');
const { createWindow } = require('./window');
const { registerIpcHandlers } = require('./ipc-handlers');
const { stopNightLightWatch } = require('./nightlight');
const { closeSerialWithLedsOff } = require('./serial');
const { ensureApiShape, startHttpApi, stopHttpApi } = require('./api-server');

registerIpcHandlers();

app.whenReady().then(() => {
  app.setName('Monitor Ambient Light');
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture');
  });
  ensureApiShape();
  createWindow();
  startHttpApi().catch(() => {});
});

app.on('will-quit', () => {
  stopNightLightWatch();
  stopHttpApi().catch(() => {});
});

app.on('window-all-closed', () => {
  closeSerialWithLedsOff().then(() => app.quit());
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
