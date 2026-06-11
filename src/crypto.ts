import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

function getKey(aesKey: string): Buffer {
  return Buffer.from(aesKey, 'hex');
}

// Encrypt plaintext cookies JSON string → base64 ciphertext
export function encryptCookies(plaintext: string, aesKey: string): string {
  const key = getKey(aesKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // iv + ciphertext + authTag
  const result = Buffer.concat([iv, encrypted, authTag]);
  return result.toString('base64');
}

// Decrypt base64 ciphertext → cookies JSON string
export function decryptCookies(encrypted: string, aesKey: string): string {
  const key = getKey(aesKey);
  const data = Buffer.from(encrypted, 'base64');

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(data.length - AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH, data.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// Generate a random AES-256 key (64 hex chars)
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
