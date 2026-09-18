// auto_remind.mjs —— 彩票提醒「一键跑」（不依赖 WorkBuddy 自动化调度 / 不依赖任何连接器）
//
// 背景：WorkBuddy 的自动化调度器在无人值守运行时，会检查任务依赖的连接器；
//       凡涉及邮箱的自动化（agent-mail / 网易邮箱）一律报「连接器均未连接成功」并在启动瞬间终止，
//       导致发信自动化连续多日 0 执行。本脚本把「决策 → 拼正文 → 发信 → 写状态 → 留痕」串成一条命令，
//       由 macOS cron / launchd 或手动执行，彻底绕开该限制。
//
// 用法：
//   /Users/zoujiean/.workbuddy/binaries/node/versions/22.22.2-2/bin/node auto_remind.mjs
//   （可选 --force 忽略 09:00–20:00 发送窗口，用于测试）
//
// 输出：stdout 打印 JSON 摘要，便于写进 cron 日志。

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const PY = '/Users/zoujiean/.workbuddy/binaries/python/versions/3.13.12/bin/python3';
const TO = 'hinewly@163.com';

const practiceDir = path.join(__dirname, 'practice');
const stateFile = path.join(practiceDir, '.send_state.json');
const moodFile = path.join(__dirname, '彩票提醒-每日心情.md');
const sentLogFile = path.join(practiceDir, '已发记录.md');

const force = process.argv.includes('--force');
// --must：跳过「随性跳过」必发（补发用）；--only <qxc|dlt>：只处理一个彩种
const must = process.argv.includes('--must');
const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;
const now = new Date();
const pad = n => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

function readJson(p, def) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return def; }
}
function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function appendLine(p, line) {
  fs.appendFileSync(p, line.endsWith('\n') ? line : line + '\n');
}
// 心情 MD 只留大白话，别把长错误信息塞进去
function briefReason(msg) {
  const m = msg || '';
  if (m.includes('未找到邮箱凭据')) return '本地邮件凭据没配';
  if (m.includes('SMTP 认证失败')) return 'SMTP 授权码失效';
  if (m.includes('timed out') || m.includes('timeout')) return 'SMTP 连接超时';
  return m.slice(0, 30);
}

// ---------- 1. 每天先写「心情留痕」（无论发不发、无论网络） ----------
let state = readJson(stateFile, {});
if (state.moodLoggedDate !== today) {
  state.moodLoggedDate = today;
  writeJson(stateFile, state);
}

// ---------- 2. 决策 ----------
// 先记住决策前的额度，发信失败要回滚（避免"扣了额度却没发出"）
const stateBefore = readJson(stateFile, {});
const usedBefore = {
  qxc: (stateBefore.qxc && stateBefore.qxc.used) || 0,
  dlt: (stateBefore.dlt && stateBefore.dlt.used) || 0
};
const rArgs = [path.join(__dirname, 'gen_reminder.mjs')];
if (must) rArgs.push('--must');
if (only) rArgs.push('--only', only);
const r = spawnSync(NODE, rArgs, { encoding: 'utf8' });
let plan = {};
try { plan = JSON.parse(r.stdout); } catch (e) {
  state = readJson(stateFile, {});
  const msg = `- ${today} ${hhmm} 今天决策脚本跑挂了（gen_reminder 无有效输出），两个彩种都没发。`;
  appendLine(moodFile, msg);
  console.log(JSON.stringify({ success: false, stage: 'gen_reminder', raw: r.stdout.slice(0, 300), stderr: r.stderr.slice(0, 300) }));
  process.exit(1);
}

// ---------- 3. 发送窗口 ----------
const hour = now.getHours();
const inWindow = hour >= 9 && hour < 20;
if (!inWindow && !force) {
  const msg = `- ${today} ${hhmm} 不在发送窗口（09:00–20:00），本轮只留痕不发信。`;
  if (state.moodLoggedDate === today && !fs.readFileSync(moodFile, 'utf8').includes(`${today} ${hhmm}`)) appendLine(moodFile, msg);
  console.log(JSON.stringify({ success: true, sent: [], skipped: 'out_of_window' }));
  process.exit(0);
}

// ---------- 4. 拼正文 ----------
function renderBody(d) {
  const lines = [];
  lines.push(`${d.name} ${d.issue} 期`);
  lines.push(`开奖：${d.drawDate} ${d.drawWeekday}`);
  lines.push('');
  lines.push('请在当天 17:00 前（傍晚前）线下购买，别拖到停售 21:00 才出门。');
  lines.push('');
  lines.push(`这期我站 ${d.mainKey}（${d.mainSchemeName}）`);
  for (const n of d.notes) {
    const mark = n.main ? '▶ 主  ' : '      ';
    const dbl = n.doubled ? '（翻倍×2）' : '';
    lines.push(`${mark}${n.display}${dbl}   [${n.schemeName}]`);
  }
  lines.push('');
  if (d.game === 'dlt') {
    lines.push('建议不加注（追加 +1 元），守住 10 元；你买时按心情自定是否追加。');
  } else {
    lines.push('建议不倍投，守住 10 元；你买时按心情自定是否倍投 ×2~5。');
  }
  lines.push('');
  lines.push('—— 纯娱乐试错，不保证中奖，量力而行。');
  return lines.join('\n');
}

