// ============================================================
// 木作设计台 v5 · 数据库 Schema（Drizzle ORM + better-sqlite3）
// 7 个业务实体，字段与旧版 v4 db.json 对齐，便于无损迁移
// ============================================================
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ---------- 客户（项目） ----------
export const clients = sqliteTable('clients', {
  id: text('id').primaryKey(),                 // nanoid/uuid
  name: text('name').notNull(),                // 业主姓名
  phone: text('phone').default(''),
  address: text('address').default(''),       // 楼盘+栋户
  phase: text('phase').default('量尺'),         // 量尺/方案设计/深化设计/生产/安装/交付
  needs: text('needs').default(''),            // 需求概述
  note: text('note').default(''),              // 备注
  progress: integer('progress').default(0),    // 0-100
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 任务 ----------
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  title: text('title').notNull(),
  type: text('type').default('跟进'),           // 尺寸复核/跟进/下单/安装/...
  priority: text('priority').default('P1'),     // P0/P1/P2
  status: text('status').default('待办'),       // 待办/进行中/已完成
  due: text('due').default(''),                 // YYYY-MM-DD
  note: text('note').default(''),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 现场（量尺/图纸记录） ----------
export const siteRecords = sqliteTable('site_records', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  type: text('type').default('量尺照片'),        // 量尺照片/CAD图纸/现场复核
  date: text('date').default(''),
  note: text('note').default(''),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 会议 ----------
export const meetings = sqliteTable('meetings', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  date: text('date').default(''),
  attendees: text('attendees').default(''),
  topics: text('topics').default(''),
  conclusion: text('conclusion').default(''),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 会议跟进事项 ----------
export const followUps = sqliteTable('follow_ups', {
  id: text('id').primaryKey(),
  meetingId: text('meeting_id'),
  text: text('text').default(''),
  due: text('due').default(''),
  done: integer('done').default(0),
});

// ---------- 电器（客户房屋内的电器设备） ----------
export const appliances = sqliteTable('appliances', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  applianceId: text('appliance_id').default(''), // 家电资料库匹配 id（可选）
  brand: text('brand').default(''),
  model: text('model').default(''),               // 型号
  name: text('name').default(''),                 // 品名
  // 我方录入尺寸（现场/设计值，mm）
  w: real('w'), d: real('d'), h: real('h'),
  // 官方尺寸（自动从家电资料库带出，mm）
  ow: real('ow'), od: real('od'), oh: real('oh'),
  cutout: text('cutout').default(''),             // 官方开孔/净空
  docUrl: text('doc_url').default(''),            // 官方说明书直链
  pageUrl: text('page_url').default(''),          // 官方产品页
  note: text('note').default(''),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 自检清单（每客户一份，12 项） ----------
export const checks = sqliteTable('checks', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  items: text('items').default('{}'),             // JSON: {"c01":true,...}
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

// ---------- 资料库（外链 / 上传文件登记） ----------
export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  clientId: text('client_id'),
  phase: text('phase').default(''),               // 量尺/深化/生产/安装
  kind: text('kind').default('link'),             // link / file
  name: text('name').default(''),
  url: text('url').default(''),                  // 外链 或 /api/file/:id
  size: integer('size').default(0),
  ext: text('ext').default(''),
  version: text('version').default(''),
  note: text('note').default(''),
  date: text('date').default(''),
  createdAt: text('created_at'),
});

export type Client = typeof clients.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Appliance = typeof appliances.$inferSelect;
export type CheckRow = typeof checks.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
