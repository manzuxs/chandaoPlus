# chandaoPlus

浏览器端 AI 分析助手 —— Chrome 扩展捕获网页内容（特别是禅道 Bug 页面），通过本地网关将上下文发送给 AI Agent（Claude Code / Codex CLI / OpenCode），在侧边栏内实时流式获取评估、修复建议等分析结果。

## 前置要求

- **Node.js** 20+
- **pnpm** 9+
- **`claude`** / **`codex`** / **`opencode`** 至少一个已在 PATH 中可用
- **Chrome** 或 Chromium 浏览器，已开启开发者模式

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动网关（热重载）
pnpm dev:gateway

# 3. 构建扩展（watch 模式）
pnpm dev:extension

# 4. 在 Chrome 中加载扩展
#    打开 chrome://extensions → 开启"开发者模式" → "加载已解压的扩展程序"
#    选择 apps/extension/dist 目录
```

加载后，点击浏览器工具栏中的扩展图标打开侧边栏，添加工作空间（指向你的项目根目录），即可开始使用。

### 一次性构建（非开发模式）

```bash
pnpm -r build          # 构建所有包
pnpm -r typecheck      # 类型检查
pnpm -r test           # 运行所有测试
```

## 核心架构

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome 扩展 (MV3)                      │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │ Content   │  │Background│  │  Sidepanel (React) │    │
│  │ Script    │◄─┤ Worker   │◄─┤                    │    │
│  │           │  │          │  │  - Agent/模型选择    │    │
│  │ HTML→MD   │  │ 消息转发  │  │  - 技能系统        │    │
│  │ 图片Base64│  │          │  │  - 会话历史         │    │
│  │ 禅道Recipe│  │          │  │  - SSE 流式渲染     │    │
│  └──────────┘  └──────────┘  └────────┬───────────┘    │
│                                        │                │
└────────────────────────────────────────┼────────────────┘
                                         │ HTTP POST
                                         │ SSE Stream
                                         ▼
┌─────────────────────────────────────────────────────────┐
│                   Gateway (Express :3210)                 │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Workspace    │  │ Session      │  │ Agent        │  │
│  │ Store        │  │ Store        │  │ Registry     │  │
│  │ (JSON 文件)  │  │ (JSON 文件)  │  │              │  │
│  └──────────────┘  └──────────────┘  │ Claude Code  │  │
│                                       │ Codex CLI    │  │
│  ┌──────────────┐  ┌──────────────┐  │ OpenCode     │  │
│  │ Skill Store  │  │ Context      │  └──────┬───────┘  │
│  │ (内置+自定义) │  │ Bundle Writer│         │          │
│  └──────────────┘  └──────────────┘         │          │
│                                              ▼          │
│                                    ┌─────────────────┐  │
│                                    │ 子进程 CLI       │  │
│                                    │ stdout/stderr   │  │
│                                    │ JSON 流式事件    │  │
│                                    └─────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 数据流：从捕获到分析

```
1. 用户点击扩展图标 → 侧边栏打开
2. 侧边栏发送 CAPTURE_ACTIVE_TAB → 后台 Worker
3. 后台 Worker 转发 CAPTURE_CURRENT_PAGE → 内容脚本
4. 内容脚本：
   a. 提取页面 HTML（移除导航/工具栏等噪声）
   b. extractPageCapture() → Turndown → Markdown
   c. hydrateImageAssets() → 图片 Base64 水合
   d. ZenTao Recipe 识别 → 提取 Bug ID、标题、状态等元数据
5. 侧边栏 POST /api/chat/stream → 网关
6. 网关：
   a. 写入 Context Bundle → <workspace>/.chandaoplus/sessions/<uuid>/
   b. 组装 Prompt → 含页面内容、会话上下文、技能指令
   c. 启动 AI CLI 子进程 → 管道写入 prompt
   d. 解析 CLI stdout JSON 流式事件 → SSE 推送至侧边栏
7. 侧边栏实时渲染 Markdown 响应
```

### 包职责

| 包 | 用途 |
|---|---|
| `apps/gateway` | Express 服务器，工作空间/会话/技能管理，Agent 调度，SSE 流式传输 |
| `apps/extension` | Chrome MV3 扩展：内容脚本（页面提取）、后台 Worker（消息路由）、React 侧边栏（UI） |
| `packages/shared` | Zod 合约定义、提示词模板、XML 格式化工具 |
| `packages/extractor` | HTML→Markdown 提取（Turndown）+ 图片 Base64 水合 |

### API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET/POST` | `/api/workspaces` | 列出/创建工作空间 |
| `PUT/DELETE` | `/api/workspaces/:id` | 更新/删除工作空间 |
| `GET/POST` | `/api/sessions` | 列出/创建会话 |
| `GET/DELETE` | `/api/sessions/:id` | 获取/删除会话 |
| `GET/POST/DELETE` | `/api/skills` | 技能 CRUD |
| `POST` | `/api/chat/stream` | 核心：发起 AI 分析，SSE 流式返回结果 |
| `GET` | `/api/chat/tasks/:taskId/stream` | 重连正在运行的任务流 |
| `POST` | `/api/chat/tasks/:taskId/stop` | 停止正在生成的任务 |
| `GET` | `/api/chat/models?agent=X` | 获取某 Agent 的可用模型列表 |

