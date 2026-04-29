# 盲盒商店系统 · 技术设计文档

> ShadowLingo / EchoChinese · Phase 1 MVP
> Last updated: 2026-04-28

---

## 1. 设计目标

为 ShadowLingo 学习闭环嵌入"随机奖励"层，把"跟读练习 → 攒回声币 → 抽卡 → 收集"打通成一个长期留存回路。

**核心原则**
- 货币只能学得，不卖钱（无任何 IAP 接入）
- 不打断学习心流：抽卡入口只在"自然停顿点"出现
- 内容驱动：盲盒是叙事杠杆，不是单纯付费墙
- 配置驱动：系列/物品/概率全在配置表里，不写死代码
- **渐进式门槛 + 平滑奖励曲线**：保证所有水平用户首次抽卡都在前 2 课内触发

**Phase 1 范围（本文档覆盖）**
- 单系列（"初见诺拉"）首发，6 件物品
- 单抽（无十连）
- 重复 → 碎片转换
- 简易保底（10 抽 SR+ / 30 抽 SSR）
- 收集册页面
- 诺拉 SSR 衣服影响章节封面立绘

**Phase 2/3 范围（不在本文档，但要预留接口）**
- 多系列分池（七七 / 明轩 / 林晚）
- 十连抽
- 林晚预热"匿名学长"系列（按章节进度解锁）
- 限时主题系列

---

## 2. 数据模型

### 2.0 货币产出与抽卡门槛

**单句跟读奖励曲线**（替换原有 1/2/3 币方案）：

| 跟读得分 | 回声币 |
|---------|--------|
| 60-80   | **2** 币 |
| 80-90   | **3** 币 |
| 90+     | **5** 币 |

**渐进式抽卡门槛**（首次抽卡保证在前 2 课内触发）：

```js
const GACHA_THRESHOLDS = [10, 25, 50];  // 第 1 / 2 / 3+ 次抽卡所需币数
function getCurrentThreshold(pullCount) {
  return GACHA_THRESHOLDS[Math.min(pullCount, GACHA_THRESHOLDS.length - 1)];
}
```

`pullCount` 从 0 起累加，前两次抽卡享受新手价（10 / 25），第 3 次起稳态 50 币。

**节奏验证表**（4 句 / 课）：

| 用户表现 | 单课收益 | 首次抽卡 | 第 2 次 | 稳态频率 |
|---------|---------|---------|---------|----------|
| 全 90+   | 20 币 | 第 1 课 | 第 2 课中段 | 每 2-3 课 |
| 全 80-90 | 12 币 | 第 1 课 | 第 2-3 课 | 每 4-5 课 |
| 全 60-80 | 8 币 | 第 2 课 | 第 4-5 课 | 每 6-7 课 |

### 2.1 物品定义（静态配置 · 写死在代码里）

