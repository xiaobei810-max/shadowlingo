const https = require('https');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';

// ── PCM → WAV（44 字节 RIFF 头）────────────────────────────────
function pcmToWav(pcmBuf) {
  const wav = Buffer.alloc(44 + pcmBuf.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcmBuf.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);       // PCM
  wav.writeUInt16LE(1, 22);       // mono
  wav.writeUInt32LE(16000, 24);   // sample rate
  wav.writeUInt32LE(32000, 28);   // byte rate = 16000*1*2
  wav.writeUInt16LE(2, 32);       // block align
  wav.writeUInt16LE(16, 34);      // bits per sample
  wav.write('data', 36);
  wav.writeUInt32LE(pcmBuf.length, 40);
  pcmBuf.copy(wav, 44);
  return wav;
}

// ── Azure 发音评测 REST API ──────────────────────────────────────
function azureAssess(pcmBase64, refText) {
  return new Promise((resolve, reject) => {
    const wavBuf = pcmToWav(Buffer.from(pcmBase64, 'base64'));
    console.log('[Azure] WAV大小:', wavBuf.length, '字节，refText:', refText);

    const cfg = Buffer.from(JSON.stringify({
      ReferenceText: refText,
      GradingSystem: 'HundredMark',
      Granularity:   'Phoneme',
      Dimension:     'Comprehensive'
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
        console.log('[Azure] 原始响应:', raw);   // ← 完整打印，便于排查
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

// ── 提取拼音声母 ─────────────────────────────────────────────────
function getInitial(py) {
  py = (py || '').toLowerCase().replace(/\d/g, '').trim();
  for (const two of ['zh', 'ch', 'sh']) if (py.startsWith(two)) return two;
  for (const one of 'b p m f d t n l g k h j q x r z c s y w'.split(' '))
    if (py.startsWith(one)) return one;
  return '';
}
const RETRO_PAIRS = [['zh','z'], ['ch','c'], ['sh','s']];

// ── 兼容 Azure 两种响应格式的辅助函数 ───────────────────────────
// 文档格式：w.PronunciationAssessment.AccuracyScore
// 实测格式：w.AccuracyScore（扁平）
function wordAcc(w)    { return Math.round((w.PronunciationAssessment || {}).AccuracyScore ?? w.AccuracyScore ?? 0); }
function wordErr(w)    { return (w.PronunciationAssessment || {}).ErrorType || w.ErrorType || 'None'; }
function subAcc(p)     { return Math.round((p.PronunciationAssessment || {}).AccuracyScore ?? p.AccuracyScore ?? 0); }

// ── 解析 Azure 响应 ──────────────────────────────────────────────
function parseAzureResult(resp, chars) {
  console.log('[parse] RecognitionStatus:', resp.RecognitionStatus);

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    console.error('[parse] 无 NBest:', JSON.stringify(resp));
    return { totalScore: 0, wordResults: [], debugInfo: resp.RecognitionStatus || 'NoNBest' };
  }

  // ── 总分：嵌套式 → 扁平式 → 词级平均 三级兜底 ──────────────
  const pa = nbest.PronunciationAssessment || {};
  let pronScore = Math.round(pa.PronScore ?? pa.AccuracyScore ?? nbest.AccuracyScore ?? 0);
  if (pronScore === 0 && nbest.Words && nbest.Words.length > 0) {
    pronScore = Math.round(nbest.Words.reduce((s, w) => s + wordAcc(w), 0) / nbest.Words.length);
    console.log('[parse] 词级平均兜底 pronScore:', pronScore);
  }
  console.log('[parse] pronScore:', pronScore, '| 词数:', (nbest.Words || []).length);

  // ── 正确拼音队列（每个字 → 期望拼音列表，用于平翘舌检测）──
  const queue = {}, usedIdx = {};
  (chars || []).forEach(({ c, p }) => (queue[c] = queue[c] || []).push(p));

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text     = w.Word || '';
    const accuracy = wordAcc(w);
    const errType  = wordErr(w);
    // Azure 中文：Phonemes 包含完整拼音串（如 "shou 3"），Syllables 含每字得分
    const phonemes  = w.Phonemes  || [];
    const syllables = w.Syllables || [];

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} phonemes=${phonemes.length} syl=${syllables.length}`);

    const charArr = Array.from(text);
    const cMsgs   = charArr.map(() => []);   // 每个字的错误消息列表
    const cErr    = charArr.map(() => false); // 每个字是否有错

    // ── 词级错误 → 挂到第一个字 ───────────────────────────────
    // 判断规则：AccuracyScore < 75 或 ErrorType = Mispronunciation → 标红
    if (errType === 'Omission') {
      cMsgs[0].push('漏读'); cErr[0] = true;
    } else if (errType === 'Insertion') {
      cMsgs[0].push('多读'); cErr[0] = true;
    } else if (errType === 'Mispronunciation') {
      cMsgs[0].push(`发音有误（${accuracy}分）`); cErr[0] = true;
    } else if (accuracy < 75) {
      cMsgs[0].push(`准确度偏低（${accuracy}分）`); cErr[0] = true;
    }

    // ── 逐字分析（音节准确度 + 平翘舌检测）────────────────────
    charArr.forEach((ch, i) => {
      // 找对应音素（Grapheme 精确匹配，否则按下标）
      const ph  = phonemes.find(p => p.Grapheme === ch)  || phonemes[i]  || null;
      const syl = syllables.find(s => s.Grapheme === ch) || syllables[i] || null;

      // 音节准确度（优先用 Syllables，无则用 Phonemes）
      const sylScore = syl ? subAcc(syl) : (ph ? subAcc(ph) : null);
      if (sylScore !== null && sylScore < 40) {
        cMsgs[i].push(`音节偏差（${sylScore}分）`); cErr[i] = true;
      }

      // ── 平翘舌检测 ────────────────────────────────────────────
      // Azure 的 ph.Phoneme 是完整拼音串，如 "shou 3" / "zhong 1" / "zong 1"
      // getInitial("shou 3")  → "sh"
      // getInitial("zhong 1") → "zh"
      // getInitial("zong 1")  → "z"
      const correctPyArr = queue[ch];
      if (correctPyArr && ph && ph.Phoneme) {
        const ui         = usedIdx[ch] || 0;
        const correctPy  = correctPyArr[ui] ?? correctPyArr[correctPyArr.length - 1];
        usedIdx[ch]      = ui + 1;

        const wantInit = getInitial(correctPy);   // 期望声母
        const gotInit  = getInitial(ph.Phoneme);  // Azure 识别的声母

        console.log(`[平翘舌] "${ch}": 期望=${correctPy}(${wantInit}) 识别=${ph.Phoneme}(${gotInit})`);

        for (const [retro, flat] of RETRO_PAIRS) {
          if (wantInit !== retro && wantInit !== flat) continue; // 该字不涉及此对
          if (!gotInit) continue;                                 // 识别不出声母，跳过
          if ((wantInit === retro && gotInit === flat) ||
              (wantInit === flat  && gotInit === retro)) {
            cMsgs[i].push(`平翘舌：应【${wantInit}】实【${gotInit}】（${correctPy}）`);
            cErr[i] = true;
          }
        }
      } else if (correctPyArr) {
        // 没有 Phoneme 串但有期望拼音，仍消费队列保持对齐
        usedIdx[ch] = (usedIdx[ch] || 0) + 1;
      }
    });

    charArr.forEach((ch, i) => {
      wordResults.push({ content: ch, perrLevel: cErr[i] ? 1 : 0, perrMsg: cMsgs[i].join('；') });
    });
  }

  // ── 最终得分：Azure PronScore 70% + 字符正确率 30% ──────────
  let totalScore = pronScore;
  if (wordResults.length > 0) {
    const charRatio = wordResults.filter(w => w.perrLevel === 0).length / wordResults.length;
    totalScore = Math.round(pronScore * 0.7 + charRatio * 100 * 0.3);
  }

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
    const { audioBase64, refText, chars } = req.body;
    if (!audioBase64 || !refText)
      return res.status(400).json({ error: 'audioBase64 and refText are required' });

    const azureResp = await azureAssess(audioBase64, refText);
    const result    = parseAzureResult(azureResp, chars || []);

    // ── _debug：Azure 原始返回数据，直接在 Network 面板可见 ──────────
    const nbest0 = azureResp.NBest && azureResp.NBest[0];
    result._debug = {
      // 1. 顶层识别状态
      RecognitionStatus: azureResp.RecognitionStatus,

      // 2. NBest[0].PronunciationAssessment 完整对象（Azure 综合评分）
      'NBest[0].PronunciationAssessment': nbest0 ? nbest0.PronunciationAssessment : null,

      // 3. NBest[0].Words[0] 第一个词的完整数据（含音素）
      'NBest[0].Words[0]': nbest0 && nbest0.Words && nbest0.Words[0]
        ? nbest0.Words[0]
        : null,

      // 4. 本次识别的完整文本
      'NBest[0].Lexical': nbest0 ? nbest0.Lexical : null,

      // 5. 共识别到几个词
      WordCount: nbest0 && nbest0.Words ? nbest0.Words.length : 0
    };
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
