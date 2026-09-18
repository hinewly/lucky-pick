# OPERATIONS.md · 操作指南

> 开发、部署、调试的步骤说明。

---

## 一、本地开发

### 启动服务（最常用）

**方法 1：双击脚本**

Finder 打开 `lucky-pick/`，双击 `启动服务器.command`。会弹出 Terminal 窗口，**保持开着**。

**方法 2：手动启动**

打开 Terminal（macOS 顶栏找 Terminal 图标），运行：

```bash
cd /Users/zoujiean/codex/lucky-pick
python3 -m http.server 8765
```

服务跑在 `http://localhost:8765/public/`。

**方法 3：用 Codex Terminal**

在 Codex 顶栏找 Terminal 图标，开 Terminal 后跑同一行命令。

### 关闭服务

- **方法 1**：双击 `停止服务器.command`
- **方法 2**：在跑服务的 Terminal 里按 `Ctrl+C`

### 访问页面

服务启动后，浏览器打开：

```
http://localhost:8765/public/index.html
```

**推荐用 Safari**（不是 Codex 自带浏览器）。Codex 内置浏览器有缓存怪癖。

### 更新数据

```bash
cd /Users/zoujiean/codex/lucky-pick
node src/fetch_data.mjs
# 自动抓最新数据到 data/dlt.js + data/qxc.js
```

抓完后**同步复制到 public/data/**：

```bash
cp data/*.js public/data/
```

---

## 二、刷新和清缓存

### 普通刷新

- macOS Chrome / Safari：`Cmd + R`
- macOS Firefox：`Cmd + R`

### 强制刷新（绕过缓存）

- `Cmd + Shift + R`

### 在 Codex 内置浏览器刷新

Codex 内置浏览器不支持普通刷新快捷键。用页面上的 **🧹 清缓存** 按钮：
- 页面底部"📱 怎么装到手机桌面？"卡片里
- 点开 → 看到右侧按钮
- 点一下 → 自动注销 SW + 清缓存 + 强制刷新

---

## 三、调试

### 浏览器开发者工具

**Safari**：`Cmd + Option + C`
**Chrome**：`Cmd + Option + J`（Console 标签）
**Firefox**：`Cmd + Option + K`

### 看数据加载状态

页面底部有"🔧 系统状态（调试用）"折叠卡片，点开看：

```
大乐透数据     558 期 ✓
七星彩数据     560 期 ✓
当前彩种       dlt
因素数量       0
最近一期       26106 (2026-09-13)
```

这能直接告诉我们问题：
- `0 期 ✗` 表示数据没加载
- `558 期 ✓` 表示 OK

### 控制台日志

打开 Console 看应用初始化日志，比如数据加载数量。
---

## 四、部署

### 推荐：Cloudflare Pages

**优点**：免费、无限流量、国内访问相对好、自动 HTTPS

**步骤**：

1. 把代码推到 GitHub 仓库
2. 登录 cloudflare.com → Pages
3. 连接 GitHub 仓库
4. 构建配置：
   - 构建命令：（留空，纯静态）
   - 输出目录：`public`
5. 部署 → 几分钟后拿到 URL（`xxx.pages.dev`）

### 备选：Vercel / Netlify

类似流程，都是从 GitHub 自动部署。

### GitHub Pages

⚠️ 国内访问不稳，仅适合海外用户访问。

---

## 五、Git 操作

### 初始化（已经做完）

仓库已初始化，第一个 commit 已完成。

### 添加远程并推送

第一次推送到 GitHub：

```bash
cd /Users/zoujiean/codex/lucky-pick
git remote add origin https://github.com/你的用户名/lucky-pick.git
git branch -M main
git push -u origin main
```

### 日常开发

```bash
# 改完代码后
git add .
git commit -m "描述改了啥"
git push
```

部署平台（Cloudflare Pages）会自动检测 push 并部署。

---

## 六、数据更新流程

### 半自动（短期方案）

```bash
cd /Users/zoujiean/codex/lucky-pick

# 1. 抓最新数据
node src/fetch_data.mjs

# 2. 同步到 public
cp data/*.js public/data/

# 3. 提交并推送
git add data/ public/data/
git commit -m "更新历史数据"
git push
```

### 全自动（长期方案）

部署 Cloudflare Worker，每天定时抓数据。

---

## 七、常见问题

| 问题 | 解决 |
|------|------|
| 浏览器看不到新版本 | Cmd+Shift+R 强制刷新，或用页面"🧹 清缓存"按钮 |
| 服务器僵死 | 重启服务（双击脚本或手动 Ctrl+C 后重启） |
| 七星彩没数据 | 检查 public/data/qxc.js 是否存在 |
| Service Worker 注册失败 | 开发模式下应禁用，部署到 HTTPS 才启用 |
