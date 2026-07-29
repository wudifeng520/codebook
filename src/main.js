'use strict';

const { app, BrowserWindow, ipcMain, clipboard, dialog, shell, powerMonitor } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { deriveKey, encryptWithKey, preparePasswordChange, decryptWithKey, validatePayload } = require('./vault-crypto');
const { createEmptyVault, normalizeVault, removeFolder } = require('./vault-model');
const {
  AUTO_LAUNCH_SHORTCUT_NAME,
  createAutoLaunchTarget,
  createShortcutDetails,
  shortcutMatches,
  createLegacyRemovalSettings
} = require('./auto-launch');
const { author: APP_AUTHOR } = require('../package.json');

const AUTO_LOCK_DELAY_MS = 5 * 60 * 1000;
const CLIPBOARD_CLEAR_DELAY_MS = 30_000;

let mainWindow;
let vault = null;
let vaultKey = null;
let vaultSalt = null;
let autoLockTimer = null;
let clipboardToken = 0;

const vaultPath = () => path.join(app.getPath('userData'), 'vault.pvault');

function autoLaunchTarget() {
  return createAutoLaunchTarget({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    executablePath: process.execPath,
    portableExecutablePath: process.env.PORTABLE_EXECUTABLE_FILE
  });
}

function autoLaunchShortcutPath() {
  return path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs',
    'Startup',
    AUTO_LAUNCH_SHORTCUT_NAME
  );
}

function isAutoLaunchEnabled() {
  if (process.platform !== 'win32') return false;
  const shortcutPath = autoLaunchShortcutPath();
  if (!fs.existsSync(shortcutPath)) return false;
  try {
    return shortcutMatches(shell.readShortcutLink(shortcutPath), autoLaunchTarget());
  } catch {
    return false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#f4f6f8',
    title: '本地密码本',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', lockVault);
}

function publicEntry(entry) {
  return { ...entry, password: undefined, hasPassword: Boolean(entry.password) };
}

function requireUnlocked() {
  if (!vault || !vaultKey || !vaultSalt) throw new Error('保险库已锁定');
  resetAutoLock();
}

function resetAutoLock() {
  clearTimeout(autoLockTimer);
  if (!vault) return;
  autoLockTimer = setTimeout(() => {
    lockVault();
    mainWindow?.webContents.send('vault:locked');
  }, AUTO_LOCK_DELAY_MS);
}

function lockVault() {
  clearTimeout(autoLockTimer);
  autoLockTimer = null;
  if (vaultKey) vaultKey.fill(0);
  vaultKey = null;
  vaultSalt = null;
  vault = null;
}

async function writeEncryptedVault(encrypted) {
  const target = vaultPath();
  const temp = `${target}.tmp`;
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(temp, JSON.stringify(encrypted), { encoding: 'utf8', mode: 0o600 });
  await fsp.rename(temp, target);
}

async function writeVault() {
  requireUnlocked();
  vault.updatedAt = new Date().toISOString();
  await writeEncryptedVault(encryptWithKey(vault, vaultKey, vaultSalt));
}

function safeHandler(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== mainWindow?.webContents) throw new Error('拒绝访问');
    try {
      return { ok: true, data: await handler(...args) };
    } catch (error) {
      return { ok: false, error: error.message || '操作失败' };
    }
  });
}

