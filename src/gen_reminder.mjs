// gen_reminder.mjs —— 每日提醒决策（预算 / 随机 / 选号）
// 只输出"今天发不发、发哪期、发几注"的 JSON 计划，不直接发信、不直接爬网。
// 由自动化代理读取本计划后，再去发邮件 + 留底 + 按需爬灵感站。
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const practiceDir = path.join(__dirname, 'practice');
const stateFile = path.join(practiceDir, '.send_state.json');

// 通过 argv 控制：--must 跳过「随性跳过」，尽量发（用于手动补发）

const now = new Date();
const ARGS = process.argv.slice(2);
const must = ARGS.includes('--must');
const onlyIdx = ARGS.indexOf('--only');
const only = onlyIdx >= 0 ? ARGS[onlyIdx + 1] : null;

// 当前 ISO 周键（用于每周预算重置）
function weekKey(d) {
  const onejan = new Date(d.getFullYear(), 0, 1);
  const wk = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return d.getFullYear() + '-W' + String(wk).padStart(2, '0');
}
const wk = weekKey(now);

// 开奖星期（0=周日）。用于标签"周X开奖"
const DRAW = { qxc: [2, 5, 0], dlt: [1, 3, 6] };
const NAME = { qxc: '七星彩', dlt: '大乐透' };
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
// 已过当晚 21:25 开奖时间，就不再把「今天」算作可买的下一期
const START_ADD = now.getHours() >= 21 ? 1 : 0;
function nextDrawDate(game) {
  for (let add = START_ADD; add <= 7; add++) {
    const d = new Date(now);
    d.setDate(d.getDate() + add);
    if (DRAW[game].includes(d.getDay())) {
      return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
  }
  return '?';
}
function nextDrawWeekday(game) {
  for (let add = START_ADD; add <= 7; add++) {
    const d = new Date(now);
    d.setDate(d.getDate() + add);
    if (DRAW[game].includes(d.getDay())) return WD[d.getDay()];
  }
  return '?';
}

// 读状态（每周预算）
let state = {};
if (fs.existsSync(stateFile)) {
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { state = {}; }
}
for (const g of ['qxc', 'dlt']) {
  if (!state[g] || state[g].week !== wk) state[g] = { week: wk, used: 0, sent: 0 };
  else if (typeof state[g].sent !== 'number') state[g].sent = 0;
}

// 取「下一期」的练习文件。
//
// 【2026-09-10 修 bug】旧版 latestPractice() 直接取 practice 目录里期号最大的文件，
// 而 practice 文件是「开奖前生成」自动化在开奖当晚 20:00 才创建的 —— 于是在两份生成之间
// 的空窗期（要 17:00 出门买，却还没生成），会退化捡回上一期**已经开奖**的号码发出去
// （实例：9/10 把大乐透已开奖的 26103 当新期发了）。
// 现改为：交给 gen_practice.mjs 按「本地最新已抓期 +1」算目标期并确保文件存在（幂等），
// 再校验该期确实未结算（status !== 'matched'），否则不发。
function targetPractice(game) {
  const args = [path.join(__dirname, 'gen_practice.mjs')];
  if (game === 'qxc') args.push('--qxc');
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const m = out.match(/(?:->|已存在)\s*(\S+\.json)/);
  if (!m) return null;
  try {
    const d = JSON.parse(fs.readFileSync(m[1], 'utf8'));
    if (d.status === 'matched') return null; // 已开奖，绝不再推荐
    return d;
  } catch (e) { return null; }
}

function mkNote(scheme, game) {
  const set = scheme.sets[Math.floor(Math.random() * scheme.sets.length)];
  const display = game === 'dlt'
    ? set.front.join(' ') + ' | ' + set.back.join(' ')
    : set.nums.join(' ');
  return { schemeName: scheme.weights.name, display, doubled: false };
}

const keys = ['A', 'B', 'C', 'D', 'E'];
const plan = {};

for (const game of ['qxc', 'dlt']) {
  const g = state[game];
  let decision = { send: false };
  // --only：只决策一个彩种，另一个不碰（避免"决策了但不发"虚扣本周额度）
  if (only && game !== only) { plan[game] = decision; continue; }
  let sentThisRun = false;
  // 随性：今天想不想发（预算内才考虑）。--must 用于手动补发，跳过随机
  if (g.used < 5 && (must || Math.random() < 0.5)) {
    const remain = 5 - g.used;
    let cnt = Math.random() < 0.5 ? 1 : 2;
    cnt = Math.min(cnt, remain);
    const practice = targetPractice(game);
    if (cnt > 0 && practice) {
      const schemes = practice.schemes;
      const notes = [];
      // 主注：按手感轮换（期号 % 5）挑方案
      const idx = parseInt(practice.issue) % keys.length;
      const mainNote = mkNote(schemes[keys[idx]], game);
      mainNote.main = true;
      notes.push(mainNote);
      if (cnt >= 2) {
        // 副注：换一个不同方案
        const idx2 = (idx + 1 + Math.floor(Math.random() * (keys.length - 1))) % keys.length;
        notes.push(mkNote(schemes[keys[idx2]], game));
      }
      // 上头了就翻倍（某注标翻倍×2，仍占 1 个名额）
      if (Math.random() < 0.25 && notes.length > 0) {
        notes[Math.floor(Math.random() * notes.length)].doubled = true;
      }
      decision = {
        send: true,
        game,
        name: NAME[game],
        issue: practice.issue,
        drawDate: nextDrawDate(game),
        drawWeekday: nextDrawWeekday(game),
        mainKey: keys[idx],
        mainSchemeName: mainNote.schemeName,
        notes
      };
      g.used += cnt;
      sentThisRun = true;
    }
  }
  // 保底：本周该彩种尚未成功发过（sent===0）且有未来可发期 → 强制至少发 1 注，
  // 防整周被随机「随性跳过」漏发。发信代理成功发出后会把 sent+1，保底随之解除。
  if (!sentThisRun && g.sent === 0 && g.used < 5) {
    const practice = targetPractice(game);
    if (practice) {
      const schemes = practice.schemes;
      const idx = parseInt(practice.issue) % keys.length;
      const mainNote = mkNote(schemes[keys[idx]], game);
      mainNote.main = true;
      decision = {
        send: true,
        game,
        name: NAME[game],
        issue: practice.issue,
        drawDate: nextDrawDate(game),
        drawWeekday: nextDrawWeekday(game),
        mainKey: keys[idx],
        mainSchemeName: mainNote.schemeName,
        notes: [mainNote],
        guaranteed: true
      };
      g.used += 1;
    }
  }
  plan[game] = decision;
}

fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(JSON.stringify(plan, null, 2));
