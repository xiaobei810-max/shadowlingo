/**
 * api/tts.js — 语音合成（Edge TTS 免费 WebSocket，替代过期的 Azure）
 *
 * 支持角色：
 *   local   → 明轩（中文男声，zh-CN-YunxiNeural）
 *   learner → Nora（带外国口音的女声，en-US-AvaMultilingualNeural 读中文）
 *   linyue  → 林欣悦（中文女声，zh-CN-XiaoxiaoNeural）
 *   qiqi    → 夏七七（活力大学生女声，zh-CN-XiaochenNeural，语速 +5%）
 */

const WebSocket = require('ws');
const crypto    = require('crypto');

// ── Edge TTS 鉴权常量 ────────────────────────────────────────────
const TRUSTED_CLIENT_TOKEN  = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_FULL_VERSION = '143.0.3650.75';
const CHROMIUM_MAJOR        = CHROMIUM_FULL_VERSION.split('.')[0];
const SEC_MS_GEC_VERSION    = `1-${CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH             = 11644473600; // 1601→1970 秒偏移

function generateSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;   // 先在秒级对齐到 5 分钟
  ticks = ticks * 1e7;    // 再转换为 100ns 单位
  const str = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
  return crypto.createHash('sha256').update(str, 'ascii').digest('hex').toUpperCase();
}

// ── 角色 → 声音配置 ─────────────────────────────────────────────
const VOICES = {
  // 明轩：中文男声，稳重亲切
  local: {
    name:      'zh-CN-YunxiNeural',
    lang:      'zh-CN',
    rateScale: 1.02,
    pitchAdj:  '+2%',
  },
  // Nora：英语多语言女声读中文 → 带外国口音
  learner: {
    name:      'en-US-AvaMultilingualNeural',
    lang:      'zh-CN',
    rateScale: 0.82,
    pitchAdj:  '+6%',
  },
  // 林欣悦：中文女声，清脆亲切
  linyue: {
    name:      'zh-CN-XiaoxiaoNeural',
    lang:      'zh-CN',
    rateScale: 1.0,
    pitchAdj:  '+4%',
  },
  // 夏七七：活力大学生女声 — 与林欣悦同基底（XiaoxiaoNeural，Edge TTS 稳定支持），
  // 通过 +8% 语速 + +5% 音高让七七听起来更年轻活泼，避免"声音不响"问题
  qiqi: {
    name:      'zh-CN-XiaoxiaoNeural',
    lang:      'zh-CN',
    rateScale: 1.08,
    pitchAdj:  '+5%',
  },
  // 收银员等一次性 NPC：YunyangNeural — 标准男播音腔，与明轩（YunxiNeural）明显区分
  cashier: {
    name:      'zh-CN-YunyangNeural',
    lang:      'zh-CN',
    rateScale: 1.0,
    pitchAdj:  '0%',
  },
  // 大卫：英语母语男声读中文 → 带外国口音，与 Nora 同技术路线
  david: {
    name:      'en-US-AndrewMultilingualNeural',
    lang:      'zh-CN',
    rateScale: 0.88,
    pitchAdj:  '+3%',
  },
  // 咖啡馆店员：YunjianNeural — 清亮年轻男声，与明轩(YunxiNeural)/收银员(YunyangNeural)
  // 区分明显，适合咖啡馆这种节奏快、服务感强的场景
  cafestaff: {
    name:      'zh-CN-YunjianNeural',
    lang:      'zh-CN',
    rateScale: 1.0,
    pitchAdj:  '0%',
  },
  // 咖啡馆店员（快语速变体）— 与 cafestaff 同声音演员，但语速更快，
  // 用于 L12「点单卡壳」场景：店员连珠炮发问，让学员体验真实世界的反应压力
  cafestaff_fast: {
    name:      'zh-CN-YunjianNeural',
    lang:      'zh-CN',
    rateScale: 1.13,
    pitchAdj:  '+2%',
  },
  // 林晚：YunhaoNeural — 成熟有力的男声，"极简主义" 计算机学神人设
  // 语速略慢、音调自然低沉，营造"克制 / 冷静 / 一句一个重点" 的气质
  linwan: {
    name:      'zh-CN-YunhaoNeural',
    lang:      'zh-CN',
    rateScale: 0.93,
    pitchAdj:  '0%',
  },
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function buildSSML(text, role, rate) {
  const v        = VOICES[role] || VOICES.local;
  const finalRate = `${Math.round(((rate || 1.0) * v.rateScale - 1) * 100)}%`;
  const escaped  = escapeXml(text);
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${v.lang}'>` +
         `<voice name='${v.name}'>` +
         `<prosody rate='${finalRate}' pitch='${v.pitchAdj}'>${escaped}</prosody>` +
         `</voice></speak>`;
}

