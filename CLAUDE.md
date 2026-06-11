# CLAUDE.md — Daily Check-in 项目

## 项目概述

每日自动打卡系统：通过 GitHub Actions 在 22:30-23:50 CST 自动填写腾讯文档智能表格（俯卧撑、睡觉时间、今日任务、明日计划）。微信 Bot 部署在 Railway 上 24/7 运行，处理用户命令和定时提醒推送。

## 架构

```
GitHub Actions (22:30-23:50 CST) ──▶ 腾讯文档 API (submitformview)
         │                                    │
         └──── Supabase (PostgreSQL) ─────────┘
                         │
         Railway Cloud Bot (24/7) ──▶ iLink API ──▶ 微信用户
```

## 关键文件

| 文件 | 用途 |
|------|------|
| `src/index.ts` | GitHub Actions 打卡入口 |
| `src/checkin.ts` | 核心编排逻辑（Cookie 解密 → 生成数据 → 提交 → 写日志） |
| `src/wechat-docs-api.ts` | 腾讯文档直接 HTTP API 提交（主方案） |
| `src/wechat-docs-playwright.ts` | Playwright 浏览器提交（后备方案） |
| `src/wechat-docs.ts` | 门面：API 优先，失败后回退 Playwright |
| `src/supabase.ts` | 数据库客户端（plans, logs） |
| `src/crypto.ts` | AES-256-GCM Cookie 加解密 |
| `bot/index.ts` | Railway Bot：iLink 长轮询 + 微信命令处理 + 定时任务 |
| `sql/schema.sql` | 数据库建表语句 |
| `.github/workflows/daily-checkin.yml` | 定时触发 + workflow_dispatch |
| `tools/encrypt-cookie.ts` | Cookie 加密 CLI 工具 |
| `tools/test-checkin.ts` | 干跑验证工具 |
| `docs/API-REFERENCE.md` | API 端点和参数参考 |
| `docs/COOKIE-RENEWAL.md` | Cookie 过期续期操作手册 |

## 常用命令

```bash
# 本地干跑验证
npm run test-checkin

# 加密新 Cookie
cat cookies-flat.json | npm run encrypt-cookie

# 触发即时打卡
gh workflow run daily-checkin.yml -f dry_run=false

# 查看 GitHub Actions 运行状态
gh run list --workflow=daily-checkin.yml --limit=5

# 查看今日打卡结果
curl -s "https://ubvbhyaldkkxpqjlonap.supabase.co/rest/v1/checkin_logs?checkin_date=eq.$(date +%Y-%m-%d)&order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

## 环境变量

| 变量 | 位置 | 说明 |
|------|------|------|
| `SUPABASE_URL` | GitHub Secrets + Railway + .env | Supabase 项目 URL |
| `SUPABASE_SERVICE_KEY` | GitHub Secrets + Railway | 数据库写入权限 |
| `SUPABASE_ANON_KEY` | .env（本地） | 数据库读取权限 |
| `ENCRYPTED_COOKIES` | GitHub Secrets + .env | AES 加密的腾讯文档 Cookie |
| `AES_KEY` | GitHub Secrets + .env | Cookie 解密密钥 |
| `BOT_TOKEN` | Railway | iLink Bot token |
| `BOT_BASE_URL` | Railway | iLink API 地址 |
| `GITHUB_TOKEN` | Railway | 触发即时打卡的 PAT |

## 微信命令

- `明日计划 <内容>` → 写入 daily_plans
- `立即打卡` → 触发 GitHub Actions 即时打卡
- `今日打卡结果` → 查询今日打卡
- `历史记录 [N]` → 最近 N 天记录
- `帮助` → 命令列表

## 数据流

```
Day N 21:00 → Bot 21:00 cron 检查明日计划 → 未填则推送提醒
Day N 22:43 → GitHub Actions 自动触发打卡
  - 今日任务 = daily_plans(plan_date=今天) 的计划
  - 明日计划 = daily_plans(plan_date=明天) 的计划（无则沿用）
Day N 23:55 → Bot 推送今日打卡结果
```

## 已知问题 & 调试

### Railway Bot 查不到数据
检查 `SUPABASE_SERVICE_KEY` 是否含多余换行符（Railway Variables 中删除重粘）

### Cookie 过期
参考 `docs/COOKIE-RENEWAL.md`

### Playwright 后备方案
当前主方案是直接 HTTP API（`submitformview`）。如果 API 不可用，会自动回退 Playwright。Playwright 选择器：`.text-editor[contenteditable="true"]`（表单字段）、`button:has-text("提交")`（提交按钮）

### 多次打卡
已移除幂等保护，同一天允许多次打卡。

### 明日计划覆盖
重复发送"明日计划"会自动覆盖同一天的上一条记录（upsert）。

## 部署要点

1. Supabase 建表 → SQL Editor 执行 `sql/schema.sql`
2. Cookie 加密 → `npm run encrypt-cookie` → 设 GitHub Secrets
3. GitHub Actions cron → 编辑 `.github/workflows/daily-checkin.yml`
4. 微信绑定 → `npx cc-wechat@latest patch && npx cc-wechat@latest install`
5. Railway 部署 → 连接 GitHub 仓库 → 设 4 个环境变量

## 项目专属凭据位置

- Supabase: https://ubvbhyaldkkxpqjlonap.supabase.co
- Railway: dailycheckin 项目
- GitHub: Abraham-wy/dailycheckin
- Bot token: `~/.claude/channels/wechat/default/account.json`
- 腾讯文档 URL: `https://doc.weixin.qq.com/smartsheet/s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0`
