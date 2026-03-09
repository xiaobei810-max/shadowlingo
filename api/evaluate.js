const https      = require('https');
const { pinyin: pinyinGet } = require('pinyin-pro');

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
  wav.writeUInt32LE(32000, 28);   // byte rate
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
    const cleanRef = refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, '');
    console.log('[Azure] WAV大小:', wavBuf.length, '字节，refText:', cleanRef);

    const cfg = Buffer.from(JSON.stringify({
      ReferenceText:  cleanRef,
      GradingSystem:  'HundredMark',
      Granularity:    'Phoneme',
      Dimension:      'Comprehensive',
      EnableMiscue:   false
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

// ── 拼音辅助函数 ──────────────────────────────────────────────────
// "shou 3" / "shou3" → "shou3"
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

// ── 兼容 Azure 两种响应格式的辅助函数 ───────────────────────────
function wordAcc(w)    { return Math.round((w.PronunciationAssessment || {}).AccuracyScore ?? w.AccuracyScore ?? 0); }
function wordErr(w)    { return (w.PronunciationAssessment || {}).ErrorType || w.ErrorType || 'None'; }
function subAcc(p)     { return Math.round((p.PronunciationAssessment || {}).AccuracyScore ?? p.AccuracyScore ?? 0); }

// ── 解析 Azure 响应 ──────────────────────────────────────────────
function parseAzureResult(resp, refText) {
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

  // ── 用 pinyin-pro 生成期望拼音（带上下文变调）─────────────────
  const cleanRef  = (refText || '').replace(/[，。！？,.!?\s、；：""''《》【】]/g, '');
  const pyArr     = pinyinGet(cleanRef, { toneType: 'num', type: 'array' });
  const refChars  = Array.from(cleanRef);
  // 按字建队列，保留出现顺序（同一个字可能多音）
  const pyQueue = {}, pyUsed = {};
  refChars.forEach((c, i) => { (pyQueue[c] = pyQueue[c] || []).push(pyArr[i] || ''); });

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text     = w.Word || '';
    const accuracy = wordAcc(w);
    const errType  = wordErr(w);
    const phonemes  = w.Phonemes  || [];
    const syllables = w.Syllables || [];

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} ph=${phonemes.length} syl=${syllables.length}`);

    const charArr = Array.from(text);
    const cMsgs   = charArr.map(() => []);
    const cLevel  = charArr.map(() => 0);

    // 绿：acc>=75 且 None；黄：acc 50-74 或 Mispronunciation；红：acc<50 或 Omission
    const levelOf = (acc, err) => {
      if (err === 'Omission') return 2;
      if (acc < 50) return 2;
      if (err === 'Mispronunciation') return 1;
      if (acc < 75) return 1;
      return 0;
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

      // ── 拼音级精确比对（pinyin-pro 期望 vs Azure 实测）────────
      const ui      = pyUsed[ch] || 0;
      const wantRaw = (pyQueue[ch] || [])[ui] || '';
      pyUsed[ch]    = ui + 1;

      const wantPy = normalizePy(wantRaw);
      const gotPy  = ph ? normalizePy(ph.Phoneme) : '';

      console.log(`[拼音] "${ch}" 期望=${wantPy} 实测=${gotPy}`);

      if (wantPy && gotPy && errType !== 'Omission') {
        const wantInit  = getInitial(wantPy);
        const gotInit   = getInitial(gotPy);
        const wantFinal = getFinal(wantPy);
        const gotFinal  = getFinal(gotPy);
        const wantTone  = getTone(wantPy);
        const gotTone   = getTone(gotPy);

        if (wantInit !== gotInit) {
          cMsgs[i].push(`声母错误：应【${wantInit || '零声母'}】实【${gotInit || '零声母'}】`);
          cLevel[i] = Math.max(cLevel[i], 2);
        } else if (wantFinal !== gotFinal) {
          cMsgs[i].push(`韵母错误：应【${wantFinal}】实【${gotFinal}】`);
          cLevel[i] = Math.max(cLevel[i], 2);
        }

        if (wantTone && gotTone && wantTone !== gotTone) {
          cMsgs[i].push(`声调偏差：应第${wantTone}声，识别第${gotTone}声`);
          if (cLevel[i] === 0) cLevel[i] = 1;
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

    const azureResp = await azureAssess(audioBase64, refText);
    const result    = parseAzureResult(azureResp, refText);

    // ── _debug ──────────────────────────────────────────────────
    const nbest0 = azureResp.NBest && azureResp.NBest[0];
    const w0 = nbest0 && nbest0.Words && nbest0.Words[0];
    const w1 = nbest0 && nbest0.Words && nbest0.Words[1];
    result._debug = {
      RecognitionStatus: azureResp.RecognitionStatus,
      'NBest[0].PronunciationAssessment': nbest0 ? nbest0.PronunciationAssessment : null,
      'NBest[0].Lexical': nbest0 ? nbest0.Lexical : null,
      WordCount: nbest0 && nbest0.Words ? nbest0.Words.length : 0,
      'Words[0]_full': w0 || null,
      'Words[0].Phonemes_full': w0 ? w0.Phonemes : null,
      'Words[0].Syllables_full': w0 ? w0.Syllables : null,
      'Words[1]_full': w1 || null,
      'Words[1].Phonemes_full': w1 ? w1.Phonemes : null,
    };
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
