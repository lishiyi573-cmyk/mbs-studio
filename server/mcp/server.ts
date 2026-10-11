// ============================================================
// MCP Server（Model Context Protocol v2 · Streamable HTTP）
// ------------------------------------------------------------
// 这是「让最先进的模型继续开发/操作这个工作台」的核心通道：
// 任何 MCP 客户端（WorkBuddy / Claude / GPT / Cursor…）连接
// http://127.0.0.1:7891/mcp 即可直接读写工作台全部业务数据，
// 并可查询 22,437 型号家电资料库（官方尺寸/开孔/说明书）。
//
// 无状态模式：每个 HTTP 请求新建 server 实例 + transport，
// 底层共享同一个 SQLite 连接，天然并发安全（WAL）。
// ============================================================
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db, schema, now, newId } from '../db/index.js';
import { searchCatalog, findByModel, brief, loadCatalog } from '../catalog.js';
import { CHECK_ITEMS } from '../routes/api.js';

const { clients, tasks, appliances, checks, meetings, followUps } = schema;

const json = (data: unknown) => ({ type: 'text' as const, text: JSON.stringify(data, null, 1) });

/** 注册全部工具到给定 McpServer 实例 */
export function registerTools(server: McpServer) {
  // ---------- 看板 ----------
  server.registerTool('dashboard',
    { description: '工作台看板：客户数、未完任务、逾期、今日到期、风险预警' },
    async () => {
      const t = new Date().toISOString().slice(0, 10);
      const cs = db.select().from(clients).all();
      const ts = db.select().from(tasks).all();
      const open = ts.filter(x => x.status !== '已完成');
      return { content: [json({
        clients: cs.length,
        openTasks: open.length,
        overdue: open.filter(x => x.due && x.due < t).map(x => ({ title: x.title, due: x.due, priority: x.priority })),
        dueToday: open.filter(x => x.due === t).map(x => x.title),
        clientList: cs.map(c => ({ id: c.id, name: c.name, phase: c.phase, progress: c.progress })),
      })] };
    });

  // ---------- 客户 ----------
  server.registerTool('list_clients', { description: '列出全部客户/项目' },
    async () => ({ content: [json(db.select().from(clients).all())] }));

  server.registerTool('get_client',
    {
      description: '查单个客户完整档案：任务/电器台账/自检/资料/会议',
      inputSchema: z.object({ clientId: z.string().describe('客户 id（见 list_clients）') }),
    },
    async ({ clientId }) => {
      const cl = db.select().from(clients).where(eq(clients.id, clientId)).get();
      if (!cl) return { content: [{ type: 'text', text: '客户不存在' }], isError: true };
      return { content: [json({
        client: cl,
        tasks: db.select().from(tasks).where(eq(tasks.clientId, clientId)).all(),
        appliances: db.select().from(appliances).where(eq(appliances.clientId, clientId)).all(),
        check: db.select().from(checks).where(eq(checks.clientId, clientId)).get(),
        meetings: db.select().from(meetings).where(eq(meetings.clientId, clientId)).all(),
      })] };
    });

  server.registerTool('create_client',
    {
      description: '新建客户/项目（录入业主姓名与楼盘地址）',
      inputSchema: z.object({
        name: z.string().describe('业主姓名'),
        address: z.string().optional().describe('楼盘+栋户，如 建发缦云3-1004'),
        phase: z.string().optional().describe('阶段：量尺/方案设计/深化设计/生产/安装/交付'),
        needs: z.string().optional().describe('需求概述'),
        note: z.string().optional().describe('备注'),
      }),
    },
    async (body) => {
      const row = { id: newId('cl'), progress: 0, ...body, createdAt: now(), updatedAt: now() };
      db.insert(clients).values(row).run();
      return { content: [json({ ok: true, client: row })] };
    });

  server.registerTool('update_client',
    {
      description: '更新客户阶段/进度/备注',
      inputSchema: z.object({
        clientId: z.string(),
        phase: z.string().optional(),
        progress: z.number().int().min(0).max(100).optional(),
        needs: z.string().optional(),
        note: z.string().optional(),
      }),
    },
    async ({ clientId, ...rest }) => {
      db.update(clients).set({ ...rest, updatedAt: now() }).where(eq(clients.id, clientId)).run();
      return { content: [json({ ok: true })] };
    });

  // ---------- 任务 ----------
  server.registerTool('create_task',
    {
      description: '给客户建任务（尺寸复核/跟进/下单/安装…）',
      inputSchema: z.object({
        clientId: z.string(),
        title: z.string().describe('任务标题，如「冰箱位尺寸复核」'),
        type: z.string().optional(),
        priority: z.enum(['P0', 'P1', 'P2']).optional().describe('默认 P1'),
        due: z.string().optional().describe('截止日 YYYY-MM-DD'),
        note: z.string().optional(),
      }),
    },
    async (body) => {
      const row = { id: newId('tk'), status: '待办' as const, ...body, createdAt: now(), updatedAt: now() };
      db.insert(tasks).values(row).run();
      return { content: [json({ ok: true, task: row })] };
    });

  server.registerTool('complete_task',
    {
      description: '完成任务',
      inputSchema: z.object({ taskId: z.string() }),
    },
    async ({ taskId }) => {
      db.update(tasks).set({ status: '已完成', updatedAt: now() }).where(eq(tasks.id, taskId)).run();
      return { content: [json({ ok: true })] };
    });

  // ---------- 家电资料库 ----------
  server.registerTool('search_appliance_catalog',
    {
      description: '搜家电资料库（22,437 型号 / 8 品牌集群，中国大陆官网官方参数）。按关键词搜型号/品名/品牌，可只看含开孔项。',
      inputSchema: z.object({
        q: z.string().describe('关键词：型号片段 / 品名 / 品牌'),
        brand: z.string().optional().describe('品牌过滤，如 海尔/西门子/博世/卡萨帝/美的/老板/利勃海尔/嘉格纳'),
        onlyCut: z.boolean().optional().describe('只看含开孔/嵌入尺寸的型号'),
        limit: z.number().int().min(1).max(50).optional().describe('默认 15'),
      }),
    },
    async ({ q, brand, onlyCut, limit }) => {
      const items = searchCatalog(q, { brand, onlyCut, limit: limit ?? 15 });
      return { content: [json({ total: items.length, items: items.map(brief) })] };
    });

  server.registerTool('lookup_model',
    {
      description: '按型号精确查官方数据：宽/深/高（mm）、开孔或净空、说明书直链。数据全部来自品牌中国大陆官网，零 AI 改写。',
      inputSchema: z.object({ model: z.string().describe('完整型号，如 BCD-603WGHFD2BW5U1') }),
    },
    async ({ model }) => {
      const hits = findByModel(model);
      if (!hits.length) return { content: [{ type: 'text', text: `家电资料库中未找到型号 ${model}` }], isError: true };
      return { content: [json({ found: hits.length, official: brief(hits[0]), sameModelOthers: hits.slice(1).map(brief) })] };
    });

  server.registerTool('add_appliance',
    {
      description: '给客户登记电器：填型号即自动回填官方宽/深/高、开孔/净空、说明书链接（来自家电资料库）。也可手动给尺寸。',
      inputSchema: z.object({
        clientId: z.string(),
        model: z.string().optional().describe('型号——强烈建议填，自动带官方数据'),
        name: z.string().optional().describe('电器名，如 嵌入式冰箱'),
        w: z.number().optional().describe('我方录入宽 mm（现场/设计值）'),
        d: z.number().optional(),
        h: z.number().optional(),
        note: z.string().optional(),
      }),
    },
    async (body) => {
      let official: Record<string, unknown> = {};
      if (body.model) {
        const hit = findByModel(body.model)[0];
        if (hit) {
          const num = (v: unknown) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
          official = {
            brand: hit.b, name: hit.n, ow: num(hit.w), od: num(hit.d), oh: num(hit.h),
            cutout: hit.cut || '', docUrl: (hit.doc || '').split('|')[1] || '', pageUrl: hit.u || '',
          };
        }
      }
      const row = { id: newId('ap'), ...body, ...official, createdAt: now(), updatedAt: now() };
      db.insert(appliances).values(row).run();
      return { content: [json({ ok: true, appliance: row, note: official.ow ? '已自动回填官方尺寸' : '型号未匹配到官方库，仅存手录值' })] };
    });

  // ---------- 自检 ----------
  server.registerTool('get_checklist',
    {
      description: '查客户交底自检清单（12 项：水电点位/厨电锁定/净空核对/开孔进图…）',
      inputSchema: z.object({ clientId: z.string() }),
    },
    async ({ clientId }) => {
      const row = db.select().from(checks).where(eq(checks.clientId, clientId)).get();
      const state: Record<string, boolean> = row ? JSON.parse(row.items || '{}') : {};
      return { content: [json({
        items: CHECK_ITEMS.map(([k, t]) => ({ key: k, text: t, done: !!state[k] })),
        progress: `${CHECK_ITEMS.filter(([k]) => state[k]).length}/${CHECK_ITEMS.length}`,
      })] };
    });

  server.registerTool('set_check_item',
    {
      description: '勾选/取消自检清单某一项',
      inputSchema: z.object({
        clientId: z.string(),
        key: z.string().describe('c01~c12，见 get_checklist'),
        done: z.boolean(),
      }),
    },
    async ({ clientId, key, done }) => {
      const row = db.select().from(checks).where(eq(checks.clientId, clientId)).get();
      const state: Record<string, boolean> = row ? JSON.parse(row.items || '{}') : {};
      state[key] = done;
      if (row) {
        db.update(checks).set({ items: JSON.stringify(state), updatedAt: now() }).where(eq(checks.clientId, clientId)).run();
      } else {
        db.insert(checks).values({ id: newId('ck'), clientId, items: JSON.stringify(state), createdAt: now(), updatedAt: now() }).run();
      }
      return { content: [json({ ok: true })] };
    });

  // ---------- 会议 ----------
  server.registerTool('add_meeting',
    {
      description: '记会议：参会人/议题/结论/跟进事项',
      inputSchema: z.object({
        clientId: z.string(),
        date: z.string().optional(),
        attendees: z.string().optional(),
        topics: z.string().optional(),
        conclusion: z.string().optional(),
        followUps: z.array(z.object({
          text: z.string(), due: z.string().optional(),
        })).optional().describe('跟进事项'),
      }),
    },
    async (body) => {
      const mid = newId('mt');
      db.insert(meetings).values({
        id: mid, clientId: body.clientId, date: body.date || new Date().toISOString().slice(0, 10),
        attendees: body.attendees || '', topics: body.topics || '', conclusion: body.conclusion || '',
        createdAt: now(), updatedAt: now(),
      }).run();
      for (const fu of body.followUps || []) {
        db.insert(followUps).values({ id: newId('fu'), meetingId: mid, text: fu.text, due: fu.due || '', done: 0 }).run();
      }
      return { content: [json({ ok: true, meetingId: mid })] };
    });

  // ---------- 交底单 ----------
  server.registerTool('generate_handover_report',
    {
      description: '生成木作深化交底单（Markdown）：客户信息 + 电器尺寸台账（官方）+ 待办 + 12 项自检勾选状态',
      inputSchema: z.object({ clientId: z.string() }),
    },
    async ({ clientId }) => {
      const cl = db.select().from(clients).where(eq(clients.id, clientId)).get();
      if (!cl) return { content: [{ type: 'text', text: '客户不存在' }], isError: true };
      const aps = db.select().from(appliances).where(eq(appliances.clientId, clientId)).all();
      const open = db.select().from(tasks).where(eq(tasks.clientId, clientId)).all().filter(t => t.status !== '已完成');
      const ck = db.select().from(checks).where(eq(checks.clientId, clientId)).get();
      const st: Record<string, boolean> = ck ? JSON.parse(ck.items || '{}') : {};
      const L: string[] = [
        `# 木作深化交底单`, ``,
        `**项目**：${cl.name}（${cl.address || '地址待补'}）`,
        `**阶段**：${cl.phase}　**进度**：${cl.progress}%`, ``,
        `## 电器尺寸台账（官方口径，mm）`, ``,
        `| 电器 | 型号 | 官方宽×深×高 | 开孔/净空 |`, `|---|---|---|---|`,
      ];
      for (const a of aps) {
        L.push(`| ${a.name || a.brand || '未命名'} | ${a.model || '—'} | ${(a.ow || a.od || a.oh) ? `${a.ow ?? '—'}×${a.od ?? '—'}×${a.oh ?? '—'}` : '未匹配'} | ${a.cutout || '—'} |`);
      }
      L.push(``, `## 待办`, ...(open.length ? open.map(t => `- 【${t.priority}】${t.title}${t.due ? `（${t.due}）` : ''}`) : ['- （无未完事项）']), ``,
        `## 交底自检（${CHECK_ITEMS.filter(([k]) => st[k]).length}/${CHECK_ITEMS.length}）`,
        ...CHECK_ITEMS.map(([k, t]) => `- [${st[k] ? 'x' : ' '}] ${t}`));
      return { content: [{ type: 'text', text: L.join('\n') }] };
    });

  // ---------- 资源说明 ----------
  server.registerTool('catalog_stats',
    { description: '家电资料库规模统计（型号数/品牌/含开孔数）' },
    async () => {
      const cat = loadCatalog();
      return { content: [json({
        models: cat.items.length, brands: cat.brands,
        withCut: cat.items.filter(i => i.cut).length,
        withDocs: cat.items.filter(i => i.doc).length,
        source: cat.source,
      })] };
    });
}

/** 挂载到 Hono 的 /mcp 路由（Streamable HTTP，无状态） */
export async function mcpHandler(c: Context) {
  const server = new McpServer({ name: 'mbs-studio', version: '5.0.0' });
  registerTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw, { parsedBody: (c as any).get?.('parsedBody') });
}
