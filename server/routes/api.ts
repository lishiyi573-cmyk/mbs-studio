// ============================================================
// REST API（Hono + Zod v4 校验）
// 端点总览：
//   /api/health                 健康检查
//   /api/dashboard              首页看板（统计/今日待办/风险预警/最近客户）
//   /api/clients                GET 列表 / POST 新建
//   /api/clients/:id            GET / PATCH / DELETE
//   /api/tasks?clientId=&status= CRUD
//   /api/site?clientId=         CRUD（现场记录）
//   /api/meetings?clientId=     CRUD + followUps
//   /api/appliances?clientId=   CRUD
//   /api/appliances/match       POST {model} → 自动回填官方尺寸
//   /api/checks?clientId=       GET / PUT
//   /api/files?clientId=        CRUD（资料登记）
//   /api/catalog/search?q=      家电资料库搜索（22,437 型号）
//   /api/catalog/model/:model   型号精确查询
//   /api/report/:clientId       交底单（Markdown 文本）
//   /api/upload /api/file/:id   文件上传/下载/删除
//   /api/backup                 手动备份
// ============================================================
import { Hono } from 'hono';
import { z } from 'zod/v4';
import { eq, desc } from 'drizzle-orm';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, schema, now, newId, backupDb, DATA_DIR } from '../db/index.js';
import { searchCatalog, findByModel, brief, loadCatalog } from '../catalog.js';

const { clients, tasks, siteRecords, meetings, followUps, appliances, checks, files } = schema;

export const api = new Hono();

// ---------- 工具 ----------
const today = () => new Date().toISOString().slice(0, 10);

// ---------- health ----------
api.get('/health', (c) => c.json({
  ok: true, app: 'mbs-studio v5', port: 7891,
  stack: 'React19+Vite8+Hono4+SQLite(Drizzle)+MCP',
}));

// ---------- 首页看板 ----------
api.get('/dashboard', (c) => {
  const allClients = db.select().from(clients).orderBy(desc(clients.updatedAt)).all();
  const allTasks = db.select().from(tasks).all();
  const t = today();
  const overdue = allTasks.filter(x => x.status !== '已完成' && x.due != null && x.due < t);
  const dueToday = allTasks.filter(x => x.status !== '已完成' && x.due === t);
  const upcoming = allTasks.filter(x => x.status !== '已完成' && x.due != null && x.due > t)
    .sort((a, b) => (a.due || '').localeCompare(b.due || '')).slice(0, 8);
  const risks: string[] = [];
  for (const od of overdue.slice(0, 10)) {
    const cl = allClients.find(x => x.id === od.clientId);
    risks.push(`【${od.priority}】${cl?.name || '未关联'}：${od.title}（${od.due || '?'} 已逾期）`);
  }
  for (const cl of allClients) {
    if (cl.phase === '深化设计' && (cl.progress ?? 0) < 50) {
      risks.push(`${cl.name}：深化设计阶段但进度仅 ${cl.progress}%`);
    }
  }
  return c.json({
    stats: {
      clients: allClients.length,
      openTasks: allTasks.filter(x => x.status !== '已完成').length,
      overdue: overdue.length, dueToday: dueToday.length,
      doneRate: allTasks.length ? Math.round(allTasks.filter(x => x.status === '已完成').length / allTasks.length * 100) : 0,
    },
    dueToday, upcoming, risks,
    recentClients: allClients.slice(0, 6),
  });
});

// ---------- 客户 ----------
const ClientInput = z.object({
  name: z.string().min(1), phone: z.string().optional(),
  address: z.string().optional(), phase: z.string().optional(),
  needs: z.string().optional(), note: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
});

api.get('/clients', (c) => {
  return c.json(db.select().from(clients).orderBy(desc(clients.updatedAt)).all());
});

api.post('/clients', async (c) => {
  const body = ClientInput.parse(await c.req.json());
  const row = { id: newId('cl'), ...body, progress: body.progress ?? 0, createdAt: now(), updatedAt: now() };
  db.insert(clients).values(row).run();
  return c.json(row, 201);
});

