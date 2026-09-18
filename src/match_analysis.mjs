// match_analysis.mjs —— 开奖后匹配 + 分析文档
// 读 practice/*.json(pending) -> 抓实际开奖号比对 -> 写 analysis/期号.md -> 更新 analysis/汇总.md
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadData, matchCount, awardTierDLT, awardTierQXC, TIER_NAMES, ALERT_TIER_MAX } from './engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const practiceDir = path.join(__dirname, 'practice');
const analysisDir = path.join(__dirname, 'analysis');
fs.mkdirSync(analysisDir, { recursive: true });

if (!fs.existsSync(practiceDir)) { console.log('practice/ 不存在，无待匹配'); process.exit(0); }
const files = fs.readdirSync(practiceDir).filter(f => f.endsWith('.json'));
let matchedAny = false;

for (const f of files) {
  const rec = JSON.parse(fs.readFileSync(path.join(practiceDir, f), 'utf8'));
  if (rec.status !== 'pending') continue;

  const data = loadData(rec.game);
  const actual = data.draws.find(d => d.issue === rec.issue);
  if (!actual) { console.log(`期${rec.issue} 开奖号尚未抓到，等待下一轮`); continue; }

  const report = {
    game: rec.game, issue: rec.issue, date: actual.date, actual,
    schemes: {}
  };
  for (const [key, sc] of Object.entries(rec.schemes)) {
    const hits = sc.sets.map(s => {
      const m = matchCount(rec.game, s, actual);
      m.set = s;
      m.tier = rec.game === 'dlt' ? awardTierDLT(m.front, m.back) : awardTierQXC(m.pos, m.frontP, m.lastP);
      return m;
    });
    report.schemes[key] = {
      weights: sc.weights,
      hits,
      frontSum: hits.reduce((a, h) => a + (h.front || 0), 0),
      backSum: hits.reduce((a, h) => a + (h.back || 0), 0),
      posSum: hits.reduce((a, h) => a + (h.pos || 0), 0)
    };
  }

  writeAnalysis(analysisDir, report);
  updateSummary(analysisDir, report);

  rec.status = 'matched';
  fs.writeFileSync(path.join(practiceDir, f), JSON.stringify(rec, null, 2));
  updatePracticeIndex(practiceDir, { issue: rec.issue, game: rec.game, genDate: rec.genDate, status: 'matched' });
  matchedAny = true;
  console.log(`匹配期${rec.issue} 完成 -> analysis/${rec.game}_${rec.issue}.md`);
}

if (!matchedAny) console.log('无待匹配记录（或开奖号尚未抓取）');

// ---------- 单期分析文档 ----------
function writeAnalysis(dir, r) {
  const L = [];
  L.push(`# 第${r.issue}期 ${r.game === 'dlt' ? '大乐透' : '七星彩'} 匹配分析 ${r.date}`);
  L.push('');
  L.push('## 实际开奖');
  L.push(r.game === 'dlt'
    ? `前区 ${r.actual.front.join(' ')} | 后区 ${r.actual.back.join(' ')}`
    : `号码 ${r.actual.nums.join(' ')}`);
  L.push('');
  L.push('## 各方案命中（每组 5 注，[ ] 内为命中的号）');
  L.push('');
  L.push('| 方案 | 权重(频/偏/环/运) | 中号对照（每注） | 奖级 |');
  L.push('| --- | --- | --- | --- |');
  for (const [k, v] of Object.entries(r.schemes)) {
    const details = v.hits.map(h => detailCell(r.game, h, r.actual));
    const tierTxt = v.hits.map(h => {
      if (h.tier === 0) return `—`;
      if (h.tier <= 3) return `🔴${TIER_NAMES[h.tier]}`;
      if (h.tier === 4) return `⚠️四等`;
      if (h.tier === 5) return `📌五等`;
      return TIER_NAMES[h.tier];
    });
    L.push(`| ${k} ${v.weights.name} | ${v.weights.a}/${v.weights.b}/${v.weights.c}/${v.weights.d} | ${details.join('<br>')} | ${tierTxt.join('<br>')} |`);
  }
  L.push('');
  // ---------- 接近中奖提醒（三等奖及以上）----------
  const alerts = [];
  for (const [k, v] of Object.entries(r.schemes)) {
    v.hits.forEach((h, i) => { if (h.tier >= 1 && h.tier <= ALERT_TIER_MAX) alerts.push({ scheme: k, name: v.weights.name, idx: i + 1, tier: h.tier, detail: detailCell(r.game, h, r.actual) }); });
  }
  L.push('## 接近中奖提醒（三等奖及以上）');
  if (alerts.length === 0) {
    L.push('- 本期无达到三等奖及以上的命中。');
  } else {
    const strong = alerts.filter(a => a.tier <= 3);
    const mid = alerts.filter(a => a.tier === 4);
    if (strong.length) {
      L.push(`- 🔴 **三等奖及以上（${strong.length} 注）**：`);
      strong.forEach(a => L.push(`  - ${a.scheme} ${a.name} 注${a.idx}：${a.detail} → **${TIER_NAMES[a.tier]}**`));
    }
    if (mid.length) {
      L.push(`- ⚠️ **四等奖（${mid.length} 注）**：`);
      mid.forEach(a => L.push(`  - ${a.scheme} ${a.name} 注${a.idx}：${a.detail} → **${TIER_NAMES[a.tier]}**`));
    }
  }
  const near = [];
  for (const [k, v] of Object.entries(r.schemes)) {
    v.hits.forEach((h, i) => { if (h.tier === 5) near.push({ scheme: k, name: v.weights.name, idx: i + 1, detail: detailCell(r.game, h, r.actual) }); });
  }
  if (near.length) {
    L.push('');
    L.push(`- 📌 接近三等奖（五等奖水平，前区中 3+ 或等效，${near.length} 注）：`);
    near.forEach(a => L.push(`  - ${a.scheme} ${a.name} 注${a.idx}：${a.detail}`));
  }
  L.push('');
  L.push('## 偏差观察');
  L.push('- 累积多期后由 `analysis/汇总.md` 给出趋势');
  L.push('');
  L.push('## 给下期建议');
  L.push('- 见 `analysis/汇总.md`');
  fs.writeFileSync(path.join(dir, r.game + '_' + r.issue + '.md'), L.join('\n'));
}

