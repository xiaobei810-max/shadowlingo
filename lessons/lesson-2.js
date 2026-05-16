{
        id: "lesson-2",
        title: "坐大巴",
        scene: "Nora 和明轩上了机场大巴，但 Nora 还没有开通手机支付。",
        correct: [
          {
            zh: "没事",
            pinyin: "Méi shì",
            en: "No worries (casual)",
            note: "口语中最地道的回应，比\"没关系\"更高频。"
          },
          {
            zh: "没关系",
            pinyin: "Méi guān xi",
            en: "It doesn't matter (textbook)",
            note: "书面语，年轻人日常少用。"
          }
        ],
        titleZh: "第二课：坐大巴", titleEn: "Lesson 2: On the Bus",
        newChars: [],
        cgImage:   '/assets/cg/lesson2_bus.png?v=20260421',   // 公路空镜（图3）→ 故事CG + 全屏背景 + 卡片缩略图
        cardImage: '/assets/cg/lesson2_bus_card.jpg?v=20260421', // 公路空镜切片 → 章节卡片缩略图
        cgText:  '窗外的风景在后退，而我在中国的生活，才刚刚启程。',
        cgTextEn: 'As the scenery fades behind us, my journey in China has only just begun.',
        coverScene: {
          zh: 'Nora 和明轩上了机场大巴，<br>但 Nora 还没有开通手机支付。',
          en: "Nora and Mingxuan board the airport bus, but Nora hasn't set up mobile payments yet."
        },
        audio: "",   // 暂无整段录音，逐句由 TTS 接管
        sentences: [
          /* Page 1 */
          {
            zh: "我们需要买票吗？",
            pinyin: "Wǒ men xū yào mǎi piào ma?",
            en: "Do we need to buy tickets?",
            contextBelow: { speaker: "赵明轩 · Zhao Mingxuan", zh: "不用，上车扫码。", pinyin: "Bú yòng, shàng chē sǎo mǎ.", en: "No need, just scan the code on the bus." },
            role: "learner",
            start: 0, end: 0,
            praise: "🎯 问得很自然！Great question!",
            hint: "【需要...吗？】asks 'do we need to...?' · 【买票】'buy tickets' — works on any transport",
            chars: [
              { c: "我", p: "wo3" }, { c: "们", p: "men5" },
              { c: "需", p: "xu1" }, { c: "要", p: "yao4" },
              { c: "买", p: "mai3" }, { c: "票", p: "piao4" }, { c: "吗", p: "ma5" }
            ]
          },
          /* Page 2 */
          {
            zh: "我还没有微信。",
            pinyin: "Wǒ hái méi yǒu Wēi xìn.",
            en: "I don't have WeChat yet.",
            contextBelow: { speaker: "赵明轩 · Zhao Mingxuan", zh: "没事，我帮你付。", pinyin: "Méi shì, wǒ bāng nǐ fù.", en: "It's okay, I'll pay for you." },
            role: "learner",
            start: 0, end: 0,
            praise: "😊 表达得很清楚！Crystal clear!",
            hint: "【还没有】= 'don't have yet' · 还 implies it's coming — softer and more natural than just 没有",
            chars: [
              { c: "我", p: "wo3" }, { c: "还", p: "hai2" }, { c: "没", p: "mei2" },
              { c: "有", p: "you3" }, { c: "微", p: "wei1" }, { c: "信", p: "xin4" }
            ]
          },
          /* Page 3 */
          {
            zh: "多少钱？我给你现金。",
            pinyin: "Duō shǎo qián? Wǒ gěi nǐ xiàn jīn.",
            en: "How much? I'll give you cash.",
            contextBelow: { speaker: "赵明轩 · Zhao Mingxuan", zh: "二十块。不用急。", pinyin: "Èr shí kuài. Bú yòng jí.", en: "Twenty yuan. No rush." },
            role: "learner",
            start: 0, end: 0,
            praise: "💰 问价格很地道！Spot on!",
            hint: "【多少钱？】is THE most useful question in China · works in any shop, taxi, or market",
            chars: [
              { c: "多", p: "duo1" }, { c: "少", p: "shao3" }, { c: "钱", p: "qian2" },
              { c: "我", p: "wo3" }, { c: "给", p: "gei3" }, { c: "你", p: "ni3" },
              { c: "现", p: "xian4" }, { c: "金", p: "jin1" }
            ]
          },
          /* Page 4 */
          {
            zh: "机场离学校远吗？",
            pinyin: "Jī chǎng lí xué xiào yuǎn ma?",
            en: "Is the airport far from the school?",
            contextBelow: { speaker: "赵明轩 · Zhao Mingxuan", zh: "有点远，要一个小时。", pinyin: "Yǒu diǎn yuǎn, yào yī gè xiǎo shí.", en: "A bit far, it takes an hour." },
            role: "learner",
            start: 0, end: 0,
            praise: "🌍 问距离超实用！So practical!",
            hint: "【A 离 B 远吗？】= 'Is A far from B?' · 【有点...】softens adjectives — 'a bit far', 'a little tired'",
            chars: [
              { c: "机", p: "ji1" }, { c: "场", p: "chang3" }, { c: "离", p: "li2" },
              { c: "学", p: "xue2" }, { c: "校", p: "xiao4" }, { c: "远", p: "yuan3" }, { c: "吗", p: "ma5" }
            ]
          }
        ],
        vocab: [
          { zh: '买票', py: 'mǎi piào',  en: 'Buy a ticket',  role: 'local' },
          { zh: '扫码', py: 'sǎo mǎ',   en: 'Scan QR code',  role: 'local' },
          { zh: '现金', py: 'xiàn jīn', en: 'Cash',          role: 'local' },
          { zh: '远',   py: 'yuǎn',     en: 'Far',           role: 'local' },
        ],
        insiderTip: {
          textbook: { zh: '没关系。', en: "It doesn't matter." },
          street:   { zh: '没事。', pinyin: 'Méi shì.' },
          langTip: {
            zh: '当别人道歉或道谢时，中国年轻人最常说的不是教科书里的"<b class="tip-hl">没关系 (Méi guān xi)</b>"，而是更随意的"<b class="tip-hl">没事 (Méi shì)</b>"——简短、轻巧，表示"没什么大不了"。',
            en: 'When someone apologizes or thanks you, young Chinese rarely use the textbook phrase <b class="tip-hl">没关系 (Méi guān xi)</b>. Instead, they say <b class="tip-hl">没事 (Méi shì)</b> — brief, casual, meaning "it\'s nothing, no big deal."'
          },
          cultureTip: {
            zh: '"<b class="tip-hl">扫码 (sǎo mǎ)</b>"是现代中国生存的必备词。无论买车票、买水还是进场馆，几乎所有支付和验证都通过手机完成。没有<b class="tip-hl">微信</b>或<b class="tip-hl">支付宝</b>，在中国寸步难行。',
            en: '<b class="tip-hl">扫码 (sǎo mǎ)</b> — "scan the QR code" — is a survival word in China. From bus tickets to bottled water, nearly all payments go through your phone. Without <b class="tip-hl">WeChat Pay</b> or <b class="tip-hl">Alipay</b>, daily life gets complicated fast.'
          }
        }
      }
