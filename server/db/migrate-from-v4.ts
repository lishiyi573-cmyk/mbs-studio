// ============================================================
// 旧版 v4（F:\木作设计台\data\db.json）→ v5 SQLite 迁移
// 用法：npm run migrate
// 幂等：按 id 去重，旧数据已存在则跳过
// ============================================================
import fs from 'node:fs';
import { db, schema, now } from './index.js';

const V4_DB = 'F:/木作设计台/data/db.json';
const { clients, tasks, siteRecords, meetings, followUps, appliances, checks, files } = schema;

function main() {
  if (!fs.existsSync(V4_DB)) {
    console.log('未找到旧版 db.json：', V4_DB, '（跳过迁移）');
    return;
  }
  const old = JSON.parse(fs.readFileSync(V4_DB, 'utf8'));
  console.log('读取旧库：', {
    clients: old.clients?.length, tasks: old.tasks?.length, site: old.site?.length,
    meetings: old.meetings?.length, appliances: old.appliances?.length,
    checks: old.checks?.length, files: old.files?.length,
  });

  let n = 0;
  const seen = new Set<string>();
  const isNew = (id: string) => !seen.has(id);

  // 客户
  for (const c of old.clients || []) {
    if (!isNew(c.id)) continue;
    db.insert(clients).values({
      id: c.id, name: c.name || '未命名', phone: c.phone || '', address: c.address || '',
      phase: c.phase || '量尺', needs: c.needs || '', note: c.note || '',
      progress: c.progress ?? 0, createdAt: c.createdAt || now(), updatedAt: c.updatedAt || now(),
    }).run(); seen.add(c.id); n++;
  }

  // 任务
  for (const t of old.tasks || []) {
    if (!isNew(t.id)) continue;
    db.insert(tasks).values({
      id: t.id, clientId: t.clientId || '', title: t.title || '', type: t.type || '跟进',
      priority: t.priority || 'P1', status: t.status || '待办', due: t.due || '',
      note: t.note || '', createdAt: t.createdAt || now(), updatedAt: t.updatedAt || now(),
    }).run(); seen.add(t.id); n++;
  }

  // 现场
  for (const s of old.site || []) {
    if (!isNew(s.id)) continue;
    db.insert(siteRecords).values({
      id: s.id, clientId: s.clientId || '', type: s.type || '量尺照片', date: s.date || '',
      note: s.note || '', createdAt: s.createdAt || now(), updatedAt: s.updatedAt || now(),
    }).run(); seen.add(s.id); n++;
  }

  // 会议 + 跟进
  for (const m of old.meetings || []) {
    if (!isNew(m.id)) continue;
    db.insert(meetings).values({
      id: m.id, clientId: m.clientId || '', date: m.date || '', attendees: m.attendees || '',
      topics: m.topics || '', conclusion: m.conclusion || '',
      createdAt: m.createdAt || now(), updatedAt: m.updatedAt || now(),
    }).run(); seen.add(m.id); n++;
    for (const fu of m.followUps || []) {
      db.insert(followUps).values({
        id: fu.id, meetingId: m.id, text: fu.text || '', due: fu.due || '', done: fu.done ? 1 : 0,
      }).run(); n++;
    }
  }

  // 电器 —— v4 只有 applianceId + input 尺寸，没有型号字段。
  // 旧数据里的 applianceId 是选项 id（ap1/ap3…），无法反查型号，原样迁移手录值。
  for (const a of old.appliances || []) {
    if (!isNew(a.id)) continue;
    db.insert(appliances).values({
      id: a.id, clientId: a.clientId || '', applianceId: a.applianceId || '',
      w: a.input?.w ?? null, d: a.input?.d ?? null, h: a.input?.h ?? null,
      note: '（v4 迁移，无型号）',
      createdAt: a.createdAt || now(), updatedAt: a.updatedAt || now(),
    }).run(); seen.add(a.id); n++;
  }

  // 自检
  for (const k of old.checks || []) {
    if (!isNew(k.id)) continue;
    db.insert(checks).values({
      id: k.id, clientId: k.clientId || '', items: JSON.stringify(k.items || {}),
      createdAt: k.createdAt || now(), updatedAt: k.updatedAt || now(),
    }).run(); seen.add(k.id); n++;
  }

  // 资料（跳过 example.com 占位链接）
  let skippedFake = 0;
  for (const f of old.files || []) {
    if (!isNew(f.id)) continue;
    if ((f.url || '').includes('example.com')) { skippedFake++; continue; }
    db.insert(files).values({
      id: f.id, clientId: f.clientId || '', phase: f.phase || '', kind: f.kind || 'link',
      name: f.name || '', url: f.url || '', size: f.size || 0, ext: f.ext || '',
      version: f.version || '', note: f.note || '', date: f.date || '',
      createdAt: f.createdAt || now(),
    }).run(); seen.add(f.id); n++;
  }

  console.log(`迁移完成：写入 ${n} 条；跳过占位假链接 ${skippedFake} 条`);
  console.log('新库统计：', {
    clients: db.select().from(clients).all().length,
    tasks: db.select().from(tasks).all().length,
    files: db.select().from(files).all().length,
  });
}

main();