function registerIpc() {
  safeHandler('vault:status', async () => ({
    exists: fs.existsSync(vaultPath()),
    unlocked: Boolean(vault),
    version: app.getVersion(),
    author: APP_AUTHOR
  }));

  safeHandler('vault:create', async (password) => {
    if (fs.existsSync(vaultPath())) throw new Error('保险库已经存在');
    vaultSalt = crypto.randomBytes(16);
    vaultKey = deriveKey(password, vaultSalt);
    vault = createEmptyVault();
    await writeVault();
    resetAutoLock();
    return true;
  });

  safeHandler('vault:unlock', async (password) => {
    const payload = JSON.parse(await fsp.readFile(vaultPath(), 'utf8'));
    validatePayload(payload);
    const salt = Buffer.from(payload.salt, 'base64');
    const key = deriveKey(password, salt);
    let decrypted;
    try {
      decrypted = decryptWithKey(payload, key);
    } catch {
      key.fill(0);
      throw new Error('主密码错误或保险库文件已损坏');
    }
    lockVault();
    vault = normalizeVault(decrypted);
    vaultKey = key;
    vaultSalt = salt;
    resetAutoLock();
    return true;
  });

  safeHandler('vault:changePassword', async (input = {}) => {
    requireUnlocked();
    const previousUpdatedAt = vault.updatedAt;
    vault.updatedAt = new Date().toISOString();
    let change;
    try {
      change = preparePasswordChange(
        vault,
        input.currentPassword,
        input.newPassword,
        vaultKey,
        vaultSalt
      );
      await writeEncryptedVault(change.payload);
    } catch (error) {
      vault.updatedAt = previousUpdatedAt;
      if (change?.key) change.key.fill(0);
      throw error;
    }
    vaultKey.fill(0);
    vaultKey = change.key;
    vaultSalt = change.salt;
    resetAutoLock();
    return true;
  });

  safeHandler('vault:lock', async () => { lockVault(); return true; });
  safeHandler('vault:touch', async () => { requireUnlocked(); return true; });
  safeHandler('vault:list', async () => { requireUnlocked(); return vault.entries.map(publicEntry); });
  safeHandler('folder:list', async () => { requireUnlocked(); return vault.folders.map((folder) => ({ ...folder })); });

  safeHandler('folder:save', async (input) => {
    requireUnlocked();
    const name = String(input.name || '').trim().slice(0, 60);
    if (!name) throw new Error('请输入文件夹名称');
    const duplicate = vault.folders.some((folder) => folder.id !== input.id && folder.name.toLocaleLowerCase('zh-CN') === name.toLocaleLowerCase('zh-CN'));
    if (duplicate) throw new Error('已存在同名文件夹');
    const now = new Date().toISOString();
    let id = String(input.id || '');
    const index = vault.folders.findIndex((folder) => folder.id === id);
    if (index >= 0) {
      vault.folders[index] = { ...vault.folders[index], name, updatedAt: now };
    } else {
      id = crypto.randomUUID();
      vault.folders.push({ id, name, createdAt: now, updatedAt: now });
    }
    await writeVault();
    return { ...vault.folders.find((folder) => folder.id === id) };
  });

  safeHandler('folder:delete', async (id) => {
    requireUnlocked();
    const movedEntries = removeFolder(vault, String(id || ''));
    await writeVault();
    return { movedEntries };
  });

  safeHandler('vault:get', async (id) => {
    requireUnlocked();
    const entry = vault.entries.find((item) => item.id === id);
    if (!entry) throw new Error('未找到该条目');
    return { ...entry };
  });

  safeHandler('vault:save', async (input) => {
    requireUnlocked();
    const title = String(input.title || '').trim().slice(0, 120);
    if (!title) throw new Error('请输入名称');
    const now = new Date().toISOString();
    const requestedFolderId = String(input.folderId || '');
    const folderId = vault.folders.some((folder) => folder.id === requestedFolderId) ? requestedFolderId : '';
    const cleaned = {
      title,
      username: String(input.username || '').trim().slice(0, 300),
      password: String(input.password || '').slice(0, 2000),
      website: String(input.website || '').trim().slice(0, 1000),
      notes: String(input.notes || '').slice(0, 5000),
      favorite: Boolean(input.favorite),
      folderId
    };
    let id = String(input.id || '');
    const index = vault.entries.findIndex((item) => item.id === id);
    if (index >= 0) {
      vault.entries[index] = { ...vault.entries[index], ...cleaned, updatedAt: now };
    } else {
      id = crypto.randomUUID();
      vault.entries.unshift({ id, ...cleaned, createdAt: now, updatedAt: now });
    }
    await writeVault();
    return publicEntry(vault.entries.find((item) => item.id === id));
  });

  safeHandler('vault:delete', async (id) => {
    requireUnlocked();
    const index = vault.entries.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('未找到该条目');
    vault.entries.splice(index, 1);
    await writeVault();
    return true;
  });

  safeHandler('vault:copy', async ({ id, field }) => {
    requireUnlocked();
    if (!['username', 'password'].includes(field)) throw new Error('不支持复制该字段');
    const entry = vault.entries.find((item) => item.id === id);
    if (!entry) throw new Error('未找到该条目');
    const value = String(entry[field] || '');
    clipboard.writeText(value);
    const token = ++clipboardToken;
    setTimeout(() => {
      if (token === clipboardToken && clipboard.readText() === value) clipboard.clear();
    }, CLIPBOARD_CLEAR_DELAY_MS);
    return true;
  });

  safeHandler('vault:export', async () => {
    requireUnlocked();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '备份加密保险库',
      defaultPath: `密码本备份-${new Date().toISOString().slice(0, 10)}.pvault`,
      filters: [{ name: '加密保险库', extensions: ['pvault'] }]
    });
    if (result.canceled || !result.filePath) return false;
    await fsp.copyFile(vaultPath(), result.filePath);
    return true;
  });

  safeHandler('vault:openWebsite', async (url) => {
    requireUnlocked();
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('网址格式不正确'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只能打开 HTTP 或 HTTPS 地址');
    await shell.openExternal(parsed.toString());
    return true;
  });

  safeHandler('app:getAutoLaunch', async () => {
    if (process.platform !== 'win32') throw new Error('开机自动启动仅支持 Windows');
    return isAutoLaunchEnabled();
  });

  safeHandler('app:setAutoLaunch', async (enabled) => {
    requireUnlocked();
    if (process.platform !== 'win32') throw new Error('开机自动启动仅支持 Windows');
    if (typeof enabled !== 'boolean') throw new Error('开机自动启动设置无效');
    const target = autoLaunchTarget();
    app.setLoginItemSettings(createLegacyRemovalSettings(target));
    const shortcutPath = autoLaunchShortcutPath();
    if (enabled) {
      await fsp.mkdir(path.dirname(shortcutPath), { recursive: true });
      const operation = fs.existsSync(shortcutPath) ? 'replace' : 'create';
      const written = shell.writeShortcutLink(shortcutPath, operation, createShortcutDetails(target));
      if (!written) throw new Error('Windows 未能创建开机启动快捷方式');
    } else if (fs.existsSync(shortcutPath)) {
      await fsp.unlink(shortcutPath);
    }
    const actual = isAutoLaunchEnabled();
    if (actual !== enabled) throw new Error('Windows 未能更新开机自动启动设置');
    return actual;
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  const systemLock = () => {
    if (!vault) return;
    lockVault();
    mainWindow?.webContents.send('vault:locked');
  };
  powerMonitor.on('lock-screen', systemLock);
  powerMonitor.on('suspend', systemLock);
});

app.on('window-all-closed', () => {
  lockVault();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', lockVault);
