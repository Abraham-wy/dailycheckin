// WeChat Docs smartsheet interaction via Playwright
// This is the primary approach when direct API is not available

import { chromium, BrowserContext } from 'playwright';
import type { WeChatDocCookies } from './types.js';

const FORM_URL =
  'https://doc.weixin.qq.com/smartsheet/s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0?scode=AJEAqAfZADcj4Z3dBeAW8AnwacAGY&tab=q979lj&viewId=vD00wZ';

export interface FormData {
  pushups: number;
  sleepTime: string;
  taskCompletion: string;
  tomorrowPlan: string;
}

// Parse cookie JSON string to Playwright cookie format
function parseCookies(cookieJson: string) {
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  return Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: '.qq.com',
    path: '/',
  }));
}

// Log in using saved cookies and validate session
export async function validateCookies(cookieJson: string): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(parseCookies(cookieJson));
    const page = await context.newPage();

    const response = await page.goto(FORM_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // If redirected to login, cookies are invalid
    const url = page.url();
    const valid = !url.includes('login') && !url.includes('passport') && response?.status() !== 401;

    await context.close();
    return valid;
  } finally {
    await browser.close();
  }
}

// Fill the smartsheet form with Playwright
export async function fillFormWithPlaywright(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string; errorStep?: string; screenshot?: Buffer }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(parseCookies(cookieJson));

  const page = await context.newPage();

  try {
    // Navigate to form
    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for the smartsheet to render
    await page.waitForTimeout(3000);

    // Strategy: Click on the first empty row and fill cells
    // WeChat Docs smartsheet uses a grid layout. We navigate by finding
    // the last row and filling each cell.

    // Click "add row" or the first empty cell to start editing
    // The exact selector depends on the smartsheet view type.
    // We try multiple strategies:

    const filled = await tryFillGrid(page, data);
    if (!filled) {
      return {
        success: false,
        error: 'Could not locate editable cells in the smartsheet',
        errorStep: 'fill',
      };
    }

    // Wait for save confirmation
    await page.waitForTimeout(2000);

    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);

    let screenshot: Buffer | undefined;
    try {
      screenshot = await page.screenshot({ fullPage: true });
    } catch {
      // Screenshot is best-effort
    }

    return {
      success: false,
      error,
      errorStep: 'fill',
      screenshot: screenshot as Buffer | undefined,
    };
  } finally {
    await browser.close();
  }
}

async function tryFillGrid(page: any, data: FormData): Promise<boolean> {
  // Strategy 1: Look for add-row button or last row
  const addRowSelectors = [
    '[class*="add-row"]',
    '[class*="addRow"]',
    'button:has-text("添加")',
    '[class*="new-record"]',
    '[role="button"]:has-text("添加")',
    '.smartsheet-add-row',
  ];

  for (const selector of addRowSelectors) {
    try {
      const btn = page.locator(selector).first();
      if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
        break;
      }
    } catch {
      // Try next selector
    }
  }

  // Strategy 2: Click on the last row's first cell to start editing
  // Try clicking near the bottom of the grid
  const gridSelectors = [
    '[class*="smartsheet"]',
    '[class*="grid"]',
    '[class*="table"]',
    '[role="grid"]',
  ];

  let gridFound = false;
  for (const selector of gridSelectors) {
    try {
      const grid = page.locator(selector).first();
      if (await grid.isVisible({ timeout: 2000 }).catch(() => false)) {
        gridFound = true;
        break;
      }
    } catch {
      // continue
    }
  }

  if (!gridFound) {
    // Last resort: try clicking on the page body at a position
    // where the last row might be
    await page.keyboard.press('Control+End');
    await page.waitForTimeout(500);
  }

  // Fill data using keyboard navigation
  // In smartsheet grid view, Tab moves between cells
  const values = [
    String(data.pushups),
    data.sleepTime,
    data.taskCompletion,
    data.tomorrowPlan,
  ];

  // Click to focus on the grid, then use keyboard to navigate and fill
  await page.click('body');
  await page.waitForTimeout(500);

  for (let i = 0; i < values.length; i++) {
    // Press Enter to start editing cell, type value, press Tab to next cell
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);

    // Select all existing text and replace
    await page.keyboard.press('Control+a');
    await page.keyboard.type(values[i], { delay: 20 });
    await page.waitForTimeout(300);

    if (i < values.length - 1) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(300);
    }
  }

  // Press Enter to confirm the row
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  return true;
}

// Discover API endpoints from network traffic (for manual inspection)
export async function captureApiEndpoints(cookieJson: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(parseCookies(cookieJson));
    const page = await context.newPage();

    const apiCalls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('smartsheet') || url.includes('api')) {
        apiCalls.push(`${request.method()} ${url}`);
      }
    });

    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    await context.close();
    return apiCalls;
  } finally {
    await browser.close();
  }
}
