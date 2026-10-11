# AGENTS.md · 木作设计台 v5（mbs-studio）

> 给 AI 编码代理的项目说明书。**动手前先读这份**，比读源码快 10 倍。

## 这是什么

长沙「十一哥」木作深化业务的自用工作台。管 7 类实体：客户项目、任务、现场记录、
电器台账、自检清单、会议纪要、资料。核心差异化能力是**内置 22,904 型号的家电官方
尺寸资料库**——录电器时填型号即自动带出官方宽深高 / 开孔净空 / 说明书直链。

**这是 v5，跑在 7891 端口。旧版 v4（`F:\木作设计台`，单文件 HTML）跑在 7890，仍可用，
但不再开发。** 两版并存，数据已从 v4 迁入 v5。

## 启动

```bash
npm start          # 启动服务（tsx 直跑 TS，无需编译）
npm run build      # 构建前端 → web/dist（服务启动时自动托管）
npm run migrate    # 从 v4 的 data/db.json 迁移数据（幂等，可重复跑）
npm run typecheck  # tsc --noEmit
npx tsx server/catalog.test.mts   # 资料库尺寸解析器真值测试（21 例）
npx tsx server/catalog.stats.mts  # 资料库覆盖度报表（型号/尺寸/开孔/资料 按品牌）
```

Windows 上双击 `启动.bat` 即可（自带 Node 路径兜底）。

## 技术栈（2026-10 实测版本，勿凭记忆改）

| 层 | 选型 | 版本 |
|---|---|---|
| 前端 | React + Vite(Rolldown) + Tailwind | 19.3 / 8.3.4 / 4.3.3 |
| 后端 | Hono + @hono/node-server | 4.13.13 |
| 数据 | better-sqlite3 + Drizzle ORM | 13.0.3 / 0.45.3 |
| AI 层 | @modelcontextprotocol/server + /hono | MCP 2026-07-28 spec |
| 校验 | Zod v4 | 4.4.1 |

## 目录

```
server/
  index.ts            服务入口：REST(/api) + MCP(/mcp) + 前端静态托管，端口 7891
  catalog.ts          ★ 家电资料库集成层（多源归并 / 搜索 / 型号匹配 / 尺寸串解析 / 覆盖层）
  catalog.test.mts    ★ 尺寸解析器真值测试——改 catalog.ts 后必跑
  catalog.stats.mts   覆盖度报表（按品牌出 型号/尺寸/开孔/资料 四列）
  db/
    schema.ts         Drizzle 表定义（clients/tasks/siteRecords/meetings/
                      appliances/checks/files/followUps）
    index.ts          连接 + WAL + 原子写 + 启动备份
    migrate-from-v4.ts  从 F:\木作设计台\data\db.json 迁移（自动跳过示例假数据）
  routes/api.ts       全部 REST 端点（约 35 个）
  mcp/server.ts       MCP 工具定义（15 个工具）
web/
  vite.config.ts      root=web, proxy /api 与 /mcp 到 7891
  src/api.ts          前端 API 客户端 + 与后端对齐的类型
  src/App.tsx         外壳 + 侧栏 + 首页看板
  src/pages/Clients.tsx   客户列表 + 6 tab 详情抽屉（概览/任务/电器/自检/会议/资料）
  src/pages/Catalog.tsx   电器资料库检索页
data/
  woodwork.db         SQLite 主库（WAL）
  files/              上传文件落盘处
  backups/            启动自动备份
```

## 资料库数据源（三个，全部只读）

| 源 | 路径 | 规模 |
|---|---|---|
| 主库 | `D:\...\家电资料库\_总索引\_all.json` | 22,437 型号 / 12 品牌 |
| 方太 | `D:\...\方太资料库_大陆版\方太大陆型号数据.json` | 467 型号（独立目录，结构不同，本层归一） |
| 尺寸覆盖层 | 各品牌 `_data/_haier_dims.jsonl`、`_data/_dims_local.jsonl` | 补齐上游丢掉的尺寸 |

**三份都不写回。** 本层只在内存中归一并补全。

### 尺寸为什么缺，以及怎么补（重要）

上游抓取有两类先天缺陷，都会让 `_all.json` 的 w/d/h 列空着：

1. **JSON-LD 把键名里的方向标注吞了。** 官网原文是
   `产品尺寸(宽*高*深)mm = 905*1850*617`，抓下来变成 `产品尺寸 = 905*1850*617`
   → 顺序无从判断。海尔 13,144 条里 12,753 条是这么丢的。
   补法：`_工具箱/haier_dims.js` 重抓官网「规格参数」表的键+值 → `_haier_dims.jsonl`。
