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
function parseAzureResult(resp, chars) {
  // ── 顶层诊断 ─────────────────────────────────────────────────
  console.log('[parse] RecognitionStatus:', resp.RecognitionStatus);

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    // 常见原因：NoMatch（未识别到语音）、InitialSilenceTimeout 等
    console.error('[parse] 无 NBest。完整响应:', JSON.stringify(resp));
    return { totalScore: 0, wordResults: [], debugInfo: resp.RecognitionStatus || 'NoNBest' };
  }

  const pa = nbest.PronunciationAssessment || {};
  // Azure 直接给出的综合分，作为 totalScore 主要来源
  const pronScore = Math.round(pa.PronScore || pa.AccuracyScore || 0);
  console.log('[parse] PronScore:', pronScore,
    '| AccuracyScore:', pa.AccuracyScore,
    '| FluencyScore:', pa.FluencyScore,
    '| CompletenessScore:', pa.CompletenessScore);
  console.log('[parse] Words数量:', (nbest.Words || []).length);

  // 正确拼音队列
  const queue = {}, usedIdx = {};
  (chars || []).forEach(({ c, p }) => (queue[c] = queue[c] || []).push(p));

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text     = w.Word || '';
    const wpa      = w.PronunciationAssessment || {};
    const accuracy = Math.round(wpa.AccuracyScore || 0);
    const errType  = wpa.ErrorType || 'None';

    // 诊断每个词
    const phonemeLog = (w.Phonemes || []).map(p =>
      `${p.Phoneme}=${Math.round((p.PronunciationAssessment||{}).AccuracyScore||0)}`
    ).join(' ');
    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} phonemes:[${phonemeLog}]`);

    const msgs = [];
    let hasError = false;

    // 错误类型（漏读 / 多读 / 发音错误）
    if (errType === 'Omission') {
      msgs.push('漏读'); hasError = true;
    } else if (errType === 'Insertion') {
      msgs.push('多读'); hasError = true;
    } else if (errType === 'Mispronunciation') {
      // 仅在准确度明显偏低时才标红，避免误报
      if (accuracy < 50) { hasError = true; msgs.push(`发音有误（${accuracy}分）`); }
    }

    // 音素级：低于 40 分时才报错（宽松阈值，避免误判正常口音）
    for (const p of (w.Phonemes || [])) {
      const pAcc = Math.round((p.PronunciationAssessment || {}).AccuracyScore || 0);
      if (pAcc < 40) {
        msgs.push(`音素「${p.Phoneme}」偏差（${pAcc}分）`);
        hasError = true;
      }
    }

    // 平翘舌检测（需要 chars 数据）
    if (queue[text]) {
      const ui        = usedIdx[text] || 0;
      const correctPy = queue[text][ui] ?? queue[text][queue[text].length - 1];
      usedIdx[text]   = ui + 1;
      const correctInit = getInitial(correctPy);

      for (const [retro, flat] of RETRO_PAIRS) {
        if (correctInit !== retro && correctInit !== flat) continue;
        const initPhone = (w.Phonemes || []).find(p => {
          const ph = (p.Phoneme || '').toLowerCase();
          return ph === retro || ph === flat;
        });
        if (initPhone) {
          const recog  = (initPhone.Phoneme || '').toLowerCase();
          const iAcc   = Math.round((initPhone.PronunciationAssessment || {}).AccuracyScore || 0);
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

    // 多字词拆分为单字
    Array.from(text).forEach((ch, i) => {
      wordResults.push({
        content:   ch,
        perrLevel: hasError ? 1 : 0,
        perrMsg:   i === 0 ? msgs.join('；') : ''
      });
    });
  }

  // totalScore 主要用 Azure 的 PronScore；
  // 若解析到字符结果，再与字符正确率混合修正
  let totalScore = pronScore;
  if (wordResults.length > 0) {
    const correct   = wordResults.filter(w => w.perrLevel === 0).length;
    const charRatio = correct / wordResults.length;
    // charRatio 可能因平翘舌检测拉低，限制其权重为 30%
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
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
