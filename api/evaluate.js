const crypto    = require('crypto');
const WebSocket = require('ws');

const ISE_APPID  = '7ade157c';
const ISE_APIKEY = 'f86ec1542086fe08b998712a2f439cde';
const ISE_SECRET = 'NmY1N2Q0MmI0ZmJkNzJkOWE0MDBhOTc5';

// ── 鉴权 URL ────────────────────────────────────────────────────
function buildIseUrl() {
  const host   = 'ise-api.xfyun.cn';
  const path   = '/v2/open-ise';
  const date   = new Date().toUTCString();
  const origin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
  const sig    = crypto.createHmac('sha256', ISE_SECRET).update(origin).digest('base64');
  const auth   = Buffer.from(
    `api_key="${ISE_APIKEY}", algorithm="hmac-sha256", headers="host date request-line", signature="${sig}"`
  ).toString('base64');
  return `wss://${host}${path}?authorization=${encodeURIComponent(auth)}&date=${encodeURIComponent(date)}&host=${encodeURIComponent(host)}`;
}

// ── XML 属性读取（不引入外部解析器）──────────────────────────────
function attr(str, name) {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(str);
  return m ? m[1] : '';
}

// ── dp_message 位字段解码 ────────────────────────────────────────
function decodeDp(dp) {
  if (!dp) return '';
  const errs = [];
  if (dp & 64) errs.push('声调');
  if (dp & 16) errs.push('声母');
  if (dp & 32) errs.push('韵母');
  if (dp & 8)  errs.push('发音');
  if (dp & 1)  errs.push('读音替换');
  if (dp & 2)  errs.push('漏读');
  if (dp & 4)  errs.push('多读');
  return errs.join('/');
}

// ── 提取拼音声母 ─────────────────────────────────────────────────
function getInitial(py) {
  py = py.toLowerCase().replace(/\d/g, '').trim();
  for (const two of ['zh', 'ch', 'sh']) {
    if (py.startsWith(two)) return two;
  }
  for (const one of 'b p m f d t n l g k h j q x r z c s y w'.split(' ')) {
    if (py.startsWith(one)) return one;
  }
  return '';
}

const RETRO_PAIRS = [['zh', 'z'], ['ch', 'c'], ['sh', 's']];

// ── 解析 ISE XML + 平翘舌检测 ────────────────────────────────────
function parseXml(xmlStr, chars) {
  console.log('[ISE] 完整XML:\n', xmlStr);

  // 构建正确拼音队列（同字按出现顺序匹配）
  const queue = {}, usedIdx = {};
  (chars || []).forEach(({ c, p }) => {
    (queue[c] = queue[c] || []).push(p);
  });

  const wordResults = [];
  const wordRe = /<word([^>]*)>([\s\S]*?)<\/word>/gi;
  let wm;

  while ((wm = wordRe.exec(xmlStr)) !== null) {
    const wAttrs   = wm[1];
    const wInner   = wm[2];
    const content  = attr(wAttrs, 'content');
    const perrLv   = parseInt(attr(wAttrs, 'perr_level_msg') || '0', 10);
    const wordDp   = parseInt(attr(wAttrs, 'dp_message')     || '0', 10);
    const wordPErr = attr(wAttrs, 'perr_msg');

    const msgs      = [];
    const phoneMsgs = [];
    let   syllSymbol = '';

    // ── syll 解析 ─────────────────────────────────────────────
    const syllRe = /<syll([^>]*)>([\s\S]*?)<\/syll>/gi;
    let sm, firstSyll = true;
    while ((sm = syllRe.exec(wInner)) !== null) {
      const sAttrs = sm[1];
      const sInner = sm[2];
      const sym    = attr(sAttrs, 'symbol') || attr(sAttrs, 'content');
      const syllDp = parseInt(attr(sAttrs, 'dp_message') || '0', 10);
      const sPErr  = attr(sAttrs, 'perr_msg');

      if (firstSyll) { syllSymbol = sym.toLowerCase(); firstSyll = false; }

      // ── phone 解析（最细粒度）────────────────────────────────
      const phoneRe = /<phone([^>]*?)\s*\/?>/gi;
      let pm, hasPhoneErr = false;
      while ((pm = phoneRe.exec(sInner)) !== null) {
        const pAttrs   = pm[1];
        const pContent = attr(pAttrs, 'content');
        const pDp      = parseInt(attr(pAttrs, 'dp_message') || '0', 10);
        const pPErr    = attr(pAttrs, 'perr_msg');
        const isYun    = attr(pAttrs, 'is_yun');

        console.log('[phone]', JSON.stringify({ content: pContent, is_yun: isYun, dp_message: pDp, perr_msg: pPErr }));

        if (pDp !== 0) {
          hasPhoneErr = true;
          const decoded = decodeDp(pDp);
          const part    = isYun === '0' ? '声母' : '韵母';
          phoneMsgs.push(`${part}「${pContent}」：${decoded}${pPErr ? '(' + pPErr + ')' : ''}`);
        }
      }

      // syll 级别兜底（没有 phone 细节时）
      if (!hasPhoneErr) {
        const decoded = decodeDp(syllDp);
        if (decoded) phoneMsgs.push(`音节「${sym}」：${decoded}`);
        if (sPErr)   phoneMsgs.push(sPErr);
      }
    }

    if (wordPErr)        msgs.push(wordPErr);
    if (decodeDp(wordDp)) msgs.push(decodeDp(wordDp));
    if (phoneMsgs.length) msgs.push(...phoneMsgs);

    let hasError = perrLv !== 0 || wordDp !== 0 || phoneMsgs.length > 0;

    // ── 平翘舌对比（phone 声母 content vs 正确拼音） ────────────
    if (syllSymbol && content && queue[content]) {
      const ui       = usedIdx[content] || 0;
      const correctPy = queue[content][ui] ?? queue[content][queue[content].length - 1];
      usedIdx[content] = ui + 1;

      const correctInit = getInitial(correctPy);
      const recogInit   = getInitial(syllSymbol);

      console.log(`[retro] 「${content}」 正确: ${correctPy}(${correctInit})  识别: ${syllSymbol}(${recogInit})`);

      for (const [retro, flat] of RETRO_PAIRS) {
        if ((correctInit === retro && recogInit === flat) ||
            (correctInit === flat  && recogInit === retro)) {
          msgs.push(`声母混淆：应读【${correctInit}】实读【${recogInit}】（${correctPy} ≠ ${syllSymbol}）`);
          hasError = true;
          break;
        }
      }
    }

    wordResults.push({
      content,
      perrLevel: hasError ? 1 : 0,
      perrMsg:   msgs.join('；')
    });
  }

  const correct    = wordResults.filter(w => w.perrLevel === 0).length;
  const totalScore = wordResults.length > 0
    ? Math.round(correct / wordResults.length * 100) : 0;

  console.log(`[ISE] 汇总 总字:${wordResults.length} 正确:${correct} 分:${totalScore}`);
  return { totalScore, wordResults };
}

