// Facade module: tries direct API first, falls back to Playwright

import { validateCookies as validateCookiesApi, submitFormViaApi } from './wechat-docs-api.js';
import {
  validateCookies as validateCookiesPW,
  fillFormWithPlaywright,
} from './wechat-docs-playwright.js';
import type { FormData } from './wechat-docs-playwright.js';

export type { FormData };

// Validate cookie validity
export async function validateCookies(cookieJson: string): Promise<boolean> {
  const apiValid = await validateCookiesApi(cookieJson);
  if (apiValid) return true;
  return validateCookiesPW(cookieJson);
}

// Submit form: API-first, Playwright fallback
export async function submitForm(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string; errorStep?: string; screenshot?: Buffer }> {
  // Primary: direct HTTP API call (fast, reliable, no browser needed)
  const apiResult = await submitFormViaApi(cookieJson, data);
  if (apiResult.success) return { success: true };

  // Fallback: Playwright browser-based submission
  console.log('API submit failed, falling back to Playwright:', apiResult.error);
  return fillFormWithPlaywright(cookieJson, data);
}
