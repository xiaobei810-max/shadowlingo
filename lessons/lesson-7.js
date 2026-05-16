{
        id: "lesson-7",
        title: "逛校园超市",
        scene: "七七带 Nora 去校园超市购置生活用品。",
        correct: [
          {
            zh: "我要结账",
            pinyin: "Wǒ yào jié zhàng",
            en: "I'd like to check out (street)",
            note: "超市最自然的结账用语。餐厅里改喊「买单！」，两种场合都不说「付款」——那是书面语。"
          },
          {
            zh: "我想付款",
            pinyin: "Wǒ xiǎng fù kuǎn",
            en: "I'd like to make a payment (textbook)",
            note: "教材常见写法，但日常口语几乎不用，显得书面且生硬。"
          },
          {
            type: "culture",
            zh: "找零与无现金社会",
            desc: "收银员说「找您 X 块」，这里「找」是找零的意思，不是「寻找」。中国已近乎无现金：微信支付、支付宝遍布街边小摊和校园超市，建议尽早绑定银行卡开通移动支付。"
          }
        ],
        titleZh: "第七课：逛校园超市", titleEn: "Lesson 7: Campus Supermarket Run",
        newChars: [],
        cgImage:   '/assets/cg/lesson7_supermarket.png?v=20260507',
        cardImage: '/assets/cg/lesson7_supermarket_card.jpg?v=20260507',
        cgText:  '真正的异国生活，往往是从买齐第一套洗漱用品开始的。',
        cgTextEn: 'True life in a foreign country often begins with buying your very first set of toiletries.',
        coverScene: {
          zh: '七七带 Nora<br>去校园超市购置生活用品。',
          en: "Qiqi takes Nora to the campus supermarket for daily essentials."
        },
        audio: "",
        sentences: [
          /* Page 1 — Qiqi 在 top，Nora 在 bottom */
          {
            zh: "七七，我想买一些生活用品。",
            pinyin: "Qī qi, wǒ xiǎng mǎi yì xiē shēng huó yòng pǐn.",
            en: "Qiqi, I'd like to buy some daily necessities.",
            contextBelow: { speaker: "夏七七 · Xia Qiqi", zh: "超市里都有，你需要什么？", pinyin: "Chāo shì lǐ dōu yǒu, nǐ xū yào shén me?", en: "The supermarket has everything. What do you need?" },
            role: "learner",
            start: 0, end: 0,
            praise: "🛒 开口很自然！Great start!",
            hint: "【我想买一些…】= 'I'd like to buy some...' · 生活用品 (daily necessities) is a super useful noun — covers toiletries, household items, stationery and more",
            chars: [
              { c: "七", p: "qi1" }, { c: "七", p: "qi5" },
              { c: "我", p: "wo3" }, { c: "想", p: "xiang3" }, { c: "买", p: "mai3" },
              { c: "一", p: "yi4" }, { c: "些", p: "xie1" },
              { c: "生", p: "sheng1" }, { c: "活", p: "huo2" }, { c: "用", p: "yong4" }, { c: "品", p: "pin3" }
            ]
          },
          /* Page 2 — Qiqi 在 top，Nora 在 bottom */
          {
            zh: "我需要买毛巾和牙膏。",
            pinyin: "Wǒ xū yào mǎi máo jīn hé yá gāo.",
            en: "I need to buy a towel and toothpaste.",
            contextBelow: { speaker: "夏七七 · Xia Qiqi", zh: "在那边，我帮你找。", pinyin: "Zài nà biān, wǒ bāng nǐ zhǎo.", en: "Over there — let me help you find them." },
            role: "learner",
            start: 0, end: 0,
            praise: "📝 说得很清楚！Clear and specific!",
            hint: "【我需要买…】= 'I need to buy...' — slightly stronger than 想买 · 和 (hé) links nouns in a list, just like 'and' in English",
            chars: [
              { c: "我", p: "wo3" }, { c: "需", p: "xu1" }, { c: "要", p: "yao4" }, { c: "买", p: "mai3" },
              { c: "毛", p: "mao2" }, { c: "巾", p: "jin1" },
              { c: "和", p: "he2" },
              { c: "牙", p: "ya2" }, { c: "膏", p: "gao1" }
            ]
          },
          /* Page 3 — 收银员 在 top，Nora 在 bottom */
          {
            zh: "你好，我要结账。",
            pinyin: "Nǐ hǎo, wǒ yào jié zhàng.",
            en: "Hi, I'd like to check out.",
            contextBelow: { speaker: "收银员 · Cashier", zh: "一共三十块。", pinyin: "Yī gòng sān shí kuài.", en: "That's 30 yuan in total." },
            role: "learner",
            start: 0, end: 0,
            praise: "💰 结账超顺！Smooth checkout!",
            hint: "【我要结账】= 'I'd like to check out' · Far more natural at a shop register than the textbook 付款 · Works in any store — just walk up and say it",
            chars: [
              { c: "你", p: "ni3" }, { c: "好", p: "hao3" },
              { c: "我", p: "wo3" }, { c: "要", p: "yao4" },
              { c: "结", p: "jie2" }, { c: "账", p: "zhang4" }
            ]
          },
          /* Page 4 — 收银员 在 top，Nora 在 bottom */
          {
            zh: "我只有现金，给您五十。",
            pinyin: "Wǒ zhǐ yǒu xiàn jīn, gěi nín wǔ shí.",
            en: "I only have cash — here's fifty yuan.",
            contextBelow: { speaker: "收银员 · Cashier", zh: "好的，找您二十块。", pinyin: "Hǎo de, zhǎo nín èr shí kuài.", en: "Sure, here's 20 yuan in change." },
            role: "learner",
            start: 0, end: 0,
            praise: "💵 支付很标准！Textbook payment!",
            hint: "【我只有现金】= 'I only have cash' · 给您 is polite (您 = respectful 'you') · Cashiers say 找您…块 (zhǎo = 'give change') — 找 here ≠ 'look for'!",
            chars: [
              { c: "我", p: "wo3" }, { c: "只", p: "zhi3" }, { c: "有", p: "you3" },
              { c: "现", p: "xian4" }, { c: "金", p: "jin1" },
              { c: "给", p: "gei3" }, { c: "您", p: "nin2" },
              { c: "五", p: "wu3" }, { c: "十", p: "shi2" }
            ]
          }
        ],
        vocab: [
          { zh: '生活用品', py: 'shēng huó yòng pǐn', en: 'Daily necessities' },
          { zh: '超市',    py: 'chāo shì',  en: 'Supermarket' },
          { zh: '牙膏',    py: 'yá gāo',    en: 'Toothpaste' },
          { zh: '结账',    py: 'jié zhàng', en: 'Check out / Pay' }
        ],
        insiderTip: {
          textbook: { zh: '我想付款。', en: 'I would like to make a payment.' },
          street:   { zh: '我要结账。/ 买单！', pinyin: 'Wǒ yào jié zhàng. / Mǎi dān!' },
          langTip: {
            zh: '教材里结账用「<b class="tip-hl">付款 (fù kuǎn)</b>」，但在超市你只需要说「<b class="tip-hl">我要结账</b>」；在餐厅则喊「<b class="tip-hl">买单！(mǎi dān)</b>」。另外，收银员找零时会说「<b class="tip-hl">找您…块</b>」，这里的「<b class="tip-hl">找 (zhǎo)</b>」是"找零钱"的意思，跟"寻找"的 zhǎo 同字同音，靠语境区分。',
            en: 'Textbooks use "<b class="tip-hl">付款 (fù kuǎn)</b>" for paying, but at a register just say "<b class="tip-hl">我要结账</b>"; at a restaurant, call out "<b class="tip-hl">买单！(mǎi dān)</b>". Also: cashiers say "<b class="tip-hl">找您…块</b>" for giving change — "<b class="tip-hl">找 (zhǎo)</b>" here means "give change," not "look for." Same character, same sound — context tells them apart.'
          },
          cultureTip: {
            zh: '中国已经进入几乎无现金的社会——街边小摊、校园超市、甚至菜市场都支持微信支付或支付宝。如果你用现金，收银员通常不会拒绝，但可能需要稍等找零。建议尽早开通<b class="tip-hl">移动支付 (yí dòng zhī fù)</b>，只需绑定银行卡，扫码结账比现金方便太多了。',
            en: 'China is nearly cashless — street stalls, campus shops, and even wet markets accept WeChat Pay or Alipay. Cash is still accepted, but you may wait for change. Set up <b class="tip-hl">移动支付 (yí dòng zhī fù)</b> — mobile payment — as soon as you can. Just link a bank card and scan any QR code to pay. Far more convenient than fumbling for coins.'
          }
        }
      }
