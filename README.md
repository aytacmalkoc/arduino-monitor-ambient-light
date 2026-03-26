# Monitor Ambient Light

This repository is an Electron application developed as a **hobby project**: **RGB LED** control over **Arduino** via serial (COM) on Windows, an optional local HTTP API, and desktop-capture–based ambient light sync.

---

## Architecture overview

| Layer | Role |
|--------|------|
| **Main process** (`main/index.js`) | Window, IPC registration, serial port, HTTP API, Night Light monitoring; cleanup on `will-quit` / window close |
| **Preload** (`preload.js`) | Safe API surface via `contextBridge` for a renderer with `nodeIntegration` disabled |
| **Renderer** (`index.html` + `renderer/*.js` ES modules) | UI, animation, `localStorage` / `appSettings` sync |

- **Permissions:** `session.setPermissionRequestHandler` allows `media` and `display-capture` (screen capture).
- **Renderer CSP:** `default-src 'self'`; inline content limited to the bootstrapping theme script and styles.

---

## Main-process modules (`main/`)

- `ipc-handlers.js` — `invoke` channels from the renderer.
- `serial.js` — `serialport`; writes are **serialized** (`enqueueSerialWrite` + `drain`); on shutdown `closeSerialWithLedsOff` sends `0,0,0,0\n`.
- `led-payload.js` — Kelvin→RGB, hex merge, `r,g,b,p` line generation (aligned with renderer formulas).
- `api-server.js` — Express + `http`; localhost REST; settings persisted via `settings-store`.
- `nightlight.js` — Windows Night Light state (registry / related reads).
- `window.js` — `BrowserWindow`, broadcasts to the window over IPC.

---

## Preload API surface

| Global | Purpose |
|--------|---------|
| `window.arduino` | `listPorts`, `open`, `write`, `close`, `onData`, `onError` |
| `window.appApi` | Version, launch at login, Night Light read / watch |
| `window.appSettings` | `load` / `save` (disk settings) |
| `window.desktopCapture` | `getSources`, `getPrimaryScreenSource` |
| `window.ledHttpApi` | Local API status; LED / theme / animation / preset **IPC** sync (`onLedSync`, …) |

---

## Serial protocol

- Line format: `r,g,b,p\n` — `r,g,b` ∈ [0,255], `p` brightness percentage.
- Example: `255,240,200,80`
- Default **115200 baud** on the Arduino side; must match your firmware.

---

## Hardware schematic

Reference build: **simplified 5 V RGB LED control (Arduino only)** — Arduino Uno, three **IRLZ44N** logic-level N-channel MOSFETs, and a **5 V non-addressable** RGB strip (example: 50 cm). Firmware should use **PWM pins 9, 10, 11** for R, G, B.

![Simplified 5V RGB LED control circuit (Arduino only)](docs/circuit.png)

- **Power supply:** The entire system — Arduino, MOSFETs, and LED strip — is powered from the **computer over USB**. The Arduino’s **5 V** rail feeds the strip’s **+5 V** and the control electronics share the same supply domain.
- **Color control:** Arduino **pins 9, 10, and 11 (PWM)** drive the **gates (G)** of the three **IRLZ44N** MOSFETs (typically each through a **1 kΩ** gate resistor), turning the FETs on/off according to the RGB brightness from firmware/serial.
- **LED strip connections:** The strip **+5 V** wire goes **directly to the Arduino 5 V pin**. The **R**, **G**, and **B** wires connect to each MOSFET’s **drain (D)**; current flows from the strip color pins through the channel to ground.
- **Common ground (most important):** All three MOSFET **sources (S)** must be **tied together** and returned to **Arduino GND**. Without this single shared ground reference, the MOSFETs and strip cannot share a correct return path and the circuit will not work reliably.

---

## Local HTTP API

- **Binding:** `127.0.0.1` on this machine only (not exposed to external networks).
- **Default port:** `37890` (configurable).
- **Auth:** `Authorization: Bearer <token>` or `X-API-Key`.
- **Example routes:** `GET /api/v1/health`, `GET /api/v1/state`, `PUT /api/v1/led`, `PUT /api/v1/theme`, `PUT /api/v1/presets`, `POST /api/v1/animation`, `GET /api/v1/animations`.

---

## Renderer notes

- **Hash routing:** `#/controls`, `#/automation`, `#/advanced`, `#/settings`.
- **Animations:** `renderer/animations/`; startup is blocked when `prefers-reduced-motion: reduce`.
- **Screen ambient color:** `desktopCapture` + `canvas` sampling; analysis ~64×64; serial send throttled (~20 Hz band).
- **Storage:** `localStorage` keys in `renderer/constants.js`; merged with disk via `appSettings`.

---

## Feature summary (functional)

- Brightness, Kelvin (3000–6500K), quick modes, RGB fine-tuning.
- Preset LED animation modes (when serial is connected); screen ambient color mode.
- LED temperature mapping to Windows Night Light (optional).
- COM list, baud, auto-connect, serial log.
- Theme (system / light / dark), launch at login, local API panel.

---

## Development and build

```bash
npm install
npm run build:css    # tailwindcss: input.css → styles.css (minify)
npm run watch:css
npm start            # electron .
```

`serialport` uses native bindings; `postinstall` runs `electron-rebuild`; use `npm run rebuild` if needed.

---

## Production dependencies

- `electron`, `serialport`, `express`, `winreg`

Dev: `tailwindcss`, `@tailwindcss/forms`, `electron-rebuild`, font packages (see `package.json`).

---

## License

MIT 2026 Aytac Malkoc (`package.json`).
