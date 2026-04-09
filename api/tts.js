/**
 * api/tts.js — Edge TTS (免费，无需 API Key)
 *
 * 接口契约与原 Azure 版 100% 一致：
 *   POST { text, role?, rate? }  →  audio/mpeg binary
 *
 * 使用 Edge Read-Aloud WebSocket 协议，支持同样的微软语音名称。
 */

const WebSocket = require('ws');
const crypto    = require('crypto');

// ── 声音配置（与原 Azure 版完全一致）──────────────────────
const VOICES = {
  learner: {
    name:      'en-US-AvaMultilingualNeural',
    rateScale:  0.82,
    pitchAdj:   '+6%'
  },
  local: {
    name:      'zh-CN-YunxiNeural',
    rateScale:  1.02,
    pitchAdj:   '+2%'
  },
  david: {
    name:      'en-US-AndrewMultilingualNeural',
    rateScale:  0.95,
    pitchAdj:   '+8%'
  },
  xiaqiqi: {
    name:      'zh-CN-XiaoxiaoNeural',
    rateScale:  1.05,
    pitchAdj:   '+5%'
  }
};

const TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_TOKEN}`;
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';

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
  // Edge TTS 的 rate 格式："+0%", "+50%", "-20%" 等
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
    const url       = `${WSS_URL}&ConnectionId=${connId}`;

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent':  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
        'Origin':      'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold'
      }
    });

    const audioChunks = [];
    let   done        = false;
    const timer = setTimeout(() => {
      if (!done) { done = true; ws.close(); reject(new Error('Edge TTS timeout')); }
    }, timeoutMs || 15000);

    ws.on('open', () => {
      // 1) 发送 speech.config
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

      // 2) 发送 SSML
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on('message', (data, isBinary) => {
      if (done) return;

      if (isBinary) {
        // 二进制消息：前 2 字节 = header 长度 (big-endian)，之后是 header 文本，再之后是音频数据
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length < 2) return;
        const headerLen = buf.readUInt16BE(0);
        const audioStart = 2 + headerLen;
        if (audioStart < buf.length) {
          audioChunks.push(buf.slice(audioStart));
        }
      } else {
        // 文本消息：检查 turn.end 表示合成结束
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
        if (audioChunks.length > 0) {
          resolve(Buffer.concat(audioChunks));
        } else {
          reject(new Error('Edge TTS connection closed without audio'));
        }
      }
    });
  });
}

module.exports = async function handler(req, res) {
  // CORS
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
