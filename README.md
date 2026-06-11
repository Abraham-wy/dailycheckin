# Daily Check-in Automation / 每日打卡自动化

Automated daily check-in for WeChat Docs smart sheet. Random push-ups count, random sleep time, auto-fill from yesterday's plan. WeChat bot interaction via iLink API, cloud deployment on Railway.

腾讯文档智能表格每日自动打卡。俯卧撑随机数、睡觉时间随机、任务从昨日计划自动流转。微信 Bot 通过 iLink API 交互，Railway 云端部署，关机也能用。

---

## Architecture / 架构

```
                  ┌──────────────────────────┐
                  │     Supabase (PostgreSQL) │
                  │     daily_plans           │
                  │     checkin_logs          │
                  │     reminder_logs         │
                  │     bot_users             │
                  │     pending_notifications │
                  └──────┬────────┬──────────┘
                         │        │
        ┌────────────────┘        └────────────────┐
        ▼                                          ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│  GitHub Actions           │          │  Railway Cloud Bot        │
│  22:30-23:50 CST daily    │          │  24/7 WeChat Bot          │
│                           │          │                           │
│  - Decrypt cookies        │          │  - Long-poll iLink API    │
│  - Generate random values  │          │  - Handle "明日计划"       │
│  - Fill WX Docs form      │          │  - 21:00 CST reminder     │
│  - Write result to DB     │          │  - 23:55 CST result push  │
└──────────────────────────┘          └───────────┬──────────────┘
                                                  │
                                                  ▼
                                            ┌──────────┐
                                            │  WeChat   │
                                            │  微信用户  │
                                            └──────────┘
```

## Data Flow / 数据流

```
21:00 CST  ──▶  Bot checks if tomorrow's plan exists
               ├─ No plan  → Push reminder: "请在23:00前填写明日计划"
               └─ Has plan → Confirm: "明日计划已填写 ✓"

User sends  ──▶  Bot writes to daily_plans (plan_date = tomorrow)
"明日计划 xxx"

22:43 CST ──▶  GitHub Actions triggers (random time in 22:30-23:50)
               ├─ Push-ups: random(0-30)
               ├─ Sleep time: random(23:00-23:59)
               ├─ Today's tasks ← plan from daily_plans(plan_date=today)
               ├─ Tomorrow's plan ← plan from daily_plans(plan_date=tomorrow)
               │    └─ If empty → carry forward from latest plan
               └─ Submit to WeChat Docs form

23:55 CST ──▶  Bot checks checkin_logs for today
               ├─ success → Push: "今日打卡成功 ✓ | ..."
               └─ failed  → Push: "今日打卡失败 ✗ | ..."
```

### Plan carry-forward rule / 计划流转规则

```
Day 1: 用户填写 "明日计划" = "完成A、B"
Day 2: 今日任务 = "完成A、B" (来自Day1的明日计划)
        用户填写 "明日计划" = "完成C、D"
Day 3: 今日任务 = "完成C、D" (来自Day2的明日计划)
        用户忘记填写 → 明日计划沿用 "完成C、D"
Day 4: 今日任务 = "完成C、D" (沿用)
        明日计划 = "完成C、D" (继续沿用)
```

---

## WeChat Commands / 微信命令

| Command / 命令 | Description / 说明 | Example / 示例 |
|----------------|-------------------|----------------|
| `明日计划 <内容>` | Save tomorrow's plan | `明日计划 完成项目A、修复Bug B` |
| `今日打卡结果` | View today's check-in result | `今日打卡结果` |
| `历史记录 [N]` | View last N days of check-ins | `历史记录 7` |
| `帮助` | Show help message | `帮助` |

---

## Tech Stack / 技术栈

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Cloud Automation | GitHub Actions + Playwright | 定时填表 |
| Database | Supabase (PostgreSQL, free tier) | 共享数据存储 |
| Cookie Security | AES-256-GCM (node:crypto) | Cookie 加密存储 |
| WeChat Bridge | cc-wechat (iLink Bot API) | 微信消息收发 |
| Cloud Bot | Node.js + Express + Railway | 24/7 微信 Bot |
| Scheduling | GitHub Actions cron + setInterval | 定时触发 |

