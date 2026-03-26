import { STORAGE } from './constants.js';
import {
  colorPick,
  brightness,
  cctRange,
  kelvinDisplay,
  brightPctDisplay,
  viewPanels,
  navLinks,
  btnRefresh,
  btnConnect,
  btnDisconnect,
  chkAutoConnect,
  chkCircadian,
  chkWinNightLightLed,
  chkCheckUpdates,
  chkLaunchLogin,
  appVersionLabel,
  portSelect,
  activeProfileName,
  btnClearSerialLog,
  baudSelect,
} from './dom.js';
import { hydrateThemeFromDisk, initThemeUi, setThemeMode } from './theme.js';
import { kelvinToRgb, rgbToHex, loadLedState } from './color-utils.js';
import {
  setStatus,
  scheduleSend,
  persistLedState,
  syncSwatch,
  refreshPorts,
  connect,
  disconnect,
  clearSerialLog,
  appendSerialLog,
  updateConnectionBadge,
  loadStoredSettings,
} from './led-connection.js';
import { hydratePresetsFromDisk } from './core/presets.js';
import {
  cancelNightLightKelvinTransition,
  tickWindowsNightLightLed,
  startWindowsNightLightPolling,
  stopWindowsNightLightPolling,
  initWindowsNightLightLedSync,
  ensureNightLightMainSubscription,
} from './core/windows-nightlight.js';
import { stopLedAnimation } from './animations/throttle-send.js';
import { startLedAnimation } from './animations/modes.js';
import { setupWelcomeSplash } from './screens/welcome.js';
import { parseHash } from './screens/navigation.js';
import {
  setupHttpApiRemoteListeners,
  initHttpApiSettingsPanel,
} from './http-api-settings.js';

setupHttpApiRemoteListeners();

colorPick?.addEventListener('input', () => {
  cancelNightLightKelvinTransition();
  stopLedAnimation();
  syncSwatch();
  persistLedState();
  scheduleSend();
});

brightness?.addEventListener('input', () => {
  cancelNightLightKelvinTransition();
  stopLedAnimation();
  if (brightPctDisplay && brightness) {
    brightPctDisplay.textContent = `${brightness.value}%`;
  }
  persistLedState();
  scheduleSend();
});

if (cctRange && kelvinDisplay) {
  cctRange.addEventListener('input', () => {
    cancelNightLightKelvinTransition();
    stopLedAnimation();
    const k = Number(cctRange.value);
    kelvinDisplay.textContent = `${k}K`;
    const { r, g, b } = kelvinToRgb(k);
    colorPick.value = rgbToHex(r, g, b);
    syncSwatch();
    persistLedState();
    scheduleSend();
  });
}

document.querySelectorAll('.quick-mode').forEach((btn) => {
  btn.addEventListener('click', () => {
    cancelNightLightKelvinTransition();
    stopLedAnimation();
    document.querySelectorAll('.quick-mode').forEach((b) => b.classList.remove('quick-mode--active'));
    btn.classList.add('quick-mode--active');
    const k = Number(btn.getAttribute('data-k'));
    const br = Number(btn.getAttribute('data-b'));
    const modeName = btn.getAttribute('data-name') || 'Özel';
    if (activeProfileName) activeProfileName.textContent = `«${modeName}»`;
    if (Number.isFinite(k) && cctRange && kelvinDisplay) {
      cctRange.value = String(k);
      kelvinDisplay.textContent = `${k}K`;
      const { r, g, b } = kelvinToRgb(k);
      if (colorPick) {
        colorPick.value = rgbToHex(r, g, b);
        syncSwatch();
      }
    }
    if (Number.isFinite(br) && brightness && brightPctDisplay) {
      brightness.value = String(br);
      brightPctDisplay.textContent = `${br}%`;
    }
    persistLedState();
    scheduleSend();
  });
});

btnRefresh?.addEventListener('click', () => refreshPorts());
btnConnect?.addEventListener('click', () => connect());
btnDisconnect?.addEventListener('click', () => disconnect());

const btnStopAnimation = document.getElementById('btnStopAnimation');
if (btnStopAnimation) {
  btnStopAnimation.addEventListener('click', (e) => {
    e.stopPropagation();
    stopLedAnimation();
    setStatus('Animasyon durduruldu.');
  });
}

document.querySelectorAll('.anim-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.getAttribute('data-anim');
    if (mode) startLedAnimation(mode);
  });
});

navLinks.forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const v = link.getAttribute('data-view');
    window.location.hash = `#/${v}`;
  });
});

