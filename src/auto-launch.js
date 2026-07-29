'use strict';

const path = require('node:path');

const AUTO_LAUNCH_NAME = '本地密码本';
const AUTO_LAUNCH_SHORTCUT_NAME = '本地密码本.lnk';

function createAutoLaunchTarget({ isPackaged, appPath, executablePath, portableExecutablePath }) {
  const targetPath = String(portableExecutablePath || executablePath || '');
  if (!targetPath) throw new Error('无法确定应用程序路径');
  const args = isPackaged ? [] : [String(appPath || '')];
  if (!isPackaged && !args[0]) throw new Error('无法确定开发版应用路径');
  return { path: targetPath, args };
}

function quoteWindowsArgument(value) {
  const text = String(value || '');
  if (!text || text.includes('"')) throw new Error('开机启动路径无效');
  return `"${text}"`;
}

function createShortcutDetails(target) {
  return {
    target: target.path,
    args: target.args.map(quoteWindowsArgument).join(' '),
    cwd: path.dirname(target.path),
    description: '登录 Windows 后自动启动本地密码本',
    icon: target.path,
    iconIndex: 0
  };
}

function normalizeWindowsValue(value) {
  let text = String(value || '');
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1);
  return text.replaceAll('/', '\\').toLocaleLowerCase('en-US');
}

function shortcutMatches(details, target) {
  if (!details || normalizeWindowsValue(details.target) !== normalizeWindowsValue(target.path)) {
    return false;
  }
  const expectedArgs = target.args.map(quoteWindowsArgument).join(' ');
  return String(details.args || '').trim().toLocaleLowerCase('en-US') ===
    expectedArgs.toLocaleLowerCase('en-US');
}

function createLegacyRemovalSettings(target, name = AUTO_LAUNCH_NAME) {
  return {
    name,
    openAtLogin: false,
    path: target.path,
    args: target.args
  };
}

module.exports = {
  AUTO_LAUNCH_NAME,
  AUTO_LAUNCH_SHORTCUT_NAME,
  createAutoLaunchTarget,
  createShortcutDetails,
  shortcutMatches,
  createLegacyRemovalSettings
};
