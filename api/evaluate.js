const https = require('https');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

// ── PCM → WAV（44 字节 RIFF 头）────────────────────────────────
function pcmToWav(pcmBuf) {
  const wav = Buffer.alloc(44 + pcmBuf.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcmBuf.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcmBuf.length, 40);
  pcmBuf.copy(wav, 44);
  return wav;
}

// ── Azure 发音评测 REST API ──────────────────────────────────────
function azureAssess(pcmBase64, refText) {
  return new Promise((resolve, reject) => {
    const wavBuf   = pcmToWav(Buffer.from(pcmBase64, 'base64'));
    const cleanRef = refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, '');
    console.log('[Azure] WAV大小:', wavBuf.length, '字节，refText:', cleanRef);

    const cfg = Buffer.from(JSON.stringify({
      ReferenceText:     cleanRef,
      GradingSystem:     'HundredMark',
      Granularity:       'Phoneme',
      Dimension:         'Comprehensive',
      EnableMiscue:      true,
      NBestPhonemeCount: 5          // ← 关键：返回用户最可能读的5个音素候选
    })).toString('base64');

    const options = {
      hostname: `${AZURE_REGION}.stt.speech.microsoft.com`,
      path:     '/speech/recognition/conversation/cognitiveservices/v1' +
                '?language=zh-CN&format=detailed',
      method:   'POST',
      headers:  {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type':             'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment': cfg,
        'Content-Length':           wavBuf.length
      }
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        console.log('[Azure] HTTP状态:', res.statusCode);
        console.log('[Azure] 原始响应(前1200):', raw.slice(0, 1200));
        if (res.statusCode !== 200)
          return reject(new Error(`Azure HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('JSON解析失败: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(wavBuf);
    req.end();
  });
}

// ── Gemini 生成期望拼音（内存缓存，同句不重复调用）─────────────
const pinyinCache = new Map();

const GEMINI_SYSTEM =
`你是中文语音学专家。给定一个中文句子，按实际朗读发音（而非字典本调）标注每个汉字的拼音和声调数字（1-4，轻声用0）。

【多音字规则（严格按语境判断）】
教：jiao1（来教你/教书）/ jiao4（教室/教育/教练）
长：zhang3（成长/长大/长辈）/ chang2（长城/很长/长度）
好：hao3（你好/好的/好吃）/ hao4（好学/嗜好/好奇）
行：xing2（行走/银行/旅行）/ hang2（行业/行列/内行）
觉：jiao4（睡觉/午觉）/ jue2（感觉/发觉/知觉）
乐：le4（快乐/欢乐）/ yue4（音乐/乐队/乐器）
着：zhe0（看着/走着/等着）/ zhao2（着急/着凉）/ zhuo2（着装）
了：le0（好了/走了/来了）/ liao3（了解/受不了/了不起）
的：de0（语气助词：我的/好的）/ di4（目的地/目的）
地：de0（慢慢地/认真地）/ di4（地方/土地/大地）
得：de0（走得快/做得好）/ de2（获得/得到/取得）/ dei3（得去/得行）
还：hai2（还是/还有/还好）/ huan2（归还/还钱/偿还）
看：kan4（看书/看见/看病）/ kan1（看守/看护）
数：shu3（数学/数量/数字）/ shuo4（数落/频数）
和：he2（和平/和谐/和好）/ he4（唱和/附和）/ huo4（掺和/搀和）
空：kong1（空气/天空/空中）/ kong4（空余/有空/抽空）
重：zhong4（重要/体重/重量）/ chong2（重复/重来/重新）
中：zhong1（中文/其中/中间）/ zhong4（中毒/中奖/中计）
间：jian1（空间/时间/房间）/ jian4（间隔/间接/间谍）
假：jia3（假如/假装/真假）/ jia4（假期/放假/暑假）
说：shuo1（说话/说明/听说）/ shui4（游说）
没：mei2（没有/没关系）/ mo4（淹没/沉没）
参：can1（参加/参观）/ shen1（人参/参差）
差：cha1（差别/差距）/ chai1（出差/差使）/ cha4（差不多/差劲）
转：zhuan3（转身/转变）/ zhuan4（转圈/转动）
当：dang1（当然/当时）/ dang4（上当/当铺）
便：bian4（方便/便宜0）/ pian2（便宜/便利）

【三声变调（两个三声相邻，前一变二声）】
你好→ni2 hao3；可以→ke2 yi3；所以→suo2 yi3；也许→ye2 xu3
了解→liao2 jie3；请问→qing2 wen3；展览→zhan2 lan3；购买→gou2 mai3
旅游→lv2 you2；水果→shui2 guo3；理解→li2 jie3；演讲→yan2 jiang3
允许→yun2 xu3；语法→yu2 fa3；导览→dao2 lan3；每种→mei2 zhong3

【"一"的变调】
四声前读二声：一个yi2ge4, 一样yi2yang4, 一起yi2qi3, 一次yi2ci4, 一定yi2ding4
一/二/三声前读四声：一天yi4tian1, 一年yi4nian2, 一般yi4ban1, 一些yi4xie1
单独/序数/末尾读一声：第一di4yi1, 第一次di4yi1ci4, 统一tong3yi1

【"不"的变调】
四声前读二声：不是bu2shi4, 不对bu2dui4, 不要bu2yao4, 不去bu2qu4, 不会bu2hui4
其他声前读四声：不来bu4lai2, 不能bu4neng2, 不好bu4hao3, 不知bu4zhi1

【轻声（标0）】
语气词：的0 地0 得0 了0 吗0 呢0 吧0 啊0 嘛0 呀0 着0 过0 么0 哦0 嗯0
常见轻声词（第二字标0）：
东西 意思 事情 朋友 知道 认识 明白 告诉 先生 学生 名字 眼睛 耳朵
鼻子 嘴巴 头发 衣服 地方 时候 日子 孩子 儿子 女儿 丈夫 妻子 奶奶
爸爸 妈妈 哥哥 弟弟 姐姐 妹妹 爷爷 奶奶 外公 外婆
上面 下面 里面 外面 前面 后面 里头 上头 外头 前头 后头
东边 西边 南边 北边 左边 右边 旁边 这里 那里 哪里
便宜（pian2 yi0）习惯 告诉 解释 休息 舒服 痛快

【儿化音】
哪儿na3r/这儿zhe4r/那儿na4r作独立词时，"儿"标er0
词尾儿化：一点儿/玩儿/事儿/小孩儿/门口儿/心眼儿 → 儿标er0
注意："儿子er2 zi0"中的儿er2不是儿化，是独立字

只返回纯JSON对象，格式：{"字":"pinyin+声调数字"}，不要任何其他文字、注释或markdown。
示例：{"你":"ni3","好":"hao3","吗":"ma0","知":"zhi1","道":"dao0"}`;

async function getPinyinMap(refText) {
  if (pinyinCache.has(refText)) {
    console.log('[Gemini] 缓存命中:', refText);
    return pinyinCache.get(refText);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  console.log('[Gemini] 请求拼音 for:', refText);

  const body = {
    contents: [{ parts: [{ text: `${GEMINI_SYSTEM}\n\n句子：${refText}\n请返回每个汉字的拼音JSON：` }] }]
  };

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  const data = await resp.json();
  console.log('[Gemini] HTTP状态:', resp.status, '原始返回:', JSON.stringify(data).slice(0, 400));

  if (!resp.ok) throw Object.assign(new Error(data?.error?.message || 'Gemini error'), { status: resp.status, body: data });

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  console.log('[Gemini] 文本返回:', raw);

  let pyMap;
  try {
    pyMap = JSON.parse(raw);
  } catch(e) {
    const m = raw.match(/\{[\s\S]+\}/);
    if (m) pyMap = JSON.parse(m[0]);
    else throw new Error('Gemini拼音返回格式错误: ' + raw.slice(0, 150));
  }

  pinyinCache.set(refText, pyMap);
  return pyMap;
}

// 带降级的包装
async function getPinyinMapSafe(refText) {
  try {
    return { map: await getPinyinMap(refText), error: null };
  } catch(e) {
    const detail = { status: e.status ?? null, message: e.message ?? String(e), body: e.body ?? null };
    console.error('[Gemini] 拼音请求失败 status=%s message=%s', detail.status, detail.message);
    return { map: {}, error: detail };
  }
}

// ── 拼音辅助函数 ─────────────────────────────────────────────────
function normalizePy(py) {
  return (py || '').toLowerCase().replace(/\s+(\d)/, '$1').trim();
}
function getTone(py) {
  const m = (py || '').match(/(\d)$/);
  return m ? parseInt(m[1]) : 0;
}
function getInitial(py) {
  py = (py || '').replace(/\d$/, '').toLowerCase().trim();
  for (const two of ['zh', 'ch', 'sh']) if (py.startsWith(two)) return two;
  for (const one of 'b p m f d t n l g k h j q x r z c s y w'.split(' '))
    if (py.startsWith(one)) return one;
  return '';
}
function getFinal(py) {
  const base = py.replace(/\d$/, '');
  return base.slice(getInitial(base).length) || base;
}

// ── 从 NBestPhonemes 提取用户最可能读的音节（与参考不同的那个）──
// Azure NBestPhonemes[0] = 用户实际读音最高置信候选
// 如果[0]就是参考音，则用户读对了；否则[0]就是用户实际读的
function extractUserPhoneme(ph) {
  const pa   = ph.PronunciationAssessment || {};
  const list = pa.NBestPhonemes || [];
  if (!list.length) return null;
  const refPhone = normalizePy(ph.Phoneme);
  // NBest[0] 是得分最高的，如果与参考相同说明用户读对了这个音素
  // 如果不同，说明用户读成了 NBest[0]
  const top = normalizePy(list[0].Phoneme || '');
  if (top && top !== refPhone) return top;
  // 参考音得分最高时，返回得分第二的（候补）
  if (list.length > 1) return normalizePy(list[1].Phoneme || '') || null;
  return null;
}

// ── 精确诊断发音错误：参考拼音 vs 用户实际拼音 ──────────────────
// 返回结构化错误对象数组 [{cat, msg, en}]
function diagnoseError(refPy, userPy) {
  if (!refPy || !userPy) return [];
  const rN = normalizePy(refPy);
  const uN = normalizePy(userPy);
  if (rN === uN) return [];

  const rTone  = getTone(rN);
  const uTone  = getTone(uN);
  const rInit  = getInitial(rN);
  const uInit  = getInitial(uN);
  const rFinal = getFinal(rN);
  const uFinal = getFinal(uN);

  const RETROFLEX = ['zh', 'ch', 'sh', 'r'];
  const SIBILANT  = ['z', 'c', 's'];
  const NASAL_PAIRS = [
    ['an','ang'],['en','eng'],['in','ing'],['ian','iang'],
    ['uan','uang'],['n','ng'],['un','ong']
  ];

  const errors = [];

  // 1. 声母对比
  if (rInit !== uInit) {
    const rRetro = RETROFLEX.includes(rInit);
    const rSibi  = SIBILANT.includes(rInit);
    const uRetro = RETROFLEX.includes(uInit);
    const uSibi  = SIBILANT.includes(uInit);
    if ((rRetro && uSibi) || (rSibi && uRetro)) {
      errors.push({
        cat: 'RETROFLEX',
        msg: `平翘舌：应读【${rInit||'零声母'}】你读成了【${uInit||'零声母'}】`,
        en:  `retroflex: should be "${rInit||'Ø'}", you said "${uInit||'Ø'}"`
      });
    } else if ((rInit === 'r' && (uInit === 'l' || uInit === 'n')) ||
               ((rInit === 'l' || rInit === 'n') && uInit === 'r')) {
      errors.push({
        cat: 'INITIAL',
        msg: `声母混淆【${rInit}】vs【${uInit}】（r需卷舌，l/n不卷舌）`,
        en:  `initial mix-up: "${rInit}" vs "${uInit}" (r needs tongue curl)`
      });
    } else if (rInit && uInit) {
      errors.push({
        cat: 'INITIAL',
        msg: `声母错误：应读【${rInit||'零声母'}】你读成了【${uInit||'零声母'}】`,
        en:  `initial: should be "${rInit||'Ø'}", you said "${uInit||'Ø'}"`
      });
    }
  }

  // 2. 韵母对比（声母相同时）
  if (rInit === uInit && rFinal !== uFinal && rFinal && uFinal) {
    const nasalSwap = NASAL_PAIRS.some(([f, b]) =>
      (rFinal === f && uFinal === b) || (rFinal === b && uFinal === f));
    if (nasalSwap) {
      const isFront = rFinal.endsWith('n') && !rFinal.endsWith('ng');
      errors.push({
        cat: 'NASAL',
        msg: `前后鼻音：应读【${rFinal}】（${isFront?'前鼻音-n结尾':'后鼻音-ng结尾'}），你读成了【${uFinal}】`,
        en:  `nasal ending: "${rFinal}" (${isFront?'front -n':'back -ng'}), you said "${uFinal}"`
      });
    } else {
      errors.push({
        cat: 'VOWEL',
        msg: `韵母错误：应读【${rFinal}】你读成了【${uFinal}】`,
        en:  `vowel: should be "${rFinal}", you said "${uFinal}"`
      });
    }
  }

  // 3. 声调对比（声母韵母正确时，或单独报声调）
  if (rInit === uInit && rFinal === uFinal && rTone !== 0 && uTone && rTone !== uTone) {
    const TONE_NAMES = ['','第1声（ā 高平）','第2声（á 上升）','第3声（ǎ 低降升）','第4声（à 下降）','轻声'];
    errors.push({
      cat: 'TONE',
      msg: `声调错误：应读${TONE_NAMES[rTone]||'第'+rTone+'声'}，你读成了${TONE_NAMES[uTone]||'第'+uTone+'声'}`,
      en:  `tone: should be tone ${rTone}, you said tone ${uTone}`
    });
  }

  return errors;
}

// ── Azure 响应格式兼容 ───────────────────────────────────────────
function wordAcc(w) { return Math.round((w.PronunciationAssessment || {}).AccuracyScore ?? w.AccuracyScore ?? 0); }
function wordErr(w) { return (w.PronunciationAssessment || {}).ErrorType || w.ErrorType || 'None'; }
function subAcc(p)  { return Math.round((p.PronunciationAssessment || {}).AccuracyScore ?? p.AccuracyScore ?? 0); }

// ── 解析 Azure 响应 ──────────────────────────────────────────────
async function parseAzureResult(resp, refText, pyMap) {
  console.log('[parse] RecognitionStatus:', resp.RecognitionStatus);

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    console.error('[parse] 无 NBest:', JSON.stringify(resp));
    return { totalScore: 0, wordResults: [], debugInfo: resp.RecognitionStatus || 'NoNBest' };
  }

  const pa               = nbest.PronunciationAssessment || {};
  const accuracyScore    = pa.AccuracyScore     ?? nbest.AccuracyScore     ?? 0;
  const completenessScore= pa.CompletenessScore ?? nbest.CompletenessScore ?? 100;
  const fluencyScore     = pa.FluencyScore      ?? nbest.FluencyScore      ?? 0;
  let pronScore = Math.round(accuracyScore * 0.7 + completenessScore * 0.2 + fluencyScore * 0.1);
  if (pronScore === 0 && nbest.Words && nbest.Words.length > 0) {
    pronScore = Math.round(nbest.Words.reduce((s, w) => s + wordAcc(w), 0) / nbest.Words.length);
    console.log('[parse] 词级平均兜底 pronScore:', pronScore);
  }
  console.log('[parse] accuracy=%s completeness=%s fluency=%s → pronScore=%s | 词数:%s',
    accuracyScore, completenessScore, fluencyScore, pronScore, (nbest.Words || []).length);
  console.log('[parse] pyMap:', JSON.stringify(pyMap));

  const wordResults = [];

  // Azure 对以下字在连读时识别偏严，用更宽松阈值避免误报
  // 覆盖：助词/虚词、高频字、声学上容易受协同发音影响的字
  const WEAK_CHARS = new Set([
    // 助词/语气词
    '的','地','得','了','着','过','吗','呢','吧','啊','呀','嘛','么','哦','嗯',
    // 高频但 Azure 评分偏严的实词
    '松','文','说','人','好','首','先','会','就','还','中','来','去','在','有','没',
    // 常见翘舌音字（Azure 对 zh/ch/sh/r 整体偏严）
    '知','只','之','止','直','支','志','者','这','那','她','事','是','市','时',
    '车','出','处','吃','成','城','程','称','场','长','上','身','生','声','什','使',
    '说','双','书','收','手','水','谁','所','少','社','深','三','色','思','四',
    '着','真','找','者','这','中','种','重','主','住','字','自','坐','做','走',
    '扰','热','人','日','然','让','认','如','入','若',
    // 常见平舌音字（Azure 有时对 z/c/s 过严）
    '才','从','此','草','错','词','次','曹','操',
    // 容易受 r-ending（儿化）影响的前置字
    '哪','那','这','哪','一',
    // 连读中容易弱化的字
    '请','问','去','区','打','你','下','市',
  ]);

  for (const w of (nbest.Words || [])) {
    const text      = w.Word || '';
    const accuracy  = wordAcc(w);
    const errType   = wordErr(w);
    const phonemes  = w.Phonemes  || [];
    const syllables = w.Syllables || [];

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} ph=${phonemes.length} syl=${syllables.length}`);
    // 记录第一个phoneme的NBestPhonemes结构，帮助理解格式
    if (phonemes.length > 0 && phonemes[0].PronunciationAssessment) {
      console.log(`[parse] ph[0]="${phonemes[0].Phoneme}" NBest:`, JSON.stringify((phonemes[0].PronunciationAssessment.NBestPhonemes||[]).slice(0,3)));
    }

    const charArr = Array.from(text);
    const cMsgs   = charArr.map(() => []);
    const cLevel  = charArr.map(() => 0);

    const levelOf = (acc, err, ch) => {
      if (err === 'Omission') return 2;
      const isWeak = WEAK_CHARS.has(ch);
      // 宽松策略：只有 Azure 明确报 Mispronunciation 或分数很低时才标错
      // 单纯低分（70-79）不代表发音有误，Azure 对连读整体偏严
      const redThr  = isWeak ? 32 : 42;   // 大幅降低红色阈值
      const yellThr = isWeak ? 55 : 65;   // 大幅降低黄色阈值（原来 60/80）
      if (acc < redThr)  return 2;
      // Mispronunciation 需要分数也较低才置信（避免误报）
      if (err === 'Mispronunciation' && acc < 75) return 1;
      if (acc < yellThr) return 1;
      return 0;
    };

    charArr.forEach((ch, i) => {
      // 优先用 Syllable（字级），再用 Phoneme（音素级）
      const syl = syllables.find(s => s.Grapheme === ch) || syllables[i] || null;
      // 收集属于该字的所有音素（通过Grapheme字段）
      const charPhonemes = phonemes.filter(p => p.Grapheme === ch);
      const phFallback   = charPhonemes[0] || phonemes[i] || null;

      const charAcc = syl ? subAcc(syl) : (phFallback ? subAcc(phFallback) : accuracy);
      cLevel[i] = levelOf(charAcc, errType, ch);

      // ── 基础错误标签 ────────────────────────────────────────
      if (cLevel[i] === 2) {
        if (errType === 'Omission') cMsgs[i].push('漏读');
        else cMsgs[i].push(`准确度过低（${charAcc}分）`);
      } else if (cLevel[i] === 1) {
        if (errType === 'Insertion') cMsgs[i].push('多读');
        else if (errType === 'Mispronunciation') cMsgs[i].push('发音有误');
        else cMsgs[i].push(`发音需改进（${charAcc}分）`);
      }

      // ── 精确错误诊断（只要不是漏读，都尝试分析）──────────
      if (errType !== 'Omission') {
        const wantPy = normalizePy(pyMap[ch] || '');
        const wantTone = getTone(wantPy);

        // 方案A：从 NBestPhonemes 拼合用户实际音节
        // Azure 对中文可能一个字有多个音素（声母+韵母），也可能整字一个音素
        let userSyllable = null;
        if (charPhonemes.length > 0) {
          // 尝试从每个音素的 NBest 拼出用户音节
          const userParts = charPhonemes.map(ph => {
            const nbPh = extractUserPhoneme(ph);
            return nbPh || normalizePy(ph.Phoneme);
          });
          // 如果任何音素的用户读法与参考不同，才构建 userSyllable
          const refParts = charPhonemes.map(ph => normalizePy(ph.Phoneme));
          if (JSON.stringify(userParts) !== JSON.stringify(refParts)) {
            // 简单拼接，取末尾数字作为声调（来自最后一个音素）
            const userBase = userParts.map(p => p.replace(/\d$/, '')).join('');
            const userTone = userParts.map(p => getTone(p)).find(t => t > 0) || 0;
            userSyllable = userBase + (userTone || '');
          }
        }

        // 方案B：Syllable 层级的 NBestPhonemes（Azure 有时在字级提供）
        if (!userSyllable && syl) {
          const sylNBest = (syl.PronunciationAssessment || {}).NBestPhonemes || [];
          if (sylNBest.length > 0) {
            const refSylPhone = normalizePy(syl.Phoneme || '');
            const topSylPhone = normalizePy(sylNBest[0].Phoneme || '');
            if (topSylPhone && topSylPhone !== refSylPhone) userSyllable = topSylPhone;
          }
        }

        // 方案C：低准确度时，用 Gemini 的期望拼音做规则推断
        // （当 Azure 无法提供 NBest 时的保底诊断）
        if (wantPy && (charAcc < 90 || errType === 'Mispronunciation')) {
          if (userSyllable) {
            // 有用户实际音节 → 精准比对
            const errs = diagnoseError(wantPy, userSyllable);
            errs.forEach(e => {
              cMsgs[i].push(e.msg);
              if (e.cat === 'RETROFLEX' || e.cat === 'INITIAL' || e.cat === 'NASAL' || e.cat === 'VOWEL')
                cLevel[i] = Math.max(cLevel[i], 2);
              else if (cLevel[i] === 0)
                cLevel[i] = 1;
            });
          } else {
            // 无 NBest → 无法确定具体错误，仅对轻声做特殊处理
            // ⚠️ 不添加推测性提示（如"注意翘舌音"）——没有证据就不报错
            if (wantTone === 0 && charAcc < 55) {
              cMsgs[i].push('轻声字：读得过重，应短促轻读');
              if (cLevel[i] === 0) cLevel[i] = 1;
            }
          }
        }

        // ── 声调检查：仅在有 NBest 证据时才比对 ──────────────
        // ph.Phoneme 是 Azure 的音素标识符，不适合直接提取声调
        // 只用 NBest 中的声调信息（如果 NBest 中的音节包含声调数字）
        if (wantPy && wantTone !== 0 && userSyllable) {
          const userTone = getTone(normalizePy(userSyllable));
          if (userTone && userTone !== wantTone) {
            const TONE_NAMES = ['','第1声（ā）','第2声（á）','第3声（ǎ）','第4声（à）'];
            const alreadyHasToneMsg = cMsgs[i].some(m => m.includes('声调'));
            if (!alreadyHasToneMsg) {
              cMsgs[i].push(`声调偏差：应${TONE_NAMES[wantTone]||'第'+wantTone+'声'}，识别${TONE_NAMES[userTone]||'第'+userTone+'声'}`);
              if (cLevel[i] === 0) cLevel[i] = 1;
            }
          }
        }

        // ── 儿化音检查 ──────────────────────────────────────
        const wantPy2 = normalizePy(pyMap[ch] || '');
        if (wantPy2 && wantPy2.includes('r') && ch === '儿' && wantTone === 0) {
          if (charAcc < 60) {
            cMsgs[i].push('儿化音：舌尖上卷，声音带卷舌色彩');
            cLevel[i] = Math.max(cLevel[i], 1);
          }
        }
      }

      console.log(`[parse] char="${ch}" acc=${charAcc} level=${cLevel[i]} msgs=${JSON.stringify(cMsgs[i])}`);
    });

    charArr.forEach((ch, i) => {
      wordResults.push({ content: ch, perrLevel: cLevel[i], perrMsg: cMsgs[i].join('；') });
    });
  }

  // ── 分段线性映射，让分数对学习者更友好 ──────────────────────
  const segments = [
    [90, 100, 95, 100],
    [75,  89, 85,  94],
    [60,  74, 75,  84],
    [45,  59, 60,  74],
  ];
  function mapScore(raw) {
    for (const [s0, s1, d0, d1] of segments) {
      if (raw >= s0 && raw <= s1)
        return Math.round(d0 + (raw - s0) / (s1 - s0) * (d1 - d0));
    }
    return raw;
  }

  const rawScore   = pronScore;
  const totalScore = mapScore(rawScore);
  console.log(`[parse] rawScore=${rawScore} totalScore=${totalScore} wordResults=${wordResults.length}`);
  return { totalScore, rawScore, accuracyScore, completenessScore, fluencyScore, wordResults };
}

// ── Vercel Serverless 入口 ───────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!AZURE_KEY)
    return res.status(500).json({ error: 'AZURE_SPEECH_KEY env var not configured' });

  try {
    const { audioBase64, refText } = req.body;
    if (!audioBase64 || !refText)
      return res.status(400).json({ error: 'audioBase64 and refText are required' });

    const [azureResp, { map: pyMap, error: claudeErr }] = await Promise.all([
      azureAssess(audioBase64, refText),
      getPinyinMapSafe(refText)
    ]);

    const result = await parseAzureResult(azureResp, refText, pyMap);

    // ── _debug ───────────────────────────────────────────────────
    const nbest0 = azureResp.NBest && azureResp.NBest[0];
    const w0 = nbest0 && nbest0.Words && nbest0.Words[0];
    const w1 = nbest0 && nbest0.Words && nbest0.Words[1];
    result._debug = {
      RecognitionStatus: azureResp.RecognitionStatus,
      'NBest[0].PronunciationAssessment': nbest0 ? nbest0.PronunciationAssessment : null,
      'NBest[0].Lexical':  nbest0 ? nbest0.Lexical : null,
      WordCount:           nbest0 && nbest0.Words ? nbest0.Words.length : 0,
      rawScore:          result.rawScore,
      accuracyScore:     result.accuracyScore,
      completenessScore: result.completenessScore,
      fluencyScore:      result.fluencyScore,
      pyMap,
      geminiError: claudeErr || null,
      'Words[0]_full':           w0 || null,
      'Words[0].Phonemes_full':  w0 ? w0.Phonemes  : null,
      'Words[0].Syllables_full': w0 ? w0.Syllables : null,
      'Words[1]_full':           w1 || null,
      'Words[1].Phonemes_full':  w1 ? w1.Phonemes  : null,
    };
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
