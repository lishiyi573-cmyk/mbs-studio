// ============================================================
// 家电资料库集成层（多数据源）
//   源1：D:\...\家电资料库\_总索引\_all.json        —— 22,437 型号 / 12 品牌
//   源2：D:\...\方太资料库_大陆版\方太大陆型号数据.json ——   467 型号 / 方太
// 字段缩写：b品牌 c品类 m型号 n名称 w/d/h本体尺寸 cut开孔或净空
//          sz综合尺寸 np参数项数 p参数 ni资料数 doc资料直链 img图片 u链接
// 说明：两个源都只读，本层只在内存中归一并补全，绝不写回原文件。
// ============================================================
import fs from 'node:fs';

const ALL_JSON = 'D:/2026李十一/BaiduSyncdisk/家电资料库/_总索引/_all.json';
const FOTILE_JSON = 'D:/2026李十一/BaiduSyncdisk/方太资料库_大陆版/方太大陆型号数据.json';
// 官网尺寸覆盖层（非破坏性）：上游抓取时丢了键名里的方向标注，这里按 URL 补回
//   _haier_dims.jsonl  —— 重抓官网规格表得到（海尔 JSON-LD 键名被剥离，只能重抓）
//   _dims_local.jsonl  —— 从本地原始 jsonl 的带方向键名抽出（卡萨帝/美的等）
const DIM_OVERLAYS = [
  'D:/2026李十一/BaiduSyncdisk/家电资料库/02_海尔Haier/_data/_haier_dims.jsonl',
  'D:/2026李十一/BaiduSyncdisk/家电资料库/03_卡萨帝Casarte/_data/_dims_local.jsonl',
  'D:/2026李十一/BaiduSyncdisk/家电资料库/04_美的Midea/_data/_dims_local.jsonl',
  'D:/2026李十一/BaiduSyncdisk/家电资料库/07_利勃海尔Liebherr/_data/_dims_local.jsonl',
];

export interface CatalogItem {
  b: string; c: string; m: string; n: string;
  w?: number | string; d?: number | string; h?: number | string;
  cut?: string; sz?: string; np?: number; p?: string;
  ni?: number; doc?: string; img?: string; ins?: string; u?: string;
}

export interface Catalog {
  items: CatalogItem[];
  byModel: Map<string, CatalogItem[]>;   // 型号（大写）→ 条目
  brands: string[];
  loadedAt: string;
  source: string;
}

let catalog: Catalog | null = null;

// ------------------------------------------------------------
// 尺寸串安全解析（仅解析「标签顺序明确」的串）
// 依据：用户红线——不接受跨品类套用公式，不做静默猜测。
// 只有串里显式写明 深/宽/高（或 长→宽、厚→深）的顺序时才还原数值，
// 顺序不明确的一律不解析，保留原始串 sz 供人工核对。
// 单位：串里显式出现 cm/厘米 才 ×10，绝不按数值大小反推单位。
// ------------------------------------------------------------
const DIM_LABEL: Record<string, 'w' | 'd' | 'h'> = {
  宽: 'w', 宽度: 'w', 长: 'w', 长度: 'w',
  深: 'd', 深度: 'd', 厚: 'd', 厚度: 'd',
  高: 'h', 高度: 'h',
};

/** 从标签串中提取顺序，如 "深*宽*高" → ['d','w','h'] */
function labelOrder(label: string): ('w' | 'd' | 'h')[] {
  const chars = label.match(/宽|深|高|长|厚/g) || [];
  return chars
    .map((ch) => DIM_LABEL[ch])
    .filter((x): x is 'w' | 'd' | 'h' => !!x);
}