```js
// 全部盲盒物品总表，按系列分组
const GACHA_SERIES = {
  'nora-debut': {
    id: 'nora-debut',
    nameZh: '初见诺拉',
    nameEn: "Nora's Debut",
    cover: '/assets/gacha/nora-debut/series-cover.png',
    cost: 50,                 // 单抽价格（回声币）
    unlockRule: { type: 'always' },   // 永久开放
    items: [
      // ── N (50%) ───────────────────────────
      { id: 'nd_n_card_keycard', tier: 'N',  type: 'card',
        nameZh: '宿舍房卡·四零二', nameEn: 'Dorm Key Card 402',
        img: '/assets/gacha/nora-debut/card_keycard.png',
        flavor: '三号楼四零二——诺拉在北京的第一个家。' },
      { id: 'nd_n_card_jh',    tier: 'N',  type: 'card',
        nameZh: '京华大学校徽', nameEn: 'JingHua Univ. Crest',
        img: '/assets/gacha/nora-debut/card_jh.png',
        flavor: '入学报到那天领到的，别在胸前沉甸甸的。' },

      // ── R (30%) ───────────────────────────
      { id: 'nd_r_diary_01',   tier: 'R',  type: 'diary',
        nameZh: '大巴上的二十块', nameEn: 'Twenty Yuan on the Bus',
        img: '/assets/gacha/nora-debut/diary_01.png',
        body: '司机说"二十块"，我翻遍包才凑够零钱。旁边的阿姨笑着等我，没有催。那二十块花得心跳。' },
      { id: 'nd_r_diary_02',   tier: 'R',  type: 'diary',
        nameZh: '你好，新室友！', nameEn: 'Hi, New Roomie!',
        img: '/assets/gacha/nora-debut/diary_02.png',
        body: '推开宿舍门，七七正坐在床上刷手机。她抬头看我，笑了："你就是诺拉？我等你好久了。"就这一句，北京好像没那么大了。' },

      // ── SR (15%) ──────────────────────────
      { id: 'nd_sr_diary_audio', tier: 'SR', type: 'diary',
        nameZh: '第一天的深夜独白', nameEn: 'First Night Monologue',
        img: '/assets/gacha/nora-debut/diary_sr.png',
        audio: '/assets/gacha/nora-debut/diary_sr.mp3',
        body: '今天好长。\n\n先是飞机，然后大巴，二十块钱差点找不到。到了学校，老师递给我房卡，说"三号楼，四零二"——我愣了一秒才反应过来那是我的宿舍号。\n\n推开门，七七在。她问我要不要加微信，我说"好"，手还在抖。\n\n现在躺在床上，窗外有风，有树，还有北京的夜。\n\n想家。但也想知道明天是什么样的。' },

      // ── SSR (5%) ──────────────────────────
      { id: 'nd_ssr_outfit_dress', tier: 'SSR', type: 'outfit',
        nameZh: '初秋见面礼', nameEn: "Nora's Arrival Outfit",
        img: '/assets/gacha/nora-debut/outfit_dress_thumb.png',
        outfitFull: '/assets/characters/nora/outfits/dress_full.png',
        target: 'nora',
        flavor: '浅色连衣裙 + 帆布包。第一天踏上北京土地时穿的，七七说"好看"。' },
    ]
  }
};
```

**字段约定**
- `tier`: `'N' | 'R' | 'SR' | 'SSR'` — 稀有度
- `type`: `'card' | 'diary' | 'outfit'` — 决定收集册分类与展示模板
- `target`: 仅 outfit 类需要，标识换装作用的角色（`'nora' | 'mingxuan' | 'qiqi' | 'linwan'`）
- `outfitFull`: 仅 outfit 类需要，封面立绘 PNG 路径
- `audio`: 可选，仅 diary 类某些条目需要
- `body`: 仅 diary 类的正文
- `flavor`: 卡片/外观的一句话描述

### 2.2 概率表

```js
const GACHA_RATES = {
  N:   0.50,
  R:   0.30,
  SR:  0.15,
  SSR: 0.05,
};
```

抽奖算法：先按 `GACHA_RATES` 抽稀有度，再在该稀有度内的物品中等概率随机。

### 2.3 用户状态（localStorage 持久化）

```js
// localStorage key: 'echo_gacha_state_v1'
{
  version: 1,
  collection: {
    'nd_n_card_keycard': { count: 3, firstAt: 1761820000000 },
    'nd_ssr_outfit_dress': { count: 1, firstAt: 1761830000000 },
    // 其他未抽到的物品键位不存在
  },
  shards: 14,                    // 当前回声碎片余额
  pity: {
    'nora-debut': {              // 每个系列独立保底计数器
      sinceLastSrPlus: 3,        // 距上次出 SR+ 的抽次
      sinceLastSsr:   18,        // 距上次出 SSR 的抽次
      totalPulls:     21
    }
  },
  equipped: {                    // 当前装备的衣服（影响封面立绘）
    nora:     'nd_ssr_outfit_dress',  // null 表示未装备（=默认立绘）
    mingxuan: null,
    qiqi:     null,
    linwan:   null
  },
  flags: {
    storeUnlockedSeen: true,     // 是否看过首次解锁动画
    lastUnlockAt:      0,
    pullCount:         2         // 累计抽卡次数（用于查 GACHA_THRESHOLDS）
  }
}
```

**版本字段** `version: 1` 是给 Phase 2 迁移用的：未来 schema 改动时通过 `migrateGachaState(oldState)` 升级。

### 2.4 碎片转换表