// ── Edge TTS WebSocket 合成 ──────────────────────────────────────
function synthesize(ssml) {
  return new Promise((resolve, reject) => {
    const connId = crypto.randomUUID().replace(/-/g, '');
    const reqId  = crypto.randomUUID().replace(/-/g, '');
    const gec    = generateSecMsGec();
    const url    = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
                   `?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
                   `&Sec-MS-GEC=${gec}` +
                   `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
                   `&ConnectionId=${connId}`;

    const ws     = new WebSocket(url, {
      headers: {
        'Pragma':           'no-cache',
        'Cache-Control':    'no-cache',
        'Origin':           'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent':       `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
                            `(KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR}.0.0.0 Safari/537.36 ` +
                            `Edg/${CHROMIUM_MAJOR}.0.0.0`,
        'Accept-Encoding':  'gzip, deflate, br, zstd',
        'Accept-Language':  'zh-CN,zh;q=0.9,en;q=0.8',
        'Cookie':           `muid=${crypto.randomBytes(16).toString('hex').toUpperCase()};`,
      }
    });

    const chunks = [];
    let done     = false;

    const finish = (err, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}
      err ? reject(err) : resolve(data);
    };

    const timer = setTimeout(
      () => finish(new Error('Edge TTS timeout')), 15000
    );

    ws.on('open', () => {
      // 1) speech.config
      ws.send(
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
          outputFormat: 'audio-24khz-96kbitrate-mono-mp3'
        }}}})
      );
      // 2) SSML
      ws.send(
        `X-RequestId:${reqId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`
      );
    });

    ws.on('message', (data, isBinary) => {
      if (done) return;
      if (isBinary) {
        // 每帧头部 2 字节是元数据长度，跳过
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        if (buf.length > 2) {
          const headerLen = buf.readUInt16BE(0);
          chunks.push(buf.slice(2 + headerLen));
        }
      } else {
        const text = data.toString();
        if (text.includes('Path:turn.end')) {
          finish(null, Buffer.concat(chunks));
        }
      }
    });

    ws.on('error', (err) => finish(err));
    ws.on('close', () => {
      if (!done) {
        if (chunks.length > 0) finish(null, Buffer.concat(chunks));
        else finish(new Error('Edge TTS closed early'));
      }
    });
  });
}

// ── Vercel Serverless 入口 ───────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).end();

  let body = '';
  await new Promise(resolve => { req.on('data', c => body += c); req.on('end', resolve); });
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { return res.status(400).json({ error: 'bad json' }); }

  const { text: rawText, role, rate } = parsed;
  const text = rawText != null ? String(rawText).trim() : '';
  if (!text) return res.status(400).json({ error: 'text required' });

  const ssml = buildSSML(text, role || 'local', rate || 1.0);
  console.log('[TTS] role=%s rate=%s text=%s', role, rate, text.slice(0, 50));

  try {
    const mp3 = await synthesize(ssml);
    console.log('[TTS] 合成完成，字节数:', mp3.length);
    res.setHeader('Content-Type',  'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(mp3);
  } catch (err) {
    console.error('[TTS] 合成失败:', err.message);
    res.status(502).json({ error: err.message });
  }
};
