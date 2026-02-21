# 关于 Agent Skills

Agent Skills 是扩展 AI 代理能力的标准化方式。

## 核心概念

- **Skills**: 一个包含 `SKILL.md` 的目录，定义了代理如何执行特定任务。
- **Progressive Disclosure**: 代理只在需要时加载详细指令，节省上下文窗口。
- **Portability**: 技能是标准化的文件，可以在不同的代理实现之间共享。

## 为什么使用 Skills?

Skills 允许你教 AI 代理处理特定的领域知识、遵循特定的工作流或使用特定的工具，而无需修改代理的核心代码。
