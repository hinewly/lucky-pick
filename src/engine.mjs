// engine.mjs —— 彩票荐号引擎（Node 版，与 index.html 算法同源，去 DOM 依赖）
// 所有频率/权重/采样/命中逻辑从已验证的网页代码原样抽取，避免漂移。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------- 数据访问 ----------
export function loadData(game) {
  const file = path.join(__dirname, 'data', game + '.js');
  const txt = fs.readFileSync(file, 'utf8');
  const window = {};
  // 数据文件形如 window.DLT = {...} / window.QXC = {...}
  eval(txt);
  return window[game.toUpperCase()];
}

// ---------- 频率分析 ----------
export function freqDLT(rec) {
  const front = new Array(36).fill(0), back = new Array(13).fill(0);
  rec.forEach(dr => { dr.front.forEach(n => front[n]++); dr.back.forEach(n => back[n]++); });
  return { front, back };
}
export function freqQXC(rec, allDraws) {
  const P = allDraws[0].nums.length;
  const dom = [], pos = [];
  for (let p = 0; p < P; p++) {
    const set = new Set(); allDraws.forEach(dr => set.add(dr.nums[p]));
    const dm = [...set].sort((a, b) => a - b); dom.push(dm);
    const m = {}; dm.forEach(v => m[v] = 0);
    rec.forEach(dr => m[dr.nums[p]]++); pos.push(m);
  }
  return { pos, dom };
}

// ---------- 环境基准（透明、可复现）----------
export function dateBaseValue(date, weatherOn = 0, weatherVal = 0) {
  const w = weatherOn ? weatherVal : 0;
  return date.getFullYear() + date.getMonth() + date.getDate() + w;
}

// ---------- 采样 ----------
// Efraimidis-Spirakis 不放回加权抽样：key=-ln(u)/w，按 key 升序取前 k（权重越大越优先）
export function pickNoReplace(weights, k) {
  const keys = Object.keys(weights).map(Number);
  const scored = keys.map(n => ({ n, key: -Math.log(Math.random()) / (weights[n] + 1e-9) }));
  scored.sort((a, b) => a.key - b.key);
  return scored.slice(0, k).map(x => x.n).sort((a, b) => a - b);
}
export function pickOne(weights) {
  let sum = 0; for (const k in weights) sum += weights[k];
  let r = Math.random() * sum;
  for (const k in weights) { r -= weights[k]; if (r <= 0) return Number(k); }
  const ks = Object.keys(weights); return Number(ks[ks.length - 1]);
}

