# Daily Check-in Automation

每天 22:30-23:50 CST 自动填写腾讯文档智能表格打卡，通过微信 Clawbot 交互填写"明日计划"。

## 架构

```
GitHub Actions (22:30-23:50)  →  Supabase (PostgreSQL)  ←  WeChat Clawbot
      自动填表                      共享数据库                 微信交互
```

## 快速开始

### 1. Supabase 设置

1. 在 [supabase.com](https://supabase.com) 创建免费项目
2. 在 SQL Editor 中执行 `sql/schema.sql`
3. 获取项目 URL、anon key、service_role key（Settings → API）

### 2. Cookie 加密

1. 在浏览器中登录 `doc.weixin.qq.com`
2. 打开 DevTools → Application → Cookies
3. 将 cookies 导出为 JSON 格式：`{"cookie_name": "value", ...}`
4. 复制 `.env.example` 为 `.env`
5. 生成 AES 密钥并加密 cookies：

```bash
# 生成密钥并加密
echo '{"your":"cookies"}' | npm run encrypt-cookie
```

### 3. GitHub Secrets 设置

```bash
# 生成随机执行时间（22:30-23:50 CST）
# hour: 14 或 15 (UTC)
# minute: 30-59 (hour=14) 或 0-50 (hour=15)
HOUR=$(if [ $((RANDOM % 2)) -eq 0 ]; then echo 14; else echo 15; fi)
if [ "$HOUR" = "14" ]; then MINUTE=$((RANDOM % 30 + 30)); else MINUTE=$((RANDOM % 51)); fi

# 设置 Secrets
gh secret set CRON_HOUR --body "$HOUR"
gh secret set CRON_MINUTE --body "$MINUTE"
gh secret set SUPABASE_URL --body "https://xxx.supabase.co"
gh secret set SUPABASE_SERVICE_KEY --body "your-service-role-key"
gh secret set ENCRYPTED_COOKIES --body "加密后的base64字符串"
gh secret set AES_KEY --body "64位hex密钥"
```

### 4. 测试

```bash
# 干跑测试（不实际提交）
gh workflow run daily-checkin.yml -f dry_run=true

# 实际提交测试
gh workflow run daily-checkin.yml -f dry_run=false
```

### 5. Clawbot 设置

1. 在项目 `.env` 中设置 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY`
2. 确保 clawbot 已绑定微信
3. 通过微信发送 "明日计划 <内容>" 测试

## 命令参考

| 命令 | 说明 |
|------|------|
| `npm run checkin` | 执行打卡 |
| `npm run test-checkin` | 干跑验证 |
| `npm run encrypt-cookie` | 加密 Cookie |

## 数据流

```
Day N 21:00 → Clawbot 提醒填写明日计划
Day N 22:30-23:50 → GitHub Actions 自动打卡
  - 今日任务完成情况 = Day N-1 的明日计划
  - 明日计划 = 用户填写（或沿用）
Day N 23:55 → Clawbot 推送打卡结果
```

## 文件结构

```
dailycheckin/
├── .github/workflows/daily-checkin.yml   # GH Actions 定时任务
├── src/
│   ├── index.ts                          # 入口
│   ├── checkin.ts                        # 核心打卡编排
│   ├── wechat-docs.ts                    # 腾讯文档客户端门面
│   ├── wechat-docs-playwright.ts         # Playwright 表单填写
│   ├── wechat-docs-api.ts                # API 客户端（备用）
│   ├── supabase.ts                       # 数据库客户端
│   ├── crypto.ts                         # AES 加密
│   ├── random.ts                         # 随机数生成
│   ├── retry.ts                          # 重试逻辑
│   ├── date.ts                           # 时区处理
│   ├── config.ts                         # 配置加载
│   └── types.ts                          # 类型定义
├── sql/schema.sql                        # 数据库建表
├── tools/
│   ├── encrypt-cookie.ts                 # Cookie 加密工具
│   └── test-checkin.ts                   # 干跑测试
└── CLAUDE.md                            # Clawbot 配置
```
