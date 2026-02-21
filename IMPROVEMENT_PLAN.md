# SkillCN 改进计划

> 文档版本：v1.0
> 生成日期：2026-02-21
> 基于代码版本：skillcn v1.0.0

---

## 一、项目现状总结

### 已完成的核心功能

| 模块 | 状态 | 说明 |
|------|------|------|
| 技能提交（GitHub/Gitee/GitLab 自动导入 SKILL.md）| ✅ | `POST /api/skills/import` |
| 人工审核工作流（pending → published/rejected）| ✅ | `PATCH /api/skills/:id/status` |
| MCP 技能发现接口 | ✅ | `GET /mcp/skills` |
| 技能执行引擎（Python/Node/Bash/HTTP）| ✅ | `POST /v1/skills/:slug/versions/:ver/run` |
| 独立执行器服务（Runner，不依赖 MySQL）| ✅ | `runner/index.js` 端口 3200 |
| 版本管理（slug + version 唯一键）| ✅ | |
| 路径穿越保护 | ✅ | `resolveEntrypoint` 边界检查 |
| 分类筛选 + 关键词搜索 | ✅ | |
| Docker 部署 | ✅ | MySQL + App + Executor |
| 前端 Vue 3 UI | ✅ | Home/Submit/Detail/Admin/MCP 五个页面 |

### 当前架构

```
[Vue 3 前端]
     │
     ▼
[技能服务 :3100]  ←─── MySQL (skills 表)
     │
     ├── /api/skills/*          技能 CRUD + 审核
     ├── /mcp/skills            MCP 发现接口
     └── /v1/skills/:slug/run   直接执行（克隆仓库 + 在宿主执行）

[执行器服务 :3200]
     │
     └── /run  ←── 从 MCP 拉取元数据 → 克隆仓库 → 宿主执行
```

---

## 二、问题清单

### 🔴 P0 — 安全漏洞（上线前必须修复）

#### S1：执行沙箱缺失（最严重）
- **问题**：`/v1/skills/:slug/versions/:ver/run` 和 `runner /run` 直接在宿主机执行脚本
- **风险**：恶意技能可读取 `.env`、执行 `rm -rf /`、反弹 Shell、窃取 API Key
- **影响范围**：`server/index.js` 第 636-792 行，`runner/index.js` 第 199-304 行

#### S2：管理员认证过弱
- **问题**：单一静态字符串 key（默认值 `admin`），存 `localStorage`，明文 HTTP Header 传输
- **影响范围**：`server/index.js` 第 26、50-56 行，`web/src/pages/Admin.vue`

#### S3：无速率限制
- **问题**：提交接口、执行接口、导入接口均无频率限制
- **风险**：被用于 DDoS、批量爬 GitHub API（耗尽 GITHUB_TOKEN 配额）

#### S4：无 CSRF/CORS 防护
- **问题**：`app.use(cors())` 无任何限制，接受所有来源请求

### 🟠 P1 — 功能缺失（影响平台定位）

| ID | 问题 | 影响 |
|----|------|------|
| F1 | 无用户账号系统 | 无法追踪提交者，无法建信誉体系 |
| F2 | 无安装量/浏览量统计 | 用户不知道哪些技能受欢迎 |
| F3 | 无举报/拉黑机制 | 恶意技能审核通过后无法被社区纠正 |
| F4 | 无审计日志 | 不知道谁审核了什么、什么时候 |
| F5 | 无技能更新通知 | 提交者不知道审核结果 |
| F6 | 首页无分页（pageSize 硬限 50）| 技能多时性能差、体验差 |
| F7 | 无标签/关键词系统 | 只有 category，搜索颗粒度太粗 |
| F8 | 无评分/评论 | 无法做质量排行 |

### 🟡 P2 — 代码质量问题

| ID | 问题 | 影响范围 |
|----|------|---------|
| C1 | 大量重复代码 | `server/index.js` 与 `runner/index.js` 约 150 行完全重复 |
| C2 | 错误被静默吞掉 | `asyncHandler` 的 `.catch(() => res.status(500))` 不打印错误 |
| C3 | 无结构化日志 | 出问题无法排查 |
| C4 | 无输入验证库 | 依赖手动 if 检查，容易遗漏 |
| C5 | 无测试 | 没有任何单元或集成测试 |
| C6 | README 有过时说明 | "当前执行接口为占位实现" 实际已实现 |