| 抽到重复物品 | 自动转碎片 |
|-------------|-----------|
| N           | 1         |
| R           | 3         |
| SR          | 8         |
| SSR         | 20        |

### 2.5 碎片商店定价

| 兑换目标 | 碎片价格 |
|---------|----------|
| 任意 N   | 5        |
| 任意 R   | 15       |
| 任意 SR  | 40       |
| 任意 SSR | 80       |

---

## 3. 抽卡核心算法

### 3.1 主流程

```js
function pullGacha(seriesId) {
  const series = GACHA_SERIES[seriesId];
  const state  = loadGachaState();

  // 0. 计算当前门槛（渐进式：前两次便宜）
  const cost = getCurrentThreshold(state.flags.pullCount);

  // 1. 校验余额
  if (getCoins() < cost) return { ok: false, reason: 'no-coins' };

  // 2. 扣币
  spendCoins(cost);

  // 3. 决定稀有度（含保底覆盖）
  const tier = rollTier(state.pity[seriesId]);

  // 4. 在该稀有度内随机一件
  const item = pickItemByTier(series.items, tier);

  // 5. 入库 / 转碎片
  const isDup = !!state.collection[item.id];
  if (isDup) {
    state.shards += SHARD_REWARD[tier];
  } else {
    state.collection[item.id] = { count: 1, firstAt: Date.now() };
  }
  // 重复仍然 +1 count，方便统计
  if (isDup) state.collection[item.id].count++;

  // 6. 更新保底计数 + 抽卡次数
  updatePity(state.pity[seriesId], tier);
  state.flags.pullCount++;

  // 7. 持久化
  saveGachaState(state);

  return { ok: true, item, isDup, tier, cost, shardsGained: isDup ? SHARD_REWARD[tier] : 0 };
}
```

### 3.2 保底逻辑

```js
function rollTier(pityCounter) {
  // 硬保底：30 抽必 SSR
  if (pityCounter.sinceLastSsr >= 29) return 'SSR';
  // 中保底：10 抽必 SR+
  if (pityCounter.sinceLastSrPlus >= 9) {
    return Math.random() < 0.25 ? 'SSR' : 'SR';
  }
  // 正常加权随机
  const r = Math.random();
  if (r < GACHA_RATES.SSR) return 'SSR';
  if (r < GACHA_RATES.SSR + GACHA_RATES.SR) return 'SR';
  if (r < GACHA_RATES.SSR + GACHA_RATES.SR + GACHA_RATES.R) return 'R';
  return 'N';
}

function updatePity(pity, tier) {
  pity.totalPulls++;
  pity.sinceLastSrPlus = (tier === 'SR' || tier === 'SSR') ? 0 : pity.sinceLastSrPlus + 1;
  pity.sinceLastSsr    = (tier === 'SSR') ? 0 : pity.sinceLastSsr + 1;
}
```

### 3.3 物品选择

```js
function pickItemByTier(items, tier) {
  const pool = items.filter(it => it.tier === tier);
  return pool[Math.floor(Math.random() * pool.length)];
}
```

---

## 4. UI 页面与流程

### 4.1 三个入口

| 入口 | 触发 | 视觉 |
|------|------|------|
| **解锁弹窗** | 金币 ≥ `getCurrentThreshold(pullCount)` 时 `addCoins()` 内触发，`flags.lastUnlockAt` 防重 | 顶部下滑通知条 + 2 秒后自动展示按钮 |
| **评分页 🎁** | 评分页 render 时检查 `getCoins() >= getCurrentThreshold(pullCount)` | 右上角常驻图标 |
| **顶部金币条** | 任意时刻点击金币条（已有）| 增加 onClick → 进商店 |

### 4.2 商店页（新页面 `#gacha-store-page`）

```
┌──────────────────────────────────┐
│  ◀  我的回声币: 50  我的碎片: 14   │  ← 顶部状态栏
│──────────────────────────────────│
│                                  │
│      ┌────────────────┐          │
│      │   [系列封面图]   │          │  ← 中央盲盒
│      │  初见诺拉系列    │          │
│      │  Nora's Debut    │          │
│      └────────────────┘          │
│                                  │
│  ┌─────────────────────────┐     │
│  │  消耗 50 回声币 · 抽 1 次 │     │  ← 主操作按钮
│  └─────────────────────────┘     │
│                                  │
│  [收集册]   [碎片商店]            │  ← 次级入口
└──────────────────────────────────┘
```

