# SkillGo

SkillGo 技能分享平台 - https://skillgo.cn

提供技能提交、审核、发布与 MCP 发现接口，并内置统一的技能执行入口。

## 许可证

本项目采用 [Apache License 2.0](LICENSE) 开源协议。

- **允许**：学习、修改、分发、商业使用、专利授权
- **要求**：保留版权声明和许可证，修改文件需注明变更
- **品牌**：SkillGo 为项目商标，未经授权不得用于商业宣传或误导用户

## 架构图

```
                ┌──────────────────────────────┐
                │           用户/应用           │
                └──────────────┬───────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Web 前端 UI      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  技能服务 API(3100)  │
                    │  - 技能提交/审核      │
                    │  - MCP 发现接口       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   技能库 MySQL       │
                    └─────────────────────┘

                    ┌─────────────────────┐
                    │  执行器服务(3200)    │
                    │  - 拉取 MCP 技能      │
                    │  - 下载 SKILL.md     │
                    │  - 拉取代码仓库       │
                    │  - 执行并返回结果     │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  代码仓库/HTTP 入口  │
                    └─────────────────────┘
```

说明：执行器是独立服务，通过 MCP 获取技能元数据，不依赖 MySQL。

## 服务启动

本地启动：

```bash
npm install
npm run dev:server
```

前端启动：

```bash
npm run dev:web
```

默认在 http://localhost:5173 打开前端界面。

执行器启动：

```bash
node runner/index.js
```

Docker 启动：

```bash
docker compose up --build
```

默认端口为 3100，可通过环境变量 `PORT` 修改。

## 执行接口

统一执行入口：

```bash
curl -X POST http://localhost:3100/v1/skills/{slug}/versions/{version}/run \
  -H "Content-Type: application/json" \
  -d "{\"input\":{\"text\":\"hello\"}}"
```

返回格式：

```json
{
  "status": "success",
  "skill": { "id": 1, "slug": "demo-skill", "version": "1.0.0", "name": "Demo" },
  "output": { "text": "已接收执行请求：Demo", "input": { "text": "hello" } },
  "logs": ["run stub for demo-skill@1.0.0"],
  "artifacts": []
}
```

当前执行接口为占位实现，后续可接入真实运行器。

## 运行时与入口

技能可通过 SKILL.md 元数据声明运行时与入口：

```markdown
---
runtime: python
entrypoint: main.py
---
```

执行接口会根据 runtime 决定执行方式，并在运行目录注入 input.json、context.json、options.json。

## 执行器接口

执行器会从 MCP 拉取技能并执行：

```bash
curl -X POST http://localhost:3200/run \
  -H "Content-Type: application/json" \
  -d "{\"slug\":\"demo-skill\",\"input\":{\"text\":\"hello\"}}"
```

当传入 version 时执行指定版本，否则默认最新版本。

## 执行限制配置

可通过环境变量限制执行行为：

- RUN_ALLOW_INSTALL：是否允许自动安装依赖（默认 true）
- RUN_MAX_TIMEOUT_MS：执行超时时间上限（默认 30000）
- RUN_HTTP_ALLOWED_HOSTS：允许的 HTTP 入口白名单（host 列表，用逗号分隔；为空表示不限制）

## 依赖与输出

执行请求可携带：

```json
{
  "options": {
    "install": true,
    "timeoutMs": 30000
  }
}
```

当 install=true 时：

- Python 会尝试安装 requirements.txt
- Node 会尝试安装 package.json 依赖

运行结束后若存在 output.json 或 artifacts.json：

- output.json 将作为 output 返回
- artifacts.json 将作为 artifacts 返回

---

© 2025 SkillGo (https://skillgo.cn). 本项目采用 Apache-2.0 协议。
