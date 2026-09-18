// 彩票荐号网站 - 历史数据抓取脚本（Node 零依赖，增强版）
// 数据源（主）：500 彩票网 datachart.500.com
// 数据源（兜底）：体彩官方 webapi.sporttery.cn（返回 JSON，无需爬表，出号更快）
// 健壮性：10s 超时 + 退避重试 + 连通性探测 + 官方兜底 + 失败优雅跳过（exit 0，不崩）
// 输出：data/dlt.js、data/qxc.js（window.DLT / window.QXC 全局变量，规避 file:// fetch CORS）
// 用法：node fetch_data.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const END = '26999';        // 期号上界（超过实际最新期时接口返回到最新一期）
const START = '23001';      // 期号下界（2023 年起，约 3 年数据，足够频率统计）

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const RETRIES = 3;
const BACKOFF = [10000, 30000]; // 第1次失败等10s，第2次等30s
const REQ_TIMEOUT = 10000;

// ---- 带超时的 fetch ----
async function fetchWithTimeout(url, opts = {}, timeout = REQ_TIMEOUT) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- 通用重试 ----
async function withRetry(label, fn) {
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < RETRIES - 1) {
        const wait = BACKOFF[Math.min(i, BACKOFF.length - 1)];
        console.log(`  ↳ ${label} 第${i + 1}次失败(${e.message})，${wait / 1000}s 后重试…`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ---- 主源：500 彩票网 ----
async function fetch500(url) {
  const res = await fetchWithTimeout(url, {
    headers: { 'User-Agent': UA, 'Referer': 'https://datachart.500.com/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder('gbk').decode(buf); // 500 页面为 gb2312/gbk 编码
}

// ---- 兜底源：体彩官方接口（JSON）----
async function fetchOfficial(gameNo) {
  const url =
    `https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry` +
    `?gameNo=${gameNo}&provinceId=0&pageSize=30&isVerify=1&pageNo=1`;
  const res = await fetchWithTimeout(url, {
    headers: { 'Referer': 'https://www.lottery.gov.cn/' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const list =
    json?.value?.list || json?.data?.list || json?.list || json?.result?.list || [];
  if (!Array.isArray(list) || !list.length) throw new Error('接口返回空');
  return list;
}

function officialToDraws(game, list) {
  const out = [];
  for (const row of list) {
    const issue = String(row.lotteryDrawNum);
    const date = String(row.lotteryDrawTime || '');
    const nums = String(row.lotteryDrawResult || '')
      .trim().split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10));
    if (game === 'dlt') {
      const front = nums.slice(0, 5);
      const back = nums.slice(5, 7);
      if (front.length < 5 || back.length < 2 || front.some(isNaN) || back.some(isNaN)) continue;
      out.push({ issue, date, front, back });
    } else {
      if (nums.some(isNaN)) continue;
      out.push({ issue, date, nums });
    }
  }
  return out;
}

// ---- 解析 500 返回的 HTML ----
function tdsOf(rowHtml) {
  return [...rowHtml.matchAll(/<td[^>]*>(.*?)<\/td>/g)]
    .map((x) => x[1].replace(/<[^>]+>/g, '').trim());
}

function parseDLT(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  const m = html.match(/id="tdata">([\s\S]*?)<\/tbody>/);
  if (!m) return [];
  const rows = [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const draws = [];
  for (const r of rows) {
    const t = tdsOf(r[1]);
    if (t.length < 8) continue;
    const front = t.slice(1, 6).map((s) => parseInt(s, 10));
    const back = t.slice(6, 8).map((s) => parseInt(s, 10));
    if (front.some(isNaN) || back.some(isNaN)) continue;
    draws.push({ issue: t[0], date: t[t.length - 1], front, back });
  }
  return draws;
}

function parseQXC(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  const m = html.match(/id="tablelist">([\s\S]*?)<\/table>/);
  if (!m) return [];
  const rows = [...m[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  const draws = [];
  for (const r of rows) {
    const t = tdsOf(r[1]);
    if (t.length < 5) continue;
    const nums = t[1].split(/\s+/).filter(Boolean).map((s) => parseInt(s, 10));
    if (nums.some(isNaN)) continue;
    draws.push({ issue: t[0], date: t[t.length - 1], nums });
  }
  return draws;
}

// ---- 本地历史读写（兜底合并用）----
function loadLocal(key) {
  try {
    const txt = fs.readFileSync(path.join(DATA_DIR, `${key}.js`), 'utf8');
    const json = txt.slice(txt.indexOf('=') + 1).replace(/;\s*$/, '').trim();
    return JSON.parse(json).draws || [];
  } catch {
    return [];
  }
}

function mergeDraws(existing, incoming) {
  const map = new Map();
  for (const d of existing) if (d?.issue) map.set(d.issue, d);
  for (const d of incoming) if (d?.issue) map.set(d.issue, d); // 新抓取的覆盖（更新鲜）
  return [...map.values()];
}

function writeGame(key, name, draws) {
  draws.sort((a, b) => a.issue.localeCompare(b.issue));
  const meta = {
    name,
    count: draws.length,
    lastUpdated: new Date().toISOString().slice(0, 10),
    latest: draws.length ? draws[draws.length - 1].issue : null,
  };
  const content = `window.${key.toUpperCase()}=${JSON.stringify({ meta, draws })};\n`;
  fs.writeFileSync(path.join(DATA_DIR, `${key}.js`), content, 'utf8');
  console.log(
    `${name}：${draws.length} 期 -> data/${key}.js` +
      (draws.length ? `（最新 ${draws[draws.length - 1].issue} ${draws[draws.length - 1].date}）` : '')
  );
}

// ---- 单彩种抓取：主源成功则全量覆盖；失败则官方兜底并合并历史 ----
async function fetchGame(key, cfg) {
  // 1) 主源 500
  try {
    const html = await withRetry(`${cfg.name}/500`, () => fetch500(cfg.url(START)));
    const draws = cfg.parse(html);
    if (!draws.length) throw new Error('未解析到任何数据（页面结构可能已变）');
    console.log(`✓ ${cfg.name}：500 源抓取 ${draws.length} 期`);
    return draws;
  } catch (e) {
    console.log(`⚠️ ${cfg.name}：500 源失败(${e.message})，尝试官方接口兜底…`);
  }
  // 2) 兜底源 官方
  try {
    const list = await withRetry(`${cfg.name}/官方`, () => fetchOfficial(cfg.gameNo));
    const incoming = officialToDraws(key, list);
    if (!incoming.length) throw new Error('官方接口无有效数据');
    const merged = mergeDraws(loadLocal(key), incoming);
    console.log(`✓ ${cfg.name}：官方接口兜底，合并后 ${merged.length} 期（本次新增 ${incoming.length}）`);
    return merged;
  } catch (e) {
    console.log(`✗ ${cfg.name}：500 与官方均失败(${e.message})，跳过本次刷新，保留本地数据`);
    return null; // 信号：跳过，不写文件
  }
}

const GAMES = {
  dlt: {
    name: '超级大乐透',
    gameNo: '85',
    url: (start) =>
      `https://datachart.500.com/dlt/history/newinc/history.php?start=${start}&end=${END}`,
    parse: parseDLT,
  },
  qxc: {
    name: '七星彩',
    gameNo: '04',
    url: (start) =>
      `https://datachart.500.com/qxc/history/inc/history.php?start=${start}&end=${END}`,
    parse: parseQXC,
  },
};

(async () => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // 连通性探测（仅作状态日志，不阻断抓取）
  let netOk = false;
  try {
    await fetchWithTimeout('https://webapi.sporttery.cn/', {}, 5000);
    netOk = true;
  } catch { /* ignore */ }
  console.log(`网络探测：${netOk ? '通' : '不通（将尽力抓取，双源均失败则跳过）'}`);

  let okCount = 0;
  for (const [key, cfg] of Object.entries(GAMES)) {
    const draws = await fetchGame(key, cfg);
    if (draws) {
      writeGame(key, cfg.name, draws);
      okCount++;
    }
  }
  console.log(okCount === 0
    ? '完成：本次双源均未获取到数据，本地数据保持不变。'
    : '完成。如需强制更新，重新运行 node fetch_data.mjs 即可。');
})();
