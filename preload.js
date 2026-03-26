/**
 * Tek preload girişi — alt dosya require() bazı kurulumlarda başarısız olabildiği için
 * tüm contextBridge API'leri burada tanımlanır.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arduino', {
  listPorts: () => ipcRenderer.invoke('serial:list'),
  open: (opts) => ipcRenderer.invoke('serial:open', opts),
  write: (text) => ipcRenderer.invoke('serial:write', text),
  close: () => ipcRenderer.invoke('serial:close'),
  onData: (fn) => {
    const sub = (_e, data) => fn(data);
    ipcRenderer.on('serial:data', sub);
    return () => ipcRenderer.removeListener('serial:data', sub);
  },
  onError: (fn) => {
    const sub = (_e, msg) => fn(msg);
    ipcRenderer.on('serial:error', sub);
    return () => ipcRenderer.removeListener('serial:error', sub);
  },
});

contextBridge.exposeInMainWorld('appApi', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getLoginOnStartup: () => ipcRenderer.invoke('app:get-login-on-startup'),
  setLoginOnStartup: (open) => ipcRenderer.invoke('app:set-login-on-startup', open),
  getWindowsNightLightActive: () => ipcRenderer.invoke('windows:getNightLightActive'),
  setNightLightWatch: (enabled) => ipcRenderer.invoke('windows:setNightLightWatch', { enabled }),
  onNightLightState: (fn) => {
    const sub = (_e, payload) => fn(payload);
    ipcRenderer.on('windows:nightLightState', sub);
    return () => ipcRenderer.removeListener('windows:nightLightState', sub);
  },
});

contextBridge.exposeInMainWorld('appSettings', {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (partial) => ipcRenderer.invoke('settings:save', partial),
});

contextBridge.exposeInMainWorld('desktopCapture', {
  listSources: () => ipcRenderer.invoke('desktop:getSources'),
  getPrimaryScreenSource: () => ipcRenderer.invoke('desktop:getPrimaryScreenSource'),
});

contextBridge.exposeInMainWorld('ledHttpApi', {
  getStatus: () => ipcRenderer.invoke('api:getStatus'),
  save: (partial) => ipcRenderer.invoke('api:save', partial),
  regenerateKey: () => ipcRenderer.invoke('api:regenerateKey'),
  onLedSync: (fn) => {
    const sub = (_e, led) => fn(led);
    ipcRenderer.on('led:sync-from-api', sub);
    return () => ipcRenderer.removeListener('led:sync-from-api', sub);
  },
  onThemeSync: (fn) => {
    const sub = (_e, theme) => fn(theme);
    ipcRenderer.on('theme:sync-from-api', sub);
    return () => ipcRenderer.removeListener('theme:sync-from-api', sub);
  },
  onAnimationCommand: (fn) => {
    const sub = (_e, payload) => fn(payload);
    ipcRenderer.on('api:animation-command', sub);
    return () => ipcRenderer.removeListener('api:animation-command', sub);
  },
  onPresetsSync: (fn) => {
    const sub = (_e, presets) => fn(presets);
    ipcRenderer.on('presets:sync-from-api', sub);
    return () => ipcRenderer.removeListener('presets:sync-from-api', sub);
  },
});
