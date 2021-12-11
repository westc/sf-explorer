const fs = require('fs');
const { app, BrowserWindow, ipcMain } = require('electron');
const jsforce = require('jsforce');
const path = require('path');
const { settings } = require('cluster');
const { saveSettings } = require('./utils');


/** @type {{[k: string]: jsforce.Connection}} */
const connections = {};


const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');


function createWindow () {
  const win = new BrowserWindow({
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  win.maximize();
  win.webContents.openDevTools({ mode: 'right' });
  win.loadFile('app.html');
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', async() => {
  for (const connection of Object.values(connections)) {
    try {
      await connection.logout();
    } catch (e) {}
  }
  app.quit();
});


/**
 * Used to get specific values on init.
 */
ipcMain.on('get-remote-settings', event => {
  event.returnValue = {
    /** @type {SFE_RemoteSettings} */
    returnValue: {
      appPath: app.getAppPath(),
      appDataPath: app.getPath('appData'),
      userDataPath: app.getPath('userData'),
    }
  };
});
/**
 * @typedef {Object} SFE_RemoteSettings
 * @property {string} appPath
 * @property {string} appDataPath
 * @property {string} userDataPath
 */
