// WeChat Docs smartsheet form filling via Playwright
// Uses the form view with contenteditable fields

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

function parseCookies(cookieJson: string) {
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  return Object.entries(cookies).map(([name, value]) => ({
    name,
    value,
    domain: '.qq.com',
    path: '/',
  }));
}

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
    const url = page.url();
    const valid = !url.includes('login') && !url.includes('passport') && response?.status() !== 401;
    await context.close();
    return valid;
  } finally {
    await browser.close();
  }
}

export async function fillFormWithPlaywright(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string; errorStep?: string; screenshot?: Buffer }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(parseCookies(cookieJson));

  const page = await context.newPage();

  try {
    // Navigate to form view
    await page.goto(FORM_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    // Wait for the contenteditable fields to appear
    await page.waitForSelector('.text-editor[contenteditable="true"]', { timeout: 10000 });

    const editors = page.locator('.text-editor[contenteditable="true"]');
    const fieldCount = await editors.count();

    if (fieldCount < 4) {
      return {
        success: false,
        error: `Expected 4 form fields, found ${fieldCount}`,
        errorStep: 'fill',
      };
    }

    // Fill the 4 fields in order: 俯卧撑, 开始睡觉时间, 今日任务完成情况, 明日计划
    const values = [
      String(data.pushups),
      data.sleepTime,
      data.taskCompletion,
      data.tomorrowPlan,
    ];

    // Fill: triple-click to select all existing text, then type the new value
    for (let i = 0; i < 4; i++) {
      const el = editors.nth(i);
      await el.click({ clickCount: 3 });
      await page.waitForTimeout(200);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(100);
      await page.keyboard.type(values[i], { delay: 15 });
      await page.waitForTimeout(400);
    }

    // Click submit and wait for the submitformview API response
    const submitBtn = page.locator('button:has-text("提交")').first();

    // Start waiting for submit API response before clicking
    const submitPromise = page.waitForResponse(
      r => r.url().includes('submitformview') && r.status() === 200,
      { timeout: 10000 }
    ).then(r => true).catch(() => false);

    await submitBtn.click();
    const submitSucceeded = await submitPromise;

    if (submitSucceeded) {
      return { success: true };
    }

    // Fallback: check page content for success indicators
    await page.waitForTimeout(3000);
    const pageText = (await page.textContent('body')) || '';
    if (pageText.includes('已提交') || pageText.includes('提交成功')) {
      return { success: true };
    }

    return {
      success: false,
      error: 'Submit failed: API not detected and page does not show success',
      errorStep: 'submit',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    let screenshot: Buffer | undefined;
    try {
      screenshot = await page.screenshot({ fullPage: true });
    } catch { /* best-effort */ }
    return { success: false, error, errorStep: 'fill', screenshot: screenshot as Buffer | undefined };
  } finally {
    await browser.close();
  }
}

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
