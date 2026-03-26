const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function settingsPath() {
  return path.join(app.getPath('userData'), 'led-app-settings.json');
}

function readSettingsFile() {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  } catch (e) {
    console.error('readSettingsFile', e);
  }
  return {};
}

function writeSettingsFile(obj) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('writeSettingsFile', e);
  }
}

module.exports = {
  readSettingsFile,
  writeSettingsFile,
};
