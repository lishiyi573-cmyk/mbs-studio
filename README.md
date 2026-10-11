# 木作设计台 v5 · mbs-studio

木作深化交付管控工作台。取代旧版单文件 HTML 工作台（`F:\木作设计台`），
底座换成现代技术栈，并内置 **22,904 型号的家电官方尺寸资料库**（含方太 467）。

## 快速开始

```bash
npm install     # 首次
npm start       # → http://127.0.0.1:7891
```

Windows 直接双击 `启动.bat`。

## 能力

**业务台账**：客户项目 / 任务 / 现场记录 / 会议纪要（含跟进项）/ 自检清单 / 资料。
首页看板聚合未完任务、逾期预警、项目进度。

**电器台账 + 资料库打通**：录入电器时填型号，自动从内置资料库带出
官方宽×深×高、开孔/净空尺寸、官方页面与说明书直链，无需再翻官网。
资料库检索页支持按品牌（14 个）、关键词、是否含开孔筛选。

**尺寸可信度**：资料库里每个数值都标注来源。凡是官网串里没写明方向顺序的，
一律不还原、只展示官方原始串——**宁可空，不可错**。

**MCP 接口**：`POST /mcp`（Streamable HTTP）。15 个工具，让任何 AI 客户端
（WorkBuddy / Claude / Codex）直接读写工作台数据。这是为"后续用最先进模型
继续开发"预留的通道。

## 技术栈

React 19.3 · Vite 8.3（Rolldown）· Tailwind 4.3 · Hono 4.13 ·
SQLite（better-sqlite3 13 + Drizzle ORM 0.45）· MCP TypeScript SDK（2026-07-28 spec）
· Zod 4。单进程同时提供 REST API、MCP 端点与前端静态托管。

## 数据

- 主库：`data/woodwork.db`（SQLite，WAL 模式，启动自动备份到 `data/backups/`）
- 上传文件：`data/files/`
- 家电资料库（**全部只读**，不写回）：
  - `D:\2026李十一\BaiduSyncdisk\家电资料库\_总索引\_all.json`（主库）
  - `D:\2026李十一\BaiduSyncdisk\方太资料库_大陆版\方太大陆型号数据.json`（方太）
  - 各品牌 `_data/_haier_dims.jsonl`、`_data/_dims_local.jsonl`（尺寸覆盖层）

## 目录

见 `AGENTS.md`。

## 与旧版的关系

| | v4（旧） | v5（本版） |
|---|---|---|
| 位置 | `F:\木作设计台` | `F:\mbs-studio` |
| 端口 | 7890 | **7891** |
| 形态 | 单文件 HTML + 零依赖 Node | React 19 + Hono + SQLite |
| 存储 | `data/db.json` 整文件覆盖 | SQLite（WAL + 原子写 + 备份） |
| AI 接入 | 无 | **MCP 15 工具** |

两版可同时运行。数据迁移：`npm run migrate`（幂等）。