### 4.3 拆盒动效（进阶版）

**时间轴**（约 3 秒，按稀有度分支）

```
0.0s  用户点击"抽 1 次"
0.0s  扣币 + 数据计算（瞬时）
0.0s  屏幕变暗（背景压黑 0.85 透明度）
0.3s  盲盒图标从中央放大（scale 1 → 1.3）+ 微震动
0.6s  盲盒开始发光（光晕颜色由稀有度决定）
       └─ N:   白色      |  时长 0.4s
       └─ R:   蓝色      |  时长 0.6s
       └─ SR:  紫色      |  时长 0.9s
       └─ SSR: 金色      |  时长 1.5s（更长蓄力）
1.5s  粒子爆裂（10 / 20 / 40 / 80 个粒子，按稀有度递增）
1.8s  盲盒消失，物品卡从中央缩放出现（scale 0 → 1）
       └─ SSR 触发额外的全屏金光扫光（2 道斜向光柱）
2.5s  物品名称 + 描述淡入
3.0s  下方按钮淡入：
       [再来一发 (-50)]  [查看收集册]  [离开]
       （余币不足时，第一个按钮自动禁用）
```

**实现要点**
- 用 CSS keyframes + `setTimeout` 串联各阶段
- 粒子用 `<canvas>` 绘制（已有 fireworks 模块可参考）
- SSR 全屏金光用绝对定位 `<div>` 加 `transform: skewX` + `linear-gradient`
- 全程允许"点击屏幕跳过"（`skipUnboxing()` → 直接到 2.5s 状态）

### 4.4 收集册页 `#gacha-collection-page`

布局：上方 Tab 切换（卡片 / 日记 / 衣服）、下方网格

```
┌───────────────────────────────┐
│ [卡片] [日记] [衣服]           │
│───────────────────────────────│
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐          │
│  │✓ │ │? │ │✓ │ │? │          │
│  └──┘ └──┘ └──┘ └──┘          │
│  天安 ?未  京华 ?未             │
│                                │
│  3/6 件  · 50%                 │
└───────────────────────────────┘
```

- 已得卡：彩色显示 + 计数 ×N（重复数）
- 未得卡：灰色剪影 + "?"
- 点击已得卡 → 弹出详情 modal（大图 + 描述 + audio 播放 / 装备按钮）

### 4.5 碎片商店 `#gacha-shard-shop` （Phase 1 简版）

只展示"按稀有度兑换任意未持有物品"的 4 个选项：
```
[5 碎片 → 任意 N]
[15 碎片 → 任意 R]
[40 碎片 → 任意 SR]
[80 碎片 → 任意 SSR]
```

兑换逻辑：随机从未持有的该稀有度物品池中选一个。如果该稀有度全部已持有，按钮禁用。

### 4.6 装备换装

收集册 → 衣服 Tab → 点击已持有的 outfit → "装备 / 卸下" 按钮 → 写入 `state.equipped[target]`。

封面立绘渲染处（`showCoverPage()` 内）：
```js
const equippedId = gachaState.equipped[charId];
const outfitFull = equippedId
  ? findItemById(equippedId).outfitFull
  : DEFAULT_COVER[charId];   // 默认立绘
```

---

## 5. 模块划分（代码组织）

由于项目用单文件 `public/index.html`，所有代码集中在 script 标签内，按"区块注释"组织：