### 🟡 P3 — 基础设施问题

| ID | 问题 |
|----|------|
| I1 | docker-compose 密码是 `root` |
| I2 | 无 `.env.example` 文件 |
| I3 | MySQL 服务无 healthcheck，app 可能连接失败 |
| I4 | 无反向代理（Nginx），前端 build 产物无法直接服务 |
| I5 | 无 HTTPS 配置 |



---

## 三、分阶段任务列表

### 阶段一：安全加固（最高优先级，上线前必须完成）

#### TASK-S1：执行沙箱隔离

**目标**：所有技能执行在独立 Docker 容器中运行，执行完毕后销毁容器，杜绝宿主机被攻击。

**实现方案**：
```
用户调用 /run
    │
    ▼
Runner 服务
    ├── 把 input.json/context.json 写入宿主临时目录（只读挂载进容器）
    ├── 启动一次性 Docker 容器：
    │     docker run --rm \
    │       --network none \          # 完全禁止网络访问（按需开启白名单）
    │       --memory 256m \           # 内存限制
    │       --cpus 0.5 \              # CPU 限制
    │       --read-only \             # 只读根文件系统
    │       -v /tmp/skill-xxx:/workspace:ro \   # 只读挂载代码
    │       -v /tmp/skill-xxx-io:/io \          # 读写挂载 IO 目录
    │       python:3.11-slim python /workspace/main.py
    ├── 等待容器退出（超时则 docker kill）
    └── 读取 /io/output.json 返回结果
```

**需要修改的文件**：
- `runner/index.js`：`executeLocalSkill` 函数替换为 `dockerRun` 实现
- `server/index.js`：同样替换执行逻辑
- `docker-compose.yml`：Runner 容器需挂载 Docker socket（`/var/run/docker.sock`）

**新增环境变量**：
```
SANDBOX_ENABLED=true             # false 时回退宿主执行（仅开发用）
SANDBOX_MEMORY=256m
SANDBOX_CPUS=0.5
SANDBOX_NETWORK=none
SANDBOX_IMAGE_python=python:3.11-slim
SANDBOX_IMAGE_node=node:20-slim
SANDBOX_IMAGE_bash=bash:5
```

**工作量**：中（2-3天）

---

#### TASK-S2：管理员认证改用 JWT

**目标**：替换静态 key，支持 Token 过期和多管理员账号。

**数据库变更**：新增 `admins` 表（见第五节）

**新增 API**：
```
POST /api/admin/login    { username, password } → { token, expiresAt }
POST /api/admin/logout   Authorization: Bearer <token>
GET  /api/admin/me       Authorization: Bearer <token>
```

**服务端中间件**（替换现有 `requireAdmin`）：
```javascript
const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ message: '未登录' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ message: 'Token 无效或已过期' })
  }
}
```

**前端变更**：`AdminLogin.vue` 调用登录接口，token 存 `sessionStorage`；所有管理请求加 `Authorization` header。

**新增依赖**：`jsonwebtoken`、`bcryptjs`

**工作量**：小（1天）

---

#### TASK-S3：速率限制

**目标**：防止接口被滥用、防止耗尽 GitHub Token 配额。

**实现**（使用 `express-rate-limit`）：

```javascript
// 提交/导入：每 IP 每小时最多 20 次
const submitLimiter = rateLimit({ windowMs: 3600_000, max: 20 })
app.post('/api/skills', submitLimiter)
app.post('/api/skills/import', submitLimiter)

// 执行：每 IP 每分钟最多 10 次
const runLimiter = rateLimit({ windowMs: 60_000, max: 10 })
app.use('/v1/skills', runLimiter)
```

**新增依赖**：`express-rate-limit`

**工作量**：小（半天）

---

#### TASK-S4：CORS 收紧 + 安全 Headers

```javascript
// 收紧 CORS（生产环境只允许自己的域名）
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// 添加 helmet 安全头（防 XSS、点击劫持等）
app.use(helmet())
```

**新增依赖**：`helmet`

**工作量**：小（半天）

---

### 阶段二：功能完善（核心竞争力）

#### TASK-F1：用户账号系统

