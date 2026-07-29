'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAutoLaunchTarget,
  createShortcutDetails,
  shortcutMatches,
  createLegacyRemovalSettings
} = require('../src/auto-launch');

test('安装版快捷方式保留包含空格的完整目标路径', () => {
  const target = createAutoLaunchTarget({
    isPackaged: true,
    appPath: 'D:\\Program Files\\local-vault\\resources\\app.asar',
    executablePath: 'D:\\Program Files\\local-vault\\本地密码本.exe'
  });
  assert.deepEqual(target, {
    path: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    args: []
  });
  assert.deepEqual(createShortcutDetails(target), {
    target: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    args: '',
    cwd: 'D:\\Program Files\\local-vault',
    description: '登录 Windows 后自动启动本地密码本',
    icon: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    iconIndex: 0
  });
});

test('便携版优先注册外层便携程序路径', () => {
  const target = createAutoLaunchTarget({
    isPackaged: true,
    appPath: 'C:\\Temp\\app.asar',
    executablePath: 'C:\\Temp\\本地密码本.exe',
    portableExecutablePath: 'E:\\工具\\本地密码本-便携版-2.0.1-x64.exe'
  });
  assert.equal(target.path, 'E:\\工具\\本地密码本-便携版-2.0.1-x64.exe');
  assert.deepEqual(target.args, []);
});

test('开发版应用路径作为加引号参数写入快捷方式', () => {
  const target = createAutoLaunchTarget({
    isPackaged: false,
    appPath: 'D:\\AI Projects\\notebook',
    executablePath: 'D:\\AI Projects\\notebook\\node_modules\\electron\\electron.exe'
  });
  assert.equal(createShortcutDetails(target).args, '"D:\\AI Projects\\notebook"');
});

test('正确的快捷方式目标和参数可以匹配', () => {
  const target = {
    path: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    args: ['D:\\Vault Projects\\notebook']
  };
  const details = {
    target: 'd:\\program files\\local-vault\\本地密码本.exe',
    args: '"D:\\Vault Projects\\notebook"'
  };
  assert.equal(shortcutMatches(details, target), true);
});

test('旧版注册表启动项使用原始路径执行清理', () => {
  const target = {
    path: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    args: []
  };
  assert.deepEqual(createLegacyRemovalSettings(target), {
    name: '本地密码本',
    openAtLogin: false,
    path: 'D:\\Program Files\\local-vault\\本地密码本.exe',
    args: []
  });
});
