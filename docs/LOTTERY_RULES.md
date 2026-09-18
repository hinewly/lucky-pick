# LOTTERY_RULES.md · 国外彩种规则

> Powerball、Mega Millions、EuroMillions 等海外主流彩种的规则。

---

## MVP 三个彩种

### 🇺🇸 Powerball（美国，194 个州销售）

**玩法**：
- 前区（白球）：5 个数字，1-69 范围
- 后区（红球 Powerball）：1 个数字，1-26 范围

**开奖**：
- 每周三、周六晚（美国东部时间 22:59）
- **官方 API**：https://www.powerball.com/

**9 个奖级**（按难度）：

| 奖级 | 匹配条件 | 奖金（典型）|
|------|---------|------------------|
| 头奖 | 5 白球 + Powerball | 滚存（$2 千万起）|
| 二等奖 | 5 白球 | $100 万 |
| 三等奖 | 4 白球 + Powerball | $50,000 |
| 四等奖 | 4 白球 或 3 白球 + Powerball | $100 / $100 |
| 五等奖 | 3 白球 或 2 白球 + Powerball | $7 / $7 |
| 六等奖 | 1 白球 + Powerball 或 Powerball only | $4 / $4 |
| 七等奖 | (其他匹配组合) | $4 |

**数据格式**（待验证）：
```json
{
  "draw_date": "2026-09-13",
  "white_balls": [3, 8, 17, 21, 25],
  "powerball": 14,
  "power_play": null
}
```

---

### 🇺🇸 Mega Millions（美国，45 个州销售）

**玩法**：
- 前区（白球）：5 个数字，1-70 范围
- 后区（金球 Mega Ball）：1 个数字，1-25 范围

**开奖**：
- 每周二、周五晚（22:59 EST）
- **官方**：https://www.megamillions.com/

**9 个奖级**：

| 奖级 | 匹配 | 奖金（典型）|
|------|------|--------------|
| 头奖 | 5 + Mega Ball | 滚存（$4 千万起）|
| 二等奖 | 5 白球 | $100 万 |
| 三等奖 | 4 + Mega | $10,000 |
| 四等奖 | 4 白球 | $500 |
| 五等奖 | 3 + Mega | $200 |
| 六等奖 | 3 白球 | $10 |
| 七等奖 | 2 + Mega | $10 |
| 八等奖 | 1 + Mega | $4 |
| 九等奖 | Mega only | $2 |

**数据格式**：
```json
{
  "draw_date": "2026-09-15",
  "white_balls": [5, 8, 22, 44, 64],
  "mega_ball": 11,
  "megaplier": null
}
```

---

### 🇪🇺 EuroMillions（欧洲 9 国联彩）

**玩法**：
- 主区：5 个数字，1-50 范围
- Lucky Stars：2 个数字，1-12 范围

**参与国**：英国、法国、西班牙、葡萄牙、爱尔兰、奥地利、比利时、瑞士、卢森堡

**开奖**：
- 每周二、周五晚（巴黎时间 21:00）
- **官方**：https://www.euro-millions.com/

**13 个奖级**：

| 奖级 | 匹配 | 奖金（典型）|
|------|------|--------------|
| 头奖 | 5 + 2 Stars | 滚存（€1700 万起）|
| 二等奖 | 5 + 1 Star | €200K+ |
| 三等奖 | 5 | €15K |
| 四等奖 | 4 + 2 Stars | €1.5K |
| 五等奖 | 4 + 1 Star | €150 |
| 六等奖 | 3 + 2 Stars | €70 |
| 七等奖 | 4 | €50 |
| 八等奖 | 2 + 2 Stars | €20 |
| 九等奖 | 3 + 1 Star | €15 |
| 十等奖 | 3 | €12 |
| 十一等奖 | 1 + 2 Stars | €10 |
| 十二等奖 | 2 + 1 Star | €8 |
| 十三等奖 | 2 | €4 |

**数据格式**：
```json
{
  "draw_date": "2026-09-12",
  "main_numbers": [8, 19, 23, 32, 41],
  "lucky_stars": [3, 11]
}
```

---

## 字段名映射（国外 vs 国内）

| 国内 (大乐透) | 国外 (Powerball) | 国外 (Mega Millions) | 国外 (EuroMillions) |
|----------------|---------------------|------------------------|------------------------|
| `front` | `white_balls` | `white_balls` | `main_numbers` |
| `back` | `powerball` (单值) | `mega_ball` (单值) | `lucky_stars` (数组) |
| `issue` | (日期作 ID) | (日期作 ID) | (日期作 ID) |
| `date` | `draw_date` | `draw_date` | `draw_date` |

**统一抽象方案**：
```json
{
  "game": "powerball",
  "draw_date": "2026-09-13",
  "main_numbers": [3, 8, 17, 21, 25],
  "extra_numbers": [14],   // 1-3 个额外数字
  "main_range": [1, 69],
  "extra_range": [1, 26],
  "main_count": 5,         // 选几个 main
  "extra_count": 1          // 选几个 extra
}
```

**这样抽象后，Powerball、Mega Millions、EuroMillions 都能用同一个代码路径**。

---

## 数据源（待验证）

### 候选 API

| 来源 | 覆盖 | 备注 |
|------|------|------|
| **powerball.com** | Powerball | 官方，最权威 |
| **megamillions.com** | Mega Millions | 官方 |
| **euro-millions.com** | EuroMillions | 官方 |
| **lottoresults.com** | 多彩种 | 可能有 |
| **第三方 API**（待查）| 多彩种 | 需付费 |

### 抓取方式

- 浏览器端：会被 CORS 阻挡
- 服务器端：可以用 fetch_data.mjs 类似脚本

**最佳实践**：
- 用户不抓数据（避免法律风险）
- 用第三方 API（如果有）
- 手动维护（写代码生成）

---

## 中奖规则实现

```js
// Powerball 中奖判定示例
function awardTierPowerball(mainHits, hasPowerball) {
  if (mainHits === 5 && hasPowerball) return 1; // 头奖
  if (mainHits === 5) return 2;
  if (mainHits === 4 && hasPowerball) return 3;
  if (mainHits === 4) return 4;
  if (mainHits === 3 && hasPowerball) return 5;
  if (mainHits === 3) return 6;
  if (mainHits === 2 && hasPowerball) return 6;
  if (mainHits === 1 && hasPowerball) return 6;
  if (hasPowerball) return 6;
  return 0;
}
```

---

## 推广时的合规文案

**绝对不能用**：
- ❌ "Guaranteed to win"
- ❌ "Increase your odds"
- ❌ "Better than random"
- ❌ "Predicting next draw"
- ❌ "Inside information"

**应该用**：
- ✅ "Personal lucky number picker"
- ✅ "For entertainment purposes only"
- ✅ "Not affiliated with Powerball/Mega Millions/EuroMillions"
- ✅ "Random number generator with personal factors"
- ✅ "Odds of winning are the same as any other ticket"

---

## 下一步

1. **数据源验证**：找可用的官方/第三方 API
2. **引擎扩展**：让 engine.js 能处理 3 种新彩种
3. **UI 适配**：tab 改成"Powerball / Mega Millions / Euro Millions / 大乐透 / 七星彩"
4. **英文 UI**：所有文案双语
5. **PayPal 集成**：打赏/订阅按钮
6. **Reddit / Product Hunt**：冷启动
