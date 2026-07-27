'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptVault, decryptVault, validatePayload } = require('../src/vault-crypto');

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
