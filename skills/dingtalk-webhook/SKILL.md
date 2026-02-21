---
id: dingtalk-webhook
name: 钉钉机器人 Webhook
description: 通过钉钉机器人 Webhook 发送消息到群聊
category: 消息推送
version: 1.0.0
runtime: python
entrypoint: main.py
tags: [钉钉, webhook, 消息推送]
---

# 钉钉机器人 Webhook

通过钉钉群机器人 Webhook 向群聊发送消息。

## 使用场景

当需要向钉钉群发送通知、告警或消息时使用。

## 输入参数

- `access_token`: 钉钉机器人 access_token
- `msgtype`: 消息类型，支持 text、markdown
- `content`: 消息内容

## 示例

```json
{
  "input": {
    "access_token": "xxx",
    "msgtype": "text",
    "content": "Hello from SkillGo!"
  }
}
```
