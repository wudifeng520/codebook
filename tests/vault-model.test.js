'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyVault, normalizeVault, removeFolder } = require('../src/vault-model');

test('新保险库包含文件夹集合', () => {
  const vault = createEmptyVault('2026-01-01T00:00:00.000Z');
  assert.deepEqual(vault.folders, []);
  assert.deepEqual(vault.entries, []);
});

test('旧保险库自动迁移为未分类条目', () => {
  const oldVault = { version: 1, entries: [{ id: 'entry-1', title: '邮箱' }] };
  const migrated = normalizeVault(oldVault);
  assert.deepEqual(migrated.folders, []);
  assert.equal(migrated.entries[0].folderId, '');
});

test('无效文件夹归属会迁移到未分类', () => {
  const migrated = normalizeVault({
    folders: [{ id: 'work', name: '工作' }],
    entries: [{ id: 'a', folderId: 'work' }, { id: 'b', folderId: 'missing' }]
  });
  assert.equal(migrated.entries[0].folderId, 'work');
  assert.equal(migrated.entries[1].folderId, '');
});

test('删除文件夹不会删除其中的密码条目', () => {
  const vault = normalizeVault({
    folders: [{ id: 'work', name: '工作' }],
    entries: [{ id: 'a', folderId: 'work' }, { id: 'b', folderId: '' }]
  });
  const moved = removeFolder(vault, 'work');
  assert.equal(moved, 1);
  assert.equal(vault.entries.length, 2);
  assert.equal(vault.entries[0].folderId, '');
});
