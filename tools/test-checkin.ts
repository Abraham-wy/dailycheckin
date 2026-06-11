#!/usr/bin/env node
// Dry-run validation: test config, connectivity, and cookie validity
// without actually submitting the form

import { loadConfig } from '../src/config.js';
import { decryptCookies } from '../src/crypto.js';
import { validateCookies } from '../src/wechat-docs.js';
import { getSupabaseClient, getPlan } from '../src/supabase.js';
import { todayCST, tomorrowCST, yesterdayCST } from '../src/date.js';
import { randomPushups, randomSleepTime } from '../src/random.js';

async function main() {
  console.log('=== Daily Check-in — Dry Run Test ===\n');

  // 1. Config check
  console.log('1. Checking configuration...');
  let config;
  try {
    config = loadConfig();
    console.log('   ✓ Config loaded');
    console.log(`   - SUPABASE_URL: ${config.supabaseUrl.replace(/\/.*/, '//***')}`);
    console.log(`   - DRY_RUN: ${config.dryRun}`);
    console.log(`   - ENCRYPTED_COOKIES: present (${config.encryptedCookies.length} chars)`);
    console.log(`   - AES_KEY: present (${config.aesKey.length} chars)`);
  } catch (err) {
    console.error(`   ✗ Config error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 2. Cookie decryption
  console.log('\n2. Decrypting cookies...');
  let cookieJson: string;
  try {
    cookieJson = decryptCookies(config.encryptedCookies, config.aesKey);
    const parsed = JSON.parse(cookieJson);
    console.log(`   ✓ Cookies decrypted (${Object.keys(parsed).length} cookies)`);
  } catch (err) {
    console.error(`   ✗ Decryption failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 3. Cookie validity
  console.log('\n3. Validating cookies against WeChat Docs...');
  try {
    const valid = await validateCookies(cookieJson);
    if (valid) {
      console.log('   ✓ Cookies are valid');
    } else {
      console.warn('   ⚠ Cookie validation failed — you may need to refresh cookies');
    }
  } catch (err) {
    console.warn(`   ⚠ Cookie check error: ${err instanceof Error ? err.message : err}`);
  }

  // 4. Supabase connectivity
  console.log('\n4. Checking Supabase connectivity...');
  try {
    const supabase = getSupabaseClient(config.supabaseUrl, config.supabaseServiceKey);
    const today = todayCST();
    const plan = await getPlan(supabase, today);
    console.log(`   ✓ Supabase connected`);
    console.log(`   - Today (${today}): ${plan ? `plan "${plan.content.slice(0, 30)}..."` : 'no plan'}`);
    console.log(`   - Yesterday: ${yesterdayCST()}`);
    console.log(`   - Tomorrow: ${tomorrowCST()}`);
  } catch (err) {
    console.error(`   ✗ Supabase error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 5. Random generators
  console.log('\n5. Random value generators...');
  console.log(`   - Push-ups: ${randomPushups()} (range: 0-30)`);
  console.log(`   - Sleep time: ${randomSleepTime()} (range: 23:00-23:59)`);

  // 6. Plan flow
  console.log('\n6. Plan flow preview...');
  try {
    const supabase = getSupabaseClient(config.supabaseUrl, config.supabaseServiceKey);
    const today = todayCST();
    const tomorrow = tomorrowCST();

    const todayPlan = await getPlan(supabase, today);
    const tomorrowPlan = await getPlan(supabase, tomorrow);

    console.log(`   今日任务完成情况 → 取自 plan_date=${today}: ${todayPlan?.content || '(空 — 将显示"无昨日计划记录")'}`);
    console.log(`   明日计划 → 取自 plan_date=${tomorrow}: ${tomorrowPlan?.content || '(空 — 将沿用上一条记录)'}`);
  } catch (err) {
    console.warn(`   ⚠ Plan flow check: ${err instanceof Error ? err.message : err}`);
  }

  console.log('\n=== Dry run complete ===');
  console.log('If all checks passed, the system is ready for real check-in.');
  console.log('Run with DRY_RUN=false to perform actual submission.');
}

main().catch((err) => {
  console.error('Dry run failed:', err);
  process.exit(1);
});
