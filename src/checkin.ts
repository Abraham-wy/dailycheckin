// Core check-in orchestration

import type { CheckinConfig } from './types.js';
import { decryptCookies } from './crypto.js';
import { todayCST, tomorrowCST } from './date.js';
import { randomPushups, randomSleepTime } from './random.js';
import { withRetry } from './retry.js';
import { submitForm, type FormData } from './wechat-docs.js';
import {
  getSupabaseClient,
  getLatestPlan,
  getPlan,
  getCheckin,
  insertCheckin,
} from './supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function runCheckin(config: CheckinConfig): Promise<void> {
  const startTime = Date.now();
  const supabase = getSupabaseClient(config.supabaseUrl, config.supabaseServiceKey);
  const today = todayCST();
  const tomorrow = tomorrowCST();

  console.log(`[${new Date().toISOString()}] Starting check-in for ${today}`);

  // 1. Idempotency check
  const existing = await getCheckin(supabase, today);
  if (existing) {
    console.log(`Already checked in for ${today}, exiting.`);
    return;
  }

  // 2. Decrypt cookies
  let cookieJson: string;
  try {
    cookieJson = decryptCookies(config.encryptedCookies, config.aesKey);
  } catch (err) {
    console.error('Failed to decrypt cookies:', err);
    await insertCheckin(supabase, {
      checkin_date: today,
      pushups: null,
      sleep_time: null,
      task_completion: null,
      tomorrow_plan: null,
      status: 'failed',
      attempt_count: 1,
      error_message: 'Cookie decryption failed — AES key may be wrong',
      error_step: 'auth',
      duration_ms: Date.now() - startTime,
    });
    process.exit(1);
  }

  // 3. Get plans
  // Today's task completion = the plan that was written for today (i.e., yesterday's "明日计划")
  const todayPlan = await getPlan(supabase, today);
  const taskCompletion = todayPlan?.content || '';

  // Tomorrow's plan = plan explicitly set for tomorrow
  const tomorrowPlan = await getPlan(supabase, tomorrow);

  let tomorrowPlanContent: string;
  let planSource: 'manual' | 'carried_forward';

  if (tomorrowPlan && tomorrowPlan.content) {
    // User already filled in tomorrow's plan via WeChat
    tomorrowPlanContent = tomorrowPlan.content;
    planSource = 'manual';
  } else {
    // User forgot — carry forward from latest plan
    const latestPlan = await getLatestPlan(supabase, today);
    tomorrowPlanContent = latestPlan?.content || '';
    planSource = 'carried_forward';
    if (tomorrowPlanContent) {
      console.log(`No plan for ${tomorrow}, carrying forward from ${latestPlan?.plan_date}`);
    }
  }

  // 4. Generate auto values
  const pushups = randomPushups();
  const sleepTime = randomSleepTime();

  const formData: FormData = {
    pushups,
    sleepTime,
    taskCompletion: taskCompletion || '无昨日计划记录',
    tomorrowPlan: tomorrowPlanContent,
  };

  console.log('Form data:', {
    pushups,
    sleepTime,
    taskCompletion: taskCompletion || '(empty)',
    tomorrowPlan: tomorrowPlanContent || '(empty)',
    planSource,
  });

  // 5. Submit form (with retry)
  if (config.dryRun) {
    console.log('DRY_RUN mode — skipping actual submission');
    console.log('Would have submitted:', JSON.stringify(formData, null, 2));
    return;
  }

  let errorMessage: string | null = null;
  let errorStep: string | null = null;
  let attempts = 0;
  let success = false;

  try {
    const retryResult = await withRetry(
      () => submitForm(cookieJson, formData),
      {
        maxAttempts: 3,
        baseDelayMs: 5000,
        onRetry: (attempt, err) => {
          console.warn(`Attempt ${attempt} failed: ${err.message}, retrying...`);
        },
      }
    );

    attempts = retryResult.attempts;
    success = retryResult.result.success;

    if (!success) {
      errorMessage = retryResult.result.error || 'Unknown error';
      errorStep = retryResult.result.errorStep || 'submit';
    }
  } catch (err) {
    attempts = 3;
    success = false;
    errorMessage = err instanceof Error ? err.message : String(err);
    errorStep = 'submit';
  }

  // 6. Write result to database
  await insertCheckin(supabase, {
    checkin_date: today,
    pushups: success ? pushups : null,
    sleep_time: success ? sleepTime : null,
    task_completion: success ? formData.taskCompletion : null,
    tomorrow_plan: success ? formData.tomorrowPlan : null,
    status: success ? 'success' : 'failed',
    attempt_count: attempts,
    error_message: errorMessage,
    error_step: errorStep,
    duration_ms: Date.now() - startTime,
  });

  if (success) {
    // If the plan was carried forward, upsert it for tomorrow so it's tracked
    if (planSource === 'carried_forward' && tomorrowPlanContent) {
      await import('./supabase.js').then((m) =>
        m.upsertPlan(supabase, tomorrow, tomorrowPlanContent, 'carried_forward')
      );
    }
  }

  const duration = Date.now() - startTime;
  console.log(
    `Check-in ${success ? 'succeeded' : 'failed'} after ${attempts} attempt(s) in ${duration}ms`
  );

  if (!success) {
    process.exit(1);
  }
}