**目标**：支持用户注册/登录，绑定技能提交记录，建立信誉基础。

**数据库变更**：新增 `users` 表（见第五节）

**新增 API**：
```
POST /api/auth/register   { username, email, password }
POST /api/auth/login      { email, password } → { token }
GET  /api/users/:id       公开个人主页（头像、提交的技能列表）
```

**技能表变更**：新增 `submitter_id` 外键关联 `users.id`

**前端新增页面**：
- `Register.vue`：注册页
- `Login.vue`：用户登录
- `UserProfile.vue`：个人主页（展示该用户提交的技能）

**工作量**：中（3天）

---

#### TASK-F2：安装量 / 浏览量统计

**目标**：记录每个技能的调用次数和访问次数，支持按热度排序。

**数据库变更**：`skills` 表新增 `install_count INT DEFAULT 0`、`view_count INT DEFAULT 0`

**实现方案**：
```javascript
// 每次 /run 调用成功后计数（异步，不阻塞响应）
pool.query('UPDATE skills SET install_count = install_count + 1 WHERE id = ?', [row.id]).catch(() => {})

// 每次 GET /api/skills/:id 时计数
pool.query('UPDATE skills SET view_count = view_count + 1 WHERE id = ?', [id]).catch(() => {})
```

**搜索接口新增排序参数**：`GET /api/skills?sort=popular`（按 install_count 降序）

**工作量**：小（半天）

---

#### TASK-F3：举报机制

**目标**：允许用户举报恶意/不合规技能，累计举报达阈值后自动下架至待复审。

**数据库变更**：新增 `skill_reports` 表（见第五节）

**新增 API**：
```
POST /api/skills/:id/report   { reason: 'malicious|spam|duplicate|other', detail }
GET  /api/admin/reports        管理员查看举报列表（需 JWT）
POST /api/admin/reports/:id/dismiss   驳回举报
```

**自动下架逻辑**：
```javascript
// 举报写入后检查总数
const [countRows] = await pool.query(
  'SELECT COUNT(*) as cnt FROM skill_reports WHERE skill_id = ? AND status = "open"',
  [skillId]
)
if (countRows[0].cnt >= (process.env.REPORT_AUTO_HIDE_THRESHOLD || 3)) {
  await pool.query("UPDATE skills SET status = 'pending' WHERE id = ?", [skillId])
}
```

**工作量**：中（1.5天）

---

#### TASK-F4：审计日志

**目标**：记录所有管理员操作，可溯源。

**数据库变更**：新增 `audit_logs` 表（见第五节）

**实现**：在 `requireAdmin` 中间件之后，所有写操作完成时插入日志：
```javascript
await pool.query(
  'INSERT INTO audit_logs (admin_id, action, target_type, target_id, detail, created_at) VALUES (?,?,?,?,?,now())',
  [req.admin.id, 'update_status', 'skill', id, JSON.stringify({ from: oldStatus, to: status })]
)
```

**工作量**：小（半天）

---

#### TASK-F5：技能更新通知

**目标**：技能被审核（通过/拒绝）时，发送 Email 通知提交者。

**实现方案**：使用 Nodemailer，审核状态变更时异步发送。

**新增环境变量**：
```
SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USER=noreply@skillcn.com
SMTP_PASS=xxx
NOTIFY_ENABLED=true
```

**工作量**：小（1天）

---

#### TASK-F6：前端分页完善

**目标**：首页列表支持分页导航，替换当前无分页状态。

**API 已支持**：`GET /api/skills?page=1&pageSize=12` 返回 `{ items, total, page, pageSize }`

**前端变更**：`Home.vue` 新增分页组件，响应 `total` 字段渲染页码。

**工作量**：小（半天）

---

#### TASK-F7：标签系统

**目标**：每个技能支持多个自由标签，搜索时可按标签过滤。

**数据库变更**：新增 `skill_tags` 关联表（见第五节）

**API 变更**：
```
提交时 body 增加 tags: ['股票', 'akshare', 'python']
GET /api/skills?tag=股票   按标签筛选
GET /api/tags/popular      热门标签列表
```

**工作量**：中（1天）



---

### 阶段三：差异化竞争力

#### TASK-D1：中文技能生态起步包

**目标**：内置一批面向中国开发者的高质量技能，成为差异化核心。

