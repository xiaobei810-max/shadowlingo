/**
 * api/tts.js — Edge TTS (免费，无需 API Key)
 *
 * 接口契约与原 Azure 版 100% 一致：
 *   POST { text, role?, rate? }  →  audio/mpeg binary
 *
 * 协议参考：https://github.com/rany2/edge-tts (constants.py + drm.py)
 */

const WebSocket = require('ws');
const crypto    = require('crypto');

// ── 声音配置（与原 Azure 版完全一致）──────────────────────
const VOICES = {
  learner: { name: 'en-US-AvaMultilingualNeural', rateScale: 0.82, pitchAdj: '+6%' },
  local:   { name: 'zh-CN-YunxiNeural',           rateScale: 1.02, pitchAdj: '+2%' },
  david:   { name: 'en-US-AndrewMultilingualNeural', rateScale: 0.95, pitchAdj: '+8%' },
  xiaqiqi: { name: 'zh-CN-XiaoxiaoNeural',        rateScale: 1.05, pitchAdj: '+5%' }
};

// ── Edge TTS 协议常量（与 edge-tts Python 库 constants.py 保持一致）────
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`;
const WSS_BASE = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

// Windows file time epoch: seconds from 1601-01-01 to 1970-01-01
const WIN_EPOCH = 11644473600;

/**
 * 生成 Sec-MS-GEC token（与 edge-tts Python 库 drm.py 算法完全一致）
 */
function generateSecMsGec() {
  // 1. 当前 Unix 时间（秒）
  let ticks = Math.floor(Date.now() / 1000);
  // 2. 转换为 Windows file time epoch（秒）
  ticks += WIN_EPOCH;
  // 3. 取整到最近的 5 分钟（300 秒）
  ticks -= ticks % 300;
  // 4. 转换为 100 纳秒间隔（Windows file time 格式）
  ticks = ticks * 1e7;
  // 5. 拼接 token 并 SHA256
  const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function uuid() {
  return crypto.randomUUID().replace(/-/g, '');
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rateToStr(r) {
  const pct = Math.round((r - 1) * 100);
  return (pct >= 0 ? '+' : '') + pct + '%';
}

function buildSSML(text, voice, rate) {
  const finalRate = (rate || 1.0) * voice.rateScale;
  const escaped   = escapeXml(text);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${voice.name}'>` +
    `<prosody rate='${rateToStr(finalRate)}' pitch='${voice.pitchAdj}'>${escaped}</prosody>` +
    `</voice></speak>`;
}

/**
 * 通过 Edge TTS WebSocket 合成语音，返回 MP3 Buffer
 */
function synthesize(ssml, timeoutMs) {
  return new Promise((resolve, reject) => {
    const connId    = uuid();
    const requestId = uuid();
    const gec       = generateSecMsGec();
    const url       = `${WSS_BASE}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}&ConnectionId=${connId}`;

    const ws = new WebSocket(url, {
      headers: {
        'Pragma':        'no-cache',
        'Cache-Control': 'no-cache',
        'Origin':        'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent':    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Accept-Language':  'en-US,en;q=0.9',
        'Cookie':        `muid=${generateMuid()};`
      }
    });

    const audioChunks = [];
    let done = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; ws.close(); reject(new Error('Edge TTS timeout')); }
    }, timeoutMs || 15000);

    ws.on('open', () => {
      // 1) speech.config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
                outputFormat: OUTPUT_FORMAT
              }
            }
          }
        })
      );
      // 2) SSML
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on('message', (data, isBinary) => {
      if (done) return;
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const headerLen  = buf.readUInt16BE(0);
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) {
          audioChunks.push(buf.slice(audioStart));
        }
      } else {
        const msg = data.toString();
        if (msg.includes('Path:turn.end')) {
          done = true;
          clearTimeout(timer);
          ws.close();
          resolve(Buffer.concat(audioChunks));
        }
      }
    });

    ws.on('error', (err) => {
      if (!done) { done = true; clearTimeout(timer); reject(err); }
    });

    ws.on('close', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        audioChunks.length > 0
          ? resolve(Buffer.concat(audioChunks))
          : reject(new Error('Edge TTS connection closed without audio'));
      }
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') { res.status(405).end(); return; }

  // 解析请求体（兼容 Vercel 自动解析和原始流）
  let parsed = req.body;
  if (!parsed || typeof parsed !== 'object' || Buffer.isBuffer(parsed)) {
    let raw = '';
    await new Promise(resolve => { req.on('data', c => raw += c); req.on('end', resolve); });
    try { parsed = JSON.parse(raw); }
    catch { return res.status(400).json({ error: 'bad json' }); }
  }

  const { text, role, rate } = parsed;
  if (!text) { return res.status(400).json({ error: 'text required' }); }

  const voice = VOICES[role] || VOICES.local;
  const ssml  = buildSSML(text, voice, rate || 1.0);

  try {
    const mp3 = await synthesize(ssml, 15000);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(mp3);
  } catch (err) {
    console.error('Edge TTS error:', err.message);
    res.status(502).json({ error: 'TTS synthesis failed: ' + err.message });
  }
};
