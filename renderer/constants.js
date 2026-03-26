/** Seri port hızı: UI ve `getBaud` yedek değeri (kayıtlı değer yoksa). */
export const DEFAULT_BAUD = 9600;

export const VALID_BAUD_RATES = [9600, 19200, 38400, 57600, 115200];

export const STORAGE = {
  BAUD: 'led-app-baud',
  PORT: 'led-app-lastPort',
  AUTO: 'led-app-autoConnect',
  CIRCADIAN: 'led-app-circadian',
  WIN_NIGHT_LIGHT_LED: 'led-app-winNightLightLed',
  LAUNCH: 'led-app-launchLogin',
  UPDATES: 'led-app-checkUpdates',
  LED_COLOR: 'led-app-ledColor',
  LED_BRIGHTNESS: 'led-app-ledBrightness',
  LED_KELVIN: 'led-app-ledKelvin',
  PRESETS: 'led-app-presets',
  THEME: 'led-app-theme',
};

export const THEME_MODES = ['system', 'light', 'dark'];

export const MAX_SERIAL_LOG_CHARS = 48000;

export const SCREEN_AMBIENT_KELVIN_MAX = 6500;
export const LED_KELVIN_MIN = 3000;
export const LED_KELVIN_MAX = 6500;
export const SCREEN_AMBIENT_BRIGHTNESS_PCT = 100;
export const SCREEN_AMBIENT_ANALYSIS_SIZE = 64;
export const NIGHT_LIGHT_KELVIN_TRANSITION_MS = 2200;
