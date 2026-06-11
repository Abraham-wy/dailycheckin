# 每日打卡自动化

腾讯文档智能表格每日自动打卡。俯卧撑随机数、睡觉时间随机、任务从昨日计划自动流转。微信 Bot 通过 iLink API 交互，Railway 云端部署，关机也能用。

---

## 架构

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
│  22:30-23:50 CST daily    │          │  24/7 微信 Bot            │
│                           │          │                           │
│  - 解密 Cookie            │          │  - iLink API 长轮询       │
│  - 生成随机值              │          │  - 处理"明日计划"          │
│  - 填写腾讯文档表单         │          │  - 21:00 提醒             │
│  - 结果写入数据库           │          │  - 23:55 结果推送         │
└──────────────────────────┘          └───────────┬──────────────┘
                                                  │
                                                  ▼
                                            ┌──────────┐
                                            │   微信    │
                                            │  用户     │
                                            └──────────┘
```

## 数据流

```
21:00 CST  ──▶  Bot 检查明日计划是否存在
               ├─ 未填写 → 推送提醒："请在23:00前填写明日计划"
               └─ 已填写 → 确认："明日计划已填写 ✓"

用户发送     ──▶  Bot 写入 daily_plans (plan_date = 明天)
"明日计划 xxx"

22:43 CST ──▶  GitHub Actions 触发（22:30-23:50 随机时间点）
               ├─ 俯卧撑: 0~30 随机整数
               ├─ 睡觉时间: 23:00~23:59 随机时间
               ├─ 今日任务完成情况 ← daily_plans(plan_date=今天)
               ├─ 明日计划 ← daily_plans(plan_date=明天)
               │    └─ 如果为空 → 沿用最近一条计划
               └─ 提交到腾讯文档表单

23:55 CST ──▶  Bot 查询今日打卡结果
               ├─ success → 推送："今日打卡成功 ✓ | ..."
               └─ failed  → 推送："今日打卡失败 ✗ | ..."
```

### 计划流转规则

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

## 微信命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `明日计划 <内容>` | 填写明日计划 | `明日计划 完成项目A、修复Bug B` |
| `今日打卡结果` | 查看今日打卡结果 | `今日打卡结果` |
| `历史记录 [N]` | 查看最近N天记录 | `历史记录 7` |
| `帮助` | 显示帮助信息 | `帮助` |

---

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 云端自动化 | GitHub Actions + Playwright | 定时填表 |
| 数据库 | Supabase (PostgreSQL, 免费额度) | 共享数据存储 |
| Cookie 加密 | AES-256-GCM (node:crypto) | Cookie 安全存储 |
| 微信桥接 | cc-wechat (iLink Bot API) | 微信消息收发 |
| 云端 Bot | Node.js + Express + Railway | 24/7 微信 Bot |
| 定时调度 | GitHub Actions cron + setInterval | 定时触发 |

---

## 前置条件

- [Node.js 22+](https://nodejs.org)（Bot 需要；GitHub Actions 用 Node 20）
- [GitHub 账号](https://github.com)
- [Supabase 账号](https://supabase.com)（免费额度）
- [Railway 账号](https://railway.com)（免费额度）
- 微信 + ClawBot 插件
- 腾讯文档智能表格表单

---

## 部署指南

### 1. 克隆并安装

```bash
git clone https://github.com/Abraham-wy/dailycheckin.git
cd dailycheckin
npm install
npx playwright install --with-deps chromium
```

### 2. Supabase 数据库

1. 在 [supabase.com](https://supabase.com) 创建项目
2. 进入 **SQL Editor**，粘贴执行 `sql/schema.sql`
3. 在 **Settings → API** 复制凭证：
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_KEY`

### 3. Cookie 加密

