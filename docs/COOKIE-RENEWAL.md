# Cookie 续期操作手册

腾讯文档 Cookie 有效期通常为 1-4 周。当打卡失败且日志显示 `auth` 相关错误，或收到微信提醒"Cookie 过期"时，按以下步骤操作。

---

## 步骤 1：重新导出 Cookie

1. 打开 Chrome，访问 https://doc.weixin.qq.com
2. 确保已登录（如需扫码，用微信扫码登录）
3. 按 `F12` 打开开发者工具
4. 切换到 **Application** 标签 → 左侧 **Cookies** → 选择 `doc.weixin.qq.com`
5. 将所有 Cookie 导出为 JSON 格式。

**快速导出脚本**（在 Console 中执行）：
```javascript
// 在 doc.weixin.qq.com 页面的 DevTools Console 中粘贴执行
copy(JSON.stringify(
  document.cookie.split('; ').reduce((acc, c) => {
    const [k, ...v] = c.split('=');
    acc[k] = v.join('=');
    return acc;
  }, {})
));
console.log('Cookie JSON 已复制到剪贴板');
```

6. 将复制的 JSON 保存到项目目录下的 `cookies-flat.json`：
```bash
cd /path/to/dailycheckin
# 粘贴并保存
pbpaste > cookies-flat.json  # macOS
```

---

## 步骤 2：加密 Cookie

```bash
cd /path/to/dailycheckin
cat cookies-flat.json | npm run encrypt-cookie
```

输出示例：
```
AES_KEY: 14c7aff6e9005a8355d6d9255fb0c4da7685eb4e368677b22ba3a0fbd9818167
Encrypted cookies (base64):
yKx7/yDkQ25eRG0IpBGBunb6Bj22TpJZROWyMlHPDLIT87D92vNe1yw3mp7OTH1B...
```

---

## 步骤 3：更新 GitHub Secrets

```bash
# 如果 AES_KEY 没变（用原来的 .env 中的值），只需更新 ENCRYPTED_COOKIES
gh secret set ENCRYPTED_COOKIES --body "新的加密base64字符串"

# 如果 AES_KEY 也变了，同时更新
gh secret set AES_KEY --body "新的64位hex密钥"
```

---

## 步骤 4：更新本地 .env（可选）

如果 AES_KEY 变了：
```bash
# 编辑 .env，替换 AES_KEY 和 ENCRYPTED_COOKIES
```

---

## 步骤 5：验证

```bash
# 本地干跑测试
npm run test-checkin

# 或直接触发一次打卡
gh workflow run daily-checkin.yml -f dry_run=false
```

---

## 故障排查

| 症状 | 可能原因 | 解决 |
|------|---------|------|
| `test-checkin` 报告 "Cookies are valid" 但打卡失败 | Cookie 中缺少 `wedoc_sid` 或 `TOK` | 重新导出，确保包含所有 Cookie |
| 加密命令报 "Input is not valid JSON" | cookies-flat.json 格式不对 | 检查 JSON 格式，key 和 value 都需要双引号 |
| GitHub Actions 报 `auth` 错误 | `ENCRYPTED_COOKIES` secret 未更新 | 确认 `gh secret set` 执行成功 |
| | AES_KEY 与加密时不一致 | 确保用同一个 AES_KEY 加密 |

---

## 有用的命令

```bash
# 验证 Cookie 有效性（本地）
npm run test-checkin

# 查看最新的打卡状态
curl -s "https://ubvbhyaldkkxpqjlonap.supabase.co/rest/v1/checkin_logs?order=created_at.desc&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" | python3 -m json.tool

# 手动重新加密
echo '{"language":"zh-CN","tdoc_uid":"...",...}' | npm run encrypt-cookie
```
