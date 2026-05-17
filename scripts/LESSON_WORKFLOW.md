# 新课开发工作流

L13–L16 实战中踩过的坑都列在这里。开工前从头到尾走一遍。

---

## 一、开工前决策清单

| 项 | 选择 | 说明 |
|---|---|---|
| 课号 | N | 自动归入 Unit ⌈N/5⌉（5 课一单元，固定规则） |
| 结构 | 扁平 8 句 / contextAbove+Below | 与同单元其他课对齐；L3/L5/L16 是扁平，L13/L14/L15 是 ctx 型 |
| 角色 | 复用 / 新增 | 新增角色要在 `CHARACTER_DB` 注册并配音色 |
| 林晚出场？ | 是 / 否 | 是 → 需走「林晚静态 MP3」流程（见 §4） |
| 配图 | 用户提供 / 占位 | `cgImage` + `cardImage`，放 `public/assets/cg/` |

---

## 二、文件结构

每课一个文件：`lessons/lesson-N.js`

```js
{                          // 注意：只是个对象字面量，不要 module.exports
  id: "lesson-N",
  title: "...",
  scene: "...",
  correct: [ {zh, pinyin, en, note}, ..., {type:"culture", zh, desc} ],
  titleZh, titleEn,
  newChars: [],
  cgImage, cardImage,
  cgText, cgTextEn,
  coverScene: { zh, en },
  audio: "",
  sentences: [ /* 见 §3 */ ],
  vocab: [ {zh, py, en}, ... ],
  insiderTip: { /* 见 §5 */ },
}
```

保存后 `pre-commit` 钩子会自动跑 `scripts/build_lessons.py` 把 `index.html` 里的 LESSONS 数组重建。

---

## 三、sentence 必填 9 字段

```js
{ zh, pinyin, en, role, speaker, start:0, end:0, praise, hint, chars:[…] }
```

- `role`: `local` / `learner`（决定 TTS 音色与 UI 配色）
- `speaker`: 显示名，如 `"诺拉 · Nora"`
- `chars[]`: 每个汉字对应 `{c:"汉", p:"han4"}`，**用数字声调，不是符号**

---

## 四、林晚台词 → 静态 MP3 流程

如果本课有林晚台词，**必须**预生成静态 MP3（运行时 TTS 音色不稳）：

### 4.1 在 `sync_audio.py` 的 `LINWAN_SCRIPT` 追加

```python
{"lesson_key": "lessonN",
 "line_key":   "X",                        # 1-based dialogue index
 "filename":   "LN_0X_Linwan.mp3",
 "text":       "和 sentences[X-1].zh 完全一致的全文"},
```

### 4.2 跑脚本（三条命令必须分行）

```bash
export AZURE_SPEECH_KEY="你的 Azure Key"
export AZURE_SPEECH_REGION="eastasia"
python3 sync_audio.py
```

⚠️ **不要写成一行**：`export AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=... python3 sync_audio.py` 会把整串当成变量名报 `not a valid identifier`。要么分行，要么用 `&&` 连接。

⚠️ MiniMax 那 80 条会先全部失败（API key 已过期），属于正常，让它继续跑完，Azure 阶段会接着生成林晚 MP3。

### 4.3 保证 api/tts.js 运行时回退音色一致

`api/tts.js` 的 `linwan` 配置必须与 `sync_audio.py` 完全一致：

```js
linwan: { name: 'zh-CN-YunhaoNeural', lang: 'zh-CN',
          rateScale: 0.95, pitchAdj: '0%' }
```

否则新台词在静态 MP3 生成前，听感会和 L13–L15 已有 MP3 跳变。

---

## 五、insiderTip 模板

```js
insiderTip: {
  textbookLabel: '📖 书面语 · Textbook',
  streetLabel:   '🗣️ 口语 · Real Street',
  textbook: { zh: '教材生硬版', en: '...' },
  street:   { zh: '地道口语版', pinyin: '...' },
  langTip: {
    zh: '...<b class="tip-hl">重点词</b>...',
    en: '...<b class="tip-hl">key phrase</b>...'
  },
  cultureTip: { zh: '...', en: '...' }
}
```

---

## 六、五大数据陷阱（validator 会查，但理解原因才能避免）

### 6.1 拼音必须小写

```js
❌ pinyin: "Bīng de. È... bù..."   // 大写 È/Ā 被渲染器过滤掉，拼音错位
✅ pinyin: "Bīng de. è... bù..."
```

渲染器正则只识别小写带调字符（`āáǎàéěèīíǐìōóǒòūúǔùǖǘǚǜ`）。即使是句首也要小写。

### 6.2 儿化音 = 2 汉字 1 音节

