/**
 * api/ping.js — 诊断端点（Edge TTS + 腾讯 SOE）
 */
const WebSocket = require('ws');
const crypto    = require('crypto');

const TENCENT_SECRET_ID  = process.env.TENCENT_SECRET_ID;
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const TENCENT_REGION     = process.env.TENCENT_REGION || 'ap-guangzhou';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH = 11644473600;

function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks = ticks * 1e7;
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function testEdgeTts() {
  return new Promise(resolve => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId  = crypto.randomUUID().replace(/-/g, '');
    const gec    = generateSecMsGec();
    const url    = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;
    let done = false;
    let bytes = 0;
    const timer = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch(e) {} resolve({ ok: false, error: 'timeout' }); } }, 10000);
    const ws = new WebSocket(url, {
      headers: {
        'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br, zstd', 'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`
      }
    });
    ws.on('open', () => {
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-96kbitrate-mono-mp3' } } } })}`);
      ws.send(`X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-YunxiNeural'><prosody rate='+0%' pitch='+0%'>你好</prosody></voice></speak>`);
    });
    ws.on('message', (data, isBinary) => {
      if (done) return;
      if (isBinary) { const buf = Buffer.isBuffer(data) ? data : Buffer.from(data); if (buf.length > 2) bytes += buf.length - 2 - buf.readUInt16BE(0); }
      else { if (data.toString().includes('Path:turn.end')) { done = true; clearTimeout(timer); ws.close(); resolve({ ok: true, bytes, engine: 'edge-tts-free' }); } }
    });
    ws.on('error', e => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: e.message }); } });
    ws.on('close', () => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: 'closed early', bytes }); } });
  });
}

function sha256Hex(msg) { return crypto.createHash('sha256').update(msg).digest('hex'); }
function hmacSha256(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }

// 用 STS GetCallerIdentity 验证密钥本身是否有效（不需要任何特定服务权限）
async function testTencentKeys() {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) return { ok: false, error: 'keys not set' };
  try {
    const action = 'GetCallerIdentity';
    const version = '2018-08-13';
    const service = 'sts';
    const host = 'sts.tencentcloudapi.com';
    const payload = '{}';
    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const ct = 'application/json; charset=utf-8';
    const canonicalHeaders = `content-type:${ct}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
    const secretDate = hmacSha256(`TC3${TENCENT_SECRET_KEY}`, date);
    const secretService = hmacSha256(secretDate, service);
    const secretSigning = hmacSha256(secretService, 'tc3_request');
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    const authorization = `TC3-HMAC-SHA256 Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const resp = await fetch(`https://${host}`, {
      method: 'POST',
      headers: { 'Content-Type': ct, 'Host': host, 'X-TC-Action': action,
        'X-TC-Version': version, 'X-TC-Timestamp': String(timestamp), 'Authorization': authorization },
      body: payload
    });
    const data = await resp.json();
    if (data.Response && data.Response.Error) return { ok: false, error: `${data.Response.Error.Code}: ${data.Response.Error.Message}` };
    return { ok: true, accountId: data.Response?.AccountId, arn: data.Response?.Arn };
  } catch(e) { return { ok: false, error: e.message }; }
}

async function testTencentSoe() {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) return { ok: false, error: 'TENCENT_SECRET_ID/KEY not set' };
  try {
    const action = 'TransmitOralProcessWithInit';
    const version = '2018-07-24';
    const service = 'soe';
    const host = 'soe.tencentcloudapi.com';

    // 最小 WAV（静音）
    const pcmLen = 3200; // 0.1秒 16kHz 16bit
    const wav = Buffer.alloc(44 + pcmLen, 0);
    wav.write('RIFF',0); wav.writeUInt32LE(36+pcmLen,4); wav.write('WAVE',8); wav.write('fmt ',12);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(pcmLen,40);

    const payload = JSON.stringify({
      SeqId: 1, IsEnd: 1, VoiceFileType: 2, VoiceEncodeType: 1,
      UserVoiceData: wav.toString('base64'),
      SessionId: crypto.randomUUID(),
      RefText: '你好', WorkMode: 1, EvalMode: 1, ScoreCoeff: 1.0, ServerType: 1, TextMode: 0
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const ct = 'application/json; charset=utf-8';
    const canonicalHeaders = `content-type:${ct}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;
    const credentialScope = `${date}/${service}/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
    const secretDate = hmacSha256(`TC3${TENCENT_SECRET_KEY}`, date);
    const secretService = hmacSha256(secretDate, service);
    const secretSigning = hmacSha256(secretService, 'tc3_request');
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    const authorization = `TC3-HMAC-SHA256 Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // 先不带 Region 试（SOE 是全球服务，Region 可能引发问题）
    const resp = await fetch(`https://${host}`, {
      method: 'POST',
      headers: {
        'Content-Type': ct, 'Host': host,
        'X-TC-Action': action, 'X-TC-Version': version,
        'X-TC-Timestamp': String(timestamp),
        'Authorization': authorization
        // 故意不传 X-TC-Region
      },
      body: payload
    });
    const data = await resp.json();
    if (data.Response && data.Response.Error) {
      // 也试一次带 ServerType:0（旧版服务）
      const payload0 = JSON.stringify({
        SeqId: 1, IsEnd: 1, VoiceFileType: 2, VoiceEncodeType: 1,
        UserVoiceData: wav.toString('base64'),
        SessionId: crypto.randomUUID(),
        RefText: '你好', WorkMode: 1, EvalMode: 1, ScoreCoeff: 1.0, ServerType: 0, TextMode: 0
      });
      const cr0 = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload0)}`;
      const sts0 = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(cr0)}`;
      const sig0 = crypto.createHmac('sha256', secretSigning).update(sts0).digest('hex');
      const auth0 = `TC3-HMAC-SHA256 Credential=${TENCENT_SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${sig0}`;
      const resp0 = await fetch(`https://${host}`, {
        method: 'POST',
        headers: { 'Content-Type': ct, 'Host': host, 'X-TC-Action': action,
          'X-TC-Version': version, 'X-TC-Timestamp': String(timestamp), 'Authorization': auth0 },
        body: payload0
      });
      const data0 = await resp0.json();
      const err0 = data0.Response?.Error ? `${data0.Response.Error.Code}: ${data0.Response.Error.Message}` : null;
      return {
        ok: false,
        errorServerType1: `${data.Response.Error.Code}: ${data.Response.Error.Message}`,
        errorServerType0: err0 || 'ok'
      };
    }
    return { ok: true, engine: 'tencent-soe', suggestedScore: data.Response?.SuggestedScore };
  } catch(e) {
    return { ok: false, error: e.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const [tts, keys, evaluate] = await Promise.all([testEdgeTts(), testTencentKeys(), testTencentSoe()]);
  res.status(200).json({
    tts,
    tencentKeys: keys,
    evaluate: { ...evaluate, region: TENCENT_REGION, keyPresent: !!TENCENT_SECRET_ID }
  });
};
