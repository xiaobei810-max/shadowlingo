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
    const cMsgs  = charArr.map(() => []);  // 每个字的消息列表
    const cLevel = charArr.map(() => 0);   // 0=绿 1=黄 2=红

    // ── 三色评级辅助 ─────────────────────────────────────────────
    // acc >= 80 → 0(绿)；60-79 → 1(黄)；<60 或 Mispronunciation/Omission → 2(红)
    const levelOf = (acc, err) => {
      if (err === 'Omission' || err === 'Insertion' || err === 'Mispronunciation') return 2;
      if (acc < 60) return 2;
      if (acc < 80) return 1;
      return 0;
    };

    // ── 逐字分析 ─────────────────────────────────────────────────
    charArr.forEach((ch, i) => {
      const ph  = phonemes.find(p => p.Grapheme === ch)  || phonemes[i]  || null;
      const syl = syllables.find(s => s.Grapheme === ch) || syllables[i] || null;

      // 每字准确度：优先用音节分，无则用词级分
      const charAcc = syl ? subAcc(syl) : (ph ? subAcc(ph) : accuracy);
      // 词级 ErrorType 对词内所有字生效
      cLevel[i] = levelOf(charAcc, errType);

      // ── 基础消息（根据等级和错误类型）────────────────────────
      if (cLevel[i] === 2) {
        if (errType === 'Omission')              cMsgs[i].push('漏读');
        else if (errType === 'Insertion')        cMsgs[i].push('多读');
        else if (errType === 'Mispronunciation') cMsgs[i].push('发音有误，注意声调/发音');
        else                                     cMsgs[i].push(`准确度过低（${charAcc}分）`);
      } else if (cLevel[i] === 1) {
        cMsgs[i].push(`发音需改进（${charAcc}分）`);
      }

      // ── 拼音级详细检测（声母混淆 + 声调偏差）────────────────
      const correctPyArr = queue[ch];
      if (correctPyArr && ph && ph.Phoneme) {
        const ui        = usedIdx[ch] || 0;
        const correctPy = correctPyArr[ui] ?? correctPyArr[correctPyArr.length - 1];
        usedIdx[ch]     = ui + 1;

        const wantInit = getInitial(correctPy);
        const gotInit  = getInitial(ph.Phoneme);
        console.log(`[拼音] "${ch}": 期望=${correctPy}(声母:${wantInit}) 识别=${ph.Phoneme}(声母:${gotInit})`);

        // 平翘舌混淆 → 红色
        for (const [retro, flat] of RETRO_PAIRS) {
          if (wantInit !== retro && wantInit !== flat) continue;
          if (!gotInit) continue;
          if ((wantInit === retro && gotInit === flat) ||
              (wantInit === flat  && gotInit === retro)) {
            cMsgs[i].push(`声母混淆：应【${wantInit}】实【${gotInit}】`);
            cLevel[i] = 2;
          }
        }

        // 声调偏差检测（从拼音字符串末尾的数字提取声调）
        const wantTone = (correctPy.match(/\d/) || [''])[0];
        const gotTone  = (ph.Phoneme.match(/\d/) || [''])[0];
        if (wantTone && gotTone && wantTone !== gotTone) {
          cMsgs[i].push(`声调偏差：应第${wantTone}声，识别第${gotTone}声`);
          if (cLevel[i] === 0) cLevel[i] = 1; // 仅声调偏差升级到黄色
        }
      } else if (correctPyArr) {
        usedIdx[ch] = (usedIdx[ch] || 0) + 1;
      }
    });

    charArr.forEach((ch, i) => {
      wordResults.push({ content: ch, perrLevel: cLevel[i], perrMsg: cMsgs[i].join('；') });
    });
  }

  // ── 最终得分：Azure PronScore 70% + 绿色字占比 30% ──────────
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
