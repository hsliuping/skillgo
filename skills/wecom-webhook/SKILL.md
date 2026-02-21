---
name: 企业微信 Webhook
description: 通过企业微信 Webhook 发送消息到群聊
category: 消息推送
version: 1.0.0
runtime: python
entrypoint: main.py
tags: [企业微信, webhook, 消息推送]
---

# 企业微信 Webhook

通过企业微信机器人 Webhook 向群聊发送消息。

## 使用场景

当需要向企业微信群发送通知、告警或消息时使用。

## 输入参数

- `webhook_key`: 企业微信机器人 Webhook 的 key 参数
- `msgtype`: 消息类型，支持 text、markdown
- `content`: 消息内容

## 示例

```json
{
  "input": {
    "webhook_key": "xxx-xxx-xxx",
    "msgtype": "text",
    "content": "Hello from SkillGo!"
  }
}
```
