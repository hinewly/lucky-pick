/**
 * engine.js - 浏览器端核心算法
 *
 * 基于 src/engine.mjs（Node 版）的算法逻辑移植 + 扩展
 *
 * 继承自原 engine.mjs：
 *   - freqDLT / freqQXC 频率分析
 *   - weightsDLT / weightsQXC 权重合成
 *   - Efraimidis-Spirakis 不放回抽样（比简单加权随机更公平）
 *   - awardTierDLT / awardTierQXC 奖级判定
 *   - matchCount 命中计算
 *
 * 扩展（lucky-pick 特有）：
 *   - 支持"因素库"输入（factors 数组）
 *   - 因素类型：lucky / avoid / date / zodiac / dream / lifepath / custom
 *   - 因素库在因素加成时统一处理
 *   - 暴露与原算法一致的接口
 */

(function (global) {
  'use strict';

  // ============================================================
  // 一、5 种固定策略（继承自原 engine.mjs）
  // ============================================================
  const SCHEMES = {
    A: { name: '重热度', nameEn: 'Hot',        a: 4, b: 1, c: 1, d: 1 },
    B: { name: '重偏好', nameEn: 'Preference', a: 1, b: 4, c: 1, d: 1 },
    C: { name: '重环境', nameEn: 'Context',    a: 1, b: 1, c: 4, d: 1 },
    D: { name: '重运气', nameEn: 'Random',     a: 1, b: 1, c: 1, d: 4 },
    E: { name: '均衡',   nameEn: 'Balanced',   a: 1, b: 1, c: 1, d: 1 },
  };

  const LOOKBACK_DEFAULT = 50;

  // ============================================================
  // 二、因素库定义（lucky-pick 扩展）
  // ============================================================
  /**
   * 因素接口：
   *   {
   *     type: 'lucky' | 'avoid' | 'date' | 'zodiac' | 'dream' | 'lifepath' | 'custom',
   *     label: string,           // 用户可见的标签
   *     weight: number,          // 因素自身的相对权重 0-1
   *     data: any,               // 因素的具体数据
   *     contains: (n) => boolean // 数字 n 是否被该因素"包含"
   *   }
   */

  // --- 2.1 幸运数字 ---
  function makeLucky(numbers, weight = 1.0) {
    const set = new Set(numbers.filter(n => Number.isFinite(n)));
    return {
      type: 'lucky',
      label: '幸运数字',
      weight,
      data: Array.from(set),
      contains: (n) => set.has(n),
    };
  }

  // --- 2.2 排除数字 ---
  function makeAvoid(numbers, weight = 1.0) {
    const set = new Set(numbers.filter(n => Number.isFinite(n)));
    return {
      type: 'avoid',
      label: '排除数字',
      weight,
      data: Array.from(set),
      contains: (n) => set.has(n),
    };
  }

  // --- 2.3 日期因素 ---
  function makeDate(dateStr, weight = 0.6) {
    const date = parseDate(dateStr);
    const digits = extractDateDigits(date);
    const set = new Set(digits.filter(x => x > 0));
    return {
      type: 'date',
      label: '日期·' + formatDate(date),
      weight,
      data: { dateStr: formatDate(date), digits: Array.from(set) },
      contains: (n) => set.has(n),
    };
  }

  function parseDate(s) {
    if (s instanceof Date) return s;
    if (typeof s === 'string') {
      const parts = s.split(/[-/.]/).map(Number);
      if (parts.length === 3 && parts.every(p => !isNaN(p))) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
      }
    }
    return new Date();
  }

  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function extractDateDigits(d) {
    return [
      Math.floor(d.getFullYear() / 1000) % 10,
      Math.floor(d.getFullYear() / 100) % 10,
      Math.floor(d.getFullYear() / 10) % 10,
      d.getFullYear() % 10,
      d.getMonth() + 1,
      d.getDate(),
    ];
  }

  // --- 2.4 星座因素（西方 12 星座）---
  const ZODIAC_NUMBERS = {
    aries:       { name: '白羊座', nameEn: 'Aries',       numbers: [6, 9, 12, 15, 21] },
    taurus:      { name: '金牛座', nameEn: 'Taurus',      numbers: [4, 8, 16, 23, 29] },
    gemini:      { name: '双子座', nameEn: 'Gemini',      numbers: [5, 7, 14, 22, 31] },
    cancer:      { name: '巨蟹座', nameEn: 'Cancer',      numbers: [2, 7, 11, 17, 24] },
    leo:         { name: '狮子座', nameEn: 'Leo',         numbers: [1, 8, 19, 25, 33] },
    virgo:       { name: '处女座', nameEn: 'Virgo',       numbers: [3, 14, 18, 26, 32] },
    libra:       { name: '天秤座', nameEn: 'Libra',       numbers: [6, 13, 20, 27, 34] },
    scorpio:     { name: '天蝎座', nameEn: 'Scorpio',     numbers: [8, 11, 18, 22, 27] },
    sagittarius: { name: '射手座', nameEn: 'Sagittarius', numbers: [3, 9, 17, 22, 30] },
    capricorn:   { name: '摩羯座', nameEn: 'Capricorn',   numbers: [4, 13, 22, 28, 31] },
    aquarius:    { name: '水瓶座', nameEn: 'Aquarius',    numbers: [5, 14, 18, 23, 35] },
    pisces:      { name: '双鱼座', nameEn: 'Pisces',      numbers: [3, 9, 12, 21, 33] },
  };

  function inferZodiac(date) {
    const d = parseDate(date);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    if ((m === 3 && day >= 21) || (m === 4 && day <= 19)) return 'aries';
    if ((m === 4 && day >= 20) || (m === 5 && day <= 20)) return 'taurus';
    if ((m === 5 && day >= 21) || (m === 6 && day <= 21)) return 'gemini';
    if ((m === 6 && day >= 22) || (m === 7 && day <= 22)) return 'cancer';
    if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return 'leo';
    if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return 'virgo';
    if ((m === 9 && day >= 23) || (m === 10 && day <= 23)) return 'libra';
    if ((m === 10 && day >= 24) || (m === 11 && day <= 22)) return 'scorpio';
    if ((m === 11 && day >= 23) || (m === 12 && day <= 21)) return 'sagittarius';
    if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return 'capricorn';
    if ((m === 1 && day >= 20) || (m === 2 && day <= 18)) return 'aquarius';
    return 'pisces';
  }

  function makeZodiac(zodiacOrDate, weight = 0.5) {
    let zodiac;
    let dateStr = null;
    if (ZODIAC_NUMBERS[zodiacOrDate]) {
      zodiac = zodiacOrDate;
    } else {
      zodiac = inferZodiac(zodiacOrDate);
      dateStr = formatDate(parseDate(zodiacOrDate));
    }
    const info = ZODIAC_NUMBERS[zodiac];
    const set = new Set(info.numbers);
    return {
      type: 'zodiac',
      label: '星座·' + info.name,
      weight,
      data: { zodiac, name: info.name, nameEn: info.nameEn, numbers: info.numbers, dateStr },
      contains: (n) => set.has(n),
    };
  }

  // --- 2.5 梦境因素 ---
  const DREAM_NUMBERS = {
    '水': [1, 6, 16, 26], '鱼': [1, 9, 19, 29],
    '火': [2, 7, 17, 27], '蛇': [4, 14, 24],
    '龙': [5, 15, 25, 35], '凤': [3, 13, 23, 33],
    '山': [8, 18, 28], '海': [10, 20, 30],
    '树': [11, 21, 31], '花': [12, 22, 32],
    '钱': [8, 18, 28], '梦': [4, 14, 24],
    '飞': [3, 13, 23], '跑': [5, 15, 25],
    '哭': [7, 17, 27], '笑': [9, 19, 29],
    '死': [4, 14, 24], '生': [1, 11, 21],
    '猫': [3, 13, 23], '狗': [6, 16, 26],
    '车': [2, 12, 22], '船': [1, 11, 21],
    '雨': [4, 14, 24], '雪': [7, 17, 27],
    '月': [7, 17, 27], '日': [8, 18, 28],
    '星': [9, 19, 29], '云': [10, 20, 30],
  };

  function makeDream(keywords, weight = 0.4) {
    const kwArr = Array.isArray(keywords) ? keywords : [keywords];
    const numbers = new Set();
    const matched = [];
    for (const kw of kwArr) {
      const nums = DREAM_NUMBERS[kw];
      if (nums) {
        matched.push(kw);
        nums.forEach(n => numbers.add(n));
      }
    }
    return {
      type: 'dream',
      label: '梦境·' + matched.join('、'),
      weight,
      data: { keywords: matched, numbers: Array.from(numbers) },
      contains: (n) => numbers.has(n),
    };
  }

  // --- 2.6 数字命理（Life Path Number）---
  function lifePathNumber(dateStr) {
    const date = parseDate(dateStr);
    const digits = [
      ...String(date.getFullYear()).split(''),
      String(date.getMonth() + 1),
      String(date.getDate()),
    ].map(Number);
    let sum = digits.reduce((a, b) => a + b, 0);
    while (sum >= 10) {
      sum = String(sum).split('').reduce((a, b) => a + Number(b), 0);
    }
    return sum;
  }

  const LPN_LUCKY = {
    1: [1, 10, 19, 28],
    2: [2, 11, 20, 29],
    3: [3, 12, 21, 30],
    4: [4, 13, 22, 31],
    5: [5, 14, 23, 32],
    6: [6, 15, 24, 33],
    7: [7, 16, 25, 34],
    8: [8, 17, 26, 35],
    9: [9, 18, 27, 36],
  };

  function makeLifePath(dateStr, weight = 0.4) {
    const lpn = lifePathNumber(dateStr);
    const numbers = LPN_LUCKY[lpn] || [];
    const set = new Set(numbers);
    return {
      type: 'lifepath',
      label: '数字命理·生命数字 ' + lpn,
      weight,
      data: { lifePathNumber: lpn, numbers },
      contains: (n) => set.has(n),
    };
  }

  // --- 2.7 自定义因素 ---
  function makeCustom(label, containsFn, weight = 0.5, data = null) {
    return {
      type: 'custom',
      label,
      weight,
      data,
      contains: containsFn,
    };
  }

  // ============================================================
  // 三、频率分析（继承自原 engine.mjs）
  // ============================================================
  function freqDLT(rec) {
    const front = new Array(36).fill(0);
    const back = new Array(13).fill(0);
    rec.forEach(dr => {
      dr.front.forEach(n => { if (n >= 1 && n <= 35) front[n]++; });
      dr.back.forEach(n => { if (n >= 1 && n <= 12) back[n]++; });
    });
    return { front, back };
  }

  function freqQXC(rec, allDraws) {
    const P = (allDraws && allDraws[0]) ? allDraws[0].nums.length : 7;
    const dom = [], pos = [];
    for (let p = 0; p < P; p++) {
      const set = new Set();
      allDraws.forEach(dr => set.add(dr.nums[p]));
      const dm = [...set].sort((a, b) => a - b);
      dom.push(dm);
      const m = {};
      dm.forEach(v => m[v] = 0);
      rec.forEach(dr => { m[dr.nums[p]] = (m[dr.nums[p]] || 0) + 1; });
      pos.push(m);
    }
    return { pos, dom };
  }

  // ============================================================
  // 四、因素聚合（lucky-pick 扩展层）
  // ============================================================

  /**
   * 把"因素库"转成原算法接受的 lucky/avoid Set
   * 这样可以无缝复用原 engine.mjs 的权重合成逻辑
   */
  function factorsToSets(factors) {
    const lucky = new Set();
    const avoid = new Set();
    let factorBonus = 0;

    for (const f of factors) {
      if (f.type === 'avoid') {
        for (const n of f.data) avoid.add(n);
      } else if (f.type === 'lucky') {
        for (const n of f.data) lucky.add(n);
      } else if (['date', 'zodiac', 'dream', 'lifepath', 'custom'].includes(f.type)) {
        // 把这些因素的数字也并入 lucky 集合
        // 同时保留它们的 weight 用于精细调节
        const nums = f.data && f.data.numbers ? f.data.numbers : [];
        for (const n of nums) lucky.add(n);
        factorBonus += f.weight;
      }
    }

    return { lucky, avoid, factorBonus };
  }

  /**
   * 根据因素自动选择 strategy 编号（A-E）
   * 跟原 engine.mjs 一样，简单粗暴：
   *   - 有偏好类因素 → B（重偏好）
   *   - 否则 → E（均衡）
   */
  function pickScheme(factors) {
    const hasPreference = factors.some(f =>
      ['lucky', 'date', 'zodiac', 'dream', 'lifepath', 'custom'].includes(f.type)
    );
    return hasPreference ? 'B' : 'E';
  }

  // ============================================================
  // 五、权重合成（继承 + 扩展）
  // ============================================================

  function weightsDLT(factors, freq, envBase) {
    const schemeKey = pickScheme(factors);
    const A = SCHEMES[schemeKey];
    const { lucky, avoid, factorBonus } = factorsToSets(factors);

    const tot = A.a + A.b + A.c + A.d || 1;
    const a = A.a / tot, b = A.b / tot, c = A.c / tot, d = A.d / tot;
    const maxF = Math.max(...freq.front.slice(1));
    const maxB = Math.max(...freq.back.slice(1));
    const envF = ((envBase % 35) + 35) % 35 + 1;
    const envB = ((envBase % 12) + 12) % 12 + 1;

    const fw = {}, bw = {};

    for (let n = 1; n <= 35; n++) {
      // 历史频率（基础）
      let w = a * (freq.front[n] / (maxF || 1));
      // 用户偏好（含因素库的 lucky 集合）
      w += b * (lucky.has(n) ? 1 : 0.5);
      // 环境数字
      w += c * (n === envF ? 1 : 0.5);
      // 随机
      w += d * Math.random();
      // 因素库加成（lucky-pick 扩展）
      w += factorBonus * 0.1;
      // 排除数字惩罚
      if (avoid.has(n)) w *= 0.05;
      fw[n] = w;
    }

    for (let n = 1; n <= 12; n++) {
      let w = a * (freq.back[n] / (maxB || 1));
      w += b * (lucky.has(n) ? 1 : 0.5);
      w += c * (n === envB ? 1 : 0.5);
      w += d * Math.random();
      w += factorBonus * 0.1;
      if (avoid.has(n)) w *= 0.05;
      bw[n] = w;
    }

    return { fw, bw, scheme: A };
  }

  function weightsQXC(factors, freq, envBase) {
    const schemeKey = pickScheme(factors);
    const A = SCHEMES[schemeKey];
    const { lucky, avoid, factorBonus } = factorsToSets(factors);
    const tot = A.a + A.b + A.c + A.d || 1;
    const a = A.a / tot, b = A.b / tot, c = A.c / tot, d = A.d / tot;

    return freq.pos.map((m, idx) => {
      const maxC = Math.max(...Object.values(m));
      const w = {};
      for (const v of Object.keys(m)) {
        const vv = Number(v);
        let ww = a * ((m[v] || 0) / (maxC || 1));
        ww += b * (lucky.has(vv) ? 1 : 0.5);
        const envVal = freq.dom[idx][((envBase + idx) % freq.dom[idx].length + freq.dom[idx].length) % freq.dom[idx].length];
        ww += c * (vv === envVal ? 1 : 0.5);
        ww += d * Math.random();
        ww += factorBonus * 0.1;
        if (avoid.has(vv)) ww *= 0.05;
        w[vv] = ww;
      }
      return w;
    });
  }

  // ============================================================
  // 六、Efraimidis-Spirakis 不放回抽样（继承自原 engine.mjs）
  // ============================================================
  function pickNoReplace(weights, k) {
    const keys = Object.keys(weights).map(Number).filter(n => !isNaN(n));
    const scored = keys.map(n => ({
      n,
      key: -Math.log(Math.random()) / (Math.max(weights[n], 0) + 1e-9),
    }));
    scored.sort((a, b) => a.key - b.key);
    return scored.slice(0, k).map(x => x.n).sort((a, b) => a - b);
  }

  function pickOne(weights) {
    let sum = 0;
    for (const k in weights) sum += weights[k];
    if (sum <= 0) {
      const keys = Object.keys(weights).map(Number);
      return keys[Math.floor(Math.random() * keys.length)];
    }
    let r = Math.random() * sum;
    for (const k in weights) {
      r -= weights[k];
      if (r <= 0) return Number(k);
    }
    const ks = Object.keys(weights);
    return Number(ks[ks.length - 1]);
  }

  // ============================================================
  // 七、生成号码
  // ============================================================

  function generateDLT(factors, history, options = {}) {
    const envBase = options.envBase || new Date().getDate();
    const N = options.count || 1;
    const lookback = options.lookback || LOOKBACK_DEFAULT;
    const rec = history.slice(-lookback);
    const freq = freqDLT(rec);
    const sets = [];
    for (let i = 0; i < N; i++) {
      const { fw, bw, scheme } = weightsDLT(factors, freq, envBase + i);
      sets.push({
        scheme: scheme.name,
        schemeEn: scheme.nameEn,
        front: pickNoReplace(fw, 5),
        back: pickNoReplace(bw, 2),
      });
    }
    return sets;
  }

  function generateQXC(factors, history, allDraws, options = {}) {
    const envBase = options.envBase || new Date().getDate();
    const N = options.count || 1;
    const lookback = options.lookback || LOOKBACK_DEFAULT;
    const rec = history.slice(-lookback);
    const freq = freqQXC(rec, allDraws || history);
    const sets = [];
    for (let i = 0; i < N; i++) {
      const ws = weightsQXC(factors, freq, envBase + i);
      const nums = ws.map(w => pickOne(w));
      sets.push({
        scheme: SCHEMES.B.name,
        schemeEn: SCHEMES.B.nameEn,
        nums,
      });
    }
    return sets;
  }

  // ============================================================
  // 八、奖级判定（继承自原 engine.mjs）
  // ============================================================
  function awardTierDLT(f, b) {
    if (f === 5 && b === 2) return 1;
    if (f === 5 && b === 1) return 2;
    if ((f === 5 && b === 0) || (f === 4 && b === 2)) return 3;
    if (f === 4 && b === 1) return 4;
    if ((f === 4 && b === 0) || (f === 3 && b === 2)) return 5;
    if ((f === 3 && b === 1) || (f === 2 && b === 2)) return 6;
    if ((f === 3 && b === 0) || (f === 2 && b === 1) || (f === 1 && b === 2) || (f === 0 && b === 2)) return 7;
    return 0;
  }

  function awardTierQXC(pos, frontP, lastP) {
    if (pos === 7) return 1;
    if (frontP === 6 && lastP === 0) return 2;
    if (frontP === 5 && lastP === 1) return 3;
    if (pos === 5) return 4;
    if (pos === 4) return 5;
    if (pos === 3 || lastP === 1) return 6;
    return 0;
  }

  function matchCount(game, set, actual) {
    if (game === 'dlt') {
      const frontHit = set.front.filter(n => actual.front.includes(n));
      const backHit = set.back.filter(n => actual.back.includes(n));
      const f = frontHit.length, b = backHit.length;
      const tier = awardTierDLT(f, b);
      return {
        front: f, back: b,
        frontHit, backHit, tier,
        text: '前区命中 ' + f + '/5，后区命中 ' + b + '/2',
      };
    } else {
      const posHit = [];
      let c = 0, run = 0, maxRun = 0, frontP = 0, lastP = 0;
      for (let i = 0; i < set.nums.length; i++) {
        if (set.nums[i] === actual.nums[i]) {
          c++; posHit.push(i); run++; maxRun = Math.max(maxRun, run);
          if (i < 6) frontP++; else lastP = 1;
        } else run = 0;
      }
      const tier = awardTierQXC(c, frontP, lastP);
      return {
        pos: c, posHit, maxRun, frontP, lastP, tier,
        text: '位命中 ' + c + '/7',
      };
    }
  }

  // ============================================================
  // 九、历史频率统计（用于 UI 展示）
  // ============================================================
  function summarizeDLTT(history) {
    const f = freqDLT(history);
    const frontPairs = [];
    const backPairs = [];
    for (let n = 1; n <= 35; n++) frontPairs.push({ n, count: f.front[n] });
    for (let n = 1; n <= 12; n++) backPairs.push({ n, count: f.back[n] });
    frontPairs.sort((a, b) => b.count - a.count);
    backPairs.sort((a, b) => b.count - a.count);
    return {
      hotFront: frontPairs.slice(0, 6),
      coldFront: frontPairs.slice(-6).reverse(),
      hotBack: backPairs.slice(0, 4),
      coldBack: backPairs.slice(-4).reverse(),
    };
  }

  // ============================================================
  // 十、暴露 API
  // ============================================================
  global.LuckyEngine = {
    SCHEMES,
    LOOKBACK_DEFAULT,
    ZODIAC_NUMBERS,
    DREAM_NUMBERS,
    LPN_LUCKY,

    // 因素工厂
    makeLucky,
    makeAvoid,
    makeDate,
    makeZodiac,
    makeDream,
    makeLifePath,
    makeCustom,

    // 工具
    inferZodiac,
    lifePathNumber,
    parseDate,
    formatDate,

    // 频率分析
    freqDLT,
    freqQXC,
    summarizeDLTT,

    // 生成
    generateDLT,
    generateQXC,

    // 命中 / 奖级
    matchCount,
    awardTierDLT,
    awardTierQXC,

    // 内部（供调试）
    pickNoReplace,
    pickOne,

    meta: {
      version: '1.0.0',
      games: ['dlt', 'qxc'],
      factorTypes: ['lucky', 'avoid', 'date', 'zodiac', 'dream', 'lifepath', 'custom'],
      basedOn: 'src/engine.mjs（Workbuddy 原项目 Node 版算法）',
      extensions: '因素库（lucky/avoid/date/zodiac/dream/lifepath/custom）',
    },
  };

})(typeof window !== 'undefined' ? window : globalThis);
