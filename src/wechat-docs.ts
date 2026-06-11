// Facade module: tries API first, falls back to Playwright

import { validateCookies as validateCookiesApi, submitRowViaApi } from './wechat-docs-api.js';
import {
  validateCookies as validateCookiesPW,
  fillFormWithPlaywright,
} from './wechat-docs-playwright.js';
import type { FormData } from './wechat-docs-playwright.js';

export type { FormData };

// Validate cookie validity (tries API first, then Playwright)
export async function validateCookies(cookieJson: string): Promise<boolean> {
  // Try lightweight API validation first
  const apiValid = await validateCookiesApi(cookieJson);
  if (apiValid) return true;

  // Fall back to Playwright-based validation
  return validateCookiesPW(cookieJson);
}

// Fill and submit the form
// Primary: Playwright (more reliable for complex UIs)
// Can switch to API-first by changing the order
export async function submitForm(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string; errorStep?: string; screenshot?: Buffer }> {
  // Use Playwright by default since API endpoints are unknown
  // After API discovery, try API first and fall back to Playwright
  const result = await fillFormWithPlaywright(cookieJson, data);
  return result;
}
