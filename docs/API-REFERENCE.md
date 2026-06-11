# API 参考文档（公开版）

> 真实凭据（Token、Key）存储在 `docs/local/API-REFERENCE.md`（gitignored，不上传 GitHub）。

## 腾讯文档提交 API

```
POST https://doc.weixin.qq.com/smartsheetservice/submitformview?sid={wedoc_sid}&wedoc_xsrf=1&xsrf={TOK}
Content-Type: application/json
Cookie: {全部 cookies}

Body:
{
  "answer": {"record": [
    {"fieldId":"fzSueb","cellStr":"[...]","fieldType":1},
    {"fieldId":"fDpQ7o","cellStr":"[...]","fieldType":1},
    {"fieldId":"fp1TPo","cellStr":"[...]","fieldType":1},
    {"fieldId":"fz3vww","cellStr":"[...]","fieldType":1}
  ]},
  "sub_id":"q979lj",
  "view_id":"vD00wZ",
  "doc_id":"s3_Af8ABwbxAJcCNyvQQUKfMTAe6Mal0"
}
```

| 参数 | 来源 |
|------|------|
| `sid` | Cookie `wedoc_sid` |
| `xsrf` | Cookie `TOK` |

## 字段映射

| 字段 | fieldId | 值范围 |
|------|---------|--------|
| 俯卧撑 | `fzSueb` | 0-30 |
| 开始睡觉时间 | `fDpQ7o` | 23:00-23:59 |
| 今日任务完成情况 | `fp1TPo` | 前一天明日计划 |
| 明日计划 | `fz3vww` | 用户微信填写 |

## iLink Bot API

凭据：`~/.claude/channels/wechat/default/account.json`

| 端点 | 方法 |
|------|------|
| `/ilink/bot/getupdates` | POST (长轮询) |
| `/ilink/bot/sendmessage` | POST |
| `/ilink/bot/getconfig` | POST |

认证：`Authorization: Bearer {BOT_TOKEN}`

## GitHub Actions API

```
POST /repos/{owner}/{repo}/actions/workflows/daily-checkin.yml/dispatches
Body: {"ref":"main","inputs":{"dry_run":false}}
```

Token 需 `workflow` 权限。

## Supabase

表：`daily_plans` / `checkin_logs` / `reminder_logs` / `bot_users` / `pending_notifications`
