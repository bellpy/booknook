'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { BookDB } = require('./db');

let win = null;
let db = null;

// Data lives in the per-user app-data folder
//   Windows: %APPDATA%\booknook\booknook.db
//   Linux:   ~/.config/booknook/booknook.db
function openDatabase() {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'booknook.db');
  if (!fs.existsSync(file) && !app.isPackaged) {
    for (const name of ['booknook.db', 'books.db']) {
      const old = path.join(__dirname, name);
      if (fs.existsSync(old)) { fs.copyFileSync(old, file); break; }
    }
  }
  return new BookDB(file);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1260,
    height: 880,
    minWidth: 1060,
    minHeight: 780,
    backgroundColor: '#EAE2CB',
    title: 'booknook',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// Every handler returns {ok, data} or {ok:false, error}
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc() {
  handle('books:all', (opts) => db.all(opts || {}));
  handle('books:add', (book) => db.add(book));
  handle('books:update', (id, book) => db.update(Number(id), book));
  handle('books:delete', (id) => db.delete(Number(id)));
  handle('books:clear', () => db.clear());
  handle('goals:get', () => db.goals());
  handle('goals:set', (goals) => db.setGoals(goals));

  handle('csv:import', async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return db.importCsv(fs.readFileSync(r.filePaths[0], 'utf8'));
  });

  handle('csv:export', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, {
      defaultPath: `booknook-${today}.csv`,
      filters: [{ name: 'CSV files', extensions: ['csv'] }],
    });
    if (r.canceled || !r.filePath) return null;
    const { text, count } = db.exportCsv();
    fs.writeFileSync(r.filePath, text, 'utf8');
    return { count, name: path.basename(r.filePath) };
  });
}

// Only one copy at a time, so two windows can't conflict over data
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (app.isPackaged) Menu.setApplicationMenu(null);
    db = openDatabase();
    registerIpc();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', () => { if (db) { db.close(); db = null; } });
}
