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

// ── 解析 Azure 响应 ──────────────────────────────────────────────
// Azure REST API 实际返回的评分字段有两种位置：
//   嵌套式：w.PronunciationAssessment.AccuracyScore（文档示例）
//   扁平式：w.AccuracyScore / w.ErrorType（实测返回）
// 用下面的辅助函数同时兼容两种格式。
function wordAcc(w)     { return Math.round((w.PronunciationAssessment || {}).AccuracyScore ?? w.AccuracyScore ?? 0); }
function wordErr(w)     { return (w.PronunciationAssessment || {}).ErrorType || w.ErrorType || 'None'; }
function subUnitAcc(p)  { return Math.round((p.PronunciationAssessment || {}).AccuracyScore ?? p.AccuracyScore ?? 0); }
function subUnitName(p) { return p.Phoneme || p.Grapheme || p.Syllable || ''; }

function parseAzureResult(resp, chars) {
  console.log('[parse] RecognitionStatus:', resp.RecognitionStatus);

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    console.error('[parse] 无 NBest:', JSON.stringify(resp));
    return { totalScore: 0, wordResults: [], debugInfo: resp.RecognitionStatus || 'NoNBest' };
  }

  // 总分：嵌套式或扁平式均支持；若两者均无，用词级平均值兜底
  const pa = nbest.PronunciationAssessment || {};
  let pronScore = Math.round(pa.PronScore ?? pa.AccuracyScore ?? nbest.AccuracyScore ?? 0);
  console.log('[parse] PA:', JSON.stringify(pa), '| 词数:', (nbest.Words || []).length);

  // 若顶层没有 PronScore，用词级平均 AccuracyScore 兜底
  if (pronScore === 0 && nbest.Words && nbest.Words.length > 0) {
    const avg = nbest.Words.reduce((s, w) => s + wordAcc(w), 0) / nbest.Words.length;
    pronScore = Math.round(avg);
    console.log('[parse] 顶层PronScore=0，用词级平均兜底:', pronScore);
  }

  // 正确拼音队列（用于平翘舌检测）
  const queue = {}, usedIdx = {};
  (chars || []).forEach(({ c, p }) => (queue[c] = queue[c] || []).push(p));

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text     = w.Word || '';
    const accuracy = wordAcc(w);
    const errType  = wordErr(w);
    // Azure 可能返回 Phonemes（音素）或 Syllables（音节），均兼容
    const subUnits = w.Phonemes || w.Syllables || [];

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} sub=${subUnits.length}`);

    const msgs = [];
    let hasError = false;

    // 词级错误类型
    if (errType === 'Omission') {
      msgs.push('漏读'); hasError = true;
    } else if (errType === 'Insertion') {
      msgs.push('多读'); hasError = true;
    } else if (errType === 'Mispronunciation' && accuracy < 50) {
      hasError = true; msgs.push(`发音有误（${accuracy}分）`);
    }

    // 音素/音节级（低于 40 分才报错）
    for (const p of subUnits) {
      const pAcc = subUnitAcc(p);
      if (pAcc < 40) {
        msgs.push(`「${subUnitName(p)}」偏差（${pAcc}分）`);
        hasError = true;
      }
    }

    // 平翘舌检测
    if (queue[text]) {
      const ui        = usedIdx[text] || 0;
      const correctPy = queue[text][ui] ?? queue[text][queue[text].length - 1];
      usedIdx[text]   = ui + 1;
      const correctInit = getInitial(correctPy);

      for (const [retro, flat] of RETRO_PAIRS) {
        if (correctInit !== retro && correctInit !== flat) continue;
        const initPhone = subUnits.find(p => {
          const ph = subUnitName(p).toLowerCase();
          return ph === retro || ph === flat;
        });
        if (initPhone) {
          const recog = subUnitName(initPhone).toLowerCase();
          const iAcc  = subUnitAcc(initPhone);
          if ((correctInit === retro && recog === flat) || (correctInit === flat && recog === retro)) {
            msgs.push(`平翘舌混淆：应读【${correctInit}】实读【${recog}】（${correctPy}）`);
            hasError = true;
          } else if (iAcc < 40) {
            msgs.push(`声母「${correctInit}」发音不准（${iAcc}分）`);
            hasError = true;
          }
        }
      }
    }

    Array.from(text).forEach((ch, i) => {
      wordResults.push({
        content:   ch,
        perrLevel: hasError ? 1 : 0,
        perrMsg:   i === 0 ? msgs.join('；') : ''
      });
    });
  }

  // 最终分：Azure PronScore 70% + 字符正确率 30%
  let totalScore = pronScore;
  if (wordResults.length > 0) {
    const correct   = wordResults.filter(w => w.perrLevel === 0).length;
    const charRatio = correct / wordResults.length;
    totalScore = Math.round(pronScore * 0.7 + charRatio * 100 * 0.3);
  }

  console.log(`[parse] 最终 totalScore=${totalScore} wordResults=${wordResults.length}`);
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
