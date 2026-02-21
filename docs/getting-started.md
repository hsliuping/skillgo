# 快速开始

学习如何创建你的第一个 Agent Skill。

## 1. 创建技能目录

在你的项目中创建一个新目录，例如 `my-skill`。

```bash
mkdir my-skill
cd my-skill
```

## 2. 创建 SKILL.md

在目录中创建一个 `SKILL.md` 文件，并添加以下内容：

```markdown
---
id: my-skill
name: 我的技能
description: 这是一个示例技能
---

# 我的技能

这里写下你的指令...
```

> **提示**：`id` 为英文安装标识，用于 `skillgo install id@version`，避免中文编码问题。若省略，将根据目录名自动生成。

## 3. 使用技能

将技能目录配置到你的 Agent 中，Agent 就会自动发现并使用它。
