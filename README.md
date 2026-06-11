# 每日打卡自动化

腾讯文档智能表格每日自动打卡系统。俯卧撑随机数、睡觉时间随机、任务从昨日计划自动流转。微信 Bot 通过 iLink API 交互，Railway 云端部署，**关机也能用**。

---

## 架构

```
GitHub Actions (22:30-23:50 CST) ──▶ 腾讯文档 API (submitformview)
         │                                    │
         └──── Supabase (PostgreSQL) ─────────┘
                         │
         Railway Cloud Bot (24/7) ──▶ iLink API ──▶ 微信用户
```

---

## 微信命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `明日计划 <内容>` | 填写明日计划，重复发送自动覆盖 | `明日计划 完成项目A、修复Bug B` |
| `立即打卡` | 即时触发打卡并推送结果 | `立即打卡` |
| `今日打卡结果` | 查看今日打卡结果 | `今日打卡结果` |
| `历史记录 [N]` | 查看最近 N 天记录 | `历史记录 7` |
| `帮助` | 显示帮助信息 | `帮助` |

## 数据流

```
21:00 CST  ──▶  Bot 检查明日计划 → 未填则推送提醒
用户发送    ──▶  Bot 写入 daily_plans (plan_date = 明天)
"明日计划"
22:43 CST  ──▶  GitHub Actions 自动打卡
                ├─ 俯卧撑: 0~30 随机
                ├─ 睡觉: 23:00~23:59 随机
                ├─ 今日任务 ← 前一天的明日计划（无则沿用）
                └─ 明日计划 ← 用户填写（无则沿用）
23:55 CST  ──▶  Bot 推送打卡结果
```

### 计划流转规则

```
Day 1: 用户填写 "明日计划" = "完成A、B"
Day 2: 今日任务 = "完成A、B"  ← Day1 的明日计划
        用户忘记填写 → 明日计划沿用 "完成A、B"
Day 3: 今日任务 = "完成A、B"  ← 沿用
        明日计划 = "完成A、B"  ← 继续沿用
```

---

## 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 表单提交 | 腾讯文档 REST API (submitformview) | 直连提交，秒级完成 |
| 后备方案 | Playwright | API 不可用时的浏览器兜底 |
| 数据库 | Supabase (PostgreSQL) | 免费额度，REST API 访问 |
| Cookie 加密 | AES-256-GCM (node:crypto) | 无第三方依赖 |
| 微信 Bot | iLink Bot API + Railway | 24/7 云端运行 |
| 定时调度 | GitHub Actions cron | 免费，可靠 |

---

## 前置条件