---

## Prerequisites / 前置条件

- [Node.js 22+](https://nodejs.org) (for bot; GitHub Actions uses Node 20)
- [GitHub account](https://github.com)
- [Supabase account](https://supabase.com) (free tier)
- [Railway account](https://railway.com) (free tier)
- WeChat with ClawBot plugin enabled (微信 + ClawBot 插件)
- A WeChat Docs smartsheet form (腾讯文档智能表格)

---

## Setup Guide / 部署指南

### Step 1: Clone & Install / 克隆并安装

```bash
git clone https://github.com/Abraham-wy/dailycheckin.git
cd dailycheckin
npm install
npm install -g playwright   # or: npx playwright install --with-deps chromium
```

### Step 2: Supabase / 数据库

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → paste and execute `sql/schema.sql`
3. Copy credentials from **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_KEY`

### Step 3: Cookie Encryption / Cookie 加密

1. Open Chrome, login to [doc.weixin.qq.com](https://doc.weixin.qq.com)
2. F12 → Application → Cookies → export all cookies
3. Create a JSON file `cookies.json` in flat format:
   ```json
   {"language":"zh-CN","tdoc_uid":"13102703750124192",...}
   ```
4. Encrypt:
   ```bash
   cat cookies.json | npm run encrypt-cookie
   ```
   Output: `AES_KEY` (64 hex chars) and `ENCRYPTED_COOKIES` (base64)

### Step 4: GitHub Actions / 云端自动化

```bash
# Generate random execution time (22:30-23:50 CST window)
HOUR=$(( RANDOM % 2 + 14 ))  # 14 or 15 UTC
if [ "$HOUR" = "14" ]; then MINUTE=$(( RANDOM % 30 + 30 )); else MINUTE=$(( RANDOM % 51 )); fi

# Edit .github/workflows/daily-checkin.yml:
#   Change the cron line to:  - cron: '$MINUTE $HOUR * * *'

# Set GitHub Secrets
gh secret set SUPABASE_URL --body "https://xxxxx.supabase.co"
gh secret set SUPABASE_SERVICE_KEY --body "eyJhbGciOi..."
gh secret set ENCRYPTED_COOKIES --body "<encrypted-base64-string>"
gh secret set AES_KEY --body "<64-hex-chars>"

# Test dry run (no actual submission)
gh workflow run daily-checkin.yml -f dry_run=true

# Test real check-in
gh workflow run daily-checkin.yml -f dry_run=false
```

### Step 5: WeChat Clawbot Binding / 微信绑定

```bash
# Requires Node 22+
brew install node@22

# Install and bind WeChat
npx cc-wechat@latest patch   # Patch Claude Code to enable Channels
npx cc-wechat@latest install # Show QR code → scan with WeChat

# Verify binding
cat ~/.claude/channels/wechat/default/account.json
# Copy the "token" value → this is your BOT_TOKEN
```

### Step 6: Railway Bot Deployment / 云端 Bot 部署

1. Go to [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
2. Select `Abraham-wy/dailycheckin` (or your fork)
3. Railway auto-detects Node.js and runs `npm start`
4. Add **Variables** in Railway dashboard:

| Variable | Value / 值 | Source / 来源 |
|----------|-----------|---------------|
| `BOT_TOKEN` | `10f4e4efd1f7@im.bot:...` | `~/.claude/channels/wechat/default/account.json` → `token` |
| `BOT_BASE_URL` | `https://ilinkai.weixin.qq.com` | Same file → `baseUrl` |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase dashboard |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOi...` | Supabase dashboard → service_role |

5. Deploy → check logs for `[BOOT] Daily Check-in Bot starting`
6. Send **帮助** in WeChat to test

---

## Environment Variables Reference / 环境变量

### GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key (bypasses RLS) |
| `ENCRYPTED_COOKIES` | AES-256-GCM encrypted cookies (base64) |
| `AES_KEY` | 64-character hex key for decryption |

### Railway Variables

| Variable | Description |
|----------|-------------|
| `BOT_TOKEN` | iLink Bot token from cc-wechat binding |
| `BOT_BASE_URL` | iLink API base URL (default: `https://ilinkai.weixin.qq.com`) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

---

## Commands Reference / 命令参考

### Local / 本地

```bash
npm run checkin          # Run check-in with Playwright
npm run test-checkin     # Dry-run: validate config, cookies, and DB connectivity
npm run encrypt-cookie   # Encrypt cookies (reads from stdin)
```

### GitHub Actions / 云端触发

```bash
# Manual trigger (dry run)
gh workflow run daily-checkin.yml -f dry_run=true

# Manual trigger (real submission)
gh workflow run daily-checkin.yml -f dry_run=false

# View recent runs
gh run list --workflow=daily-checkin.yml --limit=5
```

### Database / 数据库

```bash
# Check today's plan
curl -s "https://<project>.supabase.co/rest/v1/daily_plans?plan_date=eq.$(date +%Y-%m-%d)" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"

# Check today's check-in result
curl -s "https://<project>.supabase.co/rest/v1/checkin_logs?checkin_date=eq.$(date +%Y-%m-%d)" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
```

---

## Project Structure / 项目结构

```
dailycheckin/
├── .github/workflows/
│   └── daily-checkin.yml        # GitHub Actions cron workflow
├── src/
│   ├── index.ts                 # Entry point for check-in
│   ├── checkin.ts               # Core orchestration logic
│   ├── wechat-docs.ts           # WeChat Docs client facade
│   ├── wechat-docs-playwright.ts # Playwright-based form filling
│   ├── wechat-docs-api.ts       # Direct API client (stub)
│   ├── supabase.ts              # Supabase client (plans, logs)
│   ├── crypto.ts                # AES-256-GCM encrypt/decrypt
│   ├── random.ts                # Random push-ups, sleep time
│   ├── retry.ts                  # Exponential backoff retry
│   ├── date.ts                  # CST timezone helpers
│   ├── config.ts                # Env var loading & validation
│   └── types.ts                 # Shared TypeScript types
├── bot/
│   ├── index.ts                 # Railway bot: iLink polling + cron
│   ├── package.json             # Bot dependencies
│   └── tsconfig.json            # Bot TypeScript config
├── sql/
│   └── schema.sql               # Full Supabase schema
├── tools/
│   ├── encrypt-cookie.ts        # CLI: encrypt cookies for secrets
│   └── test-checkin.ts          # Dry-run validation tool
├── package.json                 # Root package (GH Actions + Bot start)
├── tsconfig.json                # Root TypeScript config
└── CLAUDE.md                    # Local clawbot config (optional)
```

---

## Troubleshooting / 故障排查

| Problem | Cause | Solution |
|---------|-------|----------|
| `Missing BOT_TOKEN` | Railway env vars not set | Add `BOT_TOKEN` in Railway → Variables |
| Cookie expired / 打卡失败 auth | WeChat Docs session expired | Re-export cookies from browser, re-encrypt, update `ENCRYPTED_COOKIES` secret |
| Bot doesn't reply on WeChat | Railway bot not deployed or crashed | Check Railway logs; redeploy |
| `bot_users` table error | SQL schema not fully executed | Run `bot_users` and `pending_notifications` CREATE TABLE in Supabase SQL Editor |
| Duplicate check-in | GitHub Actions triggered twice | Idempotency guard: unique index on `checkin_logs(checkin_date) WHERE status='success'` |
| Playwright timeout | WeChat Docs page structure changed | Check `wechat-docs-playwright.ts` selectors; update as needed |

---

## Security / 安全

- Cookies are AES-256-GCM encrypted before storage (never plaintext in repo/secrets)
- AES key stored only in GitHub Secrets and encrypted `.env`
- Supabase RLS enabled on all tables
- GitHub Actions uses `service_role` key (trusted CI); Bot uses `service_role` key (trusted cloud)
- No credentials in source code — everything via environment variables

---

## License / 许可

MIT
