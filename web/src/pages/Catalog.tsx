import { useEffect, useState } from 'react';
import { apiGet, type CatalogBrief } from '../api';

const BRANDS = ['全部', '方太', '海尔', '卡萨帝', '老板', '美的', 'COLMO', '东芝', '小天鹅', '华凌',
  '西门子', '博世', '利勃海尔', '嘉格纳'];

export default function Catalog() {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('全部');
  const [onlyCut, setOnlyCut] = useState(false);
  const [items, setItems] = useState<CatalogBrief[]>([]);
  const [stats, setStats] = useState<{ models: number; brands: string[]; withCut: number; withDoc: number; withDims: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiGet<{ models: number; brands: string[]; withCut: number; withDoc: number; withDims: number }>('/api/catalog/stats').then(setStats);
  }, []);

  const search = async () => {
    setLoading(true);
    const p = new URLSearchParams({ q, limit: '50' });
    if (brand !== '全部') p.set('brand', brand);
    if (onlyCut) p.set('onlyCut', '1');
    const r = await apiGet<{ items: CatalogBrief[] }>(`/api/catalog/search?${p}`);
    setItems(r.items);
    setLoading(false);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">电器资料库</h1>
          {stats && (
            <div className="text-xs text-[#8a8f98] mt-1">
              {stats.models.toLocaleString()} 型号 · {stats.brands.length} 品牌 · {stats.withDims.toLocaleString()} 有本体尺寸 · {stats.withCut.toLocaleString()} 含开孔/嵌入 · 数据全部来自品牌大陆官网
            </div>
          )}
        </div>
        <div className="text-[11px] text-[#8a8f98] leading-relaxed text-right">
          <div><span className="text-emerald-400">■</span> 官方原值（含按官网显式标签还原）</div>
          <div className="mt-0.5">方向标注不明的串一律不还原，仅展示官方原始串</div>
        </div>
      </div>

      <div className="panel p-4 mb-4">
        <div className="flex gap-2 mb-3">
          <input className="inp flex-1" placeholder="搜型号 / 品名，如 BCD-603、嵌入式蒸烤箱、利勃海尔"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
          <button className="btn-gold" onClick={search}>搜索</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {BRANDS.map(b => (
            <button key={b}
              className={`px-2.5 py-1 rounded text-xs cursor-pointer border transition-colors ${
                brand === b ? 'border-[#c8a971] text-[#c8a971] bg-[#c8a971]/10' : 'border-[#2a2e33] text-[#8a8f98] hover:text-[#e8e6e3]'
              }`} onClick={() => setBrand(b)}>{b}</button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-[#8a8f98] cursor-pointer ml-2">
            <input type="checkbox" checked={onlyCut} onChange={e => setOnlyCut(e.target.checked)}
              className="accent-[#c8a971] w-3.5 h-3.5" />
            只看含开孔/净空
          </label>
        </div>
      </div>

      {loading && <div className="text-sm text-[#8a8f98]">搜索中…</div>}

      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className={`panel p-4 ${it.cutout ? 'border-l-4 border-l-[#c8a971]' : ''}`}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="tag border-[#c8a971]/50 text-[#c8a971]">{it.brand}</span>
              <span className="font-medium text-sm">{it.model}</span>
              <span className="text-sm text-[#8a8f98]">{it.name}</span>
              <span className="text-xs text-[#8a8f98]">{it.category}</span>
              {it.cutout && <span className="tag border-emerald-800 text-emerald-400">含开孔</span>}
              <div className="flex-1" />
              {it.page && <a className="text-blue-400 text-xs underline" href={it.page} target="_blank" rel="noreferrer">官方页 ↗</a>}
            </div>
            <div className="grid grid-cols-3 gap-3 mt-2 text-sm">
              <div>
                <span className="text-[#8a8f98] text-xs">宽×深×高：</span>
                {(it.w || it.d || it.h) ? (
                  <>
                    <span className="text-emerald-300">
                      {it.w ?? '—'}×{it.d ?? '—'}×{it.h ?? '—'} mm
                    </span>
                    {it.dimSource === 'official-label' && (
                      <span className="text-[10px] text-emerald-500/80 ml-1">官网标签还原</span>
                    )}
                  </>
                ) : <span className="text-[#8a8f98]">未还原</span>}
              </div>
              <div className="col-span-2">
                <span className="text-[#8a8f98] text-xs">官方原始串：</span>
                <span className="text-[#e8e6e3]/85">{it.sizeRaw || '—'}</span>
              </div>
            </div>
            {it.cutout && (
              <div className="mt-2 text-sm">
                <span className="text-emerald-400 text-xs">⭐ 开孔/净空：</span>
                <span className="text-emerald-300">{it.cutout}</span>
              </div>
            )}
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div className="text-sm text-[#8a8f98]">输入关键词搜索 22,437 个型号——含开孔项左侧有金色边条</div>
        )}
      </div>
    </div>
  );
}