// 中号对照单元格：原选号用 [ ] 标中，附命中计数
function detailCell(game, m, actual) {
  if (game === 'dlt') {
    const fDisp = m.set.front.map(n => actual.front.includes(n) ? `[${n}]` : `${n}`).join(' ');
    const bDisp = m.set.back.map(n => actual.back.includes(n) ? `[${n}]` : `${n}`).join(' ');
    return `前区 ${fDisp}(${m.front}/5) 后区 ${bDisp}(${m.back}/2)`;
  }
  const disp = m.set.nums.map((v, i) => v === actual.nums[i] ? `[${v}]` : `${v}`).join(' ');
  return `${disp}(${m.pos}/7${m.lastP ? ' 特中' : ''})`;
}

// ---------- 滚动汇总（近 30 期）：md + 结构化 json（同源）----------
function updateSummary(dir, r) {
  const jsonFile = path.join(dir, 'summary.json');
  let rows = [];
  if (fs.existsSync(jsonFile)) {
    try { rows = JSON.parse(fs.readFileSync(jsonFile, 'utf8')).rows || []; } catch (e) { rows = []; }
  }
  const schemesOut = {};
  for (const [k, v] of Object.entries(r.schemes)) {
    schemesOut[k] = { name: v.weights.name };
    if (r.game === 'dlt') {
      schemesOut[k].front = +(v.frontSum / 5).toFixed(2);
      schemesOut[k].back = +(v.backSum / 5).toFixed(2);
    } else {
      schemesOut[k].pos = +(v.posSum / 5).toFixed(2);
    }
  }
  // 按 game+issue 去重，最新一次覆盖旧的，避免多次运行累积重复行（此前 26098/26099 各被写 4 次，骗过 gen_weights 样本护栏）
  rows = rows.filter(x => !(x.issue === r.issue && x.game === r.game));
  rows.push({ issue: r.issue, date: r.date, game: r.game, schemes: schemesOut });
  rows = rows.slice(-30);

  const sumObj = { updatedAt: new Date().toISOString().slice(0, 10), window: 30, rows };
  fs.writeFileSync(jsonFile, JSON.stringify(sumObj, null, 2));
  fs.writeFileSync(path.join(dir, 'summary.js'), 'window.PRACTICE_SUMMARY = ' + JSON.stringify(sumObj) + ';\n');

  const out = [];
  out.push('# 各期方案命中汇总（滚动 30 期）');
  out.push('');
  out.push('| 期号 | 各方案平均命中（5 注均值） |');
  out.push('| --- | --- |');
  for (const row of rows) {
    const cells = Object.entries(row.schemes).map(([k, v]) =>
      row.game === 'dlt' ? `${k}:前${v.front}后${v.back}` : `${k}:位${v.pos}`);
    out.push(`| ${row.issue} ${row.date} | ${cells.join(' | ')} |`);
  }
  out.push('');
  out.push('## 趋势（基于上表，待 AI 读取后给出哪种维度主导更优）');
  out.push('- 样本 < 10 期时不自动调权重');
  fs.writeFileSync(path.join(dir, '汇总.md'), out.join('\n'));
}

// ---------- 练习索引（供网页列目录，避免浏览器列目录限制）----------
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
  // 同步写 .js 孪生全局变量，保证 file:// 双击打开时练习列表也是最新的（与 gen_practice.mjs 同款写法）
  fs.writeFileSync(idxFile.replace(/\.json$/, '.js'), 'window.PRACTICE_INDEX = ' + JSON.stringify(idx) + ';\n');
}