### Agent 支持

系统支持三种 AI Agent，可在侧边栏中切换：

| Agent | CLI 命令 | 特点 |
|---|---|---|
| **Claude Code** | `claude` | 支持 `--session-id` 会话续接，模型选择，权限模式 |
| **Codex CLI** | `codex exec` | 支持线程 ID 续接，动态模型列表 |
| **OpenCode** | `opencode` | 支持 `--session` 续接，JSON 流式输出 |

每个 Agent 可通过侧边栏配置：模型、思考强度（effort）、权限模式（ask/auto/full）。

### 共享记忆机制

系统通过 **SessionStore** + **Context Bundle** 两层实现跨轮次、跨 Agent 的共享记忆。

**SessionStore**（`apps/gateway/src/services/session-store.ts`）是会话数据的唯一持久化来源：

- 存储完整消息历史（user + assistant 消息），以 JSON 文件持久化到 `~/.chandaoplus/sessions.json`
- 记录每个 Agent 的原生会话标识符（`codexThreadId`、`opencodeSessionId`），用于 CLI 层会话续接
- 基于 Promise 队列的写入锁（`withLock`），防止并发写入导致数据损坏
- 支持按 workspace 维度查询会话列表

**Context Bundle**（`apps/gateway/src/services/context-bundle-writer.ts`）是 Agent 读取上下文的工作目录：

```
<workspace>/.chandaoplus/sessions/<uuid>/
├── page.md           # 当前页面的 Markdown 提取内容
├── metadata.json     # URL、标题、图片清单
├── conversation.md   # 由 SessionStore 消息历史生成的对话记录（窗口裁剪）
└── images/           # Base64 解码后的图片文件
```

关键设计点：

- `conversation.md` 由网关从 SessionStore 的消息历史生成，注入到 Agent 的 prompt 中，确保 **切换 Agent 时对话历史不丢失**
- 图片先 Base64 编码传输，再由网关解码为文件，Agent 可直接读取本地图片
- Context Bundle 的目录路径持久化到 SessionStore 的 `contextBundleDirs` 字段，删除会话时清理磁盘

### 跨 Agent 协作

系统通过统一的 `AgentAdapter` 接口和共享的 `conversation.md` 实现跨 Agent 协作。

```
AgentAdapter 接口
├── id: "claude-code" | "codex" | "opencode"
└── run(options) → Promise<void>
    ├── request: ChatRequest      # 用户请求（含 agent 类型、model、effort）
    ├── workspace: WorkspaceProfile
    ├── bundleDir: string         # Context Bundle 路径（共享）
    ├── skill?: Skill
    ├── onChunk: callback         # 统一的流式输出回调
    ├── sessionStore: SessionStore # 读写共享会话状态
    └── signal?: AbortSignal      # 统一的中断信号
```

**跨 Agent 切换流程：**

1. 用户在侧边栏切换 Agent（如 Claude Code → Codex）并发送新消息
2. 网关从 SessionStore 读取完整消息历史，生成 `conversation.md` 写入新的 Context Bundle
3. 新 Agent 通过 prompt 指令读取 `conversation.md` 获取完整上下文
4. 新 Agent 的原生会话 ID（如 Codex thread ID）写回 SessionStore，用于后续续接
5. 会话的 `agent`/`model`/`effort` 配置同步更新到 SessionStore

**不同 Agent 的会话续接方式：**

| Agent | 原生会话机制 | 存储位置 |
|---|---|---|
| Claude Code | `--session-id` / `--resume` | CLI 内部管理，SessionStore 复用 sessionId |
| Codex CLI | thread ID（`exec resume`） | `SessionStore.codexThreadId` |
| OpenCode | `--session <id>` | `SessionStore.opencodeSessionId` |

### 异步任务管理

Agent 分析是长时间运行的子进程任务，系统设计了一套完整的异步任务生命周期管理。

**任务模型**（`ChatTask`，内存中）：

```
ChatTask {
  id, sessionId, workspaceId
  events: []              # 事件缓冲（支持断线重连）
  observers: Set<SSE>     # 观察者模式（多客户端订阅同一任务）
  abortController         # 中断信号
  status: running | completed | error | stopped
  assistantContent        # 累积的助手回复（用于持久化）
  stopRequested: boolean
}
```

