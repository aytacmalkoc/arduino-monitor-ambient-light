export const portSelect = document.getElementById('portSelect');
export const baudSelect = document.getElementById('baudSelect');
export const btnRefresh = document.getElementById('btnRefresh');
export const btnConnect = document.getElementById('btnConnect');
export const btnDisconnect = document.getElementById('btnDisconnect');
export const statusEl = document.getElementById('status');
export const colorPick = document.getElementById('colorPick');
export const swatch = document.getElementById('swatch');
export const brightness = document.getElementById('brightness');
export const brightPctDisplay = document.getElementById('brightPctDisplay');
export const cctRange = document.getElementById('cctRange');
export const kelvinDisplay = document.getElementById('kelvinDisplay');
export const connectionBadge = document.getElementById('connectionBadge');
export const connectionDot = document.getElementById('connectionDot');
export const connectionLabel = document.getElementById('connectionLabel');
export const activeProfileName = document.getElementById('activeProfileName');
export const chkAutoConnect = document.getElementById('chkAutoConnect');
export const chkCircadian = document.getElementById('chkCircadian');
export const chkWinNightLightLed = document.getElementById('chkWinNightLightLed');
export const winNightLightLedStatus = document.getElementById('winNightLightLedStatus');
export const chkLaunchLogin = document.getElementById('chkLaunchLogin');
export const chkCheckUpdates = document.getElementById('chkCheckUpdates');
export const appVersionLabel = document.getElementById('appVersionLabel');
export const serialLogOutput = document.getElementById('serialLogOutput');
export const btnClearSerialLog = document.getElementById('btnClearSerialLog');

export const viewPanels = {
  controls: document.getElementById('view-controls'),
  presets: document.getElementById('view-presets'),
  automation: document.getElementById('view-automation'),
  advanced: document.getElementById('view-advanced'),
  settings: document.getElementById('view-settings'),
};

export const navLinks = Array.from(document.querySelectorAll('.nav-link'));

export function hideScreenAmbientDebugPanel() {
  const p = document.getElementById('screenAmbientDebugPanel');
  if (p) p.classList.add('hidden');
}

export function showScreenAmbientDebugPanel() {
  const p = document.getElementById('screenAmbientDebugPanel');
  if (p) p.classList.remove('hidden');
}
