const { BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function getMainWindow() {
  return mainWindow;
}

function createWindow() {
  const preloadPath = path.resolve(__dirname, '..', 'preload.js');
  if (!fs.existsSync(preloadPath)) {
    console.error('Preload bulunamadı:', preloadPath);
  }
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      /** Tam Node preload (require, yerel modül) — sandbox kapalı olmalı */
      sandbox: false,
      backgroundThrottling: false,
    },
    title: 'Monitor Ambient Light',
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

module.exports = {
  createWindow,
  getMainWindow,
};