- [Node.js 22+](https://nodejs.org)（Bot 需要；GitHub Actions 用 Node 20）
- [GitHub 账号](https://github.com)
- [Supabase 账号](https://supabase.com)（免费额度）
- [Railway 账号](https://railway.com)（免费额度，Hobby 计划 $5/月）
- 微信 + ClawBot 插件
- 腾讯文档智能表格（表单视图）

---

## 部署指南

### 1. 克隆并安装

```bash
git clone https://github.com/Abraham-wy/dailycheckin.git
cd dailycheckin
npm install
```

### 2. Supabase 数据库

1. 在 [supabase.com](https://supabase.com) 创建项目
2. SQL Editor 中执行 `sql/schema.sql`
3. SQL Editor 中执行以下额外语句（如果 schema.sql 未包含）：
   ```sql
   DROP INDEX IF EXISTS idx_one_success_per_day;
   ```
4. Settings → API 复制：
   - `Project URL` → `SUPABASE_URL`
   - `anon public key` → `SUPABASE_ANON_KEY`
   - `service_role secret` → `SUPABASE_SERVICE_KEY`

### 3. Cookie 加密

1. Chrome 登录 [doc.weixin.qq.com](https://doc.weixin.qq.com)
2. F12 → Console，粘贴执行：
   ```javascript
   copy(JSON.stringify(
     document.cookie.split('; ').reduce((acc, c) => {
       const [k, ...v] = c.split('='); acc[k] = v.join('='); return acc;
     }, {})
   ));
   ```
3. 保存到 `cookies-flat.json`：
   ```bash
   pbpaste > cookies-flat.json
   ```
4. 加密：
   ```bash
   cat cookies-flat.json | npm run encrypt-cookie
   ```
   输出 `AES_KEY` 和 `ENCRYPTED_COOKIES`

### 4. GitHub Actions

```bash
# 生成随机执行时间（22:30-23:50 CST）
HOUR=$(( RANDOM % 2 + 14 ))  # 14 或 15 UTC
if [ "$HOUR" = "14" ]; then
  MINUTE=$(( RANDOM % 30 + 30 ))
else
  MINUTE=$(( RANDOM % 51 ))
fi

# 编辑 .github/workflows/daily-checkin.yml
# cron 行改为:  - cron: '$MINUTE $HOUR * * *'

# 设置 Secrets
gh secret set SUPABASE_URL --body "https://xxxxx.supabase.co"
gh secret set SUPABASE_SERVICE_KEY --body "eyJhbGciOi..."
gh secret set ENCRYPTED_COOKIES --body "<加密后的base64>"
gh secret set AES_KEY --body "<64位hex>"

# 干跑测试
gh workflow run daily-checkin.yml -f dry_run=true
# 真实提交测试
gh workflow run daily-checkin.yml -f dry_run=false
```

### 5. 微信 Clawbot 绑定

```bash
# 需要 Node 22+
brew install node@22

# 修补 Claude Code + 扫码绑定
npx cc-wechat@latest patch
npx cc-wechat@latest install  # 终端显示二维码 → 微信扫码

# 获取 Bot Token
cat ~/.claude/channels/wechat/default/account.json
# 复制 "token" 的值 → BOT_TOKEN
```

### 6. Railway 部署

1. [railway.com](https://railway.com) → New Project → Deploy from GitHub repo
2. 选择你的 dailycheckin 仓库
3. Railway 自动检测 Node.js，执行 `npm start`
4. Variables 添加：

| 变量 | 值 | 来源 |
|------|-----|------|
| `BOT_TOKEN` | iLink Bot token | `account.json` → `token` |
| `BOT_BASE_URL` | `https://ilinkai.weixin.qq.com` | `account.json` → `baseUrl`（可选） |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 控制台 |
| `SUPABASE_SERVICE_KEY` | service_role key | Supabase 控制台 |
| `GITHUB_TOKEN` | GitHub PAT | 需 `workflow` 权限，用于"立即打卡" |

5. ⚠️ `SUPABASE_SERVICE_KEY` 务必粘贴为**一行**，不能含换行符
6. 部署 → 日志显示 `[BOOT] Daily Check-in Bot starting`
7. 微信发送 **帮助** 验证

---

## 环境变量参考

### GitHub Actions Secrets

| Secret | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key |
| `ENCRYPTED_COOKIES` | AES-256-GCM 加密的 Cookie（base64） |
| `AES_KEY` | 64 位 hex 解密密钥 |

### Railway Variables

| 变量 | 说明 |
|------|------|
| `BOT_TOKEN` | iLink Bot token |
| `BOT_BASE_URL` | iLink API 地址（默认 `https://ilinkai.weixin.qq.com`） |
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | Supabase service_role key（**不能有换行**） |
| `GITHUB_TOKEN` | GitHub PAT，`workflow` 权限 |

---

## 命令参考

### 本地命令

```bash
npm run checkin          # 执行打卡（API 直连）
npm run test-checkin     # 干跑验证
npm run encrypt-cookie   # 加密 Cookie（从 stdin 读取）
```

### GitHub Actions

```bash
gh workflow run daily-checkin.yml -f dry_run=true   # 干跑
gh workflow run daily-checkin.yml -f dry_run=false  # 真实提交
gh run list --workflow=daily-checkin.yml --limit=5  # 查看记录
```

### 数据库查询

```bash
# 今日打卡结果
curl -s "https://<project>.supabase.co/rest/v1/checkin_logs?checkin_date=eq.$(date +%Y-%m-%d)&order=created_at.desc&limit=1" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"

# 明日计划
curl -s "https://<project>.supabase.co/rest/v1/daily_plans?plan_date=eq.$(date -v+1d +%Y-%m-%d)" \
  -H "apikey: <key>" -H "Authorization: Bearer <key>"
```

---

## 项目结构

```
dailycheckin/
├── .github/workflows/
│   └── daily-checkin.yml        # GitHub Actions 定时工作流
├── src/
│   ├── index.ts                 # 打卡入口
│   ├── checkin.ts               # 核心编排
│   ├── wechat-docs.ts           # 腾讯文档门面（API → Playwright）
│   ├── wechat-docs-api.ts       # 直连 HTTP API 提交
│   ├── wechat-docs-playwright.ts # Playwright 浏览器后备
│   ├── supabase.ts              # 数据库客户端
│   ├── crypto.ts                # AES-256-GCM 加解密
│   ├── random.ts                # 随机数生成
│   ├── retry.ts                 # 指数退避重试
│   ├── date.ts                  # CST 时区处理
│   ├── config.ts                # 环境变量
│   └── types.ts                 # 类型定义
├── bot/
│   └── index.ts                 # Railway Bot（iLink 轮询 + 微信命令 + cron）
├── sql/
│   └── schema.sql               # 数据库建表
├── docs/
│   ├── API-REFERENCE.md         # API 端点 & 参数参考
│   └── COOKIE-RENEWAL.md        # Cookie 过期续期手册
├── tools/
│   ├── encrypt-cookie.ts        # Cookie 加密 CLI
│   └── test-checkin.ts          # 干跑验证
├── package.json
├── CLAUDE.md                    # 项目 AI 协作指南
└── README.md
```

---

## 故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `Missing BOT_TOKEN` | Railway 环境变量未设置 | 添加 `BOT_TOKEN` |
| Bot 微信无回复 | Railway Bot 未部署或崩溃 | 查看 Railway 日志 |
| 历史记录返回空 | `SUPABASE_SERVICE_KEY` 含换行 | 删除重新粘贴为一行 |
| Cookie 过期 / 打卡 auth 失败 | 腾讯文档登录态过期 | 参考 `docs/COOKIE-RENEWAL.md` |
| Playwright 超时 | 腾讯文档页面结构变化 | 当前主方案是 API 直连，一般不受影响 |

---

## 参考文档

- [API 参考](docs/API-REFERENCE.md) — 所有 API 端点、参数、字段映射
- [Cookie 续期手册](docs/COOKIE-RENEWAL.md) — Cookie 过期后的操作步骤
- [CLAUDE.md](CLAUDE.md) — AI 协作工作流和项目上下文

---

## 许可

MIT