export function parseLabeledSize(sz: string): { w: number; d: number; h: number } | null {
  if (!sz) return null;
  // 否决 1：包装/纸箱尺寸 ≠ 机器本体尺寸，混入会直接误导柜体预留
  if (/包装|纸箱|外箱/.test(sz)) return null;

  const s = String(sz)
    .replace(/[（]/g, '(').replace(/[）]/g, ')')
    .replace(/[×✕✖*＊·•]/g, 'x')
    .replace(/[／]/g, '/');

  // 1) 全串扫描「轴标签连续串」，不限位置（可能出现在括号内或某个冒号之后）
  //    如 深*宽*高 / 长*宽*高 / 高/宽/深 / 高 × 宽 × 深 / 高宽深
  const axisRunRe = /[宽深高长厚](?:\s*[xX、,./\-]?\s*[宽深高长厚]){1,3}/g;
  const runs: string[] = [];
  for (const mm of s.matchAll(axisRunRe)) runs.push(mm[0]);
  if (!runs.length) return null;

  const isCm = /cm|厘米/i.test(s);

  for (const run of runs) {
    const order = labelOrder(run);
    // 顺序必须恰好三维且不重复；重复（如「长*宽*高」中长/宽都指向宽轴）＝顺序不明，跳过
    if (order.length !== 3) continue;
    if (new Set(order).size !== 3) continue;

    // 2) 数值只从「该标签串之后」取，避免命中标签本身的字符
    const tail = s.slice(s.indexOf(run) + run.length);
    // 否决 2：含区间（895*2008 ~ 2028*600）时数字个数与含义都不定 → 放弃
    if (/\d\s*[~～至—–-]\s*\d/.test(tail)) continue;
    const nums = (tail.replace(/(\d),(\d{3})/g, '$1$2').match(/\d+(?:\.\d+)?/g) || [])
      .map(Number)
      .filter((n) => n > 0);
    // 否决 3：必须恰好 3 个数字，多一个都说明串里还夹着别的量（开孔/包装/型号）
    if (nums.length !== 3) continue;

    // 3) 单位：仅显式 cm/厘米 才 ×10
    const raw = nums.map((n) => (isCm ? n * 10 : n));

    // 4) 合理性校验：家电三维 20~3000mm，否则宁可空也不输出错的
    if (!raw.every((n) => n >= 20 && n <= 3000)) continue;

    const out: { w: number; d: number; h: number } = { w: 0, d: 0, h: 0 };
    order.forEach((k, i) => { out[k] = Math.round(raw[i]); });
    return out;
  }
  return null;
}

/** 给一条记录补全 w/d/h（仅当原本为空且串可安全解析） */
function fillDims(it: CatalogItem): void {
  if (it.w || it.d || it.h) return;
  const parsed = parseLabeledSize(it.sz || '');
  if (!parsed) return;
  it.w = parsed.w; it.d = parsed.d; it.h = parsed.h;
  (it as any).dp = 1; // 数值由本层按官网显式标签读出
}

// ------------------------------------------------------------
// 官网尺寸覆盖层
// 上游抓取（JSON-LD）把键名里的方向标注丢了，如官网原文
//   「产品尺寸(宽*高*深)mm = 905*1850*617」
// 被存成「产品尺寸 = 905*1850*617」→ 顺序无从判断。
// 补采脚本把带方向的键+值单独落盘，这里按 URL 归并。
// 注意：方向因型号而异（同品牌同时存在 宽*高*深 与 宽*深*高），
//       所以只能逐条按标签读，绝不能按品牌套固定顺序。
// ------------------------------------------------------------
function loadDimOverlays(): Map<string, { w: number; d: number; h: number }> {
  const map = new Map<string, { w: number; d: number; h: number }>();
  for (const file of DIM_OVERLAYS) {
    let txt = '';
    try { txt = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (!o.u) continue;
        const dims = parseLabeledSize(`${o.k || ''} ${o.v || ''}`);
        if (dims && !map.has(o.u)) map.set(o.u, dims);
      } catch { /* 跳过坏行 */ }
    }
  }
  return map;
}

// ------------------------------------------------------------
// 方太（FOTILE）数据源
// 方太官网的尺寸串是「逐轴标注方向」的——长（左右）/宽（前后）/高（上下）/深（前后），
// 每个数值自带方向，不存在顺序歧义，因此可直接读为官方值（绿）。
// 注意：标签括号内可能夹说明文字（如「高(上下，含底盖)643」），需容忍。
// 开孔分「全嵌」「半嵌」两套且数值可能不同，两套都要保留，不可只留一套。
// ------------------------------------------------------------
const DIR_AXIS: Record<string, 'w' | 'd' | 'h'> = { 左右: 'w', 前后: 'd', 上下: 'h' };

export function parseFotileSize(sz: string): { w: number; d: number; h: number } | null {
  if (!sz) return null;
  const s = String(sz).replace(/[（]/g, '(').replace(/[）]/g, ')');
  const re = /(长|宽|高|深)\s*\(\s*(左右|前后|上下)[^)]{0,20}\)\s*[≥>=]?\s*(\d+(?:\.\d+)?)/g;
  const out: { w: number; d: number; h: number } = { w: 0, d: 0, h: 0 };
  let m: RegExpExecArray | null;
  let n = 0;
  const isCm = /cm|厘米/i.test(s);
  while ((m = re.exec(s))) {
    const axis = DIR_AXIS[m[2]];
    if (!axis) continue;
    let v = Math.round(Number(m[3]) * (isCm ? 10 : 1));
    if (v < 20 || v > 3000) continue;
    if (!out[axis]) { out[axis] = v; n++; }
  }
  return n >= 3 ? out : null; // 必须三维齐全，否则保留原始串
}

