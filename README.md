# LuckyPick · 个人幸运号码生成器

> 用你的星座、幸运数字、梦境等个人信息，生成属于你的号码。

---

## 这是什么

LuckyPick 是一个**个人娱乐工具**，让你通过添加自己的"幸运因素"来生成彩票号码（大乐透 / 七星彩）。

**核心特点**：
- 🎲 **个性化**：你添加的因素会影响号码生成，不是纯随机
- 🌟 **因素库**：星座、生日、梦境、幸运数字、塔罗、数字命理
- 📱 **PWA**：可以添加到主屏幕，像 App 一样使用，离线可用
- 🎯 **基于算法**：继承并扩展自经过实战验证的彩票选号算法
- 🛡️ **合规底线**：明确标注"娱乐用途"，不卖彩票、不保证中奖

**重要声明**：
> 本应用仅供个人娱乐，所生成的号码不保证任何中奖概率。彩票是随机的，请理性对待，量力而行。未成年人禁止使用。

---

## 项目结构

```
lucky-pick/
├── docs/                       # 规划文档
│   └── PROJECT_VISION.md       # 产品愿景与决策文档
├── public/                     # PWA 前端（浏览器端）
│   ├── index.html              # 主页面
│   ├── manifest.json           # PWA 配置
│   ├── service-worker.js       # 离线缓存
│   ├── css/styles.css          # 样式（柔和中性风格）
│   ├── js/
│   │   ├── engine.js           # 浏览器端核心算法
│   │   └── app.js              # 主程序（UI + 状态）
│   └── icons/                  # PWA 图标（SVG/PNG）
├── src/                        # Node 工具脚本
│   ├── engine.mjs              # 核心算法（Node 版）
│   ├── fetch_data.mjs          # 联网抓取开奖数据
│   ├── match_analysis.mjs      # 开奖后匹配分析
│   ├── gen_weights.mjs         # 权重计算
│   ├── gen_practice.mjs        # 生成练习注
│   ├── gen_reminder.mjs        # 提醒决策
│   ├── auto_remind.mjs         # 提醒自动化
│   └── send_mail.py            # 邮件发送
├── data/                       # 历史数据
│   ├── dlt.js                  # 大乐透历史（~554 期）
│   ├── qxc.js                  # 七星彩历史（~557 期）
│   ├── weights.js              # 当前权重
│   └── weights.json            # 当前权重（JSON 版）
├── practice/                   # 练习注
├── analysis/                   # 开奖分析
└── .gitignore
```

---

## 如何使用

### 浏览器端（PWA）

```bash
# 方式 1：直接双击 public/index.html（file:// 协议）
# 方式 2：用本地静态服务
python3 -m http.server 8000 --directory public
# 访问 http://localhost:8000
```

**添加 PWA**（移动端）：
- iOS Safari：分享 → 添加到主屏幕
- Android Chrome：菜单 → 添加到主屏幕

### Node 端（数据维护）

```bash
# 抓取最新开奖数据
node src/fetch_data.mjs

# 生成练习注
node src/gen_practice.mjs

# 开奖后匹配分析
node src/match_analysis.mjs

# 权重更新
node src/gen_weights.mjs
```

---

## 核心算法

### 5 策略权重合成

```
每个号码的最终权重 = a * 历史频次占比
                   + b * 是否用户偏好
                   + c * 是否环境数字
                   + d * 随机
                   + 因素库加成
                   - if 排除数字 then * 0.05
```

策略：
- A 重热度（a=4）：看历史频次
- B 重偏好（a=1, b=4）：看用户偏好
- C 重环境（c=4）：看日期/环境
- D 重运气（d=4）：主要随机
- E 均衡（a=b=c=d=1）

### 因素库（lucky-pick 扩展）

| 因素类型 | 说明 |
|---------|------|
| `lucky` | 用户输入的幸运数字 |
| `avoid` | 用户排除的数字 |
| `date`  | 日期数字（生日、纪念日）|
| `zodiac` | 星座幸运数字 |
| `dream` | 梦境关键词 → 数字 |
| `lifepath` | 数字命理（Life Path Number）|
| `custom` | 自定义因素 |

### 抽样算法

采用 **Efraimidis-Spirakis 不放回加权抽样**：
```
key = -ln(u) / weight
按 key 升序取前 k 个
```
比简单"按权重随机抽一个剔除"更公平，避免极端情况。

---

## 开发历史

### v1.0（2026-09-18）
- 完整 PWA 架构
- 因素库系统（lucky/avoid/date/zodiac/dream/lifepath）
- 基于原算法扩展（src/engine.mjs）
- 柔和中性风格 UI
- 5 策略权重合成
- 历史冷热号展示

### 起源
原项目位于 `/Users/zoujiean/WorkBuddy/生活/彩票/`，是经过验证的本地彩票工具。lucky-pick 在原项目基础上：
- 拆分为 PWA 架构
- 添加"用户因素"系统
- 完善 UI/UX
- 支持国际化（规划中）

---

## 路线图

### 已完成
- [x] PWA 基础设施
- [x] 因素库系统
- [x] 5 策略算法
- [x] 历史频率展示
- [x] 本地存储（localStorage）

### 计划中
- [ ] 英文版（i18n）
- [ ] 塔罗牌因素
- [ ] 转盘动画
- [ ] 多彩种扩展（Powerball、Mega Millions 等）
- [ ] 高级统计图表
- [ ] 云同步（可选）

---

## 许可证

本项目仅供学习与个人娱乐使用。

彩票是娱乐的一种形式，请理性对待，量力而行。