window.addEventListener('hashchange', () => {
  parseHash();
  const h = (window.location.hash || '#/controls').replace(/^#\/?/, '');
  const name = h.split('/')[0] || 'controls';
  const panel = viewPanels[name];
  const heading = panel && panel.querySelector('h1, h2');
  if (heading) heading.focus({ preventScroll: true });
});

if (baudSelect) {
  baudSelect.addEventListener('change', () => {
    localStorage.setItem(STORAGE.BAUD, baudSelect.value);
  });
}

if (chkAutoConnect) {
  chkAutoConnect.addEventListener('change', () => {
    localStorage.setItem(STORAGE.AUTO, chkAutoConnect.checked ? '1' : '0');
  });
}

if (chkCircadian) {
  chkCircadian.addEventListener('change', () => {
    localStorage.setItem(STORAGE.CIRCADIAN, chkCircadian.checked ? '1' : '0');
  });
}

if (chkWinNightLightLed) {
  chkWinNightLightLed.addEventListener('change', () => {
    localStorage.setItem(STORAGE.WIN_NIGHT_LIGHT_LED, chkWinNightLightLed.checked ? '1' : '0');
    if (chkWinNightLightLed.checked) startWindowsNightLightPolling();
    else stopWindowsNightLightPolling();
  });
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && chkWinNightLightLed && chkWinNightLightLed.checked) {
    void tickWindowsNightLightLed();
  }
});

window.addEventListener('focus', () => {
  if (chkWinNightLightLed && chkWinNightLightLed.checked) {
    void tickWindowsNightLightLed();
  }
});

if (chkCheckUpdates) {
  chkCheckUpdates.addEventListener('change', () => {
    localStorage.setItem(STORAGE.UPDATES, chkCheckUpdates.checked ? '1' : '0');
  });
}

if (chkLaunchLogin && window.appApi) {
  chkLaunchLogin.addEventListener('change', async () => {
    try {
      await window.appApi.setLoginOnStartup(chkLaunchLogin.checked);
      localStorage.setItem(STORAGE.LAUNCH, chkLaunchLogin.checked ? '1' : '0');
    } catch (err) {
      chkLaunchLogin.checked = !chkLaunchLogin.checked;
      setStatus(err.message || String(err), true);
    }
  });
}

if (window.arduino) {
  window.arduino.onData((data) => {
    appendSerialLog(typeof data === 'string' ? data : String(data));
  });
  window.arduino.onError((msg) => setStatus(msg, true));
}

if (btnClearSerialLog) {
  btnClearSerialLog.addEventListener('click', () => clearSerialLog());
}

async function init() {
  try {
    await refreshPorts();
  } catch (e) {
    console.error('İlk port taraması başarısız:', e);
  }

  try {
    await hydrateThemeFromDisk();
    initThemeUi();
    document.querySelectorAll('input[name="themeMode"]').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked) setThemeMode(el.value);
      });
    });
    setupWelcomeSplash();
    await loadLedState();
    await hydratePresetsFromDisk();
    loadStoredSettings();
    syncSwatch();
    if (brightPctDisplay && brightness) {
      brightPctDisplay.textContent = `${brightness.value}%`;
    }
    if (kelvinDisplay && cctRange) {
      kelvinDisplay.textContent = `${cctRange.value}K`;
    }
    persistLedState();
    updateConnectionBadge();
    ensureNightLightMainSubscription();
    initWindowsNightLightLedSync();

    if (window.appApi) {
      try {
        const ver = await window.appApi.getVersion();
        if (appVersionLabel) appVersionLabel.textContent = ver || '—';
        const launch = await window.appApi.getLoginOnStartup();
        if (chkLaunchLogin) {
          chkLaunchLogin.checked = Boolean(launch);
          localStorage.setItem(STORAGE.LAUNCH, launch ? '1' : '0');
        }
      } catch (_) {
        if (appVersionLabel) appVersionLabel.textContent = '—';
        if (chkLaunchLogin) chkLaunchLogin.checked = localStorage.getItem(STORAGE.LAUNCH) === '1';
      }
    } else {
      if (appVersionLabel) appVersionLabel.textContent = '—';
      if (chkLaunchLogin) chkLaunchLogin.checked = localStorage.getItem(STORAGE.LAUNCH) === '1';
    }

    const psAuto = portSelect || document.getElementById('portSelect');
    if (chkAutoConnect && chkAutoConnect.checked && window.arduino && psAuto) {
      const last = localStorage.getItem(STORAGE.PORT);
      const hasPort = last && Array.from(psAuto.options).some((o) => o.value === last);
      if (hasPort && psAuto.value) {
        await connect();
      }
    }

    parseHash();
  } catch (e) {
    console.error('init:', e);
    try {
      await refreshPorts();
    } catch (_) {
      /* ignore */
    }
  } finally {
    void initHttpApiSettingsPanel();
  }
}

init().catch((e) => console.error('init (üst seviye):', e));
