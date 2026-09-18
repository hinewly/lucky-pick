# DEPLOY.md · 部署指南

> 把 LuckyPick 部署到 Cloudflare Pages，让任何人都能访问。

---

## 一、为什么选 Cloudflare Pages

- ✅ 免费、无限流量
- ✅ 自动 HTTPS（PWA 必需）
- ✅ 国内访问相对稳定（Cloudflare 在亚洲有节点）
- ✅ 一键从 GitHub 自动部署
- ✅ 部署后你 push 代码，1-3 分钟自动上线

**对比其他平台**：
- **GitHub Pages**：国内不稳，经常抽风
- **Vercel**：类似 Cloudflare，但国内访问略差
- **Netlify**：老牌稳定，但免费额度只有 100GB/月

---

## 二、部署步骤（一步步来）

### 第 1 步：注册 Cloudflare 账号

1. 打开 https://dash.cloudflare.com/sign-up
2. 填邮箱 + 密码
3. 验证邮箱（Cloudflare 会发邮件）
4. 登录到 Dashboard

⚠️ **首次注册会让你选 plan**，选 **Free**（免费版完全够用）。

### 第 2 步：进入 Pages

1. 左侧菜单找 **Workers & Pages**
2. 点进去
3. 点 **Create application**
4. 选 **Pages** tab
5. 点 **Connect to Git**

### 第 3 步：连接 GitHub

1. 选 **GitHub**
2. 会跳到 GitHub 授权页面
3. ⚠️ **重要**：选 **Only select repositories**
4. 点 **Select repositories** → 选 **`hinewly/lucky-pick`**
5. 点 **Install & Authorize**
6. 回到 Cloudflare，应该看到 `hinewly/lucky-pick` 在列表里

### 第 4 步：选择仓库

1. 选 **`hinewly/lucky-pick`** 那一行
2. 点 **Begin setup**

### 第 5 步：配置构建（关键）

```
Project name:        lucky-pick
Production branch:   main
Build command:       (留空)
Build output dir:    public       ← ★ 这个很重要
Root directory:      (留空)
```

⚠️ **Build output directory 必须填 `public`**，因为我们的所有前端代码都在 `public/` 下。

### 第 6 步：部署

1. 点 **Save and Deploy**
2. 等 1-3 分钟（会显示 build log）
3. 看到 "Deployment successful!" 就 OK

### 第 7 步：拿到 URL

部署成功后，Cloudflare 会给你一个 URL：

```
https://lucky-pick.pages.dev
```

**这就是你的永久地址**——任何人都能访问。

---

## 三、绑定自定义域名（可选）

如果你有自己的域名（比如 `luckypick.com`），可以绑定：

1. 在 Cloudflare Pages 项目里点 **Custom domains**
2. 点 **Set up a custom domain**
3. 输入你的域名
4. Cloudflare 会告诉你加什么 DNS 记录
5. 去你的域名服务商加记录
6. 等 DNS 生效（一般几分钟到几小时）

**不绑定也能用**，默认 `xxx.pages.dev` 就够了。

---

## 四、之后怎么更新

### 更新代码

```bash
cd /Users/zoujiean/codex/lucky-pick
# 改完代码后
git add .
git commit -m "描述改了啥"
git push
```

推送完 1-3 分钟，Cloudflare 自动部署新版本。

### 更新数据

```bash
cd /Users/zoujiean/codex/lucky-pick
node src/fetch_data.mjs   # 抓最新开奖数据
cp data/*.js public/data/ # 同步到前端加载路径
git add data/ public/data/
git commit -m "更新历史数据"
git push
```

推送完自动上线。

---

## 五、故障排查

| 现象 | 原因 | 解决 |
|------|------|------|
| 部署失败 | Build output dir 填错 | 改成 `public` |
| 部署成功但页面空白 | JS 路径问题 | F12 看 Console 报错 |
| PWA 添加到桌面不工作 | HTTP 而非 HTTPS | Cloudflare 自动 HTTPS，应该 OK |
| 国内访问慢 | Cloudflare 节点问题 | 用浏览器开发者工具看实际延迟 |

---

## 六、查看部署日志

在 Cloudflare Pages 项目页面：

- **Deployments** tab：每次部署记录
- 点具体一次部署 → 看 **Build log**
- 可以看到构建过程、错误信息

如果部署失败，把错误日志发给我，我帮你看。

---

## 七、回滚到之前版本

万一某次部署坏了：

1. Cloudflare Pages 项目页面
2. **Deployments** tab
3. 找之前成功的部署
4. 点 **...** → **Rollback to this deploy**

---

## 八、安全建议

部署后：

1. **别把任何敏感信息 commit 进仓库**（PAT、API key、密码等）
2. **定期检查 GitHub 仓库 Settings → Security**
3. **如果 PAT 泄露**，立即去 GitHub Settings 撤销

---

## 部署后验证清单

部署成功，确认这些：

- [ ] 能访问 `https://lucky-pick.pages.dev`
- [ ] 页面显示 LuckyPick 标题
- [ ] 切 tab（大乐透 / 七星彩）正常
- [ ] 加因素 → 生成号码 → 显示结果
- [ ] "最近开奖"显示数据
- [ ] F12 Console 没红色报错

有任何一项失败，把 Console 报错发我，我帮你看。
