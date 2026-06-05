# 数学搭档 - 部署指南

## 前提条件

- 一个 GitHub 账号（免费）
- 一个 Vercel 账号（免费，用 GitHub 登录）
- 一个 Supabase 账号（免费，用 GitHub 登录）
- 一个 DeepSeek API Key（在 https://platform.deepseek.com 注册）

---

## 第一步：创建 Supabase 项目

1. 打开 https://supabase.com，用 GitHub 登录
2. 点击 **New project**
   - Name: `math-buddy`
   - Database Password: 设置一个强密码并记下来
   - Region: 选 **Singapore**（东南亚，国内访问快）
3. 等待项目创建完成（约 2 分钟）
4. 进入 **SQL Editor**，点击 **New query**
5. 把 `supabase-schema.sql` 的内容粘贴进去，点击 **Run**
6. 进入 **Settings > API**，复制：
   - `Project URL`（类似 `https://xxxxx.supabase.co`）
   - `anon public key`

---

## 第二步：配置 Vercel 项目

1. 打开 https://vercel.com，用 GitHub 登录
2. 把这个 `math-buddy-app` 目录 push 到 GitHub
3. 在 Vercel 点击 **New Project**，导入你的 GitHub 仓库
4. 设置环境变量（Settings > Environment Variables）：

| 变量名 | 值 |
|--------|-----|
| `DEEPSEEK_API_KEY` | `sk-xxxx`（你的 DeepSeek API Key）|
| `DEEPSEEK_MODEL` | `deepseek-chat` |
| `APP_PASSWORD` | 设置一个密码（小朋友登录用） |

5. 点击 **Deploy**

---

## 第三步：配置前端连接 Supabase

1. 打开 `config.js`
2. 把 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 改成你在 Supabase 获取的值
3. 提交并 push 到 GitHub，Vercel 会自动重新部署

---

## 第四步：验证

1. 打开 Vercel 给你的域名（类似 `https://math-buddy.vercel.app`）
2. 输入你设置的 APP_PASSWORD 登录
3. 点击"今日练习"测试完整流程

---

## 在 iPad 上使用

1. 用 Safari 打开你的 Vercel 域名
2. 点击 Safari 底部的 **分享按钮**
3. 选择 **添加到主屏幕**
4. 这就成了一个全屏 Web App，像原生 App 一样使用

---

## 项目结构

```
math-buddy-app/
├── index.html          # 主页面（登录 + 练习 + 错题 + 题库）
├── style.css           # 样式
├── config.js           # Supabase 连接配置
├── auth.js             # 登录认证
├── api.js              # DeepSeek API 代理调用
├── db.js               # Supabase 数据库操作
├── app.js              # 主应用逻辑
├── manifest.json       # PWA 配置（iPad 添加到主屏幕）
├── vercel.json         # Vercel 部署配置
├── package.json        # 依赖
├── supabase-schema.sql # 数据库建表 SQL
├── api/
│   └── chat.js         # Vercel Serverless Function（DeepSeek 代理 + 密码验证）
└── .env.example        # 环境变量模板
```