1. 用 Chrome 登录 [doc.weixin.qq.com](https://doc.weixin.qq.com)
2. F12 → Application → Cookies → 导出所有 Cookie
3. 整理为 JSON 文件 `cookies.json`：
   ```json
   {"language":"zh-CN","tdoc_uid":"13102703750124192",...}
   ```
4. 加密：
   ```bash
   cat cookies.json | npm run encrypt-cookie
   ```
   输出：`AES_KEY`（64位hex）和 `ENCRYPTED_COOKIES`（base64）

### 4. GitHub Actions 云端自动化

```bash
# 生成随机执行时间（22:30-23:50 CST）
HOUR=$(( RANDOM % 2 + 14 ))  # 14 或 15 UTC
if [ "$HOUR" = "14" ]; then MINUTE=$(( RANDOM % 30 + 30 )); else MINUTE=$(( RANDOM % 51 )); fi

# 编辑 .github/workflows/daily-checkin.yml：
#   cron 行改为:  - cron: '$MINUTE $HOUR * * *'

# 设置 GitHub Secrets
gh secret set SUPABASE_URL --body "https://xxxxx.supabase.co"
gh secret set SUPABASE_SERVICE_KEY --body "eyJhbGciOi..."
gh secret set ENCRYPTED_COOKIES --body "<加密后的base64>"
gh secret set AES_KEY --body "<64位hex密钥>"

# 干跑测试（不实际提交）
gh workflow run daily-checkin.yml -f dry_run=true

# 实际提交测试
gh workflow run daily-checkin.yml -f dry_run=false
```

### 5. 微信 Clawbot 绑定

```bash
# 需要 Node 22+
brew install node@22

# 安装并绑定微信
npx cc-wechat@latest patch   # 修补 Claude Code 启用 Channels
npx cc-wechat@latest install # 显示二维码 → 微信扫码

# 验证绑定
cat ~/.claude/channels/wechat/default/account.json
# 复制 "token" 的值 → 即 BOT_TOKEN
```

### 6. Railway 云端 Bot 部署

1. 打开 [railway.com](https://railway.com) → **New Project** → **Deploy from GitHub repo**
2. 选择 `Abraham-wy/dailycheckin`（或你的 fork）
3. Railway 自动检测 Node.js 并执行 `npm start`
4. 在 Railway 的 **Variables** 中添加：

| 变量 | 值 | 来源 |
|------|-----|------|
| `BOT_TOKEN` | `10f4e4efd1f7@im.bot:...` | `~/.claude/channels/wechat/default/account.json` → `token` |
| `BOT_BASE_URL` | `https://ilinkai.weixin.qq.com` | 同上 → `baseUrl` |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 控制台 |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOi...` | Supabase 控制台 → service_role |

5. 部署 → 日志中出现 `[BOOT] Daily Check-in Bot starting` 即成功
6. 微信发送 **帮助** 测试

---

## 环境变量

### GitHub Actions Secrets

| Secret | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `ENCRYPTED_COOKIES` | AES-256-GCM 加密后的 Cookie（base64） |
| `AES_KEY` | 64位 hex 解密密钥 |

### Railway Variables

| 变量 | 说明 |
|------|------|
| `BOT_TOKEN` | iLink Bot token（cc-wechat 绑定后获得） |
| `BOT_BASE_URL` | iLink API 地址（默认 `https://ilinkai.weixin.qq.com`） |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |

---

## 命令参考

### 本地命令

```bash
npm run checkin          # 执行打卡（Playwright 填表）
npm run test-checkin     # 干跑验证（配置、Cookie、数据库连通性）
npm run encrypt-cookie   # 加密 Cookie（从 stdin 读取）
```

### GitHub Actions

```bash
# 手动触发（干跑）
gh workflow run daily-checkin.yml -f dry_run=true

# 手动触发（真实提交）
gh workflow run daily-checkin.yml -f dry_run=false

# 查看最近运行记录
gh run list --workflow=daily-checkin.yml --limit=5
```

### 数据库查询

```bash
# 查看今日计划
curl -s "https://<project>.supabase.co/rest/v1/daily_plans?plan_date=eq.$(date +%Y-%m-%d)" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"

# 查看今日打卡结果
curl -s "https://<project>.supabase.co/rest/v1/checkin_logs?checkin_date=eq.$(date +%Y-%m-%d)" \
  -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>"
```

---

## 项目结构

```
dailycheckin/
├── .github/workflows/
│   └── daily-checkin.yml        # GitHub Actions 定时工作流
├── src/
│   ├── index.ts                 # 打卡入口
│   ├── checkin.ts               # 核心编排逻辑
│   ├── wechat-docs.ts           # 腾讯文档客户端门面
│   ├── wechat-docs-playwright.ts # Playwright 表单填写
│   ├── wechat-docs-api.ts       # API 客户端（备用）
│   ├── supabase.ts              # Supabase 客户端
│   ├── crypto.ts                # AES-256-GCM 加解密
│   ├── random.ts                # 俯卧撑、睡觉时间随机生成
│   ├── retry.ts                 # 指数退避重试
│   ├── date.ts                  # CST 时区处理
│   ├── config.ts                # 环境变量加载校验
│   └── types.ts                 # 类型定义
├── bot/
│   ├── index.ts                 # Railway Bot：iLink 轮询 + 定时任务
│   ├── package.json
│   └── tsconfig.json
├── sql/
│   └── schema.sql               # 数据库建表语句
├── tools/
│   ├── encrypt-cookie.ts        # Cookie 加密 CLI
│   └── test-checkin.ts          # 干跑验证工具
├── package.json                 # 根 package（GitHub Actions + Bot start）
├── tsconfig.json
└── CLAUDE.md                    # 本地 Clawbot 配置（可选）
```

---

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `Missing BOT_TOKEN` | Railway 环境变量未设置 | 在 Railway → Variables 添加 `BOT_TOKEN` |
| Cookie 过期 / 打卡失败 auth | 腾讯文档登录态过期 | 重新从浏览器导出 Cookie、加密、更新 `ENCRYPTED_COOKIES` |
| Bot 微信无回复 | Railway Bot 未部署或崩溃 | 检查 Railway 日志，重新部署 |
| `bot_users` 表错误 | SQL schema 未完整执行 | 在 Supabase SQL Editor 执行建表语句 |
| 重复打卡 | GitHub Actions 重复触发 | 幂等保护：`checkin_logs` 唯一索引 |
| Playwright 超时 | 腾讯文档页面结构变化 | 检查 `wechat-docs-playwright.ts` 中的选择器 |

---

## 安全

- Cookie 使用 AES-256-GCM 加密后存储（不在仓库/Secrets 中出现明文）
- AES 密钥仅存在于 GitHub Secrets 和加密 `.env` 中
- Supabase 所有表启用 RLS
- 所有凭据通过环境变量注入，代码中无硬编码

---

## 许可

MIT
