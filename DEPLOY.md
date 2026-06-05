# Math Buddy 部署与导入全流程

这份文档按“从零到可用”的顺序写，包含：

- Supabase 初始化
- 题库与图片导入
- Vercel 部署
- 大陆访问问题的处理建议
- 重新导入数据时的注意事项

---

## 1. 准备工作

你需要准备：

- 一个 GitHub 仓库
- 一个 Supabase 项目
- 一个 Vercel 账号
- 一个 DeepSeek API Key

本项目已经支持：

- 题库从 Supabase `question_bank_sources` / `questions` 读取
- 题目下方渲染 `assets` 图片
- 旧版 `question_banks` 题库仍可兼容

---

## 2. 初始化 Supabase

### 2.1 创建项目

1. 打开 [Supabase](https://supabase.com)
2. 新建项目
3. 设置数据库密码并保存
4. 选择区域时优先选亚洲节点

### 2.2 创建表结构

在 Supabase 控制台打开 `SQL Editor`，执行：

- `supabase-schema.sql`

如果你想使用规范化题库结构，也可以执行脚本生成的：

- `data/parsed/import-normalized-schema.sql`

推荐使用规范化结构，因为它支持：

- 一个题库来源对应多道题
- 每道题有独立 `assets`
- 后续可以按章节、年级、题型筛选

### 2.3 配置 Storage

在 Supabase 创建一个公开 bucket：

- `question-assets`

然后把题目配图上传到这个 bucket。

建议上传后的文件名统一使用英文，例如：

- `asset_0001.png`
- `asset_0002.jpg`

不要使用中文、空格、括号或特殊符号。  
本项目的导出文件已经统一改过引用。

### 2.4 题库数据导入

如果你已经把题库内容放到了 `data` 目录，脚本会生成这些文件：

- `data/parsed/questions-supabase.json`
- `data/parsed/questions-supabase-best-practice.json`
- `data/parsed/insert-normalized-questions.sql`
- `data/parsed/insert-question-bank-filled.sql`

导入时推荐按以下顺序：

1. 先执行 `data/parsed/import-normalized-schema.sql`
2. 再执行 `data/parsed/insert-normalized-questions.sql`

如果你只想先兼容旧结构，也可以执行：

- `data/parsed/insert-question-bank-filled.sql`

但长期建议还是切到 `questions` 表。

---

## 3. 题库导入方式

### 3.1 Markdown / Word / PDF 的处理思路

本项目当前的最佳实践是：

- 先把原始文件放到 `data/`
- 通过本地脚本解析成结构化数据
- 再导入 Supabase

结构化字段建议保持为：

- `text`
- `type`
- `answer`
- `explanation`
- `assets`
- 以及可选的 `source / grade / subject / chapter / tags`

### 3.2 如何在 Supabase 里导入

#### 方案 A：直接执行 SQL

适合数据量已经整理好的情况。

1. 打开 Supabase
2. 进入 `SQL Editor`
3. 粘贴并执行：
   - `data/parsed/import-normalized-schema.sql`
   - `data/parsed/insert-normalized-questions.sql`

#### 方案 B：上传文件后再导入

适合你后续持续增量导入。

1. 把图片上传到 `question-assets`
2. 题目 JSON 里只保留图片路径或 URL
3. 把题目写入 `questions`

建议数据库里保存的是：

- `asset.path`
- 或 Supabase 公网 URL

不要把本地磁盘路径直接写进数据库。

---

## 4. 前端与环境变量

### 4.1 配置 `config.js`

把下面两个值改成你自己的 Supabase 信息：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

如果你使用公开 Storage bucket `question-assets`，还可以设置：

- `SUPABASE_STORAGE_BASE`

### 4.2 Vercel 环境变量

在 Vercel `Project Settings > Environment Variables` 配置：

| 变量名 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` | 你的 DeepSeek API Key |
| `DEEPSEEK_MODEL` | 推荐 `deepseek-v4-flash`，也可按你账号支持的模型调整 |
| `APP_PASSWORD` | 登录密码 |

`api/chat.js` 会代理 DeepSeek 请求，前端不会直接暴露 API Key。

---

## 5. Vercel 部署流程

### 5.1 推送到 GitHub

先把本地改动提交到 GitHub。

### 5.2 在 Vercel 新建项目

1. 打开 [Vercel](https://vercel.com)
2. 导入 GitHub 仓库
3. 选择该项目
4. 填好环境变量
5. 点击部署

### 5.3 验证

部署完成后检查：

- 登录是否正常
- 今日练习是否能出题
- 题库页是否能读取 `question_bank_sources`
- 带图片题是否能显示 `assets`

---

## 6. 中国大陆访问问题

这个问题要分清楚：

- **Vercel 本身在大陆访问不稳定**
- 不是你代码写错了
- 也不是换个域名就一定能根治

### 6.1 推荐方案

如果你打算长期给孩子稳定使用，建议迁移到：

- 国内云服务器 + 国内 CDN
- 或香港 / 新加坡服务器

### 6.2 折中方案

如果暂时不迁移，也可以：

- 继续用 Vercel
- 但不要把它当作长期稳定方案

### 6.3 更稳的方案

后续可迁移到：

- 腾讯云
- 阿里云
- CloudBase
- 或香港 VPS + Nginx

这样通常比 Vercel 更适合大陆家庭长期使用。

---

## 7. 重新导入数据时的注意事项

### 7.1 如果导入 SQL 提示“invisible unicode”

说明文件里混进了零宽字符。

处理方式：

1. 重新生成导入文件
2. 或在导入前先清理文件

本项目已经清理过：

- `data/parsed/insert-normalized-questions.sql`
- `data/parsed/insert-question-bank-filled.sql`

### 7.2 如果图片文件名不合法

请确保：

- 文件名全英文
- 不要空格
- 不要中文
- 不要括号

### 7.3 如果题库页看不到图片

检查三件事：

1. 图片是否真的上传到了 `question-assets`
2. `assets.path` 是否和 bucket 路径一致
3. `config.js` 的 `SUPABASE_STORAGE_BASE` 是否正确

---

## 8. 本项目目录说明

```text
math-buddy-app/
├── app.js
├── auth.js
├── api.js
├── api/
│   └── chat.js
├── config.js
├── db.js
├── index.html
├── style.css
├── supabase-schema.sql
├── DEPLOY.md
├── data/
│   └── parsed/
│       ├── import-normalized-schema.sql
│       ├── insert-normalized-questions.sql
│       ├── insert-question-bank-filled.sql
│       ├── questions-supabase-best-practice.json
│       └── assets/
└── scripts/
    ├── extract_docx_questions.py
    └── sanitize_asset_names.py
```

---

## 9. 推荐的实际操作顺序

1. 把题库原始文件放进 `data`
2. 运行解析脚本，生成 `data/parsed`
3. 把 `assets` 上传到 Supabase Storage
4. 执行 `import-normalized-schema.sql`
5. 执行 `insert-normalized-questions.sql`
6. 配好 Vercel 环境变量
7. 部署到 Vercel
8. 测试登录、题库、图片渲染、练习流程

---

## 10. 最后建议

如果你后面还要持续导入新题库，最省心的方式是：

- 原始文件统一放 `data`
- 解析后统一进 `data/parsed`
- 图片统一进 Supabase Storage
- 题目统一进 `questions`

这样后续再新增 PDF、Word、Markdown，会很顺。