**建议首批技能（自行开发并收录）**：

| 技能 slug | 描述 | 依赖 |
|-----------|------|------|
| `akshare-stock-basic` | 获取 A 股基础信息（akshare）| Python |
| `akshare-kline` | 获取 K 线数据 | Python |
| `akshare-news` | 获取股票最新新闻 | Python |
| `tushare-financials` | 获取财务数据（tushare）| Python |
| `gaode-geocode` | 高德地图地理编码 | Python/HTTP |
| `baidu-ocr` | 百度 OCR 文字识别 | Python/HTTP |
| `wecom-webhook` | 企业微信 Webhook 消息推送 | HTTP |
| `dingtalk-webhook` | 钉钉机器人消息推送 | HTTP |

**工作量**：持续（每周 1-2 个技能）

---

#### TASK-D2：在线试用（Playground）

**目标**：用户在技能详情页直接填写参数，点击运行查看结果，无需安装任何工具。

**前端变更**：`SkillDetail.vue` 新增 JSON 输入框 + 运行按钮 + 结果展示区

**实现方案**：
- 前端直接调用 `POST /v1/skills/:slug/versions/:ver/run`
- 若执行需要沙箱，可限制 Playground 只支持 HTTP 类型技能（无沙箱风险）

**工作量**：中（2天）

---

#### TASK-D3：CLI 工具（skillcn-cli）

**目标**：提供类似 `clawhub install` 的命令行工具，让用户一键安装技能到本地 OpenClaw workspace。

**基本命令**：
```
skillcn search <keyword>         搜索技能
skillcn install <slug>           下载 SKILL.md 到当前目录或 workspace
skillcn install <slug>@<version> 指定版本安装
skillcn list                     列出已安装技能
skillcn update --all             更新所有已安装技能
```

**实现**：Node.js CLI，发布到 npm（`npm i -g skillcn-cli`）

**工作量**：大（3-4天）

---

#### TASK-D4：GitHub Action 自动收录

**目标**：提供 GitHub Action，让任何仓库只需添加 Action 配置，即可在 push 时自动把新版本同步到 SkillCN。

```yaml
# .github/workflows/publish-skill.yml
- name: Publish to SkillCN
  uses: skillcn/publish-action@v1
  with:
    api_url: https://skillcn.com
    api_token: ${{ secrets.SKILLCN_TOKEN }}
    skill_path: skills/my-skill
```

**工作量**：中（2天）

---

## 四、代码重构任务

#### TASK-C1：抽取共享执行模块

**目标**：消除 `server/index.js` 和 `runner/index.js` 之间约 150 行重复代码。

**新建文件**：`lib/executor.js`

**迁移函数**：
- `detectEntrypoint`
- `resolveEntrypoint`
- `createTempDir`
- `removeDir`
- `fileExists`
- `readJsonIfExists`
- `normalizeRuntime`
- `parseSkillMarkdown`（合并两个版本）
- `executeLocalSkill`（核心执行逻辑）

**工作量**：小（1天）

---

#### TASK-C2：错误日志改进

**目标**：所有未捕获错误记录到日志，生产环境不暴露堆栈给用户。

**实现**：
```javascript
// 替换现有 asyncHandler
const asyncHandler = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((err) => {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.path}`, err)
    res.status(500).json({
      message: process.env.NODE_ENV === 'development' ? err.message : '服务器错误'
    })
  })
```

**工作量**：小（半天）

---

#### TASK-C3：输入验证统一化

**目标**：使用 Zod 或 Joi 对所有请求体做结构化验证，替换散落的手动 if 检查。

**示例**（使用 Zod）：
```javascript
import { z } from 'zod'

const SubmitSkillSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  category: z.string().min(1).max(50),
  content: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/).optional().default('1.0.0'),
  tags: z.array(z.string()).max(10).optional().default([])
})
```

**工作量**：小（1天）

---

## 五、数据库 Schema 变更

### 新增表

```sql
-- 管理员账号（替换静态 ADMIN_KEY）
CREATE TABLE admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,   -- bcrypt hash
  created_at DATETIME NOT NULL,
  last_login_at DATETIME
);

-- 普通用户
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(1024),
  bio VARCHAR(500),
  status VARCHAR(32) NOT NULL DEFAULT 'active',  -- active / banned
  created_at DATETIME NOT NULL,
  last_login_at DATETIME
);