2. **同一条尺寸被拆成三个单轴键。** 如美的
   `室外机外形尺寸(宽)(单位：mm)=765` / `(高)=555` / `(深)=303`。
   补法：`_工具箱/build_dims_overlay.js` 按前缀把 宽/深/高 三条合并成 `(宽*深*高)` 一条。
   该脚本还能直接吃本地 jsonl 里带方向标注的键（卡萨帝 765 条就是这么救的），**不联网**。

⚠️ **方向是逐条目不同的。** 同一品牌同时存在 `(宽*高*深)` 与 `(宽*深*高)`，
甚至同型号不同页面写法不同。**任何「按品牌套一个固定顺序」的做法都是错的**，
会静默写错成千上万条。只能逐条按显式标签读。

## MCP 通道（「用最先进模型持续开发」的关键）

`POST http://127.0.0.1:7891/mcp`，Streamable HTTP，无需鉴权（仅监听 127.0.0.1）。
15 个工具：`dashboard` `list_clients` `get_client` `create_client` `update_client`
`create_task` `complete_task` `search_appliance_catalog` `lookup_model` `add_appliance`
`get_checklist` `set_check_item` `add_meeting` `generate_handover_report` `catalog_stats`

任何支持 MCP 的客户端（WorkBuddy / Claude Desktop / Codex）挂上这个端点，
就能直接读写工作台数据、查资料库。**新增功能时优先暴露 MCP 工具**，
这样后续模型才有办法操作它。

握手要点：`Accept: application/json, text/event-stream`；先 `initialize` 拿
`mcp-session-id` 响应头，再发 `notifications/initialized`，之后才能 `tools/call`。

## 业务红线（必须遵守）

1. **数据来源分级**：绿=官方原值 / 金=我方推导 / 蓝=现场经验。UI 里已按此配色。
2. **尺寸宁可空，不可错**。顺序不明确就只展示原始串，**绝不**按"大部分家电是宽深高"去猜。
   涉及 `catalog.ts` 的 `parseLabeledSize()`——已内置四道否决：
   包装/纸箱尺寸、区间值、数字个数≠3、超 20~3000mm 范围。
3. **不改上游原始数据**。`D:\2026李十一\BaiduSyncdisk\家电资料库\_总索引\_all.json`
   是只读数据源，v5 只在加载时于内存中补全，**不写回**。
4. **视觉约定**：黑金风。`--bg:#0e0f11` `--gold:#c8a971` `--ink:#e8e6e3`，
   面板 `#16181b`，边框 `#2a2e33`。改 UI 请沿用。

## 改代码时的注意事项

- **ESM**：`package.json` 有 `"type": "module"`。服务端 import 必须写 `.js`
  后缀（如 `from './catalog.js'`），即使源文件是 `.ts`。
- **Tailwind v4**：`@apply` **不能**引用自定义类（如 `.btn`）。要么展开，
  要么用 `@utility`。
- **Vite 根目录**在 `web/`，必须用 `npm run build`（已带 `--config`），
  直接 `npx vite build` 会因找不到 index.html 失败。
- **改完必跑**：`npm run typecheck` → `npx tsx server/catalog.test.mts`
  → `npm run build`，三者全绿再重启服务。

## 已知未完成（按优先级）

1. **仍有约 10,000 条没有本体尺寸**，分三类，处理方式不同：
   - **可救但没抓**：美的 1,485 条原始 jsonl 里连尺寸键都没有（抓取时就没拿到）——需要重抓美的官网。
   - **键名无方向**：如「外形尺寸 = 940*560*870」，官网自己就没标方向。
     按红线**不许猜**，只能展示原始串。除非回官网页面找带标注的图/表。
   - **非木作相关**：电视「屏幕尺寸 75英寸」等，本就无三维。
2. **老板的开孔数据在安装图 PDF 里，未提取到 `cut` 字段**（当前仅 146 条有 cut）。
   417 份安装图 PDF 已入库，需要解析才能补上。同理卡萨帝有 52 条「挖孔尺寸(长*宽)mm」
   也没进 `cut`。**开孔是木作最关键的字段，值得优先做。**
3. `data/woodwork.db` 里有 v4 迁移来的示例数据（`ex_*` 前缀，含 `pan.example.com` 假链接）。
   迁移脚本已跳过假链接，但范例客户「黄美女」被保留了——**删除前须问用户**。
4. 覆盖层是「补丁」而非「正解」。彻底方案是修上游 `haier.js` 等抓取脚本，
   让它们直接存带方向的键名，再重跑 `export.js` 重生成 `_all.json` 和独立索引页。
   当前覆盖层方案的好处是**零改动上游、即时生效**。
