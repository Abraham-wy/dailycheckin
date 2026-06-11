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

    for (let i = 0; i < 4; i++) {
      await editors.nth(i).click();
      await page.waitForTimeout(300);
      await editors.nth(i).fill(values[i]);
      await page.waitForTimeout(300);
    }

    // Click submit button
    const submitBtn = page.locator('button:has-text("提交")').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    // Check for success
    const pageText = (await page.textContent('body')) || '';
    const submitted = pageText.includes('提交成功') || pageText.includes('成功');

    if (!submitted) {
      // Check if form is still there (error case)
      const stillVisible = await page.locator('.text-editor[contenteditable="true"]').first().isVisible().catch(() => false);
      if (stillVisible) {
        return {
          success: false,
          error: 'Form submission may have failed — form still visible after submit',
          errorStep: 'submit',
        };
      }
    }

    return { success: true };
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
