'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

contextBridge.exposeInMainWorld('vaultApi', {
  status: () => call('vault:status'),
  create: (password) => call('vault:create', password),
  unlock: (password) => call('vault:unlock', password),
  lock: () => call('vault:lock'),
  touch: () => call('vault:touch'),
  list: () => call('vault:list'),
  listFolders: () => call('folder:list'),
  saveFolder: (folder) => call('folder:save', folder),
  deleteFolder: (id) => call('folder:delete', id),
  get: (id) => call('vault:get', id),
  save: (entry) => call('vault:save', entry),
  delete: (id) => call('vault:delete', id),
  copy: (id, field) => call('vault:copy', { id, field }),
  export: () => call('vault:export'),
  openWebsite: (url) => call('vault:openWebsite', url),
  onLocked: (callback) => ipcRenderer.on('vault:locked', callback)
});
