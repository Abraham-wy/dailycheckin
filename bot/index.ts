#!/usr/bin/env node
// Daily Check-in Bot — 24/7 WeChat Bot for Railway
// Long-polls iLink API for messages, cron via setInterval, Supabase backend

import { randomBytes } from 'node:crypto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { format, addDays, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import WebSocket from 'ws';
import express from 'express';

// ================================================================
// iLink API
// ================================================================

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const LONG_POLL_MS = 35_000;
const MAX_MSG_LEN = 800; // iLink message text limit

function buildBaseInfo() { return { channel_version: '0.1.0' }; }

function randomWechatUin(): string {
  const num = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(num), 'utf-8').toString('base64');
}

async function apiFetch(p: {
  endpoint: string; body?: string; token?: string;
  timeoutMs: number; label: string; method?: string; baseUrl?: string;
}): Promise<string> {
  const { endpoint, body, token, timeoutMs, label, method = 'POST' } = p;
  let base = p.baseUrl ?? DEFAULT_BASE_URL;
  if (!base.endsWith('/')) base += '/';
  const isGet = method === 'GET';
  const headers: Record<string, string> = isGet ? {
    AuthorizationType: 'ilink_bot_token', 'X-WECHAT-UIN': randomWechatUin(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  } : {
    'Content-Type': 'application/json', AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}),
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${base}${endpoint}`, { method, headers, ...(isGet ? {} : { body }), signal: ctrl.signal });
    const text = await r.text();
    if (!r.ok) throw new Error(`[${label}] HTTP ${r.status}: ${text}`);
    return text;
  } finally { clearTimeout(t); }
}

async function getUpdates(token: string, buf: string, baseUrl: string) {
  const body = JSON.stringify({ get_updates_buf: buf, base_info: buildBaseInfo() });
  try {
    const text = await apiFetch({ baseUrl, endpoint: 'ilink/bot/getupdates', body, token, timeoutMs: LONG_POLL_MS, label: 'getUpdates' });
    return JSON.parse(text);
  } catch { return { ret: 0, msgs: [], get_updates_buf: buf }; }
}

async function sendMessage(token: string, to: string, text: string, contextToken: string, baseUrl: string) {
  // Truncate if too long
  if (text.length > MAX_MSG_LEN) {
    text = text.slice(0, MAX_MSG_LEN - 20) + '…\n(内容过长已截断)';
  }

  const clientId = `dbot-${randomBytes(4).toString('hex')}`;
  const msg: any = {
    from_user_id: '', to_user_id: to, client_id: clientId,
    message_type: 2, message_state: 2,
    item_list: [{ type: 1, text_item: { text } }],
    context_token: contextToken,
  };
  const body = JSON.stringify({ msg, base_info: buildBaseInfo() });
  await apiFetch({ baseUrl, endpoint: 'ilink/bot/sendmessage', body, token, timeoutMs: 10_000, label: 'sendMessage' });
  return clientId;
}

// ================================================================
// Supabase
// ================================================================

if (typeof globalThis.WebSocket === 'undefined') (globalThis as any).WebSocket = WebSocket;

function getSupabase(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const TZ = 'Asia/Shanghai';
const todayCST = () => format(toZonedTime(new Date(), TZ), 'yyyy-MM-dd');
const tomorrowCST = () => format(addDays(toZonedTime(new Date(), TZ), 1), 'yyyy-MM-dd');
const yesterdayCST = () => format(subDays(toZonedTime(new Date(), TZ), 1), 'yyyy-MM-dd');
const timeCST = () => format(toZonedTime(new Date(), TZ), 'HH:mm');

// ================================================================
// Active user cache — used by cron to push directly
// ================================================================

let activeUser: { userId: string; contextToken: string } | null = null;

function updateActiveUser(userId: string, contextToken: string) {
  activeUser = { userId, contextToken };
  console.log(`[USER] Active user cached: ${userId}`);
}

// ================================================================
// Message handler
// ================================================================

async function handleMessage(sb: SupabaseClient, token: string, baseUrl: string, msg: any) {
  const userId = msg.from_user_id;
  const contextToken = msg.context_token;
  let text = '';
  if (msg.item_list) for (const item of msg.item_list) if (item.text_item?.text) text += item.text_item.text;
  if (!text.trim()) return;

  const cmd = text.trim();
  console.log(`[MSG] ${userId}: ${cmd.slice(0, 120)}`);

  // Cache active user context for cron push
  updateActiveUser(userId, contextToken);

  // Track user in DB
  await sb.from('bot_users').upsert({ user_id: userId, last_seen: new Date().toISOString() });

  // Deliver pending notifications
  await deliverPending(sb, token, baseUrl, userId, contextToken);

  // ---- "明日计划 <content>" ----
  const planMatch = cmd.match(/^(?:明日计划|明天计划|明日任务)[\s\n]+(.+)$/s);
  if (planMatch) {
    const content = planMatch[1].trim();
    await sb.from('daily_plans').upsert({
      plan_date: tomorrowCST(), content, source: 'manual',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'plan_date' });
    await sendMessage(token, userId, `已保存 ${tomorrowCST()} 明日计划 ✓\n${content}`, contextToken, baseUrl);
    return;
  }

  // ---- "明日计划" (no content) ----
  if (/^(?:明日计划|明天计划)$/.test(cmd)) {
    await sendMessage(token, userId, '请提供计划内容，例如：\n明日计划 完成项目A、修复Bug B', contextToken, baseUrl);
    return;
  }

  // ---- "今日打卡结果" / "打卡结果" ----
  if (/^(?:今日)?打卡结果|今日结果/.test(cmd)) {
    const { data: logs } = await sb.from('checkin_logs').select('*').eq('checkin_date', todayCST()).order('created_at', { ascending: false }).limit(1);
    const log = logs?.[0] || null;
    if (!log) {
      await sendMessage(token, userId, '今日尚未打卡，将在 22:30-23:50 自动执行', contextToken, baseUrl);
    } else if (log.status === 'success') {
      await sendMessage(token, userId, `今日打卡成功 ✓\n俯卧撑: ${log.pushups}\n睡觉: ${log.sleep_time}\n今日任务: ${log.task_completion || '无'}\n明日计划: ${log.tomorrow_plan || '无'}`, contextToken, baseUrl);
    } else {
      await sendMessage(token, userId, `今日打卡失败 ✗\n错误: ${log.error_message}\n步骤: ${log.error_step}`, contextToken, baseUrl);
    }
    return;
  }

  // ---- "历史记录 [N]" ----
  const histMatch = cmd.match(/^(?:历史记录|历史)\s*(\d+)?$/);
  if (histMatch) {
    const n = Math.min(parseInt(histMatch[1] || '7'), 15);
    const { data: logs, error: histErr } = await sb.from('checkin_logs').select('*').order('created_at', { ascending: false }).limit(n * 5);
    console.log('[HIST] Query result:', { count: logs?.length, error: histErr?.message, first: logs?.[0]?.checkin_date });
    if (histErr) {
      await sendMessage(token, userId, `查询出错: ${histErr.message}`, contextToken, baseUrl);
    } else if (!logs || logs.length === 0) {
      await sendMessage(token, userId, '暂无打卡记录', contextToken, baseUrl);
    } else {
      // Deduplicate by checkin_date (take latest status per date)
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const l of logs) {
        if (!seen.has(l.checkin_date)) {
          seen.add(l.checkin_date);
          unique.push(l);
        }
      }
      const lines = unique.map((l: any) =>
        `${l.checkin_date} ${l.status === 'success' ? '✓' : '✗'} | 俯卧撑:${l.pushups ?? '-'} | 睡觉:${l.sleep_time ?? '-'}`);
      const msg = `最近 ${unique.length} 天：\n${lines.join('\n')}`;
      console.log('[HIST] Sending message, length:', msg.length);
      await sendMessage(token, userId, msg, contextToken, baseUrl);
    }
    return;
  }

  // ---- "立即打卡" ----
  if (/^立即打卡/.test(cmd)) {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      await sendMessage(token, userId, '未配置 GITHUB_TOKEN，无法触发打卡', contextToken, baseUrl);
      return;
    }

    try {
      const today = todayCST();
      await sendMessage(token, userId, '正在触发打卡…', contextToken, baseUrl);

      const { data: prevRows } = await sb.from('checkin_logs').select('id')
        .eq('checkin_date', today).order('created_at', { ascending: false }).limit(1);
      const prevId = prevRows?.[0]?.id || '';

      const resp = await fetch(
        'https://api.github.com/repos/Abraham-wy/dailycheckin/actions/workflows/daily-checkin.yml/dispatches',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ghToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main', inputs: { dry_run: false } }),
        }
      );

      if (resp.status === 204) {
        let result: any = null;
        for (let i = 0; i < 9; i++) {
          await new Promise(r => setTimeout(r, 10000));
          const { data: pollRows } = await sb.from('checkin_logs').select('*')
            .eq('checkin_date', today).order('created_at', { ascending: false }).limit(1);
          const log = pollRows?.[0] || null;
          if (log && log.id !== prevId && log.status !== 'pending') { result = log; break; }
        }
        if (result) {
          if (result.status === 'success') {
            await sendMessage(token, userId, `即时打卡成功 ✓\n俯卧撑: ${result.pushups}\n睡觉: ${result.sleep_time}\n今日任务: ${result.task_completion || '无'}\n明日计划: ${result.tomorrow_plan || '无'}`, contextToken, baseUrl);
          } else {
            await sendMessage(token, userId, `即时打卡失败 ✗\n错误: ${result.error_message}\n步骤: ${result.error_step}`, contextToken, baseUrl);
          }
        } else {
          await sendMessage(token, userId, '打卡超时，请稍后发送"今日打卡结果"查询', contextToken, baseUrl);
        }
      } else {
        const text = await resp.text();
        await sendMessage(token, userId, `触发失败: HTTP ${resp.status}`, contextToken, baseUrl);
        console.error('[INSTANT] Trigger failed:', text);
      }
    } catch (err) {
      console.error('[INSTANT] Error:', err);
      await sendMessage(token, userId, '触发打卡时出错，请稍后重试', contextToken, baseUrl);
    }
    return;
  }

  // ---- "帮助" ----
  if (/^(?:帮助|help)$/i.test(cmd)) {
    await sendMessage(token, userId, '可用命令：\n• 明日计划 <内容>\n• 立即打卡\n• 今日打卡结果\n• 历史记录 [N]\n• 帮助', contextToken, baseUrl);
    return;
  }

  // Unknown
  await sendMessage(token, userId, '未识别的命令。回复 "帮助" 查看可用命令。', contextToken, baseUrl);
}

async function deliverPending(sb: SupabaseClient, token: string, baseUrl: string, userId: string, contextToken: string) {
  const { data: pending } = await sb.from('pending_notifications').select('*').eq('user_id', userId).eq('delivered', false).order('created_at', { ascending: true });
  if (!pending || pending.length === 0) return;
  for (const n of pending) {
    try {
      await sendMessage(token, userId, n.content, contextToken, baseUrl);
      await sb.from('pending_notifications').update({ delivered: true }).eq('id', n.id);
    } catch (err) {
      console.error(`[PENDING] Failed to deliver ${n.id}:`, err);
    }
  }
}

// ================================================================
// Direct push helper — uses cached active user for cron delivery
// ================================================================

async function pushToActiveUser(token: string, baseUrl: string, sb: SupabaseClient, content: string) {
  if (activeUser?.userId && activeUser?.contextToken) {
    try {
      await sendMessage(token, activeUser.userId, content, activeUser.contextToken, baseUrl);
      console.log(`[PUSH] Sent to ${activeUser.userId}: ${content.slice(0, 50)}`);
      return true;
    } catch (err) {
      console.error('[PUSH] Direct send failed:', err);
    }
  }

  // Fallback: queue as pending notification
  const { data: users } = await sb.from('bot_users').select('user_id');
  if (users) {
    for (const u of users) {
      await sb.from('pending_notifications').insert({ user_id: u.user_id, content });
    }
    console.log(`[PUSH] Queued for ${users.length} users (no active contextToken)`);
  }
  return false;
}

// ================================================================
// Cron tasks
// ================================================================

async function triggerCheckinViaGitHub(ghToken: string) {
  try {
    const resp = await fetch(
      'https://api.github.com/repos/Abraham-wy/dailycheckin/actions/workflows/daily-checkin.yml/dispatches',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: 'main', inputs: { dry_run: false } }),
      }
    );
    console.log('[CRON] GitHub trigger status:', resp.status);
    return resp.status === 204;
  } catch (err) {
    console.error('[CRON] GitHub trigger error:', err);
    return false;
  }
}

async function runCron(sb: SupabaseClient, token: string, baseUrl: string) {
  const now = timeCST();
  const today = todayCST();
  const tomorrow = tomorrowCST();

  // 21:00-21:10 CST: Check tomorrow's plan, push reminder
  if (now >= '21:00' && now <= '21:10') {
    const { data: remRows } = await sb.from('reminder_logs').select('*').eq('reminder_date', today).limit(1);
    if (!remRows || remRows.length === 0) {
      const { data: planRows } = await sb.from('daily_plans').select('*').eq('plan_date', tomorrow).limit(1);
      const plan = planRows?.[0] || null;
      const planSet = !!(plan && plan.content);
      await sb.from('reminder_logs').upsert({ reminder_date: today, plan_was_set: planSet, sent_at: new Date().toISOString() });
      if (!planSet) {
        await pushToActiveUser(token, baseUrl, sb, '【每日打卡提醒】请在 23:00 前填写明日计划。直接回复 "明日计划 <内容>"');
      }
      console.log(`[CRON] 21:00 reminder: plan_set=${planSet}, pushed=${!planSet}`);
    }
  }

  // 22:43-22:50 CST: Trigger check-in via GitHub API (Bot as primary scheduler)
  if (now >= '22:43' && now <= '22:50') {
    const { data: triggerRows } = await sb.from('reminder_logs').select('*').eq('reminder_date', `${today}-bot-trigger`).limit(1);
    if (!triggerRows || triggerRows.length === 0) {
      const ghToken = process.env.GITHUB_TOKEN;
      if (ghToken) {
        const ok = await triggerCheckinViaGitHub(ghToken);
        await sb.from('reminder_logs').upsert({
          reminder_date: `${today}-bot-trigger`,
          plan_was_set: ok,
          sent_at: new Date().toISOString(),
        });
        console.log(`[CRON] 22:43 bot-trigger: ${ok ? 'OK' : 'FAILED'}`);
      }
    }
  }

  // 23:55-23:59 CST: Check result, push to active user directly
  if (now >= '23:55' && now <= '23:59') {
    const { data: notifRows } = await sb.from('pending_notifications').select('*').like('content', '%今日打卡%').eq('delivered', false).gte('created_at', today).limit(1);
    if (!notifRows || notifRows.length === 0) {
      const { data: checkRows } = await sb.from('checkin_logs').select('*').eq('checkin_date', today).order('created_at', { ascending: false }).limit(1);
      const log = checkRows?.[0] || null;
      if (log) {
        if (log.status === 'success') {
          await pushToActiveUser(token, baseUrl, sb, `今日打卡成功 ✓ | 俯卧撑:${log.pushups} | 睡觉:${log.sleep_time} | 今日任务:${log.task_completion || '无'} | 明日计划:${log.tomorrow_plan || '无'}`);
        } else {
          await pushToActiveUser(token, baseUrl, sb, `今日打卡失败 ✗ | ${log.error_message} | 回复"刷新Cookie"获取帮助`);
        }
      }
      console.log(`[CRON] 23:55 result: ${log?.status || 'no result'}`);
    }
  }
}

// ================================================================
// Main
// ================================================================

async function main() {
  console.log('[DEBUG] Env keys:', Object.keys(process.env).filter(k =>
    k.includes('BOT') || k.includes('SUPABASE') || k.includes('RAILWAY')
  ).join(', '));
  console.log('[DEBUG] BOT_TOKEN present:', !!process.env.BOT_TOKEN);
  console.log('[DEBUG] SUPABASE_URL present:', !!process.env.SUPABASE_URL);
  console.log('[DEBUG] SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);

  const token = process.env.BOT_TOKEN;
  const baseUrl = process.env.BOT_BASE_URL || DEFAULT_BASE_URL;
  if (!token) { console.error('Missing BOT_TOKEN'); process.exit(1); }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) { console.error('Missing SUPABASE env vars'); process.exit(1); }

  console.log('[BOOT] Daily Check-in Bot starting');
  console.log(`[BOOT] Base URL: ${baseUrl}`);

  const sb = getSupabase();

  const { data: testLogs, error: testErr } = await sb.from('checkin_logs').select('id').limit(1);
  console.log('[BOOT] DB check:', { found: testLogs?.length, error: testErr?.message || 'none' });

  const app = express();
  const PORT = parseInt(process.env.PORT || '8080');
  app.get('/', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.listen(PORT, () => console.log(`[HTTP] :${PORT}`));

  // Cron every 5 minutes
  setInterval(() => runCron(sb, token, baseUrl).catch(e => console.error('[CRON]', e)), 5 * 60_000);

  // Message poll loop
  let buf = '';
  while (true) {
    try {
      const updates = await getUpdates(token, buf, baseUrl);
      if (updates.get_updates_buf) buf = updates.get_updates_buf;
      if (updates.msgs) {
        for (const msg of updates.msgs) {
          try { await handleMessage(sb, token, baseUrl, msg); } catch (e) { console.error('[MSG]', e); }
        }
      }
    } catch (e) {
      console.error('[POLL]', e);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
