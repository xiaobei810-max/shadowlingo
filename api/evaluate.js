const https = require('https');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';

// ── PCM → WAV（添加 44 字节 RIFF 头）────────────────────────────
function pcmToWav(pcmBuf) {
  const wav = Buffer.alloc(44 + pcmBuf.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcmBuf.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);      // PCM chunk size
  wav.writeUInt16LE(1,  20);      // format: PCM
  wav.writeUInt16LE(1,  22);      // channels: mono
  wav.writeUInt32LE(16000, 24);   // sample rate
  wav.writeUInt32LE(32000, 28);   // byte rate
  wav.writeUInt16LE(2,  32);      // block align
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

    // Pronunciation-Assessment 配置（base64 编码）
    const cfg = Buffer.from(JSON.stringify({
      ReferenceText:           refText,
      GradingSystem:           'HundredMark',
      Granularity:             'Phoneme',    // word + phoneme 双层评分
      Dimension:               'Comprehensive', // 含 Fluency / Prosody
      EnableMiscue:            true,         // 检测漏读/多读
      EnableProsodyAssessment: true          // 声调/语调评测
    })).toString('base64');

    const options = {
      hostname: `${AZURE_REGION}.stt.speech.microsoft.com`,
      path:     '/speech/recognition/conversation/cognitiveservices/v1' +
                '?language=zh-CN&format=detailed',
      method:   'POST',
      headers:  {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type':              'audio/wav; codecs=audio/pcm; samplerate=16000',
        'Pronunciation-Assessment':  cfg,
        'Content-Length':            wavBuf.length
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        console.log('[Azure] HTTP', res.statusCode, raw.slice(0, 400));
        if (res.statusCode !== 200)
          return reject(new Error(`Azure HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(JSON.parse(raw)); }
        catch(e) { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
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

// ── 解析 Azure 响应 + 平翘舌检测 ────────────────────────────────
function parseAzureResult(resp, chars) {
  console.log('[Azure] 完整响应:', JSON.stringify(resp).slice(0, 800));

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    console.error('[Azure] 无 NBest，RecognitionStatus:', resp.RecognitionStatus);
    return { totalScore: 0, wordResults: [] };
  }

  const pa           = nbest.PronunciationAssessment || {};
  const overallPron  = Math.round(pa.PronScore || pa.AccuracyScore || 0);
  const prosody      = nbest.ProsodyAssessment || {};
  console.log('[Azure] 整体评分 PronScore:', overallPron,
    'Accuracy:', pa.AccuracyScore, 'Fluency:', pa.FluencyScore,
    'Prosody PitchScore:', prosody.PitchScore);

  // 正确拼音队列
  const queue = {}, usedIdx = {};
  (chars || []).forEach(({ c, p }) => (queue[c] = queue[c] || []).push(p));

  const wordResults = [];

  for (const w of (nbest.Words || [])) {
    const text    = w.Word || '';
    const wpa     = w.PronunciationAssessment || {};
    const accuracy = Math.round(wpa.AccuracyScore  || 0);
    const errType  = wpa.ErrorType || 'None';        // None / Omission / Insertion / Mispronunciation
    const toneScore = Math.round(wpa.ToneScore || 0); // 声调分（部分区域支持）

    const msgs = [];
    let hasError = false;

    // 错误类型
    if (errType === 'Omission') {
      msgs.push('漏读'); hasError = true;
    } else if (errType === 'Insertion') {
      msgs.push('多读'); hasError = true;
    } else if (errType === 'Mispronunciation') {
      hasError = true;
    }

    // 声调评分
    if (toneScore > 0 && toneScore < 70) {
      msgs.push(`声调偏差（${toneScore}分）`); hasError = true;
    }

    // 音素级评分（声母/韵母）
    const phonemes = w.Phonemes || [];
    console.log(`[Azure] word="${text}" accuracy=${accuracy} errType=${errType}`,
      phonemes.map(p => `${p.Phoneme}=${Math.round((p.PronunciationAssessment||{}).AccuracyScore||0)}`).join(' '));

    const badPhones = phonemes.filter(p =>
      Math.round((p.PronunciationAssessment || {}).AccuracyScore || 0) < 60
    );
    for (const p of badPhones) {
      const sc = Math.round((p.PronunciationAssessment || {}).AccuracyScore || 0);
      msgs.push(`音素「${p.Phoneme}」发音偏差（${sc}分）`);
      hasError = true;
    }

    // 整体准确度过低
    if (!hasError && accuracy < 75) {
      msgs.push(`准确度偏低（${accuracy}分）`); hasError = true;
    }

    // ── 平翘舌检测：chars 正确声母 vs Azure 识别声母 ────────────
    if (queue[text]) {
      const ui        = usedIdx[text] || 0;
      const correctPy = queue[text][ui] ?? queue[text][queue[text].length - 1];
      usedIdx[text]   = ui + 1;
      const correctInit = getInitial(correctPy);

      for (const [retro, flat] of RETRO_PAIRS) {
        if (correctInit !== retro && correctInit !== flat) continue;

        // 从 Azure phonemes 找出声母对应的音素
        const initPhone = phonemes.find(p => {
          const ph = (p.Phoneme || '').toLowerCase();
          return ph === retro || ph === flat;
        });

        if (initPhone) {
          const initAcc    = Math.round((initPhone.PronunciationAssessment || {}).AccuracyScore || 0);
          const recogPhone = (initPhone.Phoneme || '').toLowerCase();

          // 如果识别出的音素与正确声母不一致（平翘舌互换）
          if ((correctInit === retro && recogPhone === flat) ||
              (correctInit === flat  && recogPhone === retro)) {
            msgs.push(`平翘舌混淆：应读【${correctInit}】实读【${recogPhone}】（${correctPy}）`);
            hasError = true;
          } else if (initAcc < 60) {
            // 声母准确度低但未直接混淆
            msgs.push(`声母「${correctInit}」发音不准（${initAcc}分）`);
            hasError = true;
          }
        }
      }
    }

    // 多字词拆分为单字（Chinese word segmentation）
    const chars2 = Array.from(text);
    chars2.forEach((ch, i) => {
      wordResults.push({
        content:   ch,
        perrLevel: hasError ? 1 : 0,
        perrMsg:   i === 0 ? msgs.join('；') : ''   // 问题描述只挂在第一个字上
      });
    });
  }

  // 总分：以正确字数/总字数为主，参考 Azure PronScore
  const correct    = wordResults.filter(w => w.perrLevel === 0).length;
  const charScore  = wordResults.length > 0
    ? Math.round(correct / wordResults.length * 100) : 0;
  // 两者取均值，避免全靠字数导致分数偏极端
  const totalScore = wordResults.length > 0
    ? Math.round((charScore + overallPron) / 2) : overallPron;

  console.log(`[Azure] 汇总 总字:${wordResults.length} 正确:${correct} 字符分:${charScore} Azure总分:${overallPron} 最终:${totalScore}`);
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
    console.error('[evaluate] error:', err);
    res.status(500).json({ error: err.message });
  }
};
