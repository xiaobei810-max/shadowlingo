{
        id: "lesson-8",
        title: "大厅的初见",
        scene: "Nora 在休息室刷手机，大卫走过来向她询问网络密码。",
        correct: [
          {
            zh: "密码多少？",
            pinyin: "Mì mǎ duō shao?",
            en: "What's the password? (street)",
            note: "最地道的问法，直接简洁。中国人很少说「请问密码是什么」，那听起来太正式。"
          },
          {
            zh: "请问密码是什么？",
            pinyin: "Qǐng wèn mì mǎ shì shén me?",
            en: "May I ask what the password is? (textbook)",
            note: "教材标准写法，实际口语中几乎不用，显得过于书面。"
          },
          {
            type: "culture",
            zh: "八个八的秘密",
            desc: "Wi-Fi 密码「88888888」因为 8 的发音近似「发(fā)——发财」而大受欢迎，象征好运和财富。宿舍、小店、餐馆默认密码多半都是连排的 8，记住这个规律能省不少力气。"
          }
        ],
        titleZh: "第八课：大厅的初见", titleEn: "Lesson 8: Meeting in the Lobby",
        newChars: ['david'],
        cgImage:   '/assets/cg/lesson8_lobby.png?v=20260507',
        cardImage: '/assets/cg/lesson8_lobby_card.jpg?v=20260507',
        cgText:  '笨拙的语序，真诚的笑脸。原来在这场攻克中文的冒险里，没有人是一座孤岛。',
        cgTextEn: 'Clumsy grammar, a sincere smile. In this adventure of conquering Chinese, no one is an island.',
        coverScene: {
          zh: 'Nora 在休息室刷手机，<br>大卫走过来向她询问网络密码。',
          en: "Nora is on her phone in the lobby when David walks over to ask about the Wi-Fi password."
        },
        audio: "",
        sentences: [
          /* Page 1 — David 在 top，Nora 在 bottom */
          {
            zh: "你是想问「密码多少」，对吧？是八个八。",
            pinyin: "Nǐ shì xiǎng wèn 「mì mǎ duō shao」, duì ba? Shì bā ge bā.",
            en: "You mean to ask \"what's the password\", right? It's eight 8s.",
            contextAbove: { speaker: "大卫 · David", zh: "你好，打扰一下。我可以有 Wi-Fi 密码吗？", pinyin: "Nǐ hǎo, dǎ rǎo yí xià. Wǒ kě yǐ yǒu mì mǎ ma?", en: "Hello, excuse me. Can I have the Wi-Fi password?" },
            role: "learner",
            start: 0, end: 0,
            praise: "🔑 纠错超地道！Great correction!",
            hint: "【密码多少？】is how Chinese people ask for a password — no filler, straight to the point · 你是想问...对吧 is a friendly way to clarify a mistake · 八个八 = eight 8s: 8 (bā) sounds like 发 (fā — to prosper), so 88888888 is a classic lucky password",
            chars: [
              { c: "你", p: "ni3" }, { c: "是", p: "shi4" }, { c: "想", p: "xiang3" }, { c: "问", p: "wen4" },
              { c: "密", p: "mi4" }, { c: "码", p: "ma3" }, { c: "多", p: "duo1" }, { c: "少", p: "shao3" },
              { c: "对", p: "dui4" }, { c: "吧", p: "ba5" },
              { c: "是", p: "shi4" }, { c: "八", p: "ba1" }, { c: "个", p: "ge4" }, { c: "八", p: "ba1" }
            ]
          },
          /* Page 2 — David 在 top，Nora 在 bottom */
          {
            zh: "没关系，慢慢来。我是诺拉，昨天刚到。",
            pinyin: "Méi guān xi, màn man lái. Wǒ shì Nuò lā, zuó tiān gāng dào.",
            en: "It's okay, take your time. I'm Nora, I just arrived yesterday.",
            contextAbove: { speaker: "大卫 · David", zh: "对，「密码多少」！我的中文真是太糟糕了。", pinyin: "Duì, 「mì mǎ duō shao」! Wǒ de Zhōng wén zhēn shì tài zāo gāo le.", en: "Right, \"what's the password\"! My Chinese is really terrible." },
            role: "learner",
            start: 0, end: 0,
            praise: "😊 鼓励人心！Very encouraging!",
            hint: "【慢慢来】= 'take your time / no rush' — the most reassuring phrase you can offer a learner · 刚到 = 'just arrived' — super natural way to introduce yourself as a newcomer",
            chars: [
              { c: "没", p: "mei2" }, { c: "关", p: "guan1" }, { c: "系", p: "xi5" },
              { c: "慢", p: "man4" }, { c: "慢", p: "man4" }, { c: "来", p: "lai2" },
              { c: "我", p: "wo3" }, { c: "是", p: "shi4" },
              { c: "诺", p: "nuo4" }, { c: "拉", p: "la5" },
              { c: "昨", p: "zuo2" }, { c: "天", p: "tian1" }, { c: "刚", p: "gang1" }, { c: "到", p: "dao4" }
            ]
          },
          /* Page 3 — David 在 top，Nora 在 bottom */
          {
            zh: "谢谢。其实我的词汇量还不够。",
            pinyin: "Xiè xie. Qí shí wǒ de cí huì liàng hái bú gòu.",
            en: "Thank you. Actually, my vocabulary is still not enough.",
            contextAbove: { speaker: "大卫 · David", zh: "我是大卫。你的发音听起来很自然。", pinyin: "Wǒ shì Dà wèi. Nǐ de fā yīn tīng qǐ lái hěn zì rán.", en: "I'm David. Your pronunciation sounds very natural." },
            role: "learner",
            start: 0, end: 0,
            praise: "💬 谦虚得体！Humble and natural!",
            hint: "【其实】= 'actually / to be honest' — softens what follows · 词汇量 (vocabulary) 还不够 (still not enough) — a humble, genuine deflection of a compliment",
            chars: [
              { c: "谢", p: "xie4" }, { c: "谢", p: "xie5" },
              { c: "其", p: "qi2" }, { c: "实", p: "shi2" },
              { c: "我", p: "wo3" }, { c: "的", p: "de5" },
              { c: "词", p: "ci2" }, { c: "汇", p: "hui4" }, { c: "量", p: "liang4" },
              { c: "还", p: "hai2" }, { c: "不", p: "bu4" }, { c: "够", p: "gou4" }
            ]
          },
          /* Page 4 — David 在 top，Nora 在 bottom */
          {
            zh: "当然可以，随时欢迎。",
            pinyin: "Dāng rán kě yǐ, suí shí huān yíng.",
            en: "Of course, you're welcome anytime.",
            contextAbove: { speaker: "大卫 · David", zh: "太好了，以后我们可以在这里一起练习吗？", pinyin: "Tài hǎo le, yǐ hòu wǒ men kě yǐ zài zhè lǐ yì qǐ liàn xí ma?", en: "Great, can we practice here together in the future?" },
            role: "learner",
            start: 0, end: 0,
            praise: "🤝 邀约超爽快！Open-door energy!",
            hint: "【当然可以】= 'of course / absolutely' — the strongest yes · 随时欢迎 = 'welcome anytime' — a warm open invitation, great for extending friendships",
            chars: [
              { c: "当", p: "dang1" }, { c: "然", p: "ran2" },
              { c: "可", p: "ke3" }, { c: "以", p: "yi3" },
              { c: "随", p: "sui2" }, { c: "时", p: "shi2" },
              { c: "欢", p: "huan1" }, { c: "迎", p: "ying2" }
            ]
          }
        ],
        vocab: [
          { zh: '打扰', py: 'dǎ rǎo',  en: 'Excuse me / To disturb' },
          { zh: '密码', py: 'mì mǎ',   en: 'Password' },
          { zh: '糟糕', py: 'zāo gāo', en: 'Terrible / Oh no' },
          { zh: '练习', py: 'liàn xí', en: 'To practice' }
        ],
        insiderTip: {
          textbookLabel: '❌ 错句 · Wrong',
          streetLabel:   '✅ 正确 · Correct',
          textbook: { zh: '我可以有密码吗？', en: 'Can I have the password?' },
          street:   { zh: '密码是多少？', pinyin: 'Mì mǎ shì duō shao?' },
          langTip: {
            zh: '【经典错题】英语母语者特别喜欢把 "Can I have..." 直译成「<b class="tip-hl">我可以有…吗</b>」，但在中文里这个结构极其生硬。中国人要东西或问信息时，会直接问「<b class="tip-hl">XXX多少</b>」（密码多少？）或者说「<b class="tip-hl">请给我XXX</b>」。诺拉在这里的纠正非常地道。',
            en: '【Classic Mistake】English speakers love translating "Can I have..." directly as "<b class="tip-hl">我可以有…吗</b>" — but in Chinese this sounds extremely awkward. When asking for something or requesting info, Chinese people go straight to "<b class="tip-hl">XXX多少</b>" (what\'s the password?) or "<b class="tip-hl">请给我XXX</b>" (please give me XXX). Nora\'s correction here is perfectly natural.'
          },
          cultureTip: {
            zh: '为什么 Wi-Fi 密码是"八个八（88888888）"？数字"8"的发音和"<b class="tip-hl">发 (fā)</b>"相近，象征财运与好运。这是中国大大小小的宿舍、餐馆和小店最喜欢用的默认密码。数字吉利文化在中国无处不在——8 越多越好，而 4 因为和"死 (sǐ)"谐音，大家都尽量避开。',
            en: 'Why is the Wi-Fi password "eight 8s"? The number 8 sounds like "<b class="tip-hl">发 (fā)</b>" — to make a fortune — so it symbolises luck and wealth. It\'s the go-to default password in dorms, restaurants and small shops across China. Number luck culture is everywhere: more 8s = better, while 4 is avoided because it sounds like "死 (sǐ)" — to die.'
          }
        }
      }