```js
// ════════════════════════════════════════════════
// ── 盲盒系统 Gacha System ────────────────────────
// ════════════════════════════════════════════════

// ─ 5.1 配置层 ─────────────────────────────────
const GACHA_SERIES     = { ... };
const GACHA_RATES      = { ... };
const GACHA_THRESHOLDS = [10, 25, 50];   // 渐进式门槛
const COIN_REWARD      = { tier1: 2, tier2: 3, tier3: 5 };  // 60-80/80-90/90+
const SHARD_REWARD     = { N: 1, R: 3, SR: 8, SSR: 20 };
const SHARD_PRICE      = { N: 5, R: 15, SR: 40, SSR: 80 };
const DEFAULT_COVER    = { nora: '/assets/...', ... };

// ─ 5.2 状态层 ─────────────────────────────────
function loadGachaState()  { /* localStorage 读取，缺省返回初始结构 */ }
function saveGachaState(s) { /* 写入 localStorage */ }
function migrateGachaState(s) { /* 版本迁移 */ }

// ─ 5.3 抽卡核心 ───────────────────────────────
function pullGacha(seriesId) { ... }
function rollTier(pity) { ... }
function pickItemByTier(items, tier) { ... }
function updatePity(pity, tier) { ... }

// ─ 5.4 入口逻辑 ───────────────────────────────
function checkGachaUnlock() { /* addCoins 调用，达 50 触发解锁通知 */ }
function showGachaUnlockToast() { ... }
function openGachaStore() { /* 打开商店页 */ }
function closeGachaStore() { ... }

// ─ 5.5 商店页 ─────────────────────────────────
function renderGachaStore() { ... }
function onGachaPullClick() { /* 点抽卡按钮 */ }

// ─ 5.6 拆盒动效 ───────────────────────────────
function playUnboxing(result, onComplete) { /* 3s 动画序列 */ }
function unboxParticleBurst(canvas, tier) { ... }
function unboxGoldFlash() { /* SSR 专属全屏金光 */ }
function skipUnboxing() { ... }

// ─ 5.7 收集册 ─────────────────────────────────
function openCollectionBook(tab) { ... }
function renderCollectionGrid(type) { ... }
function showItemDetail(itemId) { /* 详情 modal */ }
function equipOutfit(itemId) { /* 装备/卸下 */ }

// ─ 5.8 碎片商店 ───────────────────────────────
function openShardShop() { ... }
function exchangeByTier(tier) { /* 用碎片兑换随机未持有 */ }

// ─ 5.9 封面立绘集成（改造既有函数）─────────────
//   showCoverPage() 内增加换装读取（约 5 行新增代码）
```

---

## 6. 资源路径规范

```
public/assets/
├─ gacha/
│  └─ nora-debut/
│     ├─ series-cover.png         # 系列封面（盲盒展示用）
│     ├─ card_keycard.png          # N 宿舍房卡·四零二
│     ├─ card_jh.png              # N 京华大学校徽
│     ├─ diary_01.png             # R 大巴上的二十块（日记封面）
│     ├─ diary_02.png             # R 你好，新室友！（日记封面）
│     ├─ diary_sr.png             # SR 第一天的深夜独白（日记封面）
│     ├─ diary_sr.mp3             # SR 独白语音（30-45s）
│     └─ outfit_dress_thumb.png   # SSR 缩略图（收集册用）
│
└─ characters/
   └─ nora/
      ├─ outfits/
      │  └─ dress_full.png        # SSR 装备后的封面立绘（全身）
      └─ ...
```

---

## 7. 与既有系统的集成点

### 7.1 金币结算
当前评分逻辑给币数为 1/2/3，需要替换为新曲线 2/3/5：
```js
function scoreToCoins(score) {
  if (score >= 90) return COIN_REWARD.tier3;   // 5 币
  if (score >= 80) return COIN_REWARD.tier2;   // 3 币
  if (score >= 60) return COIN_REWARD.tier1;   // 2 币
  return 0;
}
```
`addCoins(n)` 在跟读评分结束时调用。需要在其末尾插入：
```js
function addCoins(n) {
  // ...既有逻辑...
  checkGachaUnlock();   // 新增：内部用 getCurrentThreshold(pullCount) 判断
}
```

### 7.2 顶部金币条
现有的金币条点击事件（如有）需扩展：
```js
function onCoinBarClick() {
  // ...既有逻辑...
  if (getCoins() >= GACHA_SERIES['nora-debut'].cost) {
    openGachaStore();
  } else {
    // 显示余币不足提示
  }
}
```

### 7.3 章节封面立绘
`showCoverPage(lessonIdx)` 内：
```js
function showCoverPage(lessonIdx) {
  // ...既有逻辑...
  const charOnCover = LESSONS[lessonIdx].coverCharacter || 'nora';
  const equipped = gachaState.equipped[charOnCover];
  const coverImg = equipped
    ? findItemById(equipped).outfitFull
    : DEFAULT_COVER[charOnCover];
  document.getElementById('cover-character-img').src = coverImg;
}
```

