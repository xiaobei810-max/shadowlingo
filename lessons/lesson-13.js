{
        id: "lesson-13",
        title: "林晚解围",
        scene: "就在诺拉感到窘迫时，排在她身后的男生突然开口，给了诺拉一个建议。",
        correct: [
          {
            zh: "你是谁？我们认识吗？",
            pinyin: "Nǐ shì shéi? Wǒ men rèn shi ma?",
            en: "Who are you? Do we know each other? (textbook)",
            note: "教材式问句，过于直接、略显冒犯。"
          },
          {
            zh: "你看起来很面熟，我们是不是在哪里见过？",
            pinyin: "Nǐ kàn qǐ lái hěn miàn shú, wǒ men shì bu shì zài nǎ lǐ jiàn guò?",
            en: "You look familiar, have we met before? (natural). ✅",
            note: "口语首选：「面熟」+ 「是不是在哪见过」是经典破冰句，委婉自然且自带一点悬念。"
          },
          {
            type: "culture",
            zh: "万能救场词「正常」+ 扫码支付",
            desc: "不知道甜度/冰量时，「正常」一句话跳过所有定制选项；扫码支付几乎渗透中国生活每个角落，出门可以不带现金。"
          }
        ],
        titleZh: "第十三课：林晚解围", titleEn: "Lesson 13: Lin Wan Steps In",
        newChars: ['linwan'],
        cgImage:   '/assets/cg/lesson13_coffee-shop.png',
        cardImage: '/assets/cg/lesson13_coffee-shop_card.jpg',
        cgText:  '当我快要被「几分甜」打败的时候，一个低沉的声音从身后递来了答案。',
        cgTextEn: 'Just as I was about to be defeated by "how much sweetness", a low, calm voice from behind handed me the answer.',
        coverScene: {
          zh: '就在诺拉感到窘迫时，<br>排在她身后的男生突然开口，<br>给了诺拉一个建议。',
          en: "Just as Nora was feeling stuck, the guy standing behind her in line suddenly spoke up — and offered her a suggestion."
        },
        audio: "",
        sentences: [
          /* Page 1 — 林晚先开口，Nora 回应 */
          {
            zh: "太好了！那我就要正常冰、正常糖，谢谢你。",
            pinyin: "Tài hǎo le! Nà wǒ jiù yào zhèng cháng bīng, zhèng cháng táng, xiè xie nǐ.",
            en: "That's great! Then I'll have regular ice and regular sugar, thank you.",
            contextAbove: { speaker: "林晚 · Lin Wan", zh: "如果不知道怎么选，一般可以点「正常冰、正常糖」。", pinyin: "Rú guǒ bù zhī dào zěn me xuǎn, yì bān kě yǐ diǎn \"zhèng cháng bīng, zhèng cháng táng\".", en: "If you don't know how to choose, you can generally order \"regular ice, regular sugar\"." },
            role: "learner",
            start: 0, end: 0,
            praise: "🙏 谢得很自然！Smooth thanks!",
            hint: "【那我就要……】= 'Then I'll just take...' — 「就」表示「干脆决定」的语气 · 【正常冰、正常糖】是饮品店的万能救场词，一句搞定所有定制选项",
            chars: [
              { c: "太", p: "tai4" }, { c: "好", p: "hao3" }, { c: "了", p: "le5" },
              { c: "那", p: "na4" }, { c: "我", p: "wo3" },
              { c: "就", p: "jiu4" }, { c: "要", p: "yao4" },
              { c: "正", p: "zheng4" }, { c: "常", p: "chang2" },
              { c: "冰", p: "bing1" },
              { c: "正", p: "zheng4" }, { c: "常", p: "chang2" },
              { c: "糖", p: "tang2" },
              { c: "谢", p: "xie4" }, { c: "谢", p: "xie5" },
              { c: "你", p: "ni3" }
            ]
          },
          /* Page 2 — 询问微信支付 */
          {
            zh: "我没有现金，可以用微信支付吗？",
            pinyin: "Wǒ méi yǒu xiàn jīn, kě yǐ yòng Wēi xìn zhī fù ma?",
            en: "I don't have cash, can I pay with WeChat?",
            contextAbove: { speaker: "店员 · Cafe Staff", zh: "好的，一共十五块。", pinyin: "Hǎo de, yí gòng shí wǔ kuài.", en: "Okay, fifteen yuan in total." },
            role: "learner",
            start: 0, end: 0,
            praise: "💳 主动提扫码很地道！Smart pay!",
            hint: "【可以用…支付吗？】= 'Can I pay with …?' — 不确定支付方式时的标准反问 · 微信支付 (Wēixìn zhīfù) = WeChat Pay",
            chars: [
              { c: "我", p: "wo3" },
              { c: "没", p: "mei2" }, { c: "有", p: "you3" },
              { c: "现", p: "xian4" }, { c: "金", p: "jin1" },
              { c: "可", p: "ke3" }, { c: "以", p: "yi3" },
              { c: "用", p: "yong4" },
              { c: "微", p: "wei1" }, { c: "信", p: "xin4" },
              { c: "支", p: "zhi1" }, { c: "付", p: "fu4" },
              { c: "吗", p: "ma5" }
            ]
          },
          /* Page 3 — 致谢 + 自报家门 */
          {
            zh: "刚才真的谢谢你帮我解围。不然我都不知道该怎么办。",
            pinyin: "Gāng cái zhēn de xiè xie nǐ bāng wǒ jiě wéi. Bù rán wǒ dōu bù zhī dào gāi zěn me bàn.",
            en: "Thank you so much for helping me out just now. I wouldn't have known what to do.",
            contextAbove: { speaker: "店员 · Cafe Staff", zh: "可以的，您直接在这儿扫码就行。", pinyin: "Kě yǐ de, nín zhí jiē zài zhèr sǎo mǎ jiù xíng.", en: "Yes you can, just scan the code right here." },
            role: "learner",
            start: 0, end: 0,
            praise: "🤝 表达感激很自然！Great expression!",
            hint: "【帮我解围】= 'bail me out / save me' — 比一句「谢谢」更具体、更走心 · 【不然我都不知道该怎么办】= 'I wouldn't have known what to do' — 强调对方帮助的关键性",
            chars: [
              { c: "刚", p: "gang1" }, { c: "才", p: "cai2" },
              { c: "真", p: "zhen1" }, { c: "的", p: "de5" },
              { c: "谢", p: "xie4" }, { c: "谢", p: "xie5" },
              { c: "你", p: "ni3" },
              { c: "帮", p: "bang1" }, { c: "我", p: "wo3" },
              { c: "解", p: "jie3" }, { c: "围", p: "wei2" },
              { c: "不", p: "bu4" }, { c: "然", p: "ran2" },
              { c: "我", p: "wo3" }, { c: "都", p: "dou1" },
              { c: "不", p: "bu4" },
              { c: "知", p: "zhi1" }, { c: "道", p: "dao4" },
              { c: "该", p: "gai1" },
              { c: "怎", p: "zen3" }, { c: "么", p: "me5" },
              { c: "办", p: "ban4" }
            ]
          },
          /* Page 4 — 破冰：你看起来很面熟 */
          {
            zh: "对了，我觉得你看起来很面熟。我们是不是在哪里见过？",
            pinyin: "Duì le, wǒ jué de nǐ kàn qǐ lái hěn miàn shú. Wǒ men shì bu shì zài nǎ lǐ jiàn guò?",
            en: "By the way, I think you look very familiar. Have we met somewhere before?",
            contextAbove: { speaker: "林晚 · Lin Wan", zh: "没关系。对刚来的留学生来说，中文菜单确实有点难。", pinyin: "Méi guān xi. Duì gāng lái de liú xué shēng lái shuō, Zhōng wén cài dān què shí yǒu diǎn nán.", en: "It's nothing. For newly arrived international students, Chinese menus are indeed a bit difficult." },
            role: "learner",
            start: 0, end: 0,
            praise: "👀 破冰开场漂亮！Great icebreaker!",
            hint: "【你看起来很面熟】= 'You look very familiar' — 比直接问「你是谁」更委婉 · 【我们是不是在哪里见过？】是搭讪/破冰的经典开场白，自带一丝悬念",
            chars: [
              { c: "对", p: "dui4" }, { c: "了", p: "le5" },
              { c: "我", p: "wo3" },
              { c: "觉", p: "jue2" }, { c: "得", p: "de5" },
              { c: "你", p: "ni3" },
              { c: "看", p: "kan4" }, { c: "起", p: "qi3" }, { c: "来", p: "lai2" },
              { c: "很", p: "hen3" },
              { c: "面", p: "mian4" }, { c: "熟", p: "shu2" },
              { c: "我", p: "wo3" }, { c: "们", p: "men5" },
              { c: "是", p: "shi4" }, { c: "不", p: "bu4" }, { c: "是", p: "shi4" },
              { c: "在", p: "zai4" },
              { c: "哪", p: "na3" }, { c: "里", p: "li3" },
              { c: "见", p: "jian4" }, { c: "过", p: "guo4" }
            ]
          }
        ],
        vocab: [
          { zh: '正常', py: 'zhèng cháng', en: 'Normal / regular' },
          { zh: '扫码', py: 'sǎo mǎ',      en: 'Scan QR code' },
          { zh: '解围', py: 'jiě wéi',     en: 'To help out of a predicament' },
          { zh: '面熟', py: 'miàn shú',    en: 'Looks familiar' }
        ],
        insiderTip: {
          textbook: { zh: '你是谁？我们认识吗？', en: 'Who are you? Do we know each other?' },
          street:   { zh: '你看起来很面熟，我们是不是在哪里见过？', pinyin: 'Nǐ kàn qǐ lái hěn miàn shú, wǒ men shì bu shì zài nǎ lǐ jiàn guò?' },
          langTip: {
            zh: '想要委婉地打开话题、确认是否认识对方时，「<b class="tip-hl">你看起来很面熟 (nǐ kàn qǐ lái hěn miàn shú)</b>」是「You look familiar」最自然的中文表达。配合「<b class="tip-hl">我们是不是在哪里见过？</b>」这个搭讪式问句，比硬邦邦地问「你是谁」更轻盈、更耐人寻味。',
            en: 'When you want to break the ice and gently check whether you\'ve met someone before, "<b class="tip-hl">你看起来很面熟 (nǐ kàn qǐ lái hěn miàn shú)</b>" — "you look familiar" — is the most natural Chinese way to say it. Pair it with the classic icebreaker "<b class="tip-hl">我们是不是在哪里见过？</b>" — "Have we met somewhere before?" — and you sound far more elegant than the blunt "你是谁 / who are you".'
          },
          cultureTip: {
            zh: '在中国饮品店点单时，如果你被「冰/热」「几分甜」轰炸得不知所措，最万能的救场词就是「<b class="tip-hl">正常 (zhèng cháng)</b>」——它一句话跳过所有定制选项，简洁又安全。另外，<b class="tip-hl">扫码支付</b>已经渗透到中国生活的每个角落：从大商场到街边小吃摊、自动售货机，甚至寺庙的功德箱，几乎都能用微信/支付宝扫码完成，<b class="tip-hl">出门可以不带现金</b>。',
            en: 'When ordering drinks in China, if you get bombarded by "Iced or hot? How much sweetness?" and your brain freezes, the universal lifesaver is "<b class="tip-hl">正常 (zhèng cháng)</b>" — "regular" — one word that skips every customization choice safely. Also, <b class="tip-hl">scan-to-pay</b> has spread to every corner of Chinese life: from big malls to street snack stalls, vending machines, even temple donation boxes — almost everywhere accepts WeChat / Alipay QR codes, so <b class="tip-hl">you can leave home without cash</b>.'
          }
        }
      }
