/**
 * api/ping.js — 诊断端点（Edge TTS + 腾讯 SOE WebSocket）
 */
const WebSocket = require('ws');
const crypto    = require('crypto');

const TENCENT_APP_ID     = process.env.TENCENT_APP_ID;
const TENCENT_SECRET_ID  = process.env.TENCENT_SECRET_ID;
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY;

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

// ── STS 验证密钥有效性 ─────────────────────────────────────────
const https = require('https');
function sha256Hex(msg) { return crypto.createHash('sha256').update(msg).digest('hex'); }
function hmacSha256(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }

function httpsPost(host, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
    const req = https.request({
      hostname: host, path: '/', method: 'POST',
      headers: { ...headers, 'Content-Length': buf.length }
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function buildTc3(service, host, action, version, payload, secretId, secretKey) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const ct = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${ct}\nhost:${host}\n`;
  const signedHeaders = 'content-type;host';
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256Hex(payload)}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;
  const secretDate    = hmacSha256(`TC3${secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    'Content-Type': ct, 'Host': host,
    'X-TC-Action': action, 'X-TC-Version': version,
    'X-TC-Timestamp': String(timestamp), 'Authorization': authorization
  };
}

async function testTencentKeys() {
  if (!TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) return { ok: false, error: 'keys not set' };
  try {
    const host = 'sts.tencentcloudapi.com';
    const payload = '{}';
    const headers = {
      ...buildTc3('sts', host, 'GetCallerIdentity', '2018-08-13', payload, TENCENT_SECRET_ID, TENCENT_SECRET_KEY),
      'X-TC-Region': 'ap-guangzhou'
    };
    const data = await httpsPost(host, headers, payload);
    if (data.Response?.Error) return { ok: false, error: `${data.Response.Error.Code}: ${data.Response.Error.Message}` };
    return { ok: true, accountId: data.Response?.AccountId };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ── 腾讯 SOE WebSocket 诊断（发空白音频，只测连接和签名）──────
async function testTencentSoe() {
  if (!TENCENT_APP_ID || !TENCENT_SECRET_ID || !TENCENT_SECRET_KEY)
    return { ok: false, error: 'TENCENT_APP_ID / keys not set' };

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const expired   = timestamp + 3600;
    const nonce     = Math.floor(Math.random() * 1e8);
    const voiceId   = crypto.randomUUID().replace(/-/g, '');

    // 最小 WAV（44 字节头 + 3200 字节静音 PCM）
    const pcmLen = 3200;
    const wav = Buffer.alloc(44 + pcmLen, 0);
    wav.write('RIFF',0); wav.writeUInt32LE(36+pcmLen,4); wav.write('WAVE',8); wav.write('fmt ',12);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(16000,24); wav.writeUInt32LE(32000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(pcmLen,40);

    const params = {
      eval_mode: '1', expired: String(expired), nonce: String(nonce),
      ref_text: '你好', score_coeff: '1.0', secretid: TENCENT_SECRET_ID,
      server_engine_type: '16k_zh', text_mode: '0', timestamp: String(timestamp),
      voice_format: '2', voice_id: voiceId,
    };
    const sortedKeys = Object.keys(params).sort();
    const queryForSign = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
    const strToSign = `soe.cloud.tencent.com/soe/api/${TENCENT_APP_ID}?${queryForSign}`;
    const signature = crypto.createHmac('sha1', TENCENT_SECRET_KEY).update(strToSign).digest('base64');
    const urlQuery = sortedKeys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
    const url = `wss://soe.cloud.tencent.com/soe/api/${TENCENT_APP_ID}?${urlQuery}&signature=${encodeURIComponent(signature)}`;

    return await new Promise(resolve => {
      const ws = new WebSocket(url);
      let done = false;
      const fin = (result) => { if (!done) { done = true; clearTimeout(timer); try { ws.close(); } catch(_) {} resolve(result); } };
      const timer = setTimeout(() => fin({ ok: false, error: 'timeout (15s)' }), 15000);

      ws.on('open', () => {
        ws.send(wav);
        ws.send(JSON.stringify({ voice_id: voiceId, seq: 0, is_end: 1 }));
      });
      ws.on('message', data => {
        if (done) return;
        try {
          const msg = JSON.parse(data.toString());
          const code = msg.code ?? msg.Code;
          if (code !== undefined && code !== 0) {
            fin({ ok: false, error: `code=${code} ${msg.message || msg.Message || ''}` });
          } else {
            const r = msg.result || msg.Result || msg;
            fin({ ok: true, engine: 'tencent-soe-ws', suggestedScore: r.SuggestedScore, code });
          }
        } catch(e) { /* ignore non-JSON */ }
      });
      ws.on('error', e => fin({ ok: false, error: e.message }));
      ws.on('close', (code, reason) => fin({ ok: false, error: `closed: ${code} ${reason}` }));
    });
  } catch(e) { return { ok: false, error: e.message }; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const [tts, keys, evaluate] = await Promise.all([testEdgeTts(), testTencentKeys(), testTencentSoe()]);
  res.status(200).json({
    tts,
    tencentKeys: keys,
    evaluate: { ...evaluate, appIdPresent: !!TENCENT_APP_ID, keyPresent: !!TENCENT_SECRET_ID }
  });
};