```js
zh:     "在这儿"
pinyin: "zài zhèr"               // 2 音节（这+儿合并 r）
chars:  [{c:"在",p:"zai4"}, {c:"这",p:"zhe4"}, {c:"儿",p:"r5"}]
```

validator 知道 `r` 单独算 0 音节，会自动校正。

### 6.3 拼音串不能掺非拼音 token

```js
zh:     "Wi-Fi 密码"
❌ pinyin: "Wi-Fi mì mǎ"          // Wi-Fi 会污染音节计数
✅ pinyin: "mì mǎ"                // 渲染器会跳过英文部分
```

### 6.4 chars[] 必须和 zh 一对一同序

- 标点不算
- 顺序必须严格匹配
- 数量不能多也不能少

### 6.5 字符串嵌套不能用同种引号

```js
❌ note: "句末带出"不敢相信成功"的惊喜感。"   // 内层 " 把外层字符串提前关闭
✅ note: "句末带出「不敢相信成功」的惊喜感。"  // 中文「」最安全
✅ note: '句末带出"不敢相信成功"的惊喜感。'    // 外层换单引号
```

validator 会用 json5 解析 LESSONS 数组，遇到错误会报 `Unexpected "X" at column N`。中文引号「」/『』在视觉上最贴近双引号，建议优先用。

### 6.6 同一页两句皆 Nora → 跟读页声音错乱（已修，仍要警觉）

如果一页里 `top` 和 `bottom` **都是 Nora**（如 L19 第 1 页：自言自语 + 主动搭话），
`top` 进绿色 sentence-box（Nora 跟读），`bottom` 会被丢到「下方 context-panel」。

修复前：context-panel 调 `_speakerRole('nora')` 时，因为函数没识别 nora，
fallthrough 到 `return 'local'` → runtime TTS 拿到 Mingxuan 音色。

修复（commit `15d6b11`）：`_speakerRole` 顶部加 nora/learner 判断，正确返回 'learner'。

⚠️ **设计建议**：尽量避免同一页两句皆 Nora。如果剧情需要"自言自语+对外讲话"
的连续句，考虑：
1. 把内心独白合并到下一句
2. 移到 `coverScene` / `cgText` 当旁白
3. 接受双 Nora 排版（已不影响音频，仅视觉上略奇怪）

### 6.7 图片路径要真实存在

```js
cgImage: '/assets/cg/lesson16_tent.png?v=2'   // ?v=2 会被验证器自动去除
```

放图前确认 `public/assets/cg/` 下文件存在。

---

## 七、单元（每 5 课新开一个）

当 N 是 5 的倍数时，要在 `public/index.html` 的 `UNITS` 数组追加新单元。

### 7.1 模板

```js
{
  id: 5, numLabel: '05',
  titleZh: '...', titleEn: '...',
  eyebrowZh: '第五单元', eyebrowEn: 'Unit 5',
  motif: '关键词 · 关键词 · 关键词',
  themeColor: '#xxxxxx',     // 与前 4 单元有冷暖对比
  cardBg:  '...',            // 纯 CSS 渐变
  pageBg:  '...',
  lessons: [20],             // 0-based 索引数组（第 21 课对应 20）
}
```

### 7.2 单元色已用列表（避免撞色）

| Unit | 主题色 | 风格 |
|---|---|---|
| U1 | `#bfd4ea` | 冷蓝 |
| U2 | `#e8b890` | 暖橙 |
| U3 | `#d4ad88` | 暖褐 |
| U4 | `#7ecba1` | 草绿 |
| U5 | ? | 建议冷紫 / 深青 / 暖金 任选 |

### 7.3 封面是纯 CSS，不要图片

`cardBg` / `pageBg` 都是 radial-gradient + linear-gradient 组合，不依赖任何资源。

---

## 八、提交流程

```bash
# 1. 改完 lessons/lesson-N.js 后，pre-commit 自动重建 index.html
git add lessons/lesson-N.js public/assets/cg/lessonN_*.png
git commit -m "add: 第N课「标题」"

# 2. push 前 pre-push 自动跑 validator
git push
```

如果 validator 报错：

```bash
python3 scripts/validate_lessons.py     # 手动跑看详细报告
```

仍要绕过校验强推（不推荐）：

```bash
git push --no-verify
```

---

## 九、新课验收清单（push 后浏览器测试）

- [ ] 课程列表能看到新课
- [ ] 点进去封面图、cgText 正常显示
- [ ] 全文预览页：每个汉字上方拼音对齐
- [ ] 跟读页：朗读音频能播放（林晚台词听感与 L13–L15 一致）
- [ ] insiderTip 弹出层 zh/en 切换正常
- [ ] 关卡页 correct 选项 + culture 卡片显示完整
- [ ] 单元页（如新开单元）颜色与前 4 单元区分明显
