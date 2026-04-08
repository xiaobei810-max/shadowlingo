const https = require('https');
const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';

function testTts() {
  return new Promise(resolve => {
    if (!AZURE_KEY) { resolve({ ok: false, error: 'AZURE_SPEECH_KEY not set' }); return; }
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-YunxiNeural'>你好</voice></speak>`;
    const buf  = Buffer.from(ssml, 'utf8');
    const req  = https.request({
      hostname: `${AZURE_REGION}.tts.speech.microsoft.com`,
      path: '/cognitiveservices/v1', method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3', 'User-Agent': 'ShadowLingo/ping', 'Content-Length': buf.length }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        res.statusCode === 200
          ? resolve({ ok: true, bytes: body.length })
          : resolve({ ok: false, status: res.statusCode, body: body.toString('utf-8').slice(0, 400) });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(buf); req.end();
  });
}

function testStt() {
  return new Promise(resolve => {
    if (!AZURE_KEY) { resolve({ ok: false, error: 'AZURE_SPEECH_KEY not set' }); return; }
    const pcmLen = 1600;
    const wav = Buffer.alloc(44 + pcmLen, 0);
    wav.write('RIFF',0); wav.writeUInt32LE(36+pcmLen,4); wav.write('WAVE',8); wav.write('fmt ',12);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(pcmLen,40);
    const req = https.request({
      hostname: `${AZURE_REGION}.stt.speech.microsoft.com`,
      path: '/speech/recognition/conversation/cognitiveservices/v1?language=zh-CN', method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': AZURE_KEY, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', 'Content-Length': wav.length }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        res.statusCode === 200
          ? resolve({ ok: true, body: body.slice(0, 200) })
          : resolve({ ok: false, status: res.statusCode, body: body.slice(0, 400) });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(wav); req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const [tts, stt] = await Promise.all([testTts(), testStt()]);
  res.status(200).json({ region: AZURE_REGION, keyPresent: !!AZURE_KEY, keyPrefix: AZURE_KEY ? AZURE_KEY.slice(0,4)+'...' : null, tts, stt });
};