**SSE 流式传输：**

- 每个任务通过 `text/event-stream` 推送 6 种 chunk 类型：`meta` → `status` → `text` → `done`/`error`
- 15 秒心跳（SSE comment `:`）保持连接存活
- 事件带 `seq` 序列号，支持增量同步

**重连机制**（`GET /api/chat/tasks/:taskId/stream?from=N`）：

- 客户端断开后可通过 `taskId` 重新订阅同一个 SSE 流
- `from` 参数指定起始序列号，网关从 `events[from]` 开始回放已缓冲的事件
- 若任务已结束（status ≠ running），直接关闭连接并清理

**停止生成**（`POST /api/chat/tasks/:taskId/stop`）：

```
stop 请求 → stopRequested = true → abortController.abort()
  → Agent 子进程收到 SIGTERM → 进程退出
  → finishTask() 持久化已生成的 assistantContent（追加 "[已停止]"）
  → clearRunningTask() 清理 SessionStore 中的运行状态
```

**生命周期保证：**

- 用户消息在 Agent 启动**之前**即持久化到 SessionStore，即使 Agent 崩溃也不丢失
- `finishTask` 在 try/catch 中执行，确保无论成功/失败/停止都正确清理状态
- `clearRunningTaskByTaskId` 可按 taskId 全局清理，处理网关重启后的孤儿任务

### 多人协同

系统利用禅道 Bug 的**历史记录（评论）**作为团队信息共享载体，实现方案沉淀和接力协作。

**核心原理**：插件的内容脚本在捕获页面时，`buildHistorySection()` 会自动提取 Bug 的所有历史记录（评论、变更、操作日志），将其作为页面内容的一部分注入到 AI 上下文中。因此，任何人写在禅道 Bug 评论中的方案或分析结论，都会随页面被后续的用户"看到"。

**典型协同流程：**

```
开发经理                          开发人员
───────                          ──────
1. 打开 Bug 页面，用插件评估
2. AI 产出分析方案
3. 将方案复制到 Bug 评论中
   （禅道历史记录）        ──→    4. 打开同一 Bug 页面
                                 5. 插件捕获页面（含历史记录）
                                 6. AI 自动读到经理的方案
                                 7. 基于方案继续提问或编码：
                                    "按评论里的方案实现"
```

**实现机制**

- `buildHistorySection()`（`apps/extension/src/recipes/zendao-detail.ts`）解析禅道历史记录面板 —— 优先读取渲染好的 DOM，回退到 `zui-create-historypanel` 属性的 JSON 数据，提取所有评论（`comment`）、变更（`historyChanges`）和操作内容（`content`），按 ID 排序
- `buildFocusedHtml()` 将历史记录作为 `<section><h2>历史记录</h2>...</section>` 拼接到捕获的 HTML 中
- 后续任何人打开同一 Bug，内容脚本自动提取到完整历史，AI 无需额外配置即可获取前人留下的方案

**使用示例：**

1. 开发经理打开 Bug #1234 → 使用"评估"技能 → AI 输出修复方案
2. 经理将方案粘贴到禅道 Bug 的"添加备注"区域，保存为历史记录
3. 开发人员打开 Bug #1234 → 侧边栏点击"定位并修复问题" → AI 在 `page.md` 中读到经理的方案，回复："基于历史记录中的方案，建议按以下步骤实施..."
4. 开发人员继续提问 → 整个过程 AI 掌握完整上下文

**无需任何额外配置** — 只要团队使用禅道的评论/历史记录功能，插件就能自动打通知识流转。

## 使用方式

### 基础流程

1. **添加工作空间** — 侧边栏顶部选择器中，点击添加按钮，输入标签名和项目根目录路径
2. **打开禅道 Bug 页面** — 侧边栏会自动识别页面类型
3. **选择技能** — 点击技能按钮或输入 `/` 打开技能菜单
4. **发送分析** — 点击"评估工期与修复方案"等命令按钮，或直接输入自定义问题
5. **查看流式结果** — Agent 的输出实时显示在聊天线程中，支持 Markdown、表格、代码块

### 技能系统

技能是可复用的 AI 提示词模板，支持变量替换（如 `{{page.title}}`、`{{bundleDir}}`）：

- **内置技能**：评估（estimate）、修复（fix）、验收（review）—— 不可删除，可复制后自定义
- **自定义技能**：用户可创建、编辑、删除自己的技能，支持自定义图标和提示词模板

在输入框中输入 `/` 打开技能菜单，或通过技能管理器（设置面板）管理所有技能。

### 会话管理

- **会话历史** — 点击侧边栏标题区域打开历史抽屉，查看、切换、删除过往会话
- **会话续接** — 选择已有会话继续对话，Agent 会保留上下文
- **Bug ID 锁定** — 每个会话锁定到一个 Bug ID，防止跨 Bug 上下文混淆
- **停止生成** — 生成过程中可随时点击停止按钮，通过 AbortController 取消请求