/** 载入方太数据源，转成统一 CatalogItem 结构 */
function loadFotile(): CatalogItem[] {
  let rows: any[] = [];
  try {
    rows = JSON.parse(fs.readFileSync(FOTILE_JSON, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch (e) {
    console.warn('[catalog] 方太资料库未加载成功（', (e as Error).message, '）');
    return [];
  }
  const out: CatalogItem[] = [];
  for (const r of rows) {
    const size = String(r.size || '').trim();
    const dims = parseFotileSize(size);
    // 开孔：全嵌 / 半嵌 两套，数值不同时都写出来，避免施工拿错
    const full = String(r.holeFull || '').trim();
    const half = String(r.holeHalf || '').trim();
    const parts: string[] = [];
    if (full) parts.push(`全嵌 ${full}`);
    if (half && half !== full) parts.push(`半嵌 ${half}`);
    if (!parts.length && r.hole) parts.push(String(r.hole));
    const specs = (r.specs && typeof r.specs === 'object') ? r.specs : {};
    const p = Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join(' | ').slice(0, 400);
    out.push({
      b: '方太',
      c: String(r.cat || '').replace(/^\d+_/, ''),
      m: String(r.model || '').trim(),
      n: '',
      w: dims?.w ?? '', d: dims?.d ?? '', h: dims?.h ?? '',
      cut: parts.join(' ｜ '),
      sz: size,
      np: Object.keys(specs).length,
      p,
      ni: r.manual ? 1 : 0,
      doc: r.manual ? `说明书|${r.manual}` : '',
      u: r.goodsId ? `https://www.fotile.com/product/${r.goodsId}.html` : '',
    });
  }
  return out;
}

export function loadCatalog(): Catalog {
  if (catalog) return catalog;
  let items: CatalogItem[] = [];
  try {
    items = JSON.parse(fs.readFileSync(ALL_JSON, 'utf8'));
  } catch (e) {
    console.warn('[catalog] 家电资料库未加载成功（', (e as Error).message, '）——电器官方尺寸回填将不可用');
    items = [];
  }
  const nMain = items.length;

  // 源2：方太（独立目录，数据结构不同 → 此处归一）
  const fotile = loadFotile();
  items = items.concat(fotile);

  const byModel = new Map<string, CatalogItem[]>();
  let filled = 0;
  let overlayHits = 0;
  const overlay = loadDimOverlays();
  for (const it of items) {
    // 先按官网补采覆盖层补（优先级最高：直接来自官网规格表）
    if (!(it.w || it.d || it.h) && it.u) {
      const d = overlay.get(it.u);
      if (d) { it.w = d.w; it.d = d.d; it.h = d.h; (it as any).dov = 1; overlayHits++; }
    }
    fillDims(it);
    if ((it as any).dp) filled++;
    const key = String(it.m || '').toUpperCase().trim();
    if (!key) continue;
    if (!byModel.has(key)) byModel.set(key, []);
    byModel.get(key)!.push(it);
  }
  catalog = {
    items,
    byModel,
    brands: [...new Set(items.map(i => i.b))],
    loadedAt: new Date().toISOString(),
    source: ALL_JSON,
  };
  console.log(`[catalog] 家电资料库已加载：${items.length} 型号 / ${catalog.brands.length} 品牌（主库 ${nMain} + 方太 ${fotile.length}；官网补采 ${overlayHits} 条，标签解析 ${filled} 条）`);
  return catalog;
}

/** 按型号精确匹配（自动大写化） */
export function findByModel(model: string): CatalogItem[] {
  const c = loadCatalog();
  return c.byModel.get(String(model).toUpperCase().trim()) || [];
}

/** 关键词搜索：型号包含 或 名称/品牌包含，返回前 N 条 */
export function searchCatalog(q: string, opts: { brand?: string; onlyCut?: boolean; limit?: number } = {}) {
  const c = loadCatalog();
  const limit = opts.limit ?? 30;
  const kw = q.trim().toUpperCase();
  const out: CatalogItem[] = [];
  for (const it of c.items) {
    if (opts.brand && it.b !== opts.brand) continue;
    if (opts.onlyCut && !it.cut) continue;
    if (kw) {
      const m = String(it.m || '').toUpperCase();
      const n = String(it.n || '');
      const b = String(it.b || '');
      const cat = String(it.c || '');
      // 品类也参与匹配：这样「油烟机」「蒸烤箱」这类词能直接搜到
      if (!(m.includes(kw) || n.toUpperCase().includes(kw) || b.toUpperCase().includes(kw) || cat.toUpperCase().includes(kw))) continue;
    }
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/** 摘要视图（给 MCP 返回，控制 token 量） */
export function brief(it: CatalogItem) {
  const any = it as any;
  const has = !!(it.w || it.d || it.h);
  return {
    brand: it.b, category: it.c, model: it.m, name: it.n,
    w: it.w ?? null, d: it.d ?? null, h: it.h ?? null,
    // official = 数据源直接给出；official-label = 按官网串里的显式方向标注读出（两者均为官方值，无推断）
    dimSource: has ? (any.dov || any.dp ? 'official-label' : 'official') : null,
    cutout: it.cut || null, sizeRaw: it.sz || null,
    docs: it.doc || null, page: it.u || null,
  };
}
