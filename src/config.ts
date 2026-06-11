import { config } from 'dotenv';
import type { CheckinConfig } from './types.js';

export function loadConfig(): CheckinConfig {
  config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
  const encryptedCookies = process.env.ENCRYPTED_COOKIES;
  const aesKey = process.env.AES_KEY;
  const dryRun = process.env.DRY_RUN === 'true';

  if (!supabaseUrl) throw new Error('Missing SUPABASE_URL');
  if (!supabaseServiceKey) throw new Error('Missing SUPABASE_SERVICE_KEY');
  if (!encryptedCookies) throw new Error('Missing ENCRYPTED_COOKIES');
  if (!aesKey) throw new Error('Missing AES_KEY');

  if (!/^[0-9a-fA-F]{64}$/.test(aesKey)) {
    throw new Error('AES_KEY must be 64 hex characters (32 bytes)');
  }

  return { supabaseUrl, supabaseServiceKey, encryptedCookies, aesKey, dryRun };
}