api.get('/clients/:id', (c) => {
  const id = c.req.param('id');
  const row = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json({
    client: row,
    tasks: db.select().from(tasks).where(eq(tasks.clientId, id)).orderBy(desc(tasks.createdAt)).all(),
    site: db.select().from(siteRecords).where(eq(siteRecords.clientId, id)).all(),
    appliances: db.select().from(appliances).where(eq(appliances.clientId, id)).all(),
    check: db.select().from(checks).where(eq(checks.clientId, id)).get() || null,
    files: db.select().from(files).where(eq(files.clientId, id)).all(),
    meetings: db.select().from(meetings).where(eq(meetings.clientId, id)).all().map(m => ({
      ...m,
      followUps: db.select().from(followUps).where(eq(followUps.meetingId, m.id)).all(),
    })),
  });
});

api.patch('/clients/:id', async (c) => {
  const id = c.req.param('id');
  const body = ClientInput.partial().parse(await c.req.json());
  db.update(clients).set({ ...body, updatedAt: now() }).where(eq(clients.id, id)).run();
  return c.json(db.select().from(clients).where(eq(clients.id, id)).get());
});

api.delete('/clients/:id', (c) => {
  const id = c.req.param('id');
  db.delete(tasks).where(eq(tasks.clientId, id)).run();
  db.delete(siteRecords).where(eq(siteRecords.clientId, id)).run();
  db.delete(appliances).where(eq(appliances.clientId, id)).run();
  db.delete(checks).where(eq(checks.clientId, id)).run();
  db.delete(files).where(eq(files.clientId, id)).run();
  db.delete(meetings).where(eq(meetings.clientId, id)).run();
  db.delete(clients).where(eq(clients.id, id)).run();
  return c.json({ ok: true });
});

// ---------- 任务 ----------
const TaskInput = z.object({
  clientId: z.string().optional(), title: z.string().min(1),
  type: z.string().optional(), priority: z.enum(['P0', 'P1', 'P2']).optional(),
  status: z.enum(['待办', '进行中', '已完成']).optional(),
  due: z.string().optional(), note: z.string().optional(),
});

