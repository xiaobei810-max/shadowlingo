const https = require('https');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';

// Voice config per role
const VOICES = {
  local: {
    name:  'zh-CN-XiaoxiaoNeural',
    style: 'customerservice',   // 清晰标准，服务员腔
    rateScale: 1.05,
    pitchAdj: '+5%'
  },
  learner: {
    name:  'zh-CN-YunxiNeural',
    style: 'cheerful',          // 阳光活泼
    rateScale: 0.95,
    pitchAdj: '+8%'
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
  const inner = `<mstts:express-as style="${v.style}">` +
    `<prosody rate="${finalRate}" pitch="${v.pitchAdj}">${escapeXml(text)}</prosody>` +
    `</mstts:express-as>`;
  return `<speak version='1.0' ` +
    `xmlns='http://www.w3.org/2001/10/synthesis' ` +
    `xmlns:mstts='https://www.w3.org/2001/mstts' ` +
    `xml:lang='zh-CN'>` +
    `<voice name='${v.name}'>${inner}</voice>` +
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
