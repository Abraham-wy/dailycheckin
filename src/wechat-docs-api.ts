// Direct API client for WeChat Docs smartsheet form submission
// Uses the submitformview REST API — much more reliable than Playwright DOM interaction

import type { WeChatDocCookies } from './types.js';
import { todayCST } from './date.js';

interface FormData {
  pushups: number;
  sleepTime: string;
  taskCompletion: string;
  tomorrowPlan: string;
}

const SUBMIT_URL = 'https://doc.weixin.qq.com/smartsheetservice/submitformview';
const FORM_URL =
  'https://doc.weixin.qq.com/smartsheet/s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0?scode=AJEAqAfZADcj4Z3dBeAW8AnwacAGY&tab=q979lj&viewId=vD00wZ';

// Static form metadata
const DOC_ID = 's3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0';
const SUB_ID = 'q979lj';
const VIEW_ID = 'vD00wZ';

// Field IDs (from form inspection)
const FIELD_PUSHUP = 'fzSueb';
const FIELD_SLEEP = 'fDpQ7o';
const FIELD_TASK = 'fp1TPo';
const FIELD_PLAN = 'fz3vww';

function toCookieHeader(cookieJson: string): string {
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

function getCookie(cookieJson: string, name: string): string {
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  return cookies[name] || '';
}

// Build cell JSON in the format expected by the API
function buildCellStr(text: string): string {
  return JSON.stringify([
    {
      text,
      type: 'text',
      format: { bold: false, italic: false, underline: false, strikeThrough: false },
    },
  ]);
}

function buildDateTimeCellStr(dateStr: string): string {
  // dateStr is "2026-07-13 23:26" format (yyyy-mm-dd hh:mm), convert to timestamp
  const d = new Date(dateStr.replace(' ', 'T') + ':00');
  return String(d.getTime());
}

// Submit the form via direct API call
export async function submitFormViaApi(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const sid = getCookie(cookieJson, 'wedoc_sid');
    const xsrf = getCookie(cookieJson, 'TOK'); // xsrf = TOK cookie value

    if (!sid || !xsrf) {
      return { success: false, error: 'Missing required cookies: wedoc_sid or TOK' };
    }

    const url = `${SUBMIT_URL}?sid=${encodeURIComponent(sid)}&wedoc_xsrf=1&xsrf=${encodeURIComponent(xsrf)}`;

    const today = todayCST();
    const sleepDateTime = `${today} ${data.sleepTime}`;

    const body = JSON.stringify({
      answer: {
        record: [
          { fieldId: FIELD_PUSHUP, cellStr: buildCellStr(String(data.pushups)), fieldType: 1 },
          { fieldId: FIELD_SLEEP, cellStr: buildDateTimeCellStr(sleepDateTime), fieldType: 4 },
          { fieldId: FIELD_TASK, cellStr: buildCellStr(data.taskCompletion), fieldType: 1 },
          { fieldId: FIELD_PLAN, cellStr: buildCellStr(data.tomorrowPlan), fieldType: 1 },
        ],
      },
      sub_id: SUB_ID,
      view_id: VIEW_ID,
      doc_id: DOC_ID,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: toCookieHeader(cookieJson),
        Referer: FORM_URL,
        Accept: 'application/json, text/plain, */*',
      },
      body,
    });

    if (resp.ok) {
      const result = await resp.json().catch(() => ({}));
      console.log('API submit response:', JSON.stringify(result).slice(0, 200));
      if (result?.head?.ret !== 0) {
        return { success: false, error: `API error ret=${result?.head?.ret}: ${result?.head?.msg || 'unknown'}` };
      }
      return { success: true };
    }

    const text = await resp.text();
    return { success: false, error: `API returned ${resp.status}: ${text.slice(0, 200)}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Validate cookies by fetching the form page
export async function validateCookies(cookieJson: string): Promise<boolean> {
  try {
    const resp = await fetch(FORM_URL, {
      method: 'GET',
      headers: {
        Cookie: toCookieHeader(cookieJson),
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      redirect: 'manual',
    });
    return resp.status === 200 && !resp.headers.get('location')?.includes('login');
  } catch {
    return false;
  }
}