-- 举报记录
CREATE TABLE skill_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  skill_id INT NOT NULL,
  reporter_id INT,                               -- NULL 表示匿名举报
  reason VARCHAR(32) NOT NULL,                   -- malicious / spam / duplicate / other
  detail TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'open',   -- open / dismissed / resolved
  created_at DATETIME NOT NULL,
  resolved_at DATETIME,
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (reporter_id) REFERENCES users(id)
);

-- 审计日志
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_id INT NOT NULL,
  action VARCHAR(64) NOT NULL,                   -- update_status / delete / dismiss_report
  target_type VARCHAR(32) NOT NULL,              -- skill / report / user
  target_id INT NOT NULL,
  detail JSON,
  created_at DATETIME NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id)
);

-- 标签
CREATE TABLE tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE,
  use_count INT NOT NULL DEFAULT 0
);

-- 技能-标签关联
CREATE TABLE skill_tags (
  skill_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (skill_id, tag_id),
  FOREIGN KEY (skill_id) REFERENCES skills(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);
```

### skills 表新增字段

```sql
ALTER TABLE skills
  ADD COLUMN submitter_id INT,                           -- 关联 users.id
  ADD COLUMN install_count INT NOT NULL DEFAULT 0,
  ADD COLUMN view_count INT NOT NULL DEFAULT 0,
  ADD COLUMN review_note VARCHAR(500),                   -- 审核备注
  ADD FOREIGN KEY (submitter_id) REFERENCES users(id);
```



---

## 六、API 接口变更汇总

### 新增接口

| 方法 | 路径 | 说明 | 鉴权 |
|------|------|------|------|
| POST | `/api/admin/login` | 管理员登录 | 无 |
| POST | `/api/admin/logout` | 管理员登出 | JWT |
| GET | `/api/admin/me` | 当前管理员信息 | JWT |
| GET | `/api/admin/reports` | 举报列表 | JWT |
| POST | `/api/admin/reports/:id/dismiss` | 驳回举报 | JWT |
| POST | `/api/auth/register` | 用户注册 | 无 |
| POST | `/api/auth/login` | 用户登录 | 无 |
| GET | `/api/users/:id` | 用户公开主页 | 无 |
| POST | `/api/skills/:id/report` | 举报技能 | 可选登录 |
| GET | `/api/tags/popular` | 热门标签 | 无 |

### 现有接口变更

| 接口 | 变更内容 |
|------|---------|
| `GET /api/skills` | 新增 `sort=popular` 参数；新增 `tag=xxx` 参数 |
| `POST /api/skills` | 新增 `tags` 字段；新增 `submitter_id`（从 JWT 读取） |
| `POST /api/skills/import` | 新增速率限制（每 IP 每小时 20 次） |
| `PATCH /api/skills/:id/status` | 鉴权改为 JWT；新增 `reviewNote` 字段；写审计日志 |
| `GET /api/skills/:id` | 响应新增 `install_count`、`view_count`、`tags` 字段；触发 view_count 计数 |
| `POST /v1/skills/:slug/versions/:ver/run` | 新增速率限制；执行改为沙箱模式；成功后计 install_count |

---

## 七、基础设施改进

#### TASK-I1：docker-compose 安全加固

```yaml
# docker-compose.yml 改进版
services:
  mysql:
    image: mysql:8.4
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: ${MYSQL_DATABASE:-skillcn}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}   # 改为从 .env 读取，不再硬编码
    healthcheck:                                      # 新增健康检查
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    build: .
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy          # 等待 MySQL 健康后再启动
    environment:
      JWT_SECRET: ${JWT_SECRET}             # 新增
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS:-http://localhost:5173}

  executor:
    build: .
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # 沙箱执行需要
      - /tmp:/tmp
    environment:
      SANDBOX_ENABLED: ${SANDBOX_ENABLED:-true}
