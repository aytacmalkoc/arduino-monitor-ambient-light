/** Paylaşılan UI / animasyon durumu (ES modüllerinde tek nesne üzerinden güncellenir) */
export const state = {
  connected: false,
  sendTimer: null,
  welcomeSplashActive: false,
  welcomeLedInterval: null,
  serialLogBuffer: '',
  ledAnimRafId: null,
  ledAnimIntervalId: null,
  ledAnimMode: null,
  lastAnimSendT: 0,
  screenAmbientSession: 0,
  screenAmbientCleanupFn: null,
  screenAmbientUiRestore: null,
  lastWinNightLightActive: null,
  nightLightMainSubscribed: false,
  nightLightKelvinRafId: null,
  nightLightTransitionCurrentK: null,
  nightLightPendingTarget: null,
  /** Ana süreç otomasyonu LED’i kontrol ederken Gece Işığı eşlemesi durur */
  automationActive: false,
  applyingAutomationSync: false,
};
