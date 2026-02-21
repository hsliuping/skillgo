# 本地 skillgo.cn 测试指南

已将 skillgo.cn 指向 127.0.0.1 后，按以下步骤测试。

## 1. 配置 .env

在 `.env` 中确保：

```
MYSQL_DATABASE=skillgo
ALLOWED_ORIGINS=http://skillgo.cn:5173,http://skillgo.cn:3100,http://localhost:5173
```

## 2. 启动服务

**终端 1 - API 服务：**
```bash
npm run dev:server
```

**终端 2 - 前端：**

在 `web/` 目录下创建 `.env.local`（仅本地 skillgo.cn 测试用）：
```
VITE_API_BASE=http://skillgo.cn:3100
```

然后运行：
```bash
npm run dev:skillgo
```

## 3. 访问

浏览器打开：**http://skillgo.cn:5173**

- 首页：技能列表
- 提交技能、MCP 服务、登录注册等
- 管理后台：http://skillgo.cn:5173/admin-login（admin / admin123）

## 4. 验证 API

```bash
curl http://skillgo.cn:3100/api/health
```

应返回 `{"status":"ok"}`

## 5. 本地技能入库

`skills/` 目录下的技能不会自动入库。两种方式：

**方式 A：推送到 GitHub 后导入**

1. 将项目推到 GitHub
2. 在「提交技能」页填写仓库链接，如 `https://github.com/你的用户名/skillgo`
3. 系统会扫描 SKILL.md 并导入

**方式 B：本地种子脚本（开发用）**

```bash
# 1. 创建数据库（若尚未创建）
node scripts/init-db.js skillgo

# 2. 初始化 schema（建表 + 迁移，若报 review_tier 错误需先执行）
npm run init-schema -- --db=skillgo

# 3. 导入技能
npm run seed-local -- --db=skillgo
```

将 `skills/` 下的技能直接写入数据库。可选 `--dry-run` 预览，或设置 `REPO_URL` 指定来源仓库。

## 6. CLI 测试

```bash
SKILLGO_API=http://skillgo.cn:3100 npx skillgo search 测试
```
