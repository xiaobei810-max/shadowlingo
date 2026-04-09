/**
 * api/ping.js — 诊断端点
 * TTS: Edge TTS (免费)
 * Evaluate: Azure Speech (仍需 key，后续会迁移到腾讯云)
 */
const WebSocket = require('ws');
const crypto    = require('crypto');

const AZURE_KEY    = process.env.AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastasia';
const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

function testEdgeTts() {
  return new Promise(resolve => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId  = crypto.randomUUID().replace(/-/g, '');
    const url    = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}&ConnectionId=${connId}`;
    let done = false;
    let bytes = 0;
    const timer = setTimeout(() => { if (!done) { done = true; ws.close(); resolve({ ok: false, error: 'timeout' }); } }, 10000);

    const ws = new WebSocket(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold' }
    });

    ws.on('open', () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-96kbitrate-mono-mp3' } } } })}`);
      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-YunxiNeural'><prosody rate='+0%' pitch='+0%'>你好</prosody></voice></speak>`);
    });

    ws.on('message', (data, isBinary) => {
      if (done) return;
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length > 2) bytes += buf.length - 2 - buf.readUInt16BE(0);
      } else {
        if (data.toString().includes('Path:turn.end')) {
          done = true; clearTimeout(timer); ws.close();
          resolve({ ok: true, bytes, engine: 'edge-tts-free' });
        }
      }
    });
    ws.on('error', e => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: e.message }); } });
    ws.on('close', () => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: 'closed early', bytes }); } });
  });
}

function testAzureStt() {
  const https = require('https');
  return new Promise(resolve => {
    if (!AZURE_KEY) { resolve({ ok: false, error: 'AZURE_SPEECH_KEY not set (needed for evaluate only)' }); return; }
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
          : resolve({ ok: false, status: res.statusCode, body: body.slice(0, 200) });
      });
    });
    req.on('error', e => resolve({ ok: false, error: e.message }));
    req.write(wav); req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const [tts, evaluate] = await Promise.all([testEdgeTts(), testAzureStt()]);
  res.status(200).json({
    tts:      { engine: 'edge-tts (free)', ...tts },
    evaluate: { engine: 'azure (will migrate to tencent)', region: AZURE_REGION, keyPresent: !!AZURE_KEY, ...evaluate }
  });
};
