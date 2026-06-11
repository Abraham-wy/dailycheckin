#!/usr/bin/env node
// CLI tool: encrypt WeChat Docs cookies for GitHub Secrets
// Usage: cat cookies.json | npx tsx tools/encrypt-cookie.ts
// Or: echo '{"key":"value"}' | npx tsx tools/encrypt-cookie.ts
//
// Also generates a random AES key if none exists in .env

import { encryptCookies, generateKey } from '../src/crypto.js';
import { config } from 'dotenv';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';

config();

async function main() {
  // Check for AES_KEY in env, generate if missing
  let aesKey = process.env.AES_KEY;
  if (!aesKey) {
    aesKey = generateKey();
    console.log(`Generated new AES_KEY: ${aesKey}`);
    console.log('Add this to your .env file and GitHub Secrets.\n');
  }

  if (aesKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(aesKey)) {
    console.error('AES_KEY must be 64 hex characters (32 bytes)');
    process.exit(1);
  }

  // Read cookie JSON from stdin or from file argument
  let input = '';
  const filePath = process.argv[2];

  if (filePath) {
    input = readFileSync(filePath, 'utf-8');
  } else {
    const rl = createInterface({ input: process.stdin });
    for await (const line of rl) {
      input += line;
    }
  }

  // Validate JSON
  try {
    JSON.parse(input.trim());
  } catch {
    console.error('Error: Input is not valid JSON');
    process.exit(1);
  }

  const encrypted = encryptCookies(input.trim(), aesKey);
  console.log(`\nEncrypted cookies (base64):`);
  console.log(encrypted);
  console.log(`\nSet this as ENCRYPTED_COOKIES in GitHub Secrets.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
