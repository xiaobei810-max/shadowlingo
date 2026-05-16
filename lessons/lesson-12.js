{
        id: "lesson-12",
        title: "点单卡壳",
        scene: "诺拉看了一会儿菜单，终于选择好咖啡，重新向店员走去。",
        correct: [
          {
            zh: "我要一杯拿铁。",
            pinyin: "Wǒ yào yì bēi ná tiě.",
            en: "I want a latte (textbook).",
            note: "教材式点单，直接但略显生硬。"
          },
          {
            zh: "麻烦给我一杯拿铁。",
            pinyin: "Má fan gěi wǒ yì bēi ná tiě.",
            en: "Could I please have a latte (natural). ✅",
            note: "口语首选：「麻烦给我……」是点单/求助的高频礼貌句式，听起来轻盈、地道。"
          },
          {
            type: "culture",
            zh: "饮品店的「几分甜」",
            desc: "中国饮品店极其注重定制化，店员会快速追问「冰/热」「几分甜」。常见甜度：全糖（默认）、七分甜/少糖、半糖、无糖。"
          }
        ],
        titleZh: "第十二课：点单卡壳", titleEn: "Lesson 12: Ordering Panic",
        newChars: [],
        cgImage:   '/assets/cg/lesson12_coffee-shop.png',
        cardImage: '/assets/cg/lesson12_coffee-shop_card.jpg',
        cgText:  '当课本上的中文遇到现实的语速，我的第一杯拿铁，被卡在了「不知道怎么选」的尴尬里。',
        cgTextEn: 'When textbook Chinese collides with real-world speed, my first latte got stuck in the awkwardness of "I don\'t know how to choose."',
        coverScene: {
          zh: '诺拉看了一会儿菜单，<br>终于选择好咖啡，<br>重新向店员走去。',
          en: "After studying the menu for a while, Nora finally decides on her coffee and walks back to the staff."
        },
        audio: "",
        sentences: [
          /* Page 1 — Nora 开口，店员回应在下方 */
          {
            zh: "你好，我看好菜单了。麻烦给我一杯拿铁。",
            pinyin: "Nǐ hǎo, wǒ kàn hǎo cài dān le. Má fan gěi wǒ yì bēi ná tiě.",
            en: "Hello, I've looked at the menu. Please give me a latte.",
            contextBelow: { speaker: "店员 · Cafe Staff", zh: "好的，请问要大杯还是中杯？", pinyin: "Hǎo de, qǐng wèn yào dà bēi hái shì zhōng bēi?", en: "Okay, large or medium?" },
            role: "learner",
            start: 0, end: 0,
            praise: "🥤 点单超礼貌！Polite order!",
            hint: "【麻烦给我……】是点单/求助时最高频的礼貌句式，比直说「我要」轻盈得多 · 看好了 = '决定好了'（看 + 好 表示完成）· 拿铁 (ná tiě) = latte",
            chars: [
              { c: "你", p: "ni3" }, { c: "好", p: "hao3" },
              { c: "我", p: "wo3" },
              { c: "看", p: "kan4" }, { c: "好", p: "hao3" },
              { c: "菜", p: "cai4" }, { c: "单", p: "dan1" }, { c: "了", p: "le5" },
              { c: "麻", p: "ma2" }, { c: "烦", p: "fan2" },
              { c: "给", p: "gei3" }, { c: "我", p: "wo3" },
              { c: "一", p: "yi1" }, { c: "杯", p: "bei1" },
              { c: "拿", p: "na2" }, { c: "铁", p: "tie3" }
            ]
          },
          /* Page 2 — Nora 选杯型 */
          {
            zh: "中杯就可以了，谢谢。",
            pinyin: "Zhōng bēi jiù kě yǐ le, xiè xie.",
            en: "Medium is fine, thank you.",
            contextBelow: { speaker: "店员 · Cafe Staff", zh: "好的，中杯。那要冰的还是热的？要几分甜？", pinyin: "Hǎo de, zhōng bēi. Nà yào bīng de hái shì rè de? Yào jǐ fēn tián?", en: "Okay, medium. Iced or hot? How much sweetness?" },
            role: "learner",
            start: 0, end: 0,
            praise: "👌 中杯说得自然！Smooth pick!",
            hint: "【……就可以了】= '…will do / is fine' — 比「我要中杯」更柔和、客气 · 中杯 (zhōng bēi) = medium cup",
            chars: [
              { c: "中", p: "zhong1" }, { c: "杯", p: "bei1" },
              { c: "就", p: "jiu4" },
              { c: "可", p: "ke3" }, { c: "以", p: "yi3" }, { c: "了", p: "le5" },
              { c: "谢", p: "xie4" }, { c: "谢", p: "xie5" }
            ]
          },
          /* Page 3 — 没听懂时如何反问 */
          {
            zh: "冰的。呃……不好意思，你刚才说的「几分甜」是什么意思？",
            pinyin: "Bīng de. è... bù hǎo yì si, nǐ gāng cái shuō de \"jǐ fēn tián\" shì shén me yì si?",
            en: "Iced. Uh... excuse me, what did you mean by 'how much sweetness' just now?",
            contextBelow: { speaker: "店员 · Cafe Staff", zh: "就是需要加多少糖？全糖、半糖还是少糖？", pinyin: "Jiù shì xū yào jiā duō shao táng? Quán táng, bàn táng hái shì shǎo táng?", en: "It means how much sugar you need added? Full, half, or less?" },
            role: "learner",
            start: 0, end: 0,
            praise: "💬 敢问就赢了！Brave question!",
            hint: "【你刚才说的XXX是什么意思？】= 'What did you mean by XXX just now?' — 把没听懂的词原样复述出来，比说「我没听懂」更精准 · 「呃……」是自然的停顿语气词",
            chars: [
              { c: "冰", p: "bing1" }, { c: "的", p: "de5" },
              { c: "呃", p: "e4" },
              { c: "不", p: "bu4" }, { c: "好", p: "hao3" }, { c: "意", p: "yi4" }, { c: "思", p: "si5" },
              { c: "你", p: "ni3" },
              { c: "刚", p: "gang1" }, { c: "才", p: "cai2" },
              { c: "说", p: "shuo1" }, { c: "的", p: "de5" },
              { c: "几", p: "ji3" }, { c: "分", p: "fen1" }, { c: "甜", p: "tian2" },
              { c: "是", p: "shi4" },
              { c: "什", p: "shen2" }, { c: "么", p: "me5" },
              { c: "意", p: "yi4" }, { c: "思", p: "si5" }
            ]
          },
          /* Page 4 — 坦白「不知道怎么选」 */
          {
            zh: "原来是这样，太复杂了，我一下子不知道该怎么选了。",
            pinyin: "Yuán lái shì zhè yàng, tài fù zá le, wǒ yí xià zi bù zhī dào gāi zěn me xuǎn le.",
            en: "So that's how it is — it's too complicated, I suddenly don't know what to choose.",
            contextBelow: { speaker: "店员 · Cafe Staff", zh: "那您再想想，不用着急。", pinyin: "Nà nín zài xiǎng xiǎng, bú yòng zháo jí.", en: "Then think about it a bit more, no need to hurry." },
            role: "learner",
            start: 0, end: 0,
            praise: "🌱 坦白困境很地道！Honest move!",
            hint: "【原来是这样】= 'Oh, so that's how it is' — 终于明白时的常用反应 · 【一下子】= 'all at once / suddenly' · 不用着急 = '不用 + V' 表示「不必」",
            chars: [
              { c: "原", p: "yuan2" }, { c: "来", p: "lai2" },
              { c: "是", p: "shi4" },
              { c: "这", p: "zhe4" }, { c: "样", p: "yang4" },
              { c: "太", p: "tai4" },
              { c: "复", p: "fu4" }, { c: "杂", p: "za2" }, { c: "了", p: "le5" },
              { c: "我", p: "wo3" },
              { c: "一", p: "yi1" }, { c: "下", p: "xia4" }, { c: "子", p: "zi5" },
              { c: "不", p: "bu4" },
              { c: "知", p: "zhi1" }, { c: "道", p: "dao4" },
              { c: "该", p: "gai1" },
              { c: "怎", p: "zen3" }, { c: "么", p: "me5" },
              { c: "选", p: "xuan3" }, { c: "了", p: "le5" }
            ]
          }
        ],
        vocab: [
          { zh: '麻烦',   py: 'má fan',     en: 'Please / to trouble (someone)' },
          { zh: '几分甜', py: 'jǐ fēn tián', en: 'How much sweetness' },
          { zh: '复杂',   py: 'fù zá',      en: 'Complicated' },
          { zh: '着急',   py: 'zháo jí',    en: 'To hurry / to be anxious' }
        ],
        insiderTip: {
          textbook: { zh: '我要一杯拿铁。', en: 'I want a latte.' },
          street:   { zh: '麻烦给我一杯拿铁。', pinyin: 'Má fan gěi wǒ yì bēi ná tiě.' },
          langTip: {
            zh: '点单时，「<b class="tip-hl">麻烦给我…… (má fan gěi wǒ…)</b>」是最常用的礼貌句式——比干巴巴的「我要」听起来轻盈得多，也地道得多。同样，当对方语速太快没听清，「<b class="tip-hl">不好意思，你刚才说的XXX是什么意思？</b>」是最有效的求助方式：把没听懂的部分<b class="tip-hl">原样复述</b>给对方，比一句「我没听懂」精准百倍。',
            en: 'When ordering, "<b class="tip-hl">麻烦给我…… (má fan gěi wǒ…)</b>" — "could I please have…" — is the go-to polite phrasing, much softer and more natural than the blunt "我要 / I want". And when someone\'s talking too fast for you, "<b class="tip-hl">不好意思，你刚才说的XXX是什么意思？</b>" — "Sorry, what did you mean by XXX just now?" — is the most effective way to ask: <b class="tip-hl">quoting the exact phrase back</b> is far more precise than just "我没听懂 / I didn\'t catch it".'
          },
          cultureTip: {
            zh: '中国饮品店极其注重<b class="tip-hl">定制化</b>。选完主饮品后，店员往往会连珠炮般问你：「冰的还是热的？要几分甜？」——这里的「<b class="tip-hl">几分甜</b>」是每位顾客都会面临的问题。常见选项：<b class="tip-hl">全糖</b>（默认）、<b class="tip-hl">七分甜 / 少糖</b>、<b class="tip-hl">半糖</b>、<b class="tip-hl">无糖</b>。学会快速回答这些"定制问题"，是真正融入中国都市生活的一道小关卡。',
            en: 'Chinese beverage shops are obsessed with <b class="tip-hl">customization</b>. After you pick a drink, staff often fire off in rapid succession: "Iced or hot? How much sweetness?" — and "<b class="tip-hl">几分甜 / how much sweetness</b>" trips up every newcomer. Common options: <b class="tip-hl">全糖 / full sugar</b> (default), <b class="tip-hl">七分甜 / 少糖 / less sugar</b>, <b class="tip-hl">半糖 / half sugar</b>, <b class="tip-hl">无糖 / no sugar</b>. Learning to answer these "customization questions" fluidly is one of those small thresholds that marks real integration into urban Chinese life.'
          }
        }
      }
