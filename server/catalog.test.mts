// 标签尺寸解析器的真值测试（跑：npx tsx server/catalog.test.mts）
import { parseLabeledSize, parseFotileSize } from './catalog.js';

const cases: [string, string, { w: number; d: number; h: number } | null][] = [
  // 卡萨帝 冰箱：深*宽*高 mm
  ['卡萨帝-冰箱', '产品尺寸(深*宽*高)mm: 540*555*1770', { w: 555, d: 540, h: 1770 }],
  ['卡萨帝-冰箱2', '产品尺寸(深*宽*高)mm: 702*905*1900', { w: 905, d: 702, h: 1900 }],
  // 老板 燃气灶：长*宽*高 → 长/宽 皆指向宽轴＝顺序重复 → 必须 null（不猜）
  ['老板-灶具', '外形尺寸（长*宽*高）: （440*320*170）mm', null],
  // 利勃海尔：高/宽/深 + cm
  ['利勃海尔', '外部尺寸：高/宽/深: 185.5 / 59.7 / 67.5 cm', { w: 597, d: 675, h: 1855 }],
  // 嘉格纳：高 × 宽 × 深 + 毫米
  ['嘉格纳', '尺寸（高 × 宽 × 深）: 2123x894x608 毫米', { w: 894, d: 608, h: 2123 }],
  // 无分隔的连续标签 高宽深
  ['高宽深', '外部尺寸高宽深: 200x60x65 毫米', { w: 60, d: 65, h: 200 }],
  // COLMO 烟机 宽*深*高
  ['COLMO-烟机', '自带装饰罩尺寸(宽*深*高): 500*320*600', { w: 500, d: 320, h: 600 }],
  // 顺序不明确 → 必须返回 null（不做猜测）
  ['西门子-无标签', '机器尺寸: 848x598x595 毫米', null],
  ['海尔-无标签', '产品尺寸: 830*1925*594', null],
  ['美的-无标签', '外机尺寸（长宽高）mm: 940（含阀体）*342*673', null],
  // 包装尺寸 / 区间尺寸 → 必须否决
  ['包装尺寸', '包装尺寸(高x宽x深)(毫米): 630x995x690 毫米', null],
  ['区间尺寸', '外形尺寸（宽*高*深）: （895*2008 ~ 2028*600）mm', null],
  // 异常值 → null
  ['超范围', '外形尺寸(宽*深*高): 5*5*5', null],
  ['空串', '', null],
];

let pass = 0, fail = 0;
for (const [label, input, expect] of cases) {
  const got = parseLabeledSize(input);
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(14)} in=${input.slice(0, 42).padEnd(44)} got=${JSON.stringify(got)}${ok ? '' : '  期望=' + JSON.stringify(expect)}`);
}

// ===== 方太专有格式（逐轴标注方向）=====
const ft: [string, string, { w: number; d: number; h: number } | null][] = [
  ['方太-烟机', '长（左右）900*宽（前后）510*高（上下）640mm', { w: 900, d: 510, h: 640 }],
  ['方太-蒸烤箱', '宽（左右）595*高（上下）457*深（前后）528mm', { w: 595, d: 528, h: 457 }],
  ['方太-热水器', '高（上下）590*宽（左右）360*深（前后）147mm', { w: 360, d: 147, h: 590 }],
  ['方太-洗碗机', '宽（左右）598*高（上下）775*深（前后）570mm（含门板）', { w: 598, d: 570, h: 775 }],
  ['方太-标签夹说明', '长（左右）505*宽（前后）505*高(上下，含底盖)643mm', { w: 505, d: 505, h: 643 }],
  ['方太-半角括号', '长（左右）1075*宽（前后）510*高（上下，含排水管）652mm', { w: 1075, d: 510, h: 652 }],
  ['方太-不完整', '长（左右）900*宽（前后）510mm', null],
];
for (const [label, input, expect] of ft) {
  const got = parseFotileSize(input);
  const ok = JSON.stringify(got) === JSON.stringify(expect);
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${label.padEnd(14)} in=${input.slice(0, 42).padEnd(44)} got=${JSON.stringify(got)}${ok ? '' : '  期望=' + JSON.stringify(expect)}`);
}

console.log(`\n通过 ${pass} / 失败 ${fail}`);
process.exit(fail ? 1 : 0);
