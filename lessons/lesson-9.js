{
        id: "lesson-9",
        title: "摄影社的传闻",
        scene: "大卫拿着一张报名表，来找诺拉和七七帮忙。",
        correct: [
          {
            zh: "我周日去报名。",
            pinyin: "Wǒ zhōu rì qù bào míng.",
            en: "I'll go sign up on Sunday. ✅ correct word order",
            note: "时间词在动词前：主语 + 时间 + 动词。大卫的错误是把「去」放在了「周日」前面。"
          },
          {
            zh: "我去周日报名。❌",
            pinyin: "",
            en: "Wrong — 去 cannot come before 周日 in Chinese.",
            note: "英语语序陷阱：英语可以说 'I go sign up on Sunday'，但中文时间词必须在动词前。"
          },
          {
            type: "culture",
            zh: "社团招新季",
            desc: "大学开学第一个月是社团招新季，越热门的社团（摄影社、街舞社）面试越严格。学长们会根据实力决定录取，是体验真实校园文化的绝佳机会。"
          }
        ],
        titleZh: "第九课：摄影社的传闻", titleEn: "Lesson 9: Rumors of the Photography Club",
        newChars: [],
        cgImage:   '/assets/cg/lesson9_lobby.png',
        cardImage: '/assets/cg/lesson9_lobby_card.jpg',
        cgText:  '既然来到了这里，不如就从摄影社开始，记录新的大学生活吧？',
        cgTextEn: "Since you're already here, why not start with the photography club and document your new university life?",
        coverScene: {
          zh: '大卫拿着一张报名表，<br>来找诺拉和七七帮忙。',
          en: "A few days later, David brings a sign-up form to Nora and Qiqi for help."
        },
        audio: "",
        sentences: [
          /* Page 1 — David 在上，Nora 在下 */
          {
            zh: "你是想说，「我周日去报名」？",
            pinyin: "Nǐ shì xiǎng shuō, 「wǒ zhōu rì qù bào míng」?",
            en: "You mean to say, \"I'll sign up on Sunday\"?",
            contextAbove: { speaker: "大卫 · David", zh: "诺拉，我去周日报名摄影社，你去吗？", pinyin: "Nuò lā, wǒ qù zhōu rì bào míng shè yǐng shè, nǐ qù ma?", en: "Nora, I go Sunday sign up for photography club, are you going?" },
            role: "learner",
            start: 0, end: 0,
            praise: "✏️ 纠错超专业！Great grammar fix!",
            hint: "【时间词前置】Chinese time words MUST go before the verb — formula: Subject + Time + Verb (我 + 周日 + 去). David put 去 before 周日 — classic English word-order mistake!",
            chars: [
              { c: "你", p: "ni3" }, { c: "是", p: "shi4" }, { c: "想", p: "xiang3" }, { c: "说", p: "shuo1" },
              { c: "我", p: "wo3" }, { c: "周", p: "zhou1" }, { c: "日", p: "ri4" },
              { c: "去", p: "qu4" }, { c: "报", p: "bao4" }, { c: "名", p: "ming2" }
            ]
          },
          /* Page 2 — David 在上，Nora 在下 */
          {
            zh: "我也想参加。摄影社很难进吗？",
            pinyin: "Wǒ yě xiǎng cān jiā. Shè yǐng shè hěn nán jìn ma?",
            en: "I want to join too. Is the photography club hard to get into?",
            contextAbove: { speaker: "大卫 · David", zh: "对！中文的时间词太难记了。", pinyin: "Duì! Zhōng wén de shí jiān cí tài nán jì le.", en: "Yes! Chinese time words are too hard to remember." },
            role: "learner",
            start: 0, end: 0,
            praise: "🎯 追问得妙！Smart follow-up!",
            hint: "【也想参加】= 'also want to join' — 也 (yě) always comes before the verb · 很难进 = 'hard to get into' — a concise, natural question for anything competitive",
            chars: [
              { c: "我", p: "wo3" }, { c: "也", p: "ye3" }, { c: "想", p: "xiang3" },
              { c: "参", p: "can1" }, { c: "加", p: "jia1" },
              { c: "摄", p: "she4" }, { c: "影", p: "ying3" }, { c: "社", p: "she4" },
              { c: "很", p: "hen3" }, { c: "难", p: "nan2" }, { c: "进", p: "jin4" }, { c: "吗", p: "ma5" }
            ]
          },
          /* Page 3 — 七七 在上，Nora 在下 */
          {
            zh: "真的吗？他叫什么名字？",
            pinyin: "Zhēn de ma? Tā jiào shén me míng zi?",
            en: "Really? What is his name?",
            contextAbove: { speaker: "夏七七 · Xia Qiqi", zh: "很难进。他们的副社长特别严格。", pinyin: "Hěn nán jìn. Tā men de fù shè zhǎng tè bié yán gé.", en: "Very hard to get into. Their vice president is extremely strict." },
            role: "learner",
            start: 0, end: 0,
            praise: "🔍 好奇心旺盛！Great curiosity!",
            hint: "【真的吗？】= 'Really?' — the universal conversation extender · 叫什么名字 = key question pattern: Subject + 叫 + 什么名字",
            chars: [
              { c: "真", p: "zhen1" }, { c: "的", p: "de5" }, { c: "吗", p: "ma5" },
              { c: "他", p: "ta1" }, { c: "叫", p: "jiao4" },
              { c: "什", p: "shen2" }, { c: "么", p: "me5" },
              { c: "名", p: "ming2" }, { c: "字", p: "zi5" }
            ]
          },
          /* Page 4 — 七七 在上，Nora 在下 */
          {
            zh: "听起来很有意思，我们试试吧。",
            pinyin: "Tīng qǐ lái hěn yǒu yì si, wǒ men shì shì ba.",
            en: "Sounds interesting, let's give it a try.",
            contextAbove: { speaker: "夏七七 · Xia Qiqi", zh: "他叫林晚，是我们学校的计算机学神。", pinyin: "Tā jiào Lín Wǎn, shì wǒ men xué xiào de jì suàn jī xué shén.", en: "His name is Lin Wan, he's our school's computer science study god." },
            role: "learner",
            start: 0, end: 0,
            praise: "💪 勇气可嘉！Love the spirit!",
            hint: "【听起来】= 'it sounds like' — great filler to react to new info · 试试 = 'give it a try' — verb reduplication makes the suggestion sound casual and friendly",
            chars: [
              { c: "听", p: "ting1" }, { c: "起", p: "qi3" }, { c: "来", p: "lai2" },
              { c: "很", p: "hen3" }, { c: "有", p: "you3" }, { c: "意", p: "yi4" }, { c: "思", p: "si5" },
              { c: "我", p: "wo3" }, { c: "们", p: "men5" },
              { c: "试", p: "shi4" }, { c: "试", p: "shi4" }, { c: "吧", p: "ba5" }
            ]
          }
        ],
        vocab: [
          { zh: '报名', py: 'bào míng',  en: 'To sign up' },
          { zh: '参加', py: 'cān jiā',   en: 'To join / participate' },
          { zh: '严格', py: 'yán gé',    en: 'Strict' },
          { zh: '社团', py: 'shè tuán',  en: 'Student club / society' }
        ],
        insiderTip: {
          textbookLabel: '❌ 错句 · Wrong',
          streetLabel:   '✅ 正确 · Correct',
          textbook: { zh: '我去周日报名。', en: '' },
          street:   { zh: '我周日去报名。', pinyin: 'Wǒ zhōu rì qù bào míng.' },
          langTip: {
            zh: '英文习惯把时间放在句子最后，但中文的"时间词"必须放在动词前面！记住公式：<b class="tip-hl">主语 + 时间 + 动词</b>（我 + 周日 + 去）。千万别像大卫一样说反了。',
            en: 'English puts time at the end of a sentence, but Chinese time words must go before the verb! Remember the formula: <b class="tip-hl">Subject + Time + Verb</b>. Don\'t make David\'s mistake!'
          },
          cultureTip: {
            zh: '大学开学的第一个月是"<b class="tip-hl">社团 (shè tuán)</b>"的招新季。越是热门的社团（如摄影社、街舞社），面试标准就越"<b class="tip-hl">严格 (yán gé)</b>"。学长们会根据你的实力来决定是否录取。<br><br>"<b class="tip-hl">学神 (xué shén)</b>"字面意思是"学习之神"，泛指那些学习能力极强、成绩顶尖的同学。他们往往被普通同学神话化，既崇拜又敬畏。与之相对的还有"<b class="tip-hl">学霸 (xué bà)</b>"（学习霸主，努力型尖子生）和"<b class="tip-hl">学渣 (xué zhā)</b>"（成绩很差的同学）。',
            en: 'The first month of university is recruitment season for student clubs (<b class="tip-hl">社团</b>). The more popular the club (like photography or street dance), the more strict the interview standards.<br><br>"<b class="tip-hl">学神 (xué shén)</b>" literally means "study god" — it refers to students with extraordinary academic ability who seem to ace everything effortlessly. They\'re both idolised and feared. Related terms: "<b class="tip-hl">学霸 (xué bà)</b>" (study overlord — the hard-working top student) and "<b class="tip-hl">学渣 (xué zhā)</b>" (the student who struggles academically).'
          }
        }
      }