```

#### TASK-I2：补充 .env.example

新建 `.env.example` 文件，列出所有必填和可选环境变量（见下一节）。

#### TASK-I3：Nginx 反向代理配置

新增 `nginx/` 目录，配置前端静态文件服务 + API 反向代理：

```nginx
server {
  listen 80;

  location /api/ {
    proxy_pass http://app:3100;
  }

  location /v1/ {
    proxy_pass http://app:3100;
  }

  location /mcp/ {
    proxy_pass http://app:3100;
  }

  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }
}
```

---

## 八、.env.example 模板

新建 `skillcn/.env.example`：

```bash
# === 数据库 ===
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=               # 必填，生产环境请使用强密码
MYSQL_DATABASE=skillcn

# === 服务端口 ===
PORT=3100
RUNNER_PORT=3200

# === 安全 ===
JWT_SECRET=                   # 必填，至少 32 位随机字符串
ALLOWED_ORIGINS=http://localhost:5173

# === GitHub/Gitee/GitLab Token（用于导入技能仓库，建议设置避免 API 限流）===
GITHUB_TOKEN=
GITEE_TOKEN=
GITLAB_TOKEN=

# === 执行沙箱 ===
SANDBOX_ENABLED=true
SANDBOX_MEMORY=256m
SANDBOX_CPUS=0.5
SANDBOX_NETWORK=none
SANDBOX_IMAGE_python=python:3.11-slim
SANDBOX_IMAGE_node=node:20-slim
SANDBOX_IMAGE_bash=bash:5

# === 速率限制 ===
REPORT_AUTO_HIDE_THRESHOLD=3  # 举报多少次自动下架

# === 邮件通知 ===
NOTIFY_ENABLED=false
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=

# === MCP 服务（Runner 用）===
MCP_BASE_URL=http://localhost:3100

# === 执行限制 ===
RUN_MAX_TIMEOUT_MS=30000
RUN_ALLOW_INSTALL=true
RUN_HTTP_ALLOWED_HOSTS=       # 留空表示不限制 HTTP 技能目标，逗号分隔
```

---

## 九、优先级汇总与工期估计

| 任务 ID | 任务名称 | 优先级 | 预计工期 | 依赖 |
|---------|---------|--------|---------|------|
| TASK-S1 | 执行沙箱隔离 | 🔴 P0 | 2-3天 | 无 |
| TASK-S2 | JWT 管理员认证 | 🔴 P0 | 1天 | 无 |
| TASK-S3 | 速率限制 | 🔴 P0 | 半天 | 无 |
| TASK-S4 | CORS + Helmet | 🔴 P0 | 半天 | 无 |
| TASK-C1 | 抽取共享执行模块 | 🟠 P1 | 1天 | TASK-S1 |
| TASK-C2 | 错误日志改进 | 🟠 P1 | 半天 | 无 |
| TASK-I1 | docker-compose 加固 | 🟠 P1 | 半天 | 无 |
| TASK-I2 | .env.example | 🟠 P1 | 半天 | 无 |
| TASK-F2 | 安装量统计 | 🟠 P1 | 半天 | 无 |
| TASK-F6 | 前端分页 | 🟠 P1 | 半天 | 无 |
| TASK-F1 | 用户账号系统 | 🟡 P2 | 3天 | TASK-S2 |
| TASK-F3 | 举报机制 | 🟡 P2 | 1.5天 | TASK-F1 |
| TASK-F4 | 审计日志 | 🟡 P2 | 半天 | TASK-S2 |
| TASK-F5 | 邮件通知 | 🟡 P2 | 1天 | TASK-F1 |
| TASK-F7 | 标签系统 | 🟡 P2 | 1天 | 无 |
| TASK-C3 | 输入验证统一化 | 🟡 P2 | 1天 | 无 |
| TASK-I3 | Nginx 配置 | 🟡 P2 | 半天 | 无 |
| TASK-D1 | 中文技能起步包 | 🟢 P3 | 持续 | TASK-S1 |
| TASK-D2 | 在线 Playground | 🟢 P3 | 2天 | TASK-S1 |
| TASK-D3 | CLI 工具 | 🟢 P3 | 3-4天 | 无 |
| TASK-D4 | GitHub Action | 🟢 P3 | 2天 | 无 |

**阶段一合计**（上线前必完成）：约 **5天**
**阶段二合计**（核心功能完善）：约 **9天**
**阶段三合计**（差异化功能）：约 **8天+持续运营**

---

*本文档由 Augment AI 根据 SkillCN v1.0.0 代码分析生成，2026-02-21*
