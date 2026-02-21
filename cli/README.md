# SkillGo CLI

SkillGo 命令行工具 - 搜索、安装、管理 Agent 技能。安装时会递归下载 SKILL.md 及同目录、子目录下的所有代码文件。支持中文技能名，若 slug 未匹配会自动按名称搜索。https://skillgo.cn

## 安装

```bash
pnpm dlx skillgo install <slug>
npx skillgo install <slug>
yarn dlx skillgo install <slug>
bunx skillgo install <slug>
```

## 用法

```bash
skillgo search <keyword>     # 搜索技能
skillgo install <slug>      # 安装最新版本到当前目录 skills/
skillgo install <slug>@<ver> # 安装指定版本
skillgo list                # 列出已安装技能
skillgo update --all        # 更新所有已安装技能
```

## 环境变量

- `SKILLGO_API`: API 地址，默认 `http://skillgo.cn`
- `SKILLGO_DEBUG`: 设为 `1` 启用调试模式，或使用 `--debug` / `-d` 参数
