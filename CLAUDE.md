# CLAUDE.md — Daily Check-in Clawbot

This project has a WeChat clawbot that interacts with users to collect "明日计划" and report check-in results.

## WeChat Bot Commands

When receiving a message from the user via clawbot, handle these commands:

### "明日计划 <content>" or "明天计划 <content>"
1. Extract `<content>` as the plan text
2. Determine the target date:
   - Before 23:00 CST → plan is for tomorrow
   - After 23:00 CST → plan is for the day after tomorrow
3. Use Supabase client (anon key from .env) to upsert into `daily_plans`:
   ```typescript
   import { getSupabaseClient, upsertPlan } from './src/supabase.js';
   const supabase = getSupabaseClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
   await upsertPlan(supabase, targetDate, content, 'manual');
   ```
4. Reply: "已保存 [targetDate] 的明日计划 ✓"

### "今日打卡结果" or "打卡结果" or "今日结果"
1. Query Supabase `checkin_logs` where `checkin_date = today` (CST)
2. If found and status='success': reply with summary:
   "今日打卡成功 ✓ | 俯卧撑: N | 睡觉: HH:MM | 今日任务: ... | 明日计划: ..."
3. If found and status='failed': reply with error details
4. If not found: reply "今日尚未打卡，将在 22:30-23:50 自动执行"

### "历史记录 [N]" or "历史 [N]"
1. Query last N checkin_logs (default 7)
2. Reply with compact summary table

### "帮助" or "help"
Reply with available commands:
- 明日计划 <内容> — 填写明日计划
- 今日打卡结果 — 查看今日打卡结果
- 历史记录 [N] — 查看最近 N 天记录

## Scheduled Tasks

Use CronCreate to set up:

### Daily 21:00 CST Reminder (suggest "7 21 * * *")
- Check Supabase `daily_plans` for tomorrow's date
- If plan exists with updated_at after midnight CST: reply "明日计划已填写 ✓，内容：..."
- If no plan or stale: send "【提醒】请在 23:00 前填写明日计划，直接回复 '明日计划 <内容>'"

### Daily 23:55 CST Result Poll (suggest "55 23 * * *")
- Query Supabase `checkin_logs` for today
- If status='success': send "今日打卡成功 ✓ | 俯卧撑: N | 睡觉: HH:MM"
- If status='failed': send "今日打卡失败 ✗ | 错误: ... | 请检查 Cookie 是否过期"
- If still 'pending' (no result within last 10 min): send "今日打卡尚未完成，请稍后查询"

## Environment
The clawbot requires these env vars in .env:
- SUPABASE_URL
- SUPABASE_ANON_KEY

These are gitignored and must be set locally.
