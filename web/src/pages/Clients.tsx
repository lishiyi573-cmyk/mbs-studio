import { useCallback, useEffect, useState } from 'react';
import {
  apiGet, apiPost, apiPatch, apiDelete, apiPut,
  type Client, type ClientDetail, type CatalogBrief,
} from '../api';

const PHASES = ['量尺', '方案设计', '深化设计', '生产', '安装', '交付'];
const PRIORITIES = ['P0', 'P1', 'P2'];

export default function Clients() {
  const [list, setList] = useState<Client[]>([]);
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phase: '量尺', needs: '', note: '' });

  const load = useCallback(() => apiGet<Client[]>('/api/clients').then(setList), []);
  useEffect(() => { load(); }, [load]);

  const open = (id: string) =>
    apiGet<ClientDetail>(`/api/clients/${id}`).then(setDetail).catch(() => setDetail(null));

  const create = async () => {
    if (!form.name.trim()) return;
    await apiPost('/api/clients', form);
    setCreating(false);
    setForm({ name: '', address: '', phase: '量尺', needs: '', note: '' });
    load();
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">客户项目</h1>
        <button className="btn-gold" onClick={() => setCreating(true)}>+ 新建客户</button>
      </div>

      {creating && (
        <div className="panel p-5 mb-6 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className="inp" placeholder="业主姓名 *" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
            <input className="inp" placeholder="楼盘+栋户" value={form.address}
              onChange={e => setForm({ ...form, address: e.target.value })} />
            <select className="inp" value={form.phase}
              onChange={e => setForm({ ...form, phase: e.target.value })}>
              {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <input className="inp" placeholder="需求概述" value={form.needs}
            onChange={e => setForm({ ...form, needs: e.target.value })} />
          <input className="inp" placeholder="备注" value={form.note}
            onChange={e => setForm({ ...form, note: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn-gold" onClick={create}>保存</button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {list.map(c => (
          <div key={c.id} className="panel p-5 flex items-center gap-5 cursor-pointer hover:border-[#c8a971]/40 transition-colors"
               onClick={() => open(c.id)}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="tag border-[#c8a971]/50 text-[#c8a971]">{c.phase}</span>
              </div>
              <div className="text-xs text-[#8a8f98] mt-1 truncate">{c.address || '地址待补'}{c.needs ? ` · ${c.needs}` : ''}</div>
            </div>
            <div className="w-40 shrink-0">
              <div className="flex items-center justify-between text-xs text-[#8a8f98] mb-1">
                <span>进度</span><span>{c.progress}%</span>
              </div>
              <div className="h-1.5 bg-[#2a2e33] rounded-full overflow-hidden">
                <div className="h-full bg-[#c8a971] transition-all" style={{ width: `${c.progress}%` }} />
              </div>
            </div>
            <div className="text-[#8a8f98] text-lg">›</div>
          </div>
        ))}
        {!list.length && <div className="text-sm text-[#8a8f98]">暂无客户，点右上角新建</div>}
      </div>

      {detail && <DetailDrawer data={detail} onClose={() => { setDetail(null); load(); }} />}
    </div>
  );
}

// ================= 详情抽屉（6 tab） =================
function DetailDrawer({ data, onClose }: { data: ClientDetail; onClose: () => void }) {
  const [tab, setTab] = useState('overview');
  const [d, setD] = useState(data);
  const c = d.client;
  const refresh = () => apiGet<ClientDetail>(`/api/clients/${c.id}`).then(setD);

  const tabs: [string, string][] = [
    ['overview', '概览'], ['tasks', '任务'], ['appliances', '电器'],
    ['check', '自检'], ['meetings', '会议'], ['files', '资料'],
  ];

  const copyReport = async () => {
    const r = await apiGet<{ markdown: string }>(`/api/report/${c.id}`);
    await navigator.clipboard.writeText(r.markdown);
    alert('交底单已复制到剪贴板（Markdown）');
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onClick={onClose}>
      <div className="w-[860px] max-w-[92vw] bg-[#121417] border-l border-[#2a2e33] flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div className="px-6 py-4 border-b border-[#2a2e33] flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold">{c.name}</span>
              <span className="tag border-[#c8a971]/50 text-[#c8a971]">{c.phase}</span>
            </div>
            <div className="text-xs text-[#8a8f98] mt-1">{c.address || '地址待补'} · 更新于 {c.updatedAt?.slice(0, 10)}</div>
          </div>
          <button className="btn-gold" onClick={copyReport}>复制交底单</button>
          <button className="btn-ghost" onClick={onClose}>×</button>
        </div>

        {/* tab 栏 */}
        <div className="px-6 border-b border-[#2a2e33] flex">
          {tabs.map(([k, label]) => (
            <button key={k} className={`tabbtn ${tab === k ? 'tabbtn-on' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'overview' && <Overview d={d} />}
          {tab === 'tasks' && <Tasks d={d} refresh={refresh} />}
          {tab === 'appliances' && <Appliances d={d} refresh={refresh} />}
          {tab === 'check' && <Checklist clientId={c.id} />}
          {tab === 'meetings' && <Meetings d={d} refresh={refresh} />}
          {tab === 'files' && <Files d={d} refresh={refresh} />}
        </div>
      </div>
    </div>
  );
}

// ---------- 概览 ----------
function Overview({ d }: { d: ClientDetail }) {
  const c = d.client;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="任务" val={`${d.tasks.filter(t => t.status !== '已完成').length} 项未完`} />
        <Stat label="电器" val={`${d.appliances.length} 台`} />
        <Stat label="资料" val={`${d.files.length} 份`} />
      </div>
      {c.needs && <Info label="需求概述" text={c.needs} />}
      {c.note && <Info label="备注" text={c.note} />}
      {d.appliances.length > 0 && (
        <div className="panel p-4">
          <div className="text-sm text-[#c8a971] mb-3">电器尺寸速览（官方口径 mm）</div>
          <table className="w-full text-sm">
            <thead><tr className="text-[#8a8f98] text-xs">
              <th className="text-left py-1.5">电器</th><th className="text-left">型号</th>
              <th className="text-left">官方宽×深×高</th><th className="text-left">开孔/净空</th>
            </tr></thead>
            <tbody>
              {d.appliances.map(a => (
                <tr key={a.id} className="border-t border-[#2a2e33]/60">
                  <td className="py-1.5">{a.name || a.brand || '—'}</td>
                  <td className="text-[#8a8f98]">{a.model || '—'}</td>
                  <td>{(a.ow || a.od || a.oh) ? `${a.ow ?? '—'}×${a.od ?? '—'}×${a.oh ?? '—'}` : <span className="text-[#8a8f98]">未匹配</span>}</td>
                  <td className="text-xs">{a.cutout || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, val }: { label: string; val: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-[#8a8f98]">{label}</div>
      <div className="text-lg mt-1">{val}</div>
    </div>
  );
}
function Info({ label, text }: { label: string; text: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-[#8a8f98] mb-1">{label}</div>
      <div className="text-sm">{text}</div>
    </div>
  );
}

// ---------- 任务 ----------
function Tasks({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('P1');
  const [due, setDue] = useState('');

  const add = async () => {
    if (!title.trim()) return;
    await apiPost('/api/tasks', { clientId: d.client.id, title, priority, due });
    setTitle(''); setDue(''); refresh();
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4 flex gap-2">
        <input className="inp flex-1" placeholder="新任务，如：冰箱位尺寸复核" value={title}
          onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
        <select className="inp w-20" value={priority} onChange={e => setPriority(e.target.value)}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}
        </select>
        <input className="inp w-36" type="date" value={due} onChange={e => setDue(e.target.value)} />
        <button className="btn-gold shrink-0" onClick={add}>添加</button>
      </div>
      {d.tasks.map(t => (
        <div key={t.id} className="panel p-3.5 flex items-center gap-3">
          <input type="checkbox" checked={t.status === '已完成'}
            onChange={async e => {
              await apiPatch(`/api/tasks/${t.id}`, { status: e.target.checked ? '已完成' : '待办' });
              refresh();
            }} className="accent-[#c8a971] w-4 h-4" />
          <div className={`flex-1 text-sm ${t.status === '已完成' ? 'line-through text-[#8a8f98]' : ''}`}>
            {t.title}
            {t.note && <span className="text-xs text-[#8a8f98] ml-2">{t.note}</span>}
          </div>
          {t.due && <span className="text-xs text-[#8a8f98]">{t.due}</span>}
          <span className={`tag ${t.priority === 'P0' ? 'border-red-800 text-red-400' : 'border-[#2a2e33] text-[#8a8f98]'}`}>{t.priority}</span>
          <button className="text-[#8a8f98] hover:text-red-400 cursor-pointer"
            onClick={async () => { await apiDelete(`/api/tasks/${t.id}`); refresh(); }}>×</button>
        </div>
      ))}
    </div>
  );
}

// ---------- 电器（接家电资料库自动匹配） ----------
function Appliances({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  const [model, setModel] = useState('');
  const [name, setName] = useState('');
  const [preview, setPreview] = useState<CatalogBrief | null>(null);
  const [msg, setMsg] = useState('');

  const lookup = async () => {
    setMsg(''); setPreview(null);
    if (!model.trim()) return;
    const r = await fetch(`/api/catalog/model/${encodeURIComponent(model.trim())}`).then(x => x.json());
    if (r.found) setPreview(r.items[0]);
    else setMsg(`资料库中未找到「${model}」——可先到「电器资料库」页搜索确认型号`);
  };

  const add = async () => {
    if (!model.trim()) return;
    const r = await fetch('/api/appliances', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: d.client.id, model: model.trim(), name: name.trim() || undefined }),
    }).then(x => x.json());
    setModel(''); setName(''); setPreview(null);
    setMsg(r.ow ? `✓ 已登记并自动回填官方尺寸 ${r.ow}×${r.od}×${r.oh}` : '已登记（未匹配到官方库，仅存型号）');
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-3">
        <div className="text-sm text-[#c8a971]">登记电器 · 填型号自动带官方宽深高 / 开孔 / 说明书</div>
        <div className="flex gap-2">
          <input className="inp flex-1" placeholder="型号，如 BCD-603WGHFD2BW5U1" value={model}
            onChange={e => setModel(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup()} />
          <input className="inp w-40" placeholder="名称（冰箱…）" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn-ghost shrink-0" onClick={lookup}>查官方</button>
          <button className="btn-gold shrink-0" onClick={add}>登记</button>
        </div>
        {preview && (
          <div className="bg-[#0e0f11] border border-[#2a2e33] rounded-lg p-3 text-sm space-y-1">
            <div className="text-[#c8a971]">{preview.brand} · {preview.category} · {preview.model}</div>
            <div className="text-[#8a8f98]">{preview.name}</div>
            <div>官方尺寸：{preview.w || preview.d || preview.h ? `${preview.w ?? '—'}×${preview.d ?? '—'}×${preview.h ?? '—'} mm` : preview.sizeRaw}</div>
            {preview.cutout && <div className="text-[#c8a971]">开孔/净空：{preview.cutout}</div>}
            {preview.page && <a className="text-blue-400 text-xs underline" href={preview.page} target="_blank" rel="noreferrer">官方页面 ↗</a>}
          </div>
        )}
        {msg && <div className="text-xs text-[#8a8f98]">{msg}</div>}
      </div>

      {d.appliances.map(a => (
        <div key={a.id} className="panel p-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-medium">{a.name || a.brand || '未命名'}</span>
            <span className="text-xs text-[#8a8f98]">{a.brand} {a.model}</span>
            <div className="flex-1" />
            {a.pageUrl && <a className="text-blue-400 text-xs underline" href={a.pageUrl} target="_blank" rel="noreferrer">官方页 ↗</a>}
            <button className="text-[#8a8f98] hover:text-red-400 cursor-pointer"
              onClick={async () => { await apiDelete(`/api/appliances/${a.id}`); refresh(); }}>×</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-[#8a8f98] text-xs">官方宽×深×高：</span>
              {(a.ow || a.od || a.oh) ? `${a.ow ?? '—'}×${a.od ?? '—'}×${a.oh ?? '—'} mm` : <span className="text-[#8a8f98]">未匹配</span>}
            </div>
            <div>
              <span className="text-[#8a8f98] text-xs">开孔/净空：</span>{a.cutout || <span className="text-[#8a8f98]">—</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- 自检 ----------
function Checklist({ clientId }: { clientId: string }) {
  const [defs, setDefs] = useState<{ key: string; text: string }[]>([]);
  const [state, setState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiGet<{ definitions: { key: string; text: string }[]; state: Record<string, boolean> }>('/api/checks?clientId=' + clientId)
      .then(r => { setDefs(r.definitions); setState(r.state); });
  }, [clientId]);

  const toggle = async (key: string) => {
    const next = { ...state, [key]: !state[key] };
    setState(next);
    await apiPut('/api/checks', { clientId, items: next });
  };

  const done = defs.filter(x => state[x.key]).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#c8a971]">交底前自检清单</span>
        <span className="text-xs text-[#8a8f98]">{done}/{defs.length}</span>
      </div>
      {defs.map(x => (
        <label key={x.key} className="panel p-3.5 flex items-center gap-3 cursor-pointer hover:border-[#c8a971]/30 transition-colors">
          <input type="checkbox" checked={!!state[x.key]} onChange={() => toggle(x.key)}
            className="accent-[#c8a971] w-4 h-4" />
          <span className={`text-sm ${state[x.key] ? 'text-[#8a8f98] line-through' : ''}`}>{x.text}</span>
          <span className="ml-auto text-xs text-[#8a8f98]">{x.key}</span>
        </label>
      ))}
    </div>
  );
}

// ---------- 会议 ----------
function Meetings({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  return (
    <div className="space-y-3">
      {d.meetings.map(m => (
        <div key={m.id} className="panel p-4">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-[#c8a971]">{m.date}</span>
            <span className="text-[#8a8f98]">{m.attendees}</span>
          </div>
          {m.topics && <div className="text-sm mt-2">{m.topics}</div>}
          {m.conclusion && <div className="text-sm text-[#8a8f98] mt-1">结论：{m.conclusion}</div>}
          {(m.followUps || []).map(fu => (
            <div key={fu.id} className="flex items-center gap-2 mt-2 text-sm">
              <input type="checkbox" checked={!!fu.done} className="accent-[#c8a971] w-3.5 h-3.5"
                onChange={async e => {
                  await apiPatch(`/api/followups/${fu.id}`, { done: e.target.checked }); refresh();
                }} />
              <span className={fu.done ? 'line-through text-[#8a8f98]' : ''}>{fu.text}</span>
              {fu.due && <span className="text-xs text-[#8a8f98]">{fu.due}</span>}
            </div>
          ))}
        </div>
      ))}
      {!d.meetings.length && <div className="text-sm text-[#8a8f98]">暂无会议记录（可通过 MCP 或 API 录入）</div>}
    </div>
  );
}

// ---------- 资料 ----------
function Files({ d, refresh }: { d: ClientDetail; refresh: () => void }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await apiPost('/api/files', { clientId: d.client.id, name, url });
    setName(''); setUrl(''); refresh();
  };

  const upload = async (f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('clientId', d.client.id);
    await fetch('/api/upload', { method: 'POST', body: fd });
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4 space-y-2">
        <div className="flex gap-2">
          <input className="inp flex-1" placeholder="资料名称" value={name} onChange={e => setName(e.target.value)} />
          <input className="inp flex-1" placeholder="外链 URL（网盘/在线文档）" value={url} onChange={e => setUrl(e.target.value)} />
          <button className="btn-gold shrink-0" onClick={add}>添加外链</button>
        </div>
        <label className="block border border-dashed border-[#2a2e33] rounded-lg p-3 text-center text-xs text-[#8a8f98] cursor-pointer hover:border-[#c8a971]/50">
          点击或拖拽上传文件（量尺照片 / CAD / PDF / SKP…）
          <input type="file" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {d.files.map(f => (
        <div key={f.id} className="panel p-3.5 flex items-center gap-3">
          <span className="tag border-[#2a2e33] text-[#8a8f98]">{f.ext || 'link'}</span>
          <a className="flex-1 text-sm hover:text-[#c8a971] cursor-pointer" href={f.url} target="_blank" rel="noreferrer">{f.name}</a>
          {f.date && <span className="text-xs text-[#8a8f98]">{f.date}</span>}
          <button className="text-[#8a8f98] hover:text-red-400 cursor-pointer"
            onClick={async () => { await apiDelete(`/api/files/${f.id}`); refresh(); }}>×</button>
        </div>
      ))}
    </div>
  );
}
