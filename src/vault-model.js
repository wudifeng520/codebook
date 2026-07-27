'use strict';

function createEmptyVault(now = new Date().toISOString()) {
  return { version: 1, createdAt: now, updatedAt: now, folders: [], entries: [] };
}

function normalizeVault(input) {
  if (!input || typeof input !== 'object') throw new Error('保险库内容无效');
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const sourceFolders = Array.isArray(input.folders) ? input.folders : [];
  const seenIds = new Set();
  const folders = sourceFolders.filter((folder) => {
    if (!folder || typeof folder.id !== 'string' || !folder.id || seenIds.has(folder.id)) return false;
    seenIds.add(folder.id);
    return true;
  }).map((folder) => ({
    id: folder.id,
    name: String(folder.name || '未命名文件夹').trim().slice(0, 60) || '未命名文件夹',
    createdAt: folder.createdAt || input.createdAt || new Date().toISOString(),
    updatedAt: folder.updatedAt || folder.createdAt || input.updatedAt || new Date().toISOString()
  }));
  const folderIds = new Set(folders.map((folder) => folder.id));
  return {
    ...input,
    version: 1,
    folders,
    entries: entries.map((entry) => ({
      ...entry,
      folderId: folderIds.has(entry.folderId) ? entry.folderId : ''
    }))
  };
}

function removeFolder(vault, folderId) {
  const index = vault.folders.findIndex((folder) => folder.id === folderId);
  if (index < 0) throw new Error('未找到该文件夹');
  vault.folders.splice(index, 1);
  let movedEntries = 0;
  for (const entry of vault.entries) {
    if (entry.folderId === folderId) {
      entry.folderId = '';
      movedEntries++;
    }
  }
  return movedEntries;
}

module.exports = { createEmptyVault, normalizeVault, removeFolder };
