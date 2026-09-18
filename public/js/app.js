/**
 * app.js - LuckyPick 主程序
 *
 * 功能：
 *   - 加载历史数据（data/dlt.js, data/qxc.js）
 *   - 加载核心引擎（engine.js）
 *   - 因素库管理（添加/删除）
 *   - 号码生成
 *   - 历史频率展示
 *   - 历史记录保存（localStorage）
 */

(function (global) {
  'use strict';

  const Engine = global.LuckyEngine;

  // ============================================================
  // 一、状态管理
  // ============================================================
  const state = {
    game: 'dlt',                  // 当前彩种 'dlt' | 'qxc'
    factors: [],                  // 用户因素库
    sets: [],                     // 最近生成的号码
    history: { dlt: [], qxc: [] },// 历史数据
    weights: { a: 1, b: 1, c: 1, d: 1 }, // a/b/c/d 权重
    language: 'zh',               // 'zh' | 'en'
    saveKey: 'luckyPick.v1',
  };

  // ============================================================
  // 二、数据加载
  // ============================================================
  function loadData() {
    // 优先用全局变量（data/*.js 注入），其次 fetch
    if (global.DLT && global.DLT.draws && Array.isArray(global.DLT.draws)) {
      state.history.dlt = normalizeDlt(global.DLT.draws);
    }
    if (global.QXC && global.QXC.draws && Array.isArray(global.QXC.draws)) {
      state.history.qxc = normalizeQxc(global.QXC.draws);
    }
  }

  function normalizeDlt(arr) {
    return arr.map(d => ({
      issue: d.issue || d.expect || '',
      date: d.date || '',
      front: d.front || [],
      back: d.back || [],
    })).filter(d => d.front.length === 5 && d.back.length === 2);
  }

  function normalizeQxc(arr) {
    return arr.map(d => ({
      issue: d.issue || d.expect || '',
      date: d.date || '',
      nums: d.nums || [],
    })).filter(d => d.nums.length === 7);
  }

  // ============================================================
  // 三、因素库管理
  // ============================================================
  function addFactor(factor) {
    state.factors.push(factor);
    renderFactors();
    saveState();
  }

  function removeFactor(idx) {
    state.factors.splice(idx, 1);
    renderFactors();
    saveState();
  }

  function updateFactorWeight(idx, weight) {
    if (state.factors[idx]) {
      state.factors[idx].weight = weight;
    }
  }

  // ============================================================
  // 四、号码生成
  // ============================================================
  function generate() {
    const game = state.game;
    const factors = state.factors;
    const history = state.history[game];

    if (history.length === 0) {
      alert('暂无历史数据，请先运行 src/fetch_data.mjs 抓取数据');
      return;
    }

    let sets = [];
    try {
      if (game === 'dlt') {
        sets = Engine.generateDLT(factors, history, { count: 3, lookback: 50 });
      } else {
        sets = Engine.generateQXC(factors, history, history, { count: 3, lookback: 50 });
      }
    } catch (err) {
      console.error('生成失败：', err);
      alert('生成失败：' + err.message);
      return;
    }

    state.sets = sets;
    renderResults();
    renderFreq();
    saveState();
  }

  // ============================================================
  // 五、UI 渲染
  // ============================================================
  function $(id) { return document.getElementById(id); }
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const k in props) {
      if (k === 'class') node.className = props[k];
      else if (k === 'style') node.style.cssText = props[k];
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), props[k]);
      else if (k === 'html') node.innerHTML = props[k];
      else if (k === 'text') node.textContent = props[k];
      else node.setAttribute(k, props[k]);
    }
    for (const c of children) {
      if (typeof c === 'string') node.appendChild(document.createTextNode(c));
      else if (c) node.appendChild(c);
    }
    return node;
  }

  function renderFactors() {
    const list = $('factor-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.factors.length === 0) {
      const hint = el('div', { class: 'muted', style: 'font-size:13px;' }, ['点击下方按钮添加你的幸运因素，让选号更"你的"']);
      hint.style.padding = '8px 0';
      return;
    }

    state.factors.forEach((f, idx) => {
      const chip = el('span', { class: 'factor-chip ' + (f.type === 'avoid' ? 'avoid' : '') }, [
        el('span', { class: 'icon', text: factorIcon(f.type) }),
        el('span', { text: f.label }),
        el('button', {
          class: 'remove',
          title: '移除',
          'data-idx': String(idx),
          onClick: (e) => {
            const i = Number(e.currentTarget.dataset.idx);
            removeFactor(i);
          },
        }, ['×']),
      ]);
      list.appendChild(chip);
    });
  }

  function factorIcon(type) {
    const icons = {
      lucky: '🍀', avoid: '🚫', date: '📅', zodiac: '♈',
      dream: '💭', lifepath: '🔢', custom: '✨',
    };
    return icons[type] || '✨';
  }

  function renderResults() {
    const container = $('results');
    if (!container) return;
    container.innerHTML = '';

    if (state.sets.length === 0) {
      container.appendChild(el('div', { class: 'muted center', text: '点击下方按钮生成你的幸运号码' }));
      return;
    }

    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0');

    state.sets.forEach((set, idx) => {
      const card = el('div', { class: 'result-card fade-in' });
      card.appendChild(el('span', { class: 'scheme-tag', text: set.scheme }));
      card.appendChild(el('div', { class: 'meta', text: '第 ' + (idx + 1) + ' 注 · ' + timeStr }));
      card.appendChild(renderBalls(set));
      container.appendChild(card);
    });
  }

  function renderBalls(set) {
    if (set.front && set.back) {
      // 大乐透
      const wrap = el('div', { class: 'balls' });
      set.front.forEach(n => wrap.appendChild(el('span', { class: 'ball front', text: String(n).padStart(2, '0') })));
      wrap.appendChild(el('span', { class: 'ball divider', text: '|' }));
      set.back.forEach(n => wrap.appendChild(el('span', { class: 'ball back', text: String(n).padStart(2, '0') })));
      return wrap;
    } else if (set.nums) {
      // 七星彩
      const wrap = el('div', { class: 'balls' });
      set.nums.forEach(n => wrap.appendChild(el('span', { class: 'ball qxc', text: String(n) })));
      return wrap;
    }
    return el('span');
  }

  function renderFreq() {
    const container = $('freq');
    if (!container) return;
    container.innerHTML = '';

    const game = state.game;
    const history = state.history[game];
    if (history.length === 0) {
      container.appendChild(el('div', { class: 'muted', text: '暂无历史数据' }));
      return;
    }

    const summary = Engine.summarizeDLTT(history);
    container.appendChild(el('div', { class: 'freq-grid' }, [
      el('div', { class: 'freq-cell' }, [
        el('div', { class: 'label', text: '前区热门号' }),
        el('div', { class: 'nums', text: summary.hotFront.map(x => String(x.n).padStart(2, '0')).join(' ') }),
      ]),
      el('div', { class: 'freq-cell' }, [
        el('div', { class: 'label', text: '前区冷门号' }),
        el('div', { class: 'nums', text: summary.coldFront.map(x => String(x.n).padStart(2, '0')).join(' ') }),
      ]),
    ]));
  }

  // ============================================================
  // 六、添加因素弹窗
  // ============================================================
  function openAddFactorModal(type) {
    const mask = $('modal-mask');
    const modal = $('modal');
    if (!mask || !modal) return;

    let body = '';

    if (type === 'lucky' || type === 'avoid') {
      body = `
        <label>输入数字（用空格或逗号分隔）</label>
        <input type="text" id="modal-input" placeholder="如：7 18 或 7,18" />
      `;
    } else if (type === 'date') {
      body = `
        <label>选择日期</label>
        <input type="date" id="modal-input" value="${new Date().toISOString().slice(0,10)}" />
      `;
    } else if (type === 'zodiac') {
      const opts = Object.entries(Engine.ZODIAC_NUMBERS)
        .map(([k, v]) => `<option value="${k}">${v.name}（${v.numbers.join(' ')}）</option>`)
        .join('');
      body = `
        <label>选择星座</label>
        <select id="modal-input">${opts}</select>
      `;
    } else if (type === 'dream') {
      body = `
        <label>输入梦境关键词（用空格分隔）</label>
        <input type="text" id="modal-input" placeholder="如：水 鱼 飞" />
      `;
    } else if (type === 'lifepath') {
      body = `
        <label>选择生日（用于计算生命数字）</label>
        <input type="date" id="modal-input" value="1990-01-01" />
      `;
    }

    modal.innerHTML = `
      <h3>添加${factorTitle(type)}</h3>
      ${body}
      <div class="actions">
        <button class="cancel" id="modal-cancel">取消</button>
        <button class="ok" id="modal-ok">确认</button>
      </div>
    `;

    mask.classList.add('show');

    $('modal-cancel').onclick = closeModal;
    $('modal-ok').onclick = () => {
      const val = $('modal-input').value;
      let factor = null;
      try {
        if (type === 'lucky') {
          const nums = parseNumbers(val);
          if (nums.length === 0) return alert('请输入数字');
          factor = Engine.makeLucky(nums);
        } else if (type === 'avoid') {
          const nums = parseNumbers(val);
          if (nums.length === 0) return alert('请输入数字');
          factor = Engine.makeAvoid(nums);
        } else if (type === 'date') {
          factor = Engine.makeDate(val);
        } else if (type === 'zodiac') {
          factor = Engine.makeZodiac(val);
        } else if (type === 'dream') {
          const kws = val.split(/\s+/).filter(Boolean);
          if (kws.length === 0) return alert('请输入关键词');
          factor = Engine.makeDream(kws);
        } else if (type === 'lifepath') {
          factor = Engine.makeLifePath(val);
        }
      } catch (e) {
        return alert('解析失败：' + e.message);
      }

      if (factor) {
        addFactor(factor);
        closeModal();
      }
    };
  }

  function factorTitle(type) {
    return {
      lucky: '幸运数字', avoid: '排除数字',
      date: '日期因素', zodiac: '星座因素',
      dream: '梦境因素', lifepath: '数字命理',
    }[type] || '因素';
  }

  function closeModal() {
    $('modal-mask').classList.remove('show');
  }

  function parseNumbers(str) {
    return str.split(/[\s,,，]+/)
      .map(s => Number(s.trim()))
      .filter(n => Number.isFinite(n));
  }

  // ============================================================
  // 七、状态持久化
  // ============================================================
  function saveState() {
    try {
      const toSave = {
        factors: state.factors.map(f => ({
          type: f.type, label: f.label, weight: f.weight, data: f.data,
        })),
        weights: state.weights,
        game: state.game,
      };
      localStorage.setItem(state.saveKey, JSON.stringify(toSave));
    } catch (e) { /* 忽略存储错误 */ }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(state.saveKey);
      if (!saved) return;
      const data = JSON.parse(saved);
      state.game = data.game || 'dlt';
      state.weights = data.weights || state.weights;
      // 重建 factors（重新生成 contains 函数）
      if (Array.isArray(data.factors)) {
        state.factors = data.factors.map(f => rebuildFactor(f)).filter(Boolean);
      }
    } catch (e) { /* 忽略 */ }
  }

  function rebuildFactor(f) {
    try {
      if (f.type === 'lucky') return Engine.makeLucky(f.data, f.weight);
      if (f.type === 'avoid') return Engine.makeAvoid(f.data, f.weight);
      if (f.type === 'date') return Engine.makeDate(f.data.dateStr, f.weight);
      if (f.type === 'zodiac') return Engine.makeZodiac(f.data.zodiac, f.weight);
      if (f.type === 'dream') return Engine.makeDream(f.data.keywords, f.weight);
      if (f.type === 'lifepath') return Engine.makeLifePath(f.data.lifePathNumber, f.weight);
    } catch (e) { return null; }
    return null;
  }

  // ============================================================
  // 八、初始化
  // ============================================================
  function init() {
    loadData();
    loadState();

    // 绑定 tab 切换
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const g = tab.dataset.game;
        if (g && (g === 'dlt' || g === 'qxc')) {
          state.game = g;
          document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.game === g));
          renderFactors();
          renderResults();
          renderFreq();
          saveState();
        }
      });
    });

    // 绑定"添加因素"按钮
    document.querySelectorAll('[data-add-factor]').forEach(btn => {
      btn.addEventListener('click', () => {
        openAddFactorModal(btn.dataset.addFactor);
      });
    });

    // 绑定"生成"按钮
    const genBtn = $('btn-generate');
    if (genBtn) genBtn.addEventListener('click', generate);

    // 绑定 modal 关闭
    const mask = $('modal-mask');
    if (mask) {
      mask.addEventListener('click', (e) => {
        if (e.target === mask) closeModal();
      });
    }

    // 初始渲染
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.game === state.game));
    renderFactors();
    renderResults();
    renderFreq();

    console.log('[LuckyPick] 初始化完成', {
      dlt: state.history.dlt.length + '期',
      qxc: state.history.qxc.length + '期',
      factors: state.factors.length + '个',
      engine: Engine.meta,
    });
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 暴露
  global.LuckyApp = {
    state,
    addFactor,
    removeFactor,
    generate,
  };

})(typeof window !== 'undefined' ? window : globalThis);