export function parseSet(str) {
  return new Set((str || '').split(/[\s,，]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(n => !isNaN(n)));
}

// ---------- 权重合成 ----------
export function weightsDLT(fr, A, envBase) {
  const tot = A.a + A.b + A.c + A.d || 1; const a = A.a / tot, b = A.b / tot, c = A.c / tot, d = A.d / tot;
  const maxF = Math.max(...fr.front.slice(1)), maxB = Math.max(...fr.back.slice(1));
  const envF = ((envBase % 35) + 35) % 35 + 1, envB = ((envBase % 12) + 12) % 12 + 1;
  const fw = {}, bw = {};
  for (let n = 1; n <= 35; n++) {
    let w = a * (fr.front[n] / (maxF || 1)) + b * (A.lucky.has(n) ? 1 : 0.5) + c * (n === envF ? 1 : 0.5) + d * Math.random();
    if (A.avoid.has(n)) w *= 0.05; fw[n] = w;
  }
  for (let n = 1; n <= 12; n++) {
    let w = a * (fr.back[n] / (maxB || 1)) + b * (A.lucky.has(n) ? 1 : 0.5) + c * (n === envB ? 1 : 0.5) + d * Math.random();
    if (A.avoid.has(n)) w *= 0.05; bw[n] = w;
  }
  return { fw, bw };
}
export function weightsQXC(fq, A, envBase) {
  const tot = A.a + A.b + A.c + A.d || 1; const a = A.a / tot, b = A.b / tot, c = A.c / tot, d = A.d / tot;
  return fq.pos.map((m, p) => {
    const maxC = Math.max(...Object.values(m));
    const envVal = fq.dom[p][((envBase + p) % fq.dom[p].length + fq.dom[p].length) % fq.dom[p].length];
    const w = {};
    for (const v of fq.dom[p]) {
      let ww = a * (m[v] / (maxC || 1)) + b * (A.lucky.has(v) ? 1 : 0.5) + c * (v === envVal ? 1 : 0.5) + d * Math.random();
      if (A.avoid.has(v)) ww *= 0.05; w[v] = ww;
    }
    return w;
  });
}

// ---------- 生成 N 注 ----------
export function generateSets(game, rec, allDraws, A, N, envBase) {
  const sets = [];
  if (game === 'dlt') {
    const fr = freqDLT(rec); const { fw, bw } = weightsDLT(fr, A, envBase);
    for (let i = 0; i < N; i++) sets.push({ front: pickNoReplace(fw, 5), back: pickNoReplace(bw, 2) });
  } else {
    const fq = freqQXC(rec, allDraws); const ws = weightsQXC(fq, A, envBase);
    for (let i = 0; i < N; i++) sets.push({ nums: ws.map(w => pickOne(w)) });
  }
  return sets;
}

// ---------- 命中计算 ----------
export function matchCount(game, set, actual) {
  if (game === 'dlt') {
    const frontHit = set.front.filter(n => actual.front.includes(n));
    const backHit = set.back.filter(n => actual.back.includes(n));
    const f = frontHit.length, b = backHit.length;
    return { front: f, back: b, frontHit, backHit,
      text: `前区命中 ${f}/5，后区命中 ${b}/2` };
  } else {
    const posHit = [];
    let c = 0, run = 0, maxRun = 0, frontP = 0, lastP = 0;
    for (let i = 0; i < set.nums.length; i++) {
      if (set.nums[i] === actual.nums[i]) {
        c++; posHit.push(i); run++; maxRun = Math.max(maxRun, run);
        if (i < 6) frontP++; else lastP = 1;
      } else run = 0;
    }
    return { pos: c, posHit, maxRun, frontP, lastP, text: `位命中 ${c}/7` };
  }
}

// ---------- 奖级判定（命中数 → 奖级 1..7，0=未中奖）----------
// 大乐透：前区5 + 后区2。现行九奖级，本项目以七奖级合并呈现；胜负判定与官方一致。
// 一等 5+2 / 二等 5+1 / 三等 5+0 或 4+2 / 四等 4+1 / 五等 4+0 或 3+2
// / 六等 3+1 或 2+2 / 七等 3+0、2+1、1+2、0+2 / 其余(2+0,1+1,1+0,0+1,0+0)=未中奖
export function awardTierDLT(f, b) {
  if (f === 5 && b === 2) return 1;
  if (f === 5 && b === 1) return 2;
  if ((f === 5 && b === 0) || (f === 4 && b === 2)) return 3;
  if (f === 4 && b === 1) return 4;
  if ((f === 4 && b === 0) || (f === 3 && b === 2)) return 5;
  if ((f === 3 && b === 1) || (f === 2 && b === 2)) return 6;
  if ((f === 3 && b === 0) || (f === 2 && b === 1) || (f === 1 && b === 2) || (f === 0 && b === 2)) return 7;
  return 0;
}
// 七星彩现行规则（体彩官网，按位计数制，六奖级，无七等奖）：
// 一等=7位全中；二等=前6位全中；三等=前6位任意5个+最后一位中；
// 四等=任意5个按位相同；五等=任意4个按位相同；
// 六等=任意3个按位相同 或 前6位任意1个+最后一位中 或 仅最后一位(特别号)相同；其余=未中奖
export function awardTierQXC(pos, frontP, lastP) {
  if (pos === 7) return 1;
  if (frontP === 6 && lastP === 0) return 2;
  if (frontP === 5 && lastP === 1) return 3;
  if (pos === 5) return 4;
  if (pos === 4) return 5;
  if (pos === 3 || lastP === 1) return 6;
  return 0;
}
export const TIER_NAMES = { 1: '一等奖', 2: '二等奖', 3: '三等奖', 4: '四等奖', 5: '五等奖', 6: '六等奖', 7: '七等奖', 0: '未中奖' };
// 特别标注门槛：四等奖及以上（tier<=4）。三等奖及以上（tier<=3）用更强标记。
export const ALERT_TIER_MAX = 4;

// ---------- 固定评估方案（永远固定，对照用）----------
export const SCHEMES = {
  A: { name: '重热度', a: 4, b: 1, c: 1, d: 1 },
  B: { name: '重偏好', a: 1, b: 4, c: 1, d: 1 },
  C: { name: '重环境', a: 1, b: 1, c: 4, d: 1 },
  D: { name: '重运气', a: 1, b: 1, c: 1, d: 4 },
  E: { name: '均衡', a: 1, b: 1, c: 1, d: 1 },
};

export const LOOKBACK_DEFAULT = 50;