### 7.4 评分页 🎁 图标
评分页 render 函数末尾增加：
```js
function showEvalPage(...) {
  // ...既有逻辑...
  const giftIcon = document.getElementById('eval-gift-icon');
  giftIcon.style.display = (getCoins() >= 50) ? 'block' : 'none';
}
```

---

## 8. Phase 2/3 扩展接口预留

### 8.1 多系列分池
`GACHA_SERIES` 已经是按 ID 索引的对象，新增系列只需添加新的键。

### 8.2 系列解锁规则
`unlockRule` 字段预留多种类型：
```js
unlockRule: { type: 'always' }                          // 永久开放
unlockRule: { type: 'lessonCompleted', lessonIdx: 4 }   // 第5课完成后
unlockRule: { type: 'date', from: '2026-06-01' }        // 限时开放
unlockRule: { type: 'progressTier', minPulls: 50 }      // 累计抽卡数
```

### 8.3 林晚"匿名学长"机制
Phase 2 增加配置项：
```js
{ id: 'lw_sr_voice_01', tier: 'SR', type: 'diary',
  nameZh: '?匿名学长 · 独白',
  revealAfter: { lessonIdx: 9 },   // 第10课通关后揭示真实名字与立绘
  ... }
```
渲染层根据 `revealAfter` 与当前学习进度决定是否打码。

### 8.4 十连抽
`pullGachaTen(seriesId)` 在 `pullGacha` 基础上循环 10 次，最后强制覆盖：
- 若 10 次内无 SR+ → 第 10 件强制升级到 SR
- 价格 = `cost × 9`（九折）

---

## 9. 边界情况与防御性处理

| 场景 | 处理 |
|------|------|
| 用户清除浏览器 localStorage | `loadGachaState()` 返回初始结构，从零开始 |
| 系列内某稀有度全部已持有 → 还能抽到？ | 仍按概率出，重复物品照常转碎片 |
| 一抽时刚好金币不足（并发？）| 抽卡前再校验一次，不足则回滚 |
| 拆盒动画播放中用户切换页面 | `pagehide` 事件 → 立即结算（数据已落库）|
| schema 版本不匹配 | `migrateGachaState()` 升级；失败则保留原 state，新字段补缺省值 |
| outfit 资源 404 | fallback 到默认立绘，console.warn 提示 |

---

## 10. 测试清单（Phase 1 上线前）

- [ ] 首次进入：`gachaState` 正确初始化（`pullCount = 0`）
- [ ] **第 1 次抽卡**：门槛显示为 10 币、扣 10 币
- [ ] **第 2 次抽卡**：门槛显示为 25 币
- [ ] **第 3 次起**：门槛稳定在 50 币
- [ ] 单句评分曲线：60 分得 2 币、85 分得 3 币、95 分得 5 币
- [ ] 单抽：扣币、抽出物品、入库、动画完整
- [ ] 重复抽到 N → 碎片正确累加
- [ ] 连抽 10 次：第 10 次出现 SR 或 SSR（中保底）
- [ ] 连抽 30 次：必出过 SSR（硬保底）
- [ ] 装备 SSR 衣服 → 章节封面立绘正确切换
- [ ] 卸下衣服 → 立绘回到默认
- [ ] 碎片商店：兑换后碎片正确扣减
- [ ] 余币不足：抽卡按钮禁用 + 提示
- [ ] 解锁通知：首次达 50 币只弹一次（`flags` 防重）
- [ ] 顶部金币条入口：在三种页面都能正常打开商店
- [ ] localStorage 清除后从零开始无报错

---

## 11. 进度追踪

文档定稿后按此顺序实现：

- [ ] M1 · 数据层 + 抽卡核心算法（无 UI，console 测试）
- [ ] M2 · 商店页 UI 框架
- [ ] M3 · 拆盒动效（占位资源）
- [ ] M4 · 收集册页面
- [ ] M5 · 碎片商店
- [ ] M6 · 三个入口接通
- [ ] M7 · 换装应用到封面立绘
- [ ] M8 · 替换正式美术资源
- [ ] M9 · 端到端联调 + bug 修复