// ---------- 5. 发信 ----------
const results = [];
const games = only ? [only] : ['qxc', 'dlt'];
for (const game of games) {
  const d = plan[game];
  if (!d || !d.send) { results.push({ game, status: 'skip_no_plan' }); continue; }

  state = readJson(stateFile, {});
  if (!state.lastSentDate) state.lastSentDate = {};
  if (state.lastSentDate[game] === today && !must) { results.push({ game, status: 'skip_already_sent_today' }); continue; }

  const bodyFile = `/tmp/lottery_mail_${game}.txt`;
  fs.writeFileSync(bodyFile, renderBody(d), 'utf8');
  const subject = `${d.name} ${d.issue} 提醒 · 这期我站 ${d.mainKey}（${d.mainSchemeName}）开奖日期：${d.drawDate} ${d.drawWeekday}`;

  let ok = false, errmsg = '';
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    const p = spawnSync(PY, [path.join(__dirname, 'send_mail.py'), '--to', TO, '--subject', subject, '--body-file', bodyFile], { encoding: 'utf8' });
    let out = {};
    try { out = JSON.parse(p.stdout.trim().split('\n').pop()); } catch (e) { out = { success: false, message: '输出解析失败: ' + p.stdout + p.stderr }; }
    ok = !!out.success;
    if (!ok) errmsg = out.message || 'unknown';
  }

  if (ok) {
    state = readJson(stateFile, {});
    if (!state[game]) state[game] = { week: '', used: 0, sent: 0 };
    state[game].sent = (state[game].sent || 0) + 1;
    if (!state.lastSentDate) state.lastSentDate = {};
    state.lastSentDate[game] = today;
    writeJson(stateFile, state);

    // 大乐透 display 内含 " 前区 | 后区 "，直接写进 md 表格会把列冲掉 → 改用 +
    const nums = d.notes.map(n => n.display.replace(/\|/g, '+') + (n.doubled ? '（翻倍×2）' : '')).join(' / ');
    const advise = d.game === 'dlt' ? '建议不加注，守住 10 元' : '建议不倍投，守住 10 元';
    appendLine(sentLogFile,
      `| ${today} | ${d.name} | ${d.issue} | ${d.drawDate} ${d.drawWeekday} | ${d.notes.length} | ${nums} | ${advise} | 否 |${d.guaranteed ? '（本周保底）' : ''}`);

    results.push({ game, status: 'sent', issue: d.issue, notes: d.notes.length, guaranteed: !!d.guaranteed });
  } else {
    // 发信失败 → 回滚被 gen_reminder 预扣的额度（额度只认真正发出去的）
    state = readJson(stateFile, {});
    if (state[game]) state[game].used = usedBefore[game];
    writeJson(stateFile, state);
    results.push({ game, status: 'failed', message: errmsg });
  }
}

// ---------- 6. 心情留痕（结果版）----------
const parts = [];
for (const g of ['qxc', 'dlt']) {
  const name = g === 'qxc' ? '七星彩' : '大乐透';
  const res = results.find(x => x.game === g);
  if (!res) continue;
  if (res.status === 'sent') parts.push(`${name}发了 ${res.issue}（${res.notes} 注${res.guaranteed ? '，本周保底' : ''}）`);
  else if (res.status === 'failed') parts.push(`${name}想发但没发出（${briefReason(res.message)}）`);
  else if (res.status === 'skip_already_sent_today') parts.push(`${name}今天已经发过了`);
  else parts.push(`${name}这轮没安排`);
}
const moodLine = `- ${today} ${hhmm} ${parts.length ? parts.join('；') : '今天没有可发的期号'}。`;
// 同一天只保留「最新一条」：先把当天旧的留痕行整行替换，没有旧行才追加
// （旧版用 includes(`${today} `) 判断，导致当天跑第二遍时结果版永远写不进去）
{
  const p = moodFile;
  const txt = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const lines = txt.split('\n');
  const prefix = `- ${today} `;
  const idx = lines.findIndex(l => l.startsWith(prefix));
  if (idx >= 0) {
    // 同天多次运行：把旧结论并进来（去重），别把早上那次的记录冲掉
    const oldBody = lines[idx].replace(/^- \d{4}-\d{2}-\d{2} \d{2}:\d{2} /, '').replace(/。$/, '');
    const newBody = parts.length ? parts.join('；') : '今天没有可发的期号';
    const merged = [...new Set([oldBody, newBody].filter(Boolean))].join('；');
    lines[idx] = `- ${today} ${hhmm} ${merged}。`;
  } else lines.push(moodLine);
  fs.writeFileSync(p, lines.join('\n'), 'utf8');
}

const failed = results.filter(x => x.status === 'failed');
console.log(JSON.stringify({
  success: failed.length === 0,
  time: `${today} ${hhmm}`,
  results,
  alert: failed.length ? failed.map(f => `${f.game} 发信失败：${f.message}`).join(' | ') : null
}, null, 2));
