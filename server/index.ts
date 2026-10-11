// ============================================================
// 木作设计台 v5 · 服务入口
// Hono 4 · 端口 7891（旧版 v4 在 7890，两者并行互不影响）
// 一个进程提供：REST API + MCP 端点 + 前端静态托管
// ============================================================
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';
import { mcpHandler } from './mcp/server.js';
import { backupDb } from './db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../web/dist');
const PORT = Number(process.env.PORT || 7891);

const app = new Hono();

// 开发期 Vite(5173) 跨域调 API
app.use('*', cors());

// 健康检查（根路径，方便探测）
app.get('/api-x/health', (c) => c.json({ ok: true }));

// REST API
app.route('/api', api);

// MCP（Model Context Protocol v2 · Streamable HTTP）
app.all('/mcp', mcpHandler);

// 静态托管前端构建产物（生产模式；开发模式走 Vite dev server）
if (fs.existsSync(DIST)) {
  app.use('*', serveStatic({ root: DIST, rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p) }));
  // SPA 兜底：非 /api /mcp 的未知路径回 index.html
  app.get('*', (c) => {
    const p = c.req.path;
    if (p.startsWith('/api') || p.startsWith('/mcp') || p.includes('.')) return c.notFound();
    return c.html(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));
  });
}

// 启动即备份一次
try { backupDb('startup'); } catch { /* 忽略 */ }

// 预热家电资料库（异步，不阻塞启动）
import('./catalog.js').catch(() => { /* 首次搜索时再惰性加载 */ });

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, (info) => {
  console.log('');
  console.log('  ============================================');
  console.log('   木作设计台 v5 · mbs-studio');
  console.log(`   Web + API : http://127.0.0.1:${info.port}`);
  console.log(`   MCP 端点  : http://127.0.0.1:${info.port}/mcp`);
  console.log('   技术底座  : React19 + Vite8 + Hono4 + SQLite + MCP v2');
  console.log('   数据      : data/woodwork.db（WAL + 每日备份）');
  console.log('  ============================================');
});
