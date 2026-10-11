import { useEffect, useState } from 'react';
import { apiGet, type Dashboard } from './api';
import Clients from './pages/Clients';
import Catalog from './pages/Catalog';

type View = 'home' | 'clients' | 'catalog';

export default function App() {
  const [view, setView] = useState<View>('home');

  const navs: [View, string, string][] = [
    ['home', '首页看板', '◈'],
    ['clients', '客户项目', '👥'],
    ['catalog', '电器资料库', '🔌'],
  ];

  return (
    <div className="flex h-full">
      {/* 侧栏 */}
      <aside className="w-52 shrink-0 border-r border-[#2a2e33] bg-[#121417] flex flex-col">
        <div className="px-5 py-5 border-b border-[#2a2e33]">
          <div className="text-[#c8a971] font-semibold text-lg tracking-wide">木作设计台</div>
          <div className="text-[#8a8f98] text-xs mt-0.5">v5 · 深化交付管控</div>
        </div>
        <nav className="flex-1 py-3">
          {navs.map(([v, label, icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm text-left transition-colors cursor-pointer ${
                view === v ? 'text-[#c8a971] bg-[#c8a971]/10 border-r-2 border-[#c8a971]' : 'text-[#8a8f98] hover:text-[#e8e6e3]'
              }`}>
              <span className="w-5 text-center">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-[#2a2e33] text-[11px] text-[#8a8f98] leading-relaxed">
          <div>React 19 · Vite 8 · Hono 4</div>
          <div>SQLite + MCP v2 · 端口 7891</div>
          <div className="mt-2 text-[#c8a971]/70">● 本地模式 · 数据落盘</div>
        </div>
      </aside>

      {/* 主区 */}
      <main className="flex-1 overflow-y-auto">
        {view === 'home' && <Home />}
        {view === 'clients' && <Clients />}
        {view === 'catalog' && <Catalog />}
      </main>
    </div>
  );
}

// ================= 首页看板 =================
function Home() {
  const [d, setD] = useState<Dashboard | null>(null);
  useEffect(() => { apiGet<Dashboard>('/api/dashboard').then(setD).catch(console.error); }, []);

  if (!d) return <div className="p-8 text-[#8a8f98]">加载中…</div>;

  const cards: [string, number | string, string][] = [
    ['客户项目', d.stats.clients, 'text-[#e8e6e3]'],
    ['未完任务', d.stats.openTasks, d.stats.overdue ? 'text-red-400' : 'text-[#e8e6e3]'],
    ['今日到期', d.stats.dueToday, d.stats.dueToday ? 'text-[#c8a971]' : 'text-[#e8e6e3]'],
    ['任务完成率', `${d.stats.doneRate}%`, 'text-[#e8e6e3]'],
  ];

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-semibold mb-6">今日看板</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {cards.map(([label, val, cls]) => (
          <div key={label} className="panel p-5">
            <div className="text-xs text-[#8a8f98] mb-2">{label}</div>
            <div className={`text-3xl font-semibold ${cls}`}>{val}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="panel p-5">
          <div className="text-sm font-medium mb-3 text-[#c8a971]">⚠ 风险预警</div>
          {d.risks.length ? d.risks.map((r, i) => (
            <div key={i} className="text-sm text-[#e8e6e3]/90 py-1.5 border-b border-[#2a2e33]/60 last:border-0">{r}</div>
          )) : <div className="text-sm text-[#8a8f98]">无风险项</div>}
        </div>
        <div className="panel p-5">
          <div className="text-sm font-medium mb-3 text-[#c8a971]">最近客户</div>
          {d.recentClients.map(c => (
            <div key={c.id} className="flex items-center justify-between py-1.5 border-b border-[#2a2e33]/60 last:border-0">
              <div>
                <span className="text-sm">{c.name}</span>
                <span className="text-xs text-[#8a8f98] ml-2">{c.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="tag border-[#2a2e33] text-[#8a8f98]">{c.phase}</span>
                <div className="w-16 h-1.5 bg-[#2a2e33] rounded-full overflow-hidden">
                  <div className="h-full bg-[#c8a971]" style={{ width: `${c.progress}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
