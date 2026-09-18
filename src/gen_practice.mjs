// gen_practice.mjs —— 开奖前自动生成练习号码
// 5 套固定方案(A-E) 各生成 5 注，组内 ±20% 运气漂移，存 practice/期号.json(pending)
// 用法: node gen_practice.mjs [--qxc] [--issue 26098]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadData, generateSets, SCHEMES, parseSet, dateBaseValue } from './engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const game = args.includes('--qxc') ? 'qxc' : 'dlt';
const issueIdx = args.indexOf('--issue');
const argIssue = issueIdx >= 0 ? args[issueIdx + 1] : null;
const nIdx = args.indexOf('--n');
const RECO_N = nIdx >= 0 ? Math.max(1, parseInt(args[nIdx + 1], 10) || 5) : 5;
const N = 5;                 // 每组 5 注（对照实验）
const LOOKBACK = 50;

const data = loadData(game);
const latest = data.draws[data.draws.length - 1];

let issue = argIssue;
if (!issue) {
  // 目标期 = 最新已抓期号 +1。体彩年度期数约 150-156：
  // 若 data 中已出现次年期号，则取次年期号最大值+1；
  // 否则年内序号>=150 视为年末，下一期跨年（年份+1，序号归1）；其余直接+1。
  const num = parseInt(latest.issue, 10);
  const year = Math.floor(num / 1000);
  const seq = num % 1000;
  const hasNextYear = data.draws.some(d => parseInt(d.issue, 10) > (year + 1) * 1000);
  if (hasNextYear) {
    const ny = data.draws.filter(d => parseInt(d.issue, 10) >= (year + 1) * 1000).map(d => parseInt(d.issue, 10));
    issue = String(Math.max(...ny) + 1);
  } else if (seq >= 150) {
    issue = String((year + 1) * 1000 + 1);
  } else {
    issue = String(num + 1);
  }
}

const practiceDir = path.join(__dirname, 'practice');
fs.mkdirSync(practiceDir, { recursive: true });
// 大乐透(dlt)与七星彩(qxc)期号数字范围重叠，仅按期号命名会撞车，
// 故 dlt 加前缀 dlt_ 隔离；qxc 保持裸名以兼容已有匹配流程。
const outFile = path.join(practiceDir, (game === 'dlt' ? 'dlt_' : '') + issue + '.json');

// ---- 读取全局基准权重（近期最优方案倾向）；未启用(全1均衡)则不产推荐注 ----
let weights = null;
try {
  const wf = path.join(__dirname, 'weights.json');
  if (fs.existsSync(wf)) {
    const w = JSON.parse(fs.readFileSync(wf, 'utf8'));
    if (!(w.a === 1 && w.b === 1 && w.c === 1 && w.d === 1)) weights = w;
  }
} catch (e) { weights = null; }
const bestScheme = weights ? weights.bestScheme : 'E';

// ---- 推荐注：用全局基准权重生成，独立文件，不进对照统计/不参与 match 统计（避免正反馈污染）----
if (weights) {
  const recoFile = path.join(practiceDir, 'recommend_' + (game === 'dlt' ? 'dlt_' : '') + issue + '.json');
  const A = { a: weights.a, b: weights.b, c: weights.c, d: weights.d, lucky: parseSet(''), avoid: parseSet('') };
  const recoSets = generateSets(game, data.draws.slice(-LOOKBACK), data.draws, A, RECO_N, dateBaseValue(new Date()));
  const recoOut = {
    game, issue, genDate: new Date().toISOString().slice(0, 10),
    source: 'weights', bestScheme,
    weights: { a: weights.a, b: weights.b, c: weights.c, d: weights.d },
    sets: recoSets
  };
  fs.writeFileSync(recoFile, JSON.stringify(recoOut, null, 2));
  console.log(`★ 推荐注(近期最优 ${bestScheme}，权重 a${weights.a}/b${weights.b}/c${weights.c}/d${weights.d}) ${RECO_N}注 -> ${recoFile}`);
  recoSets.forEach((s, i) => console.log('   ', i + 1, game === 'dlt' ? `前[${s.front.join(' ')}] 后[${s.back.join(' ')}]` : s.nums.join(' ')));
}

// ---- 主练习（5 方案无偏对照，供权重统计，保持纯净）----
if (fs.existsSync(outFile)) {
  console.log('练习', outFile, '已存在，跳过对照生成');
} else {
  const rec = data.draws.slice(-LOOKBACK);
  const envBase = dateBaseValue(new Date());
  const lucky = parseSet(''), avoid = parseSet('');

  const schemes = {};
  for (const [key, base] of Object.entries(SCHEMES)) {
    const sets = [];
    for (let i = 0; i < N; i++) {
      // 组内 ±20% 抖动（运气漂移），clamp 下限 0.05 防归零
      const jitter = (v) => Math.max(0.05, v * (1 + (Math.random() * 0.4 - 0.2)));
      const A = {
        a: jitter(base.a), b: jitter(base.b), c: jitter(base.c), d: jitter(base.d),
        lucky, avoid
      };
      sets.push(generateSets(game, rec, data.draws, A, 1, envBase)[0]);
    }
    schemes[key] = { weights: base, sets };
  }

  const out = {
    game, issue,
    genDate: new Date().toISOString().slice(0, 10),
    status: 'pending',
    schemes
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  updatePracticeIndex(practiceDir, { issue, game, genDate: out.genDate, status: 'pending' });
  console.log(`生成练习 ${game === 'dlt' ? '大乐透' : '七星彩'} 期${issue} 5方案×${N}注 -> ${outFile}`);
}

function updatePracticeIndex(dir, rec) {
  const idxFile = path.join(dir, 'index.json');
  let idx = { updatedAt: '', records: [] };
  if (fs.existsSync(idxFile)) {
    try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (e) { idx = { updatedAt: '', records: [] }; }
  }
  idx.records = idx.records || [];
  const i = idx.records.findIndex(x => x.issue === rec.issue && x.game === rec.game);
  if (i >= 0) idx.records[i].status = rec.status;
  else idx.records.unshift({ issue: rec.issue, game: rec.game, genDate: rec.genDate || '', status: rec.status });
  idx.updatedAt = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 2));
  fs.writeFileSync(idxFile.replace(/\.json$/, '.js'), 'window.PRACTICE_INDEX = ' + JSON.stringify(idx) + ';\n');
}
