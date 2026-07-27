'use strict';

const crypto = require('node:crypto');

const FORMAT_VERSION = 1;
const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function deriveKey(password, salt) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('主密码至少需要 8 个字符');
  }
  return crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
}

function encryptVault(data, password, existingSalt) {
  const salt = existingSalt || crypto.randomBytes(16);
  const key = deriveKey(password, salt);
  try {
    return encryptWithKey(data, key, salt);
  } finally {
    key.fill(0);
  }
}

function encryptWithKey(data, key, salt) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  plaintext.fill(0);
  return {
    format: 'LocalVault',
    version: FORMAT_VERSION,
    kdf: 'scrypt',
    cipher: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: ciphertext.toString('base64')
  };
}

function decryptVault(payload, password) {
  validatePayload(payload);
  const salt = Buffer.from(payload.salt, 'base64');
  const key = deriveKey(password, salt);
  try {
    return { value: decryptWithKey(payload, key), key, salt };
  } catch (error) {
    key.fill(0);
    throw new Error('主密码错误或保险库文件已损坏');
  }
}

function decryptWithKey(payload, key) {
  validatePayload(payload);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final()
  ]);
  try {
    return JSON.parse(plaintext.toString('utf8'));
  } finally {
    plaintext.fill(0);
  }
}

function validatePayload(payload) {
  if (!payload || payload.format !== 'LocalVault' || payload.version !== FORMAT_VERSION ||
      payload.kdf !== 'scrypt' || payload.cipher !== 'aes-256-gcm' ||
      !payload.salt || !payload.iv || !payload.tag || !payload.data) {
    throw new Error('不是有效的本地密码本文件');
  }
}

module.exports = {
  FORMAT_VERSION,
  deriveKey,
  encryptVault,
  encryptWithKey,
  decryptVault,
  decryptWithKey,
  validatePayload
};