// ── 讯飞 WebSocket 评测（两阶段流式协议）─────────────────────────
function evaluateWithIse(pcmBase64, refText) {
  return new Promise((resolve, reject) => {
    const ws  = new WebSocket(buildIseUrl());
    let xml   = '';
    const t   = setTimeout(() => { ws.close(); reject(new Error('评测超时')); }, 30000);

    ws.on('open', () => {
      // 第一帧：业务参数
      ws.send(JSON.stringify({
        common:   { app_id: ISE_APPID },
        business: {
          sub: 'ise', ent: 'cn_vip', category: 'read_chapter',
          extra_ability: 'multi_dimension', cmd: 'ssb',
          text: '\uFEFF' + refText, tte: 'utf-8', ttp_skip: true,
          aue: 'raw', auf: 'audio/L16;rate=16000', rstcd: 'utf8'
        },
        data: { status: 0 }
      }));

      // 音频帧（aus: 1=首 2=中 4=末，data.data=base64音频）
      const pcm   = Buffer.from(pcmBase64, 'base64');
      const CHUNK = 1280;
      let   offset = 0;

      function sendNext() {
        const end     = Math.min(offset + CHUNK, pcm.length);
        const chunk   = pcm.slice(offset, end);
        const isFirst = offset === 0;
        const isLast  = end >= pcm.length;
        ws.send(JSON.stringify({
          business: { cmd: 'auw', aus: isFirst ? 1 : (isLast ? 4 : 2) },
          data:     { status: isLast ? 2 : 1, data: chunk.toString('base64') }
        }));
        offset = end;
        if (!isLast) setTimeout(sendNext, 40);
      }
      setTimeout(sendNext, 100);
    });

    ws.on('message', (raw) => {
      try {
        const resp = JSON.parse(raw.toString());
        console.log(`[ISE] resp code=${resp.code} status=${resp.data && resp.data.status}`);
        if (resp.code !== 0) {
          clearTimeout(t); ws.close();
          return reject(new Error(`ISE ${resp.code}: ${resp.message}`));
        }
        if (resp.data && resp.data.data) {
          xml += Buffer.from(resp.data.data, 'base64').toString('utf-8');
        }
        if (resp.data && resp.data.status === 2) {
          clearTimeout(t); ws.close(); resolve(xml);
        }
      } catch (e) { clearTimeout(t); reject(e); }
    });

    ws.on('error', (err) => { clearTimeout(t); reject(err); });
  });
}

// ── Vercel Serverless 入口 ────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { audioBase64, refText, chars } = req.body;
    if (!audioBase64 || !refText) {
      return res.status(400).json({ error: 'audioBase64 and refText are required' });
    }
    const xml    = await evaluateWithIse(audioBase64, refText);
    const result = parseXml(xml, chars || []);
    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err);
    res.status(500).json({ error: err.message });
  }
};