api.get('/tasks', (c) => {
  const clientId = c.req.query('clientId');
  const status = c.req.query('status');
  let rows = db.select().from(tasks).all();
  if (clientId) rows = rows.filter(r => r.clientId === clientId);
  if (status) rows = rows.filter(r => r.status === status);
  return c.json(rows.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')));
});

api.post('/tasks', async (c) => {
  const body = TaskInput.parse(await c.req.json());
  const row = { id: newId('tk'), ...body, createdAt: now(), updatedAt: now() };
  db.insert(tasks).values(row).run();
  return c.json(row, 201);
});

api.patch('/tasks/:id', async (c) => {
  const body = TaskInput.partial().parse(await c.req.json());
  db.update(tasks).set({ ...body, updatedAt: now() }).where(eq(tasks.id, c.req.param('id'))).run();
  return c.json(db.select().from(tasks).where(eq(tasks.id, c.req.param('id'))).get());
});

api.delete('/tasks/:id', (c) => {
  db.delete(tasks).where(eq(tasks.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- 现场记录 ----------
api.get('/site', (c) => {
  const clientId = c.req.query('clientId');
  let rows = db.select().from(siteRecords).all();
  if (clientId) rows = rows.filter(r => r.clientId === clientId);
  return c.json(rows);
});

api.post('/site', async (c) => {
  const body = z.object({
    clientId: z.string(), type: z.string().optional(), date: z.string().optional(), note: z.string().optional(),
  }).parse(await c.req.json());
  const row = { id: newId('st'), type: '量尺照片', date: today(), ...body, createdAt: now(), updatedAt: now() };
  db.insert(siteRecords).values(row).run();
  return c.json(row, 201);
});

api.delete('/site/:id', (c) => {
  db.delete(siteRecords).where(eq(siteRecords.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- 会议 ----------
api.post('/meetings', async (c) => {
  const body = z.object({
    clientId: z.string(), date: z.string().optional(), attendees: z.string().optional(),
    topics: z.string().optional(), conclusion: z.string().optional(),
    followUps: z.array(z.object({ text: z.string(), due: z.string().optional(), done: z.boolean().optional() })).optional(),
  }).parse(await c.req.json());
  const mid = newId('mt');
  db.insert(meetings).values({
    id: mid, clientId: body.clientId, date: body.date || today(),
    attendees: body.attendees || '', topics: body.topics || '', conclusion: body.conclusion || '',
    createdAt: now(), updatedAt: now(),
  }).run();
  for (const fu of body.followUps || []) {
    db.insert(followUps).values({ id: newId('fu'), meetingId: mid, text: fu.text, due: fu.due || '', done: fu.done ? 1 : 0 }).run();
  }
  return c.json({ ok: true, id: mid }, 201);
});

api.patch('/meetings/:id', async (c) => {
  const id = c.req.param('id');
  const body = z.object({
    date: z.string().optional(), attendees: z.string().optional(),
    topics: z.string().optional(), conclusion: z.string().optional(),
  }).parse(await c.req.json());
  db.update(meetings).set({ ...body, updatedAt: now() }).where(eq(meetings.id, id)).run();
  return c.json(db.select().from(meetings).where(eq(meetings.id, id)).get());
});

api.delete('/meetings/:id', (c) => {
  db.delete(followUps).where(eq(followUps.meetingId, c.req.param('id'))).run();
  db.delete(meetings).where(eq(meetings.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

api.patch('/followups/:id', async (c) => {
  const body = z.object({ done: z.boolean() }).parse(await c.req.json());
  db.update(followUps).set({ done: body.done ? 1 : 0 }).where(eq(followUps.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- 家电资料库（电器查询） ----------
api.get('/catalog/search', (c) => {
  const q = c.req.query('q') || '';
  const brand = c.req.query('brand') || undefined;
  const onlyCut = c.req.query('onlyCut') === '1';
  const items = searchCatalog(q, { brand, onlyCut, limit: Number(c.req.query('limit') || 30) });
  return c.json({ total: items.length, items: items.map(brief) });
});

api.get('/catalog/model/:model', (c) => {
  const items = findByModel(c.req.param('model'));
  return c.json({ found: items.length, items: items.map(brief) });
});

api.get('/catalog/stats', (c) => {
  const cat = loadCatalog();
  const withCut = cat.items.filter(i => i.cut).length;
  const withDoc = cat.items.filter(i => i.doc).length;
  const withDims = cat.items.filter(i => i.w || i.d || i.h).length;
  return c.json({ models: cat.items.length, brands: cat.brands, withCut, withDoc, withDims, loadedAt: cat.loadedAt });
});

// ---------- 电器（客户台账） ----------
const ApplianceInput = z.object({
  clientId: z.string(), model: z.string().optional(), brand: z.string().optional(),
  name: z.string().optional(), w: z.number().optional(), d: z.number().optional(), h: z.number().optional(),
  note: z.string().optional(),
});

api.get('/appliances', (c) => {
  const clientId = c.req.query('clientId');
  let rows = db.select().from(appliances).all();
  if (clientId) rows = rows.filter(r => r.clientId === clientId);
  return c.json(rows);
});

// 按型号自动匹配官方数据（宽/深/高/开孔/说明书）
api.post('/appliances/match', async (c) => {
  const { model } = z.object({ model: z.string().min(1) }).parse(await c.req.json());
  const hits = findByModel(model);
  if (!hits.length) return c.json({ found: false, hint: '家电资料库中未找到该型号，请核对或手动录入' }, 404);
  const it = hits[0];
  const num = (v: any) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  return c.json({
    found: true, matched: 1, total: hits.length,
    official: {
      brand: it.b, category: it.c, model: it.m, name: it.n,
      w: num(it.w), d: num(it.d), h: num(it.h),
      cutout: it.cut || null, docs: it.doc || null, page: it.u || null,
    },
    others: hits.slice(1, 5).map(brief),
  });
});

api.post('/appliances', async (c) => {
  const body = ApplianceInput.parse(await c.req.json());
  // 若带型号，自动回填官方尺寸
  let official: any = {};
  if (body.model) {
    const hit = findByModel(body.model)[0];
    if (hit) {
      const num = (v: any) => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
      official = {
        brand: hit.b, name: hit.n, ow: num(hit.w), od: num(hit.d), oh: num(hit.h),
        cutout: hit.cut || '', docUrl: (hit.doc || '').split('|')[1] || '',
        pageUrl: hit.u || '',
      };
    }
  }
  const row = {
    id: newId('ap'), ...body, ...official,
    createdAt: now(), updatedAt: now(),
  };
  db.insert(appliances).values(row).run();
  return c.json(row, 201);
});

api.patch('/appliances/:id', async (c) => {
  const body = ApplianceInput.partial().parse(await c.req.json());
  db.update(appliances).set({ ...body, updatedAt: now() }).where(eq(appliances.id, c.req.param('id'))).run();
  return c.json(db.select().from(appliances).where(eq(appliances.id, c.req.param('id'))).get());
});

api.delete('/appliances/:id', (c) => {
  db.delete(appliances).where(eq(appliances.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- 自检清单（12 项） ----------
export const CHECK_ITEMS: [string, string][] = [
  ['c01', '水电点位图已出且业主确认'],
  ['c02', '厨电型号清单已锁定（品牌+型号）'],
  ['c03', '每台嵌入电器的官方预留尺寸已核对'],
  ['c04', '开孔尺寸（长×宽+倒角）已进图'],
  ['c05', '冰箱位：两侧/顶/背净空满足官方要求'],
  ['c06', '冰箱插座位置避开机身正后方'],
  ['c07', '烟机位：底距灶面高度区间已确认'],
  ['c08', '蒸烤箱：散热与柜体材质已核对'],
  ['c09', '洗碗机：进出水与电源走向已定'],
  ['c10', '洗烘区：排水/地漏/插座已复核'],
  ['c11', '柜体分色（柜门/柜体）已双向确认'],
  ['c12', '交底单已发工人且收到回复确认'],
];

api.get('/checks', (c) => {
  const clientId = c.req.query('clientId');
  const row = db.select().from(checks).where(eq(checks.clientId, clientId || '')).get();
  return c.json({
    definitions: CHECK_ITEMS.map(([k, t]) => ({ key: k, text: t })),
    state: row ? JSON.parse(row.items || '{}') : {},
  });
});

api.put('/checks', async (c) => {
  const body = z.object({ clientId: z.string(), items: z.record(z.string(), z.boolean()) }).parse(await c.req.json());
  const exist = db.select().from(checks).where(eq(checks.clientId, body.clientId)).get();
  if (exist) {
    db.update(checks).set({ items: JSON.stringify(body.items), updatedAt: now() }).where(eq(checks.clientId, body.clientId)).run();
  } else {
    db.insert(checks).values({ id: newId('ck'), clientId: body.clientId, items: JSON.stringify(body.items), createdAt: now(), updatedAt: now() }).run();
  }
  return c.json({ ok: true });
});

// ---------- 资料库 ----------
api.get('/files', (c) => {
  const clientId = c.req.query('clientId');
  let rows = db.select().from(files).all();
  if (clientId) rows = rows.filter(r => r.clientId === clientId);
  return c.json(rows);
});

api.post('/files', async (c) => {
  const body = z.object({
    clientId: z.string(), phase: z.string().optional(), kind: z.string().optional(),
    name: z.string().min(1), url: z.string().optional(), note: z.string().optional(),
    version: z.string().optional(),
  }).parse(await c.req.json());
  const row = { id: newId('fl'), kind: 'link', phase: '', date: today(), ...body, createdAt: now() };
  db.insert(files).values(row).run();
  return c.json(row, 201);
});

api.delete('/files/:id', (c) => {
  const row = db.select().from(files).where(eq(files.id, c.req.param('id'))).get();
  // 删除磁盘文件（不留孤儿）
  if (row && row.kind === 'file' && row.url?.startsWith('/api/file/')) {
    const fid = row.url.replace('/api/file/', '');
    try {
      for (const f of fs.readdirSync(path.join(DATA_DIR, 'files'))) {
        if (f.split('.')[0] === fid) fs.unlinkSync(path.join(DATA_DIR, 'files', f));
      }
    } catch { /* ignore */ }
  }
  db.delete(files).where(eq(files.id, c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- 文件上传 / 下载 ----------
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', dwg: 'application/acad', dxf: 'application/dxf',
  skp: 'application/octet-stream', zip: 'application/zip',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  json: 'application/json', txt: 'text/plain', md: 'text/markdown',
};

api.post('/upload', async (c) => {
  const form = await c.req.formData();
  const f = form.get('file') as File | null;
  const clientId = String(form.get('clientId') || '');
  if (!f) return c.json({ error: 'no file' }, 400);
  const buf = Buffer.from(await f.arrayBuffer());
  const id = crypto.randomBytes(6).toString('hex');
  const ext = String(f.name).split('.').pop()?.toLowerCase() || 'bin';
  fs.writeFileSync(path.join(DATA_DIR, 'files', `${id}.${ext}`), buf);
  // 顺手登记到资料表
  const row = {
    id: newId('fl'), clientId, phase: '', kind: 'file', name: String(f.name),
    url: `/api/file/${id}`, size: buf.length, ext, version: '', note: '',
    date: today(), createdAt: now(),
  };
  db.insert(files).values(row).run();
  return c.json({ ok: true, ...row });
});

api.get('/file/:id', (c) => {
  const id = c.req.param('id').replace(/[^a-f0-9]/gi, '');
  let fname: string | null = null;
  for (const f of fs.readdirSync(path.join(DATA_DIR, 'files'))) {
    if (f.split('.')[0] === id) { fname = f; break; }
  }
  if (!fname) return c.json({ error: 'not found' }, 404);
  const fp = path.join(DATA_DIR, 'files', fname);
  const data = fs.readFileSync(fp);
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': MIME[fname.split('.').pop() || ''] || 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(fname)}`,
      'Cache-Control': 'no-cache',
    },
  });
});

// ---------- 交底单 ----------
api.get('/report/:clientId', (c) => {
  const id = c.req.param('clientId');
  const cl = db.select().from(clients).where(eq(clients.id, id)).get();
  if (!cl) return c.json({ error: 'not found' }, 404);
  const aps = db.select().from(appliances).where(eq(appliances.clientId, id)).all();
  const openTasks = db.select().from(tasks).where(eq(tasks.clientId, id)).all()
    .filter(t => t.status !== '已完成');
  const ck = db.select().from(checks).where(eq(checks.clientId, id)).get();
  const ckState: Record<string, boolean> = ck ? JSON.parse(ck.items || '{}') : {};

  const L: string[] = [];
  L.push(`# 木作深化交底单`);
  L.push(``);
  L.push(`**项目**：${cl.name}（${cl.address || '地址待补'}）`);
  L.push(`**阶段**：${cl.phase}　**进度**：${cl.progress}%　**日期**：${today()}`);
  L.push(``);
  if (cl.note) { L.push(`> 特别注意：${cl.note}`); L.push(``); }
  L.push(`## 电器尺寸台账（单位 mm）`);
  L.push(``);
  L.push(`| 电器 | 型号 | 官方宽×深×高 | 开孔/净空 |`);
  L.push(`|---|---|---|---|`);
  for (const a of aps) {
    const official = (a.ow || a.od || a.oh) ? `${a.ow ?? '—'}×${a.od ?? '—'}×${a.oh ?? '—'}` : '未匹配';
    L.push(`| ${a.name || a.brand || '未命名'} | ${a.model || '—'} | ${official} | ${a.cutout || '—'} |`);
  }
  if (!aps.length) L.push(`| （暂无登记电器） | | | |`);
  L.push(``);
  L.push(`## 待办事项`);
  for (const t of openTasks) L.push(`- 【${t.priority}】${t.title}${t.due ? `（${t.due}）` : ''}`);
  if (!openTasks.length) L.push(`- （无未完事项）`);
  L.push(``);
  L.push(`## 交底自检（${CHECK_ITEMS.filter(([k]) => ckState[k]).length}/${CHECK_ITEMS.length} 已完成）`);
  for (const [k, text] of CHECK_ITEMS) {
    L.push(`- [${ckState[k] ? 'x' : ' '}] ${text}`);
  }
  return c.json({ markdown: L.join('\n') });
});

// ---------- 备份 ----------
api.post('/backup', (c) => {
  return c.json({ ok: true, path: backupDb('manual') });
});
