import { loadCatalog } from './catalog.js';

const c = loadCatalog();
const byBrand: Record<string, number> = {};
const dimsByBrand: Record<string, number> = {};
const cutByBrand: Record<string, number> = {};
const docByBrand: Record<string, number> = {};
for (const it of c.items) {
  const b = it.b || '?';
  byBrand[b] = (byBrand[b] || 0) + 1;
  if (it.w || it.d || it.h) dimsByBrand[b] = (dimsByBrand[b] || 0) + 1;
  if (it.cut) cutByBrand[b] = (cutByBrand[b] || 0) + 1;
  if (it.doc) docByBrand[b] = (docByBrand[b] || 0) + 1;
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
console.log('型号总数:', c.items.length, '| 品牌:', c.brands.length, '(', c.brands.join(' '), ')');
console.log('有本体尺寸:', sum(dimsByBrand));
console.log('含开孔    :', sum(cutByBrand));
console.log('有资料    :', sum(docByBrand));
console.log('\n品牌 | 型号 | 尺寸 | 开孔 | 资料');
for (const [b, n] of Object.entries(byBrand).sort((a, c2) => c2[1] - a[1])) {
  console.log(`${b.padEnd(6)} ${String(n).padStart(6)} ${String(dimsByBrand[b] || 0).padStart(6)} ${String(cutByBrand[b] || 0).padStart(5)} ${String(docByBrand[b] || 0).padStart(5)}`);
}
console.log('\n--- 方太抽样（含开孔）---');
const ft = c.items.filter((i) => i.b === '方太' && i.cut).slice(0, 5);
for (const i of ft) console.log(`${i.c} | ${i.m} | ${i.w}x${i.d}x${i.h} | ${String(i.cut).slice(0, 70)}`);