## 开发指南

### 项目结构

```
apps/gateway/src/
├── index.ts              # 网关入口，初始化所有服务和路由
├── server.ts             # Express 应用创建与 CORS 配置
├── config.ts             # 环境变量配置
├── routes/
│   ├── chat.ts           # 核心聊天 SSE 路由
│   ├── sessions.ts       # 会话 CRUD 路由
│   ├── workspaces.ts     # 工作空间 CRUD 路由
│   └── skills.ts         # 技能 CRUD 路由
├── agents/
│   ├── types.ts          # AgentAdapter 接口 + buildPrompt
│   ├── index.ts          # AgentRegistry 注册中心
│   ├── claude-code.ts    # Claude Code 适配器
│   ├── codex.ts          # Codex CLI 适配器
│   └── opencode.ts       # OpenCode 适配器
└── services/
    ├── context-bundle-writer.ts  # 上下文包写入
    ├── session-store.ts          # 会话持久化
    ├── workspace-store.ts        # 工作空间持久化
    └── skill-store.ts            # 技能持久化

apps/extension/src/
├── background/index.ts   # Service Worker（消息路由）
├── content/index.ts      # 内容脚本（页面提取）
├── recipes/
│   ├── zendao-detail.ts  # 禅道 Bug 详情识别
│   └── zendao-list.ts    # 禅道列表批量收集
├── sidepanel/
│   ├── App.tsx           # 主应用组件
│   ├── main.tsx          # React 入口
│   └── hooks/
│       ├── useChatSession.ts     # 核心状态管理
│       └── useZentaoCommands.ts  # 禅道命令检测
├── components/           # UI 组件
├── lib/
│   ├── gateway-client.ts # 网关 HTTP 客户端
│   └── page-capture.ts   # 页面捕获消息
└── styles.css            # Figma 设计系统样式

packages/shared/src/
├── contracts.ts          # Zod schema 定义（所有 API 契约）
├── prompt-templates.ts   # 内置提示词模板
└── xml.ts                # XML 格式化工具

packages/extractor/src/
├── markdown.ts           # HTML→Markdown 核心提取 + 图片水合
└── index.ts              # 导出
```

### 测试

```bash
pnpm -r test                        # 运行所有测试
cd apps/extension && npx vitest run src/recipes/zendao-detail.test.ts  # 单个测试文件
```

测试框架：**Vitest** + **jsdom**（扩展侧测试）+ **@testing-library/react**（组件测试）

### 配置环境变量

Gateway 通过 dotenv 加载 `.env`（位于 `apps/gateway/`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3210` | 网关监听端口 |
| `CLAUDE_BIN` | `claude` | Claude CLI 路径 |
| `CLAUDE_ARGS` | — | Claude CLI 额外参数 |
| `CODEX_BIN` | `codex` | Codex CLI 路径 |
| `CODEX_ARGS` | — | Codex CLI 额外参数 |
| `OPENCODE_BIN` | `opencode` | OpenCode CLI 路径 |
| `OPENCODE_ARGS` | — | OpenCode CLI 额外参数 |
| `WORKSPACE_STORE_PATH` | `~/.chandaoplus/workspaces.json` | 工作空间数据文件 |

## 技术栈

- **前端**：React 18 + TypeScript + Vite + marked（Markdown 渲染）
- **后端**：Express + TypeScript + tsx（热重载）
- **验证**：Zod（共享合约 + API 校验）
- **提取**：Turndown（HTML→Markdown）
- **测试**：Vitest + jsdom + @testing-library/react
- **包管理**：pnpm workspaces（monorepo）
- **样式**：基于 Figma 设计系统的 CSS（Inter + JetBrains Mono 字体，暗色模式支持）

## 关键设计决策

1. **不可变数据流** — 所有状态更新创建新对象，不修改原始数据。侧边栏通过 `useChatSession` Hook 集中管理状态，避免副作用。
2. **Gateway 硬编码 `127.0.0.1:3210`** — 本地回环免 CORS，无需额外配置。
3. **Context Bundle** — 页面内容先写入磁盘（`<workspace>/.chandaoplus/sessions/<uuid>/`），Agent CLI 通过提示词指令读取文件，而非通过命令行参数传递大量内容。
4. **SSE 流式传输** — 使用 `text/event-stream` 实现实时响应，支持断开重连。
5. **会话级别的 Bug ID 锁定** — 防止在同一会话中切换不同 Bug 页面导致的上下文混乱。
6. **Recipe 模式** — 针对不同页面类型（禅道 Bug 详情/列表）的检测器，可扩展支持其他平台。
