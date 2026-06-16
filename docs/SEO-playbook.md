# EchoChinese SEO 运营手册

> 整理自 2026-06-15 从零搭建 SEO 的全过程。下次加内容页、或忘了流程时，看这一份就够。

---

## 0. 一句话总览

SEO = 有人在 Google 搜某个问题时，让你的页面成为答案。
做法：**选一个真实搜索词 → 做一个能回答它的静态页 → push 上线 → 让 Google 抓 → 等几个月发酵**。
你的便宜：每条短视频 = 一个页面，内容一鱼两吃。

---

## 1. 现在已经搭好了什么（现状）

**域名**
- `echochinese.com`，在 Vercel 注册，到期 2027-06-15，自动续费已开。
- ⚠️ 待办：Vercel 左下角 "Action Required" 的**账单地址**要补全，否则可能影响域名续费。

**站点配置（都在 head / public 下）**
- canonical 域名统一为 `echochinese.com`（head 里 og:url / og:image / twitter:image 都已是 .com，并有 `<link rel="canonical">`）。
- `public/robots.txt`（Allow all + 指向 sitemap）。
- `public/sitemap.xml`（目前 8 条 URL）。

**Google Search Console**
- 已用「网域资源」+ DNS TXT 验证 `echochinese.com`。
- sitemap 已提交。

**内容页**（`public/learn/<slug>/index.html`，目前 7 篇，互相内链）
- `kuai-vs-yuan` — 块 vs 元
- `chinese-phone-and-room-numbers` — 房间号/电话号一个个念
- `chinese-lucky-and-unlucky-numbers` — 4 不吉利、8 吉利
- `what-does-haohao-mean` — 好好（叠词）
- `what-does-huitou-mean` — 回头
- `verb-qilai-chinese` — V + 起来
- `what-does-zhaoqian-mean` — 找钱

---

## 2. ⭐ 核心可复用流程：一条短视频 → 一个 SEO 页

这是你会反复做的。每次步骤：

1. **定主题 + 选词**（见第 4 节）。一页瞄一个英文长尾词，slug 用英文短横线。
2. **准备内容**：中文例子 + 拼音由你出（必须准确）；英文讲解照「课本说 X，真实说 Y」的结构。
3. **丢给 Claude Code**（用下面的模板）。
4. ⚠️ **push / 合并到 main**（不 push 不部署！见第 3 节）。
5. **验证**：浏览器或 curl 打开 `https://echochinese.com/learn/<slug>/`（带尾斜杠），返回 200、显示文章即成。
6. （可选）Search Console 请求索引，或等 sitemap 自然抓取。

### 可复用的 Claude Code prompt 模板（填空即用）

```
执行（单次 commit）。先读 public/learn/kuai-vs-yuan/index.html 当模板，
完全沿用它的 <style>、布局、head 结构、表格/强调框/CTA、底部 "Keep learning" 内链板块。

新建 public/learn/【slug】/index.html，head：
- title:【英文标题，含关键词，约 50–60 字符】
- meta description:【约 120–155 字符，含中文例子+拼音】
- canonical 和 og:url 都指向 https://echochinese.com/learn/【slug】/
- og:type=article、og:title 同 title、og:description 同 description、
  og:image 复用 https://echochinese.com/assets/og-image.jpg、lang="en"

正文（英文讲解 + 中文例子带拼音，静态写在 HTML，中文/拼音原样勿改）：
H1:【同 title】
【这里贴英文段落、例子列表、强调框，照 kuai-vs-yuan 的结构】

底部 "Keep learning" 板块：链到其它所有 /learn 页（带尾斜杠）；
并把本页加进其它每一页的 "Keep learning" 板块（保持互链）。

更新 public/sitemap.xml：新增本页 URL（带尾斜杠），lastmod 用今天。

完成后单次 commit。不要碰 vercel.json、index.html（app 本体）、api/、或音频/打分/埋点。
```

填好后，**记得让它 push 到 main**。

---

## 3. ⚠️ 踩过的坑 / 铁律（别再犯）

1. **改完必须 push / 合并到 main，Vercel 才部署。**
   本次卡了两次——以为代码坏了，其实只是 commit 卡在本地没 push。每次结尾都确认一句「push 到 main」。

2. **URL 一律带尾斜杠** `/learn/xxx/`。
   原因：vercel.json 用旧版 `routes`，不能加 `cleanUrls`（一加部署就报错），所以走「目录索引」方式（文件放 `<slug>/index.html`），访问 `/xxx/` 命中。canonical 和 sitemap 也都用带斜杠版。

3. **不要碰**：`vercel.json`、`index.html`（app 本体）、`api/`、音频、打分、埋点、gacha 概率/币值。
   内容页是纯新增文件，跟这些完全隔离，风险才低。

4. **部署后再测**（stale deploy）：「还打不开」先等 1–2 分钟部署完、刷新最新构建，再下结论。

5. 每页 **canonical 和 og:url 自指**（指向自己，不是首页）；`og:type=article`。

6. 视觉沿用 app 的 token（模板里已有，新页照抄即可）：
   - 背景 `#0a0f1a`、正文 `#e2e8f0`、链接/强调 `#22c55e`、卡片 `#111827`、边框 `#1a2540`、次要文字 `#4b5563`
   - 标题字体 `"Noto Serif SC","SimSun",serif`；正文 system sans

---

## 4. 选词原则

- **长尾、低竞争、英文意图**。新站排不上 "learn Chinese"（竞争太大），要瞄具体长句。
- **一页一词**。
- **判断能不能赢**：把词搜一下，首页全是大站（维基 / 大牌课程）就跳过；首页是单薄页或论坛帖，就能上。
- **免费选词工具**：Google 自动补全、搜索结果里的 "People also ask" / 相关搜索。
- **你的主场词**：
  - `how Chinese actually say X`（课本 vs 真实）——最强，直接对应你的短视频。
  - 技能词：`Chinese shadowing practice`、`HSK 2 speaking practice`。
  - 场景词（你的课）：`airport Chinese conversation`、`ordering coffee in Chinese` 等。

---

## 5. Google Search Console 怎么用

- 资源类型选**网域**（Domain），不是网址前缀；DNS TXT 验证（已做）。
- **提交 sitemap**：左侧「站点地图」，网域资源要填**完整 URL** `https://echochinese.com/sitemap.xml`（只填 `sitemap.xml` 会报「地址无效」）。
- **请求索引**：顶部「网址检查」输入完整 URL →「请求编入索引」。新页可催一下，但 sitemap 已含的页，Google 也会自己发现。
- 几周后看左侧**「效果」**：哪些词开始有展示、点击。哪篇有起色就往那个方向多做。

---

## 6. 期望值（别误判）

- SEO 慢：新域名通常 **3–6 个月**才有像样排名，且是复利。
- 救不了「这个月没人」，它是长期资产。
- **页越多，能接住的搜索词越多**——所以持续把短视频转成页。

---

## 7. 引流总策略（背景，SEO 只是其中一条）

- **短视频引擎（最高杠杆）**：同一条片子全平台发——YouTube Shorts + TikTok + Reels + **Bilibili + 小红书（发内容，不是私信）**；结尾软 CTA 到 app。你 173 播放那条「真实 vs 课本」格式有效，照着多做。
- **SEO（本手册）**：把短视频转成可搜索页，复利。
- **Product Hunt + Show HN**：一次性爆发 + 高权重外链 + 早期反馈（还没做，等额度/时机）。
- **试过效果有限**：冷私信创作者/老师、社区一次性发帖（只让发一次）——别在这上面耗。
