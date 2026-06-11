# API 参考文档

本文档记录项目中涉及的所有关键 API 端点、参数和凭据，方便日后维护和调用。

---

## 腾讯文档提交 API

### 端点

```
POST https://doc.weixin.qq.com/smartsheetservice/submitformview
  ?sid={wedoc_sid}
  &wedoc_xsrf=1
  &xsrf={TOK_cookie_value}
```

### 请求头

```
Content-Type: application/json
Cookie: {全部 cookies}
Referer: https://doc.weixin.qq.com/smartsheet/s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0
```

### 请求体

```json
{
  "answer": {
    "record": [
      {
        "fieldId": "fzSueb",
        "cellStr": "[{\"text\":\"{俯卧撑数字}\",\"type\":\"text\",\"format\":{\"bold\":false,\"italic\":false,\"underline\":false,\"strikeThrough\":false}}]",
        "fieldType": 1
      },
      {
        "fieldId": "fDpQ7o",
        "cellStr": "[{\"text\":\"{睡觉时间 HH:MM}\",\"type\":\"text\",\"format\":{\"bold\":false,\"italic\":false,\"underline\":false,\"strikeThrough\":false}}]",
        "fieldType": 1
      },
      {
        "fieldId": "fp1TPo",
        "cellStr": "[{\"text\":\"{今日任务完成情况}\",\"type\":\"text\",\"format\":{\"bold\":false,\"italic\":false,\"underline\":false,\"strikeThrough\":false}}]",
        "fieldType": 1
      },
      {
        "fieldId": "fz3vww",
        "cellStr": "[{\"text\":\"{明日计划}\",\"type\":\"text\",\"format\":{\"bold\":false,\"italic\":false,\"underline\":false,\"strikeThrough\":false}}]",
        "fieldType": 1
      }
    ]
  },
  "sub_id": "q979lj",
  "view_id": "vD00wZ",
  "doc_id": "s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0"
}
```

### 表单字段映射

| 字段名 | fieldId | 说明 |
|--------|---------|------|
| 俯卧撑 | `fzSueb` | 0-30 随机整数 |
| 开始睡觉时间 | `fDpQ7o` | 23:00-23:59 随机时间 |
| 今日任务完成情况 | `fp1TPo` | 来自前一天的明日计划 |
| 明日计划 | `fz3vww` | 用户通过微信填写 |

### 表单元数据

| 参数 | 值 |
|------|-----|
| doc_id | `s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0` |
| sub_id | `q979lj` |
| view_id | `vD00wZ` |
| 表单 URL | `https://doc.weixin.qq.com/smartsheet/s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0?scode=AJEAqAfZADcj4Z3dBeAW8AnwacAGY&tab=q979lj&viewId=vD00wZ` |

---

## 腾讯文档页面结构 (Playwright 后备)

当直接 API 不可用时，Playwright 通过以下选择器操作表单：

| 元素 | 选择器 |
|------|--------|
| 表单字段 | `.text-editor[contenteditable="true"]` (共 4 个) |
| 提交按钮 | `button:has-text("提交")` |
| 提交成功标记 | 页面文本含 `已提交` 或 API 返回 `submitformview` 200 |

---

## iLink 微信 Bot API

### 端点

| 操作 | 方法 | 端点 |
|------|------|------|
| 获取消息 | POST | `{baseUrl}/ilink/bot/getupdates` |
| 发送消息 | POST | `{baseUrl}/ilink/bot/sendmessage` |
| 获取二维码 | GET | `{baseUrl}/ilink/bot/get_bot_qrcode` |
| 检查扫码状态 | GET | `{baseUrl}/ilink/bot/get_qrcode_status` |
| 获取配置 | POST | `{baseUrl}/ilink/bot/getconfig` |

### 默认 baseUrl

`https://ilinkai.weixin.qq.com`

### 认证

请求头：`Authorization: Bearer {BOT_TOKEN}`

BOT_TOKEN 来自 `~/.claude/channels/wechat/default/account.json`

---

## GitHub Actions API

### 触发打卡工作流

```
POST https://api.github.com/repos/Abraham-wy/dailycheckin/actions/workflows/daily-checkin.yml/dispatches
Authorization: Bearer {GITHUB_TOKEN}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

Body: { "ref": "main", "inputs": { "dry_run": false } }
```

GITHUB_TOKEN 需 `workflow` 权限，可通过 `gh auth token` 获取。

---

## Supabase

### 项目信息

| 参数 | 值 |
|------|-----|
| URL | `https://ubvbhyaldkkxpqjlonap.supabase.co` |
| Project ID | `ubvbhyaldkkxpqjlonap` |

### 表结构

见 `sql/schema.sql`

### 关键查询

```bash
# 今日打卡结果
curl "https://ubvbhyaldkkxpqjlonap.supabase.co/rest/v1/checkin_logs?checkin_date=eq.{YYYY-MM-DD}&order=created_at.desc&limit=1" \
  -H "apikey: {KEY}" -H "Authorization: Bearer {KEY}"

# 明日计划
curl "https://ubvbhyaldkkxpqjlonap.supabase.co/rest/v1/daily_plans?plan_date=eq.{YYYY-MM-DD}" \
  -H "apikey: {KEY}" -H "Authorization: Bearer {KEY}"
```
