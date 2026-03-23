const https = require('https');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';

// Voice config per role
const VOICES = {
  // ── Nora（诺拉）：美国女留学生，HSK2-3，外国口音明显，语速较慢
  // en-US-AvaMultilingualNeural 跨语言合成：用英语引擎读中文 → 外国口音
  // rateScale 0.82：刻意放慢，模拟非母语者逐字斟酌的节奏
  learner: {
    name:       'en-US-AvaMultilingualNeural',
    xmlLang:    'en-US',
    crossLang:  'zh-CN',
    style:      null,
    rateScale:  0.82,      // 明显慢于母语者，非母语感
    pitchAdj:   '+6%'      // 音调偏高，外国口音特征
  },
  // ── 赵明轩：阳光学长，地道普通话，语速自然（不快）
  local: {
    name:      'zh-CN-YunxiNeural',
    xmlLang:   'zh-CN',
    style:     'chat',     // 轻松聊天风格
    rateScale:  1.02,      // 接近正常语速，不刻意加快
    pitchAdj:  '+2%'
  },
  // ── 大卫（David）：保留卢克声音，美国男生，留作后续角色
  david: {
    name:       'en-US-AndrewMultilingualNeural',
    xmlLang:    'en-US',
    crossLang:  'zh-CN',
    style:      null,
    rateScale:  0.95,
    pitchAdj:   '+8%'
  },
  // ── 夏七七（Xia Qiqi）：清脆亲切女声，后续角色
  xiaqiqi: {
    name:     'zh-CN-XiaoxiaoNeural',
    xmlLang:  'zh-CN',
    style:    'customerservice',
    rateScale: 1.05,
    pitchAdj: '+5%'
  }
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSSML(text, role, rate) {
  const v = VOICES[role] || VOICES.local;
  const finalRate = ((rate || 1.0) * v.rateScale).toFixed(2);
  const escaped = escapeXml(text);

  let prosody;
  if (v.crossLang) {
    // 跨语言合成：用英语发音引擎读中文，产生外国口音（必须用 mstts:lang）
    prosody = `<mstts:lang xml:lang="${v.crossLang}">` +
      `<prosody rate="${finalRate}" pitch="${v.pitchAdj}">${escaped}</prosody>` +
      `</mstts:lang>`;
  } else if (v.style) {
    prosody = `<mstts:express-as style="${v.style}">` +
      `<prosody rate="${finalRate}" pitch="${v.pitchAdj}">${escaped}</prosody>` +
      `</mstts:express-as>`;
  } else {
    prosody = `<prosody rate="${finalRate}" pitch="${v.pitchAdj}">${escaped}</prosody>`;
  }

  return `<speak version='1.0' ` +
    `xmlns='http://www.w3.org/2001/10/synthesis' ` +
    `xmlns:mstts='https://www.w3.org/2001/mstts' ` +
    `xml:lang='${v.xmlLang}'>` +
    `<voice name='${v.name}'>${prosody}</voice>` +
    `</speak>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let parsed;
  try { parsed = JSON.parse(body); } catch { res.status(400).json({ error: 'bad json' }); return; }

  const { text, role, rate } = parsed;
  if (!text) { res.status(400).json({ error: 'text required' }); return; }
  if (!AZURE_KEY) { res.status(500).json({ error: 'TTS not configured' }); return; }

  const ssml = buildSSML(text, role || 'local', rate || 1.0);
  const ssmlBuf = Buffer.from(ssml, 'utf8');

  const options = {
    hostname: `${AZURE_REGION}.tts.speech.microsoft.com`,
    path:     '/cognitiveservices/v1',
    method:   'POST',
    headers:  {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type':              'application/ssml+xml',
      'X-Microsoft-OutputFormat':  'audio-24khz-96kbitrate-mono-mp3',
      'User-Agent':                'ShadowLingo/1.0',
      'Content-Length':            ssmlBuf.length
    }
  };

  const chunks = [];
  try {
    await new Promise((resolve, reject) => {
      const azReq = https.request(options, azRes => {
        if (azRes.statusCode !== 200) {
          reject(new Error(`Azure TTS ${azRes.statusCode}`));
          return;
        }
        azRes.on('data', c => chunks.push(c));
        azRes.on('end', resolve);
      });
      azReq.on('error', reject);
      azReq.write(ssmlBuf);
      azReq.end();
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
    return;
  }

  const mp3 = Buffer.concat(chunks);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(mp3);
};
