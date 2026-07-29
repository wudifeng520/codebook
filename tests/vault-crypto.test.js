'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptVault, preparePasswordChange, decryptVault, validatePayload } = require('../src/vault-crypto');

test('加密后不包含明文并可正确解密', () => {
  const source = { entries: [{ title: '邮箱', password: 'S3cret!密码' }] };
  const encrypted = encryptVault(source, '可靠的主密码123');
  assert.equal(JSON.stringify(encrypted).includes('S3cret'), false);
  const result = decryptVault(encrypted, '可靠的主密码123');
  assert.deepEqual(result.value, source);
  result.key.fill(0);
});

test('错误主密码无法解密', () => {
  const encrypted = encryptVault({ entries: [] }, '正确的主密码123');
  assert.throws(() => decryptVault(encrypted, '错误的主密码123'), /主密码错误/);
});

test('篡改密文会被认证加密检测', () => {
  const encrypted = encryptVault({ entries: [{ password: 'abc' }] }, '正确的主密码123');
  encrypted.data = Buffer.from('tampered').toString('base64');
  assert.throws(() => decryptVault(encrypted, '正确的主密码123'), /损坏/);
});

test('拒绝未知文件格式', () => {
  assert.throws(() => validatePayload({ version: 99 }), /有效/);
});

test('修改主密码后仅新密码可以解密', () => {
  const source = { entries: [{ title: '邮箱', password: 'S3cret!' }] };
  const encrypted = encryptVault(source, '当前主密码123');
  const unlocked = decryptVault(encrypted, '当前主密码123');
  const change = preparePasswordChange(
    unlocked.value,
    '当前主密码123',
    '新的主密码456',
    unlocked.key,
    unlocked.salt
  );
  try {
    const changed = decryptVault(change.payload, '新的主密码456');
    try {
      assert.deepEqual(changed.value, source);
    } finally {
      changed.key.fill(0);
    }
    assert.throws(() => decryptVault(change.payload, '当前主密码123'), /错误/);
  } finally {
    unlocked.key.fill(0);
    change.key.fill(0);
  }
});

test('修改主密码时拒绝错误的当前密码', () => {
  const encrypted = encryptVault({ entries: [] }, '当前主密码123');
  const unlocked = decryptVault(encrypted, '当前主密码123');
  try {
    assert.throws(() => preparePasswordChange(
      unlocked.value,
      '错误的主密码123',
      '新的主密码456',
      unlocked.key,
      unlocked.salt
    ), /当前主密码错误/);
  } finally {
    unlocked.key.fill(0);
  }
});
