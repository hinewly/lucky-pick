// gen_weights.mjs —— 读 analysis/summary.json，算"近期最优方案"，把基准权重朝其移动 ±30% 输出 weights.json
// 防过拟合护栏：样本 < 10 期用默认均衡；移动封顶区间 0.2–5。
// 用法: node gen_weights.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCHEMES } from './engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sumFile = path.join(__dirname, 'analysis', 'summary.json');
const outFile = path.join(__dirname, 'weights.json');

function writeDefault(reason) {
  const out = { a: 1, b: 1, c: 1, d: 1, updatedAt: new Date().toISOString().slice(0, 10), bestScheme: 'E', bestName: '均衡', note: reason };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  fs.writeFileSync(outFile.replace(/\.json$/, '.js'), 'window.WEIGHTS = ' + JSON.stringify(out) + ';\n');
  console.log('weights.json -> 默认均衡 | ' + reason);
}

if (!fs.existsSync(sumFile)) { writeDefault('无 summary.json，使用默认均衡权重。'); process.exit(0); }
const sum = JSON.parse(fs.readFileSync(sumFile, 'utf8'));
const rows = sum.rows || [];
if (rows.length < 10) { writeDefault(`样本 < 10 期（${rows.length}），不过拟合，用默认均衡。`); process.exit(0); }

// 每方案平均得分（跨彩种归一化合并）
const acc = {};
for (const row of rows) {
  for (const [k, v] of Object.entries(row.schemes)) {
    if (!acc[k]) acc[k] = { s: 0, c: 0, name: v.name };
    const sc = row.game === 'dlt' ? (v.front / 5 + v.back / 2) / 2 : v.pos / 7;
    acc[k].s += sc; acc[k].c++;
  }
}
const avg = {}; for (const k in acc) avg[k] = acc[k].s / acc[k].c;

// 找最优
let best = null, bestV = -1;
for (const k in avg) { if (avg[k] > bestV) { bestV = avg[k]; best = k; } }
const target = SCHEMES[best];

// 当前基准
let cur = { a: 1, b: 1, c: 1, d: 1 };
if (fs.existsSync(outFile)) { try { const w = JSON.parse(fs.readFileSync(outFile, 'utf8')); cur = { a: w.a, b: w.b, c: w.c, d: w.d }; } catch (e) {} }

// 朝目标移动 30%，clamp 0.2–5
const clamp = (x) => Math.max(0.2, Math.min(5, x));
const move = (c, t) => clamp(c + (t - c) * 0.3);
const a = +move(cur.a, target.a).toFixed(2);
const b = +move(cur.b, target.b).toFixed(2);
const c = +move(cur.c, target.c).toFixed(2);
const d = +move(cur.d, target.d).toFixed(2);

const out = {
  a, b, c, d,
  updatedAt: new Date().toISOString().slice(0, 10),
  bestScheme: best, bestName: target.name,
  avgScore: Object.fromEntries(Object.entries(avg).map(([k, v]) => [k, +v.toFixed(3)])),
  note: `基于近 ${rows.length} 期汇总，${target.name} 方案命中最优（均值 ${bestV.toFixed(3)}），已将基准权重朝其移动 30%（封顶 0.2–5）。样本 < 10 期用均衡。`
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
fs.writeFileSync(outFile.replace(/\.json$/, '.js'), 'window.WEIGHTS = ' + JSON.stringify(out) + ';\n');
console.log(`生成 weights.json -> ${outFile} | 最优方案 ${best}(${target.name}) | 新基准 a${a}/b${b}/c${c}/d${d}`);
