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
      ReferenceText: cleanRef,
      GradingSystem: 'HundredMark',
      Granularity:   'Phoneme',
      Dimension:     'Comprehensive',
      EnableMiscue:  false
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
        console.log('[Azure] 原始响应:', raw);
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
  '你是中文拼音专家。给定一个中文句子，按实际朗读发音（而非字典本调）标注每个汉字的拼音和声调数字（1-4，轻声用0）。\n' +
  '变调规则：\n' +
  '1. 多音字：按句子语境判断读音，例如"教"在"来教你"中读 jiao1，在"教室"中读 jiao4\n' +
  '2. 三声连读：两个三声相邻时，第一个变二声，例如"你好"→ ni2 hao3，"可以"→ ke2 yi3\n' +
  '3. "一"的变调：四声前读二声（一个→yi2 ge4）；一/二/三声前读四声（一天→yi4 tian1）；单独、序数或句末读一声（第一→di4 yi1）\n' +
  '4. "不"的变调：四声前读二声（不是→bu2 shi4）；其他声调前读四声（不来→bu4 lai2）\n' +
  '5. 轻声：语气助词 的/地/得/了/吗/呢/吧/啊/嘛/呀/着/过/么 → 声调0；常见轻声复合词的第二个字：东西/意思/事情/朋友/知道/认识/明白/告诉/先生/学生/名字/眼睛/耳朵/鼻子/嘴巴/头发/衣服/地方/时候/日子/孩子/儿子/丈夫 等\n' +
  '6. 儿化音："儿"单独作儿化韵时 → er0\n' +
  '7. 只返回纯JSON对象，格式：{"字":"pinyin+声调数字"}，不要任何其他文字、注释或 markdown';

async function getPinyinMap(refText) {
  if (pinyinCache.has(refText)) {
    console.log('[Gemini] 缓存命中:', refText);
    return pinyinCache.get(refText);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  console.log('[Gemini] 请求拼音 for:', refText);

  const body = {
    contents: [{ parts: [{ text: `${GEMINI_SYSTEM}\n\n句子：${refText}\n请返回每个汉字的拼音JSON（格式示例：{"你":"ni3","好":"hao3"}）：` }] }]
  };

  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });

  const data = await resp.json();
  console.log('[Gemini] HTTP状态:', resp.status, '原始返回:', JSON.stringify(data).slice(0, 300));

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

// 带降级的包装：Gemini 失败时返回空 map，让 Azure 评测仍能进行
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
  const m = py.match(/(\d)$/);
  return m ? m[1] : '';
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

  // ── 总分 ──────────────────────────────────────────────────────
  const pa = nbest.PronunciationAssessment || {};
  let pronScore = Math.round(pa.PronScore ?? pa.AccuracyScore ?? nbest.AccuracyScore ?? 0);
  if (pronScore === 0 && nbest.Words && nbest.Words.length > 0) {
    pronScore = Math.round(nbest.Words.reduce((s, w) => s + wordAcc(w), 0) / nbest.Words.length);
    console.log('[parse] 词级平均兜底 pronScore:', pronScore);
  }
  console.log('[parse] pronScore:', pronScore, '| 词数:', (nbest.Words || []).length);
  console.log('[parse] pyMap:', JSON.stringify(pyMap));

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text      = w.Word || '';
    const accuracy  = wordAcc(w);
    const errType   = wordErr(w);
    const phonemes  = w.Phonemes  || [];
    const syllables = w.Syllables || [];

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} ph=${phonemes.length} syl=${syllables.length}`);

    const charArr = Array.from(text);
    const cMsgs   = charArr.map(() => []);
    const cLevel  = charArr.map(() => 0);

    const levelOf = (acc, err) => {
      if (err === 'Omission') return 2;
      if (acc < 50) return 2;          // 红：< 50 或漏读
      if (err === 'Mispronunciation') return 1;
      if (acc < 80) return 1;          // 黄：50-79
      return 0;                        // 绿：>= 80
    };

    charArr.forEach((ch, i) => {
      const ph  = phonemes.find(p => p.Grapheme === ch)  || phonemes[i]  || null;
      const syl = syllables.find(s => s.Grapheme === ch) || syllables[i] || null;

      const charAcc = syl ? subAcc(syl) : (ph ? subAcc(ph) : accuracy);
      cLevel[i] = levelOf(charAcc, errType);

      // ── 基础错误消息 ──────────────────────────────────────────
      if (cLevel[i] === 2) {
        if (errType === 'Omission') cMsgs[i].push('漏读');
        else                        cMsgs[i].push(`准确度过低（${charAcc}分）`);
      } else if (cLevel[i] === 1) {
        if (errType === 'Mispronunciation') cMsgs[i].push('发音有误');
        else if (errType === 'Insertion')   cMsgs[i].push('多读');
        else                                cMsgs[i].push(`发音需改进（${charAcc}分）`);
      }

      // ── 拼音精确比对（Claude 期望 vs Azure 实测）─────────────
      const wantPy = normalizePy(pyMap[ch] || '');
      const gotPy  = ph ? normalizePy(ph.Phoneme) : '';

      console.log(`[拼音] "${ch}" 期望=${wantPy} 实测=${gotPy}`);

      if (wantPy && gotPy && errType !== 'Omission' && charAcc < 80) {
        const wantTone  = getTone(wantPy);
        const gotTone   = getTone(gotPy);
        const wantInit  = getInitial(wantPy);
        const gotInit   = getInitial(gotPy);
        const wantFinal = getFinal(wantPy);
        const gotFinal  = getFinal(gotPy);

        // 轻声（0）不做声调比对
        if (wantTone !== '0' && wantTone && gotTone && wantTone !== gotTone) {
          cMsgs[i].push(`声调偏差：应第${wantTone}声，识别第${gotTone}声`);
          if (cLevel[i] === 0) cLevel[i] = 1;
        }

        if (wantInit !== gotInit) {
          cMsgs[i].push(`声母错误：应【${wantInit || '零声母'}】实【${gotInit || '零声母'}】`);
          cLevel[i] = Math.max(cLevel[i], 2);
        } else if (wantFinal !== gotFinal) {
          cMsgs[i].push(`韵母错误：应【${wantFinal}】实【${gotFinal}】`);
          cLevel[i] = Math.max(cLevel[i], 2);
        }
      }
    });

    charArr.forEach((ch, i) => {
      wordResults.push({ content: ch, perrLevel: cLevel[i], perrMsg: cMsgs[i].join('；') });
    });
  }

  const totalScore = pronScore;
  console.log(`[parse] totalScore=${totalScore} wordResults=${wordResults.length}`);
  return { totalScore, wordResults };
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

    // 并行请求：Azure 评测 + Claude 拼音（两者互不依赖）
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
      pyMap,
      geminiError: claudeErr || null,
      'Words[0]_full':          w0 || null,
      'Words[0].Phonemes_full': w0 ? w0.Phonemes : null,
      'Words[0].Syllables_full':w0 ? w0.Syllables : null,
      'Words[1]_full':          w1 || null,
      'Words[1].Phonemes_full': w1 ? w1.Phonemes : null,
    };
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
