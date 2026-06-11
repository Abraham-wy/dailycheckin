// Direct API client for WeChat Docs smartsheet
// This module is a stub — fill in after network traffic inspection

import type { WeChatDocCookies } from './types.js';

const BASE_URL = 'https://doc.weixin.qq.com';

export interface FormData {
  pushups: number;
  sleepTime: string;
  taskCompletion: string;
  tomorrowPlan: string;
}

// Parse cookie JSON to Cookie header string
function toCookieHeader(cookieJson: string): string {
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// Make an authenticated API request
async function apiRequest(
  cookieJson: string,
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  const headers: Record<string, string> = {
    Cookie: toCookieHeader(cookieJson),
    'Content-Type': 'application/json',
  };

  // Extract xsrf token from cookies if present
  const cookies: WeChatDocCookies = JSON.parse(cookieJson);
  const xsrf = cookies['xsrf'] || cookies['XSRF-TOKEN'];
  if (xsrf) {
    headers['X-XSRF-TOKEN'] = xsrf;
  }

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Validate that cookies are still valid
export async function validateCookies(cookieJson: string): Promise<boolean> {
  try {
    const res = await apiRequest(
      cookieJson,
      '/smartsheet/api/v1/metadata', // Example endpoint — update after discovery
      'GET'
    );
    return res.status === 200;
  } catch {
    return false;
  }
}

// Submit a row to the smartsheet via API
// TODO: Fill in the actual endpoint and body format after API discovery
export async function submitRowViaApi(
  cookieJson: string,
  data: FormData
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await apiRequest(
      cookieJson,
      '/smartsheet/api/v1/rows', // Example — update after discovery
      'POST',
      {
        // Example body — update after discovery
        sheet_id: 's3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0',
        fields: {
          pushups: data.pushups,
          sleep_time: data.sleepTime,
          task_completion: data.taskCompletion,
          tomorrow_plan: data.tomorrowPlan,
        },
      }
    );

    if (res.ok) {
      return { success: true };
    }

    const text = await res.text();
    return { success: false, error: `API returned ${res.status}: ${text}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
