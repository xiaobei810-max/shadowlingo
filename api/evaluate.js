/**
 * api/evaluate.js — 发音评测（腾讯云智聆 SOE WebSocket）
 *
 * 接口契约与原 Azure 版 100% 一致：
 *   POST { audioBase64, refText }  →  JSON { totalScore, wordResults[], ... }
 *
 * 内部流程：
 *   1. 腾讯 SOE WSS（voice_format=2 WAV, rec_mode=1, is_end=1 in URL）
 *   2. Gemini 生成期望拼音
 *   3. Whisper 双轨检测（可选）
 *   4. parseAzureResult 执行全部业务逻辑（阈值、弱字、诊断）
 */

const WebSocket = require('ws');
const crypto    = require('crypto');

const TENCENT_APP_ID     = process.env.TENCENT_APP_ID;
const TENCENT_SECRET_ID  = process.env.TENCENT_SECRET_ID;
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const GEMINI_KEY         = process.env.GEMINI_API_KEY;
const OPENAI_KEY         = process.env.OPENAI_API_KEY;

// ── PCM → WAV（44 字节 RIFF 头）────────────────────────────────
function pcmToWav(pcmBuf) {
  const wav = Buffer.alloc(44 + pcmBuf.length);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + pcmBuf.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(pcmBuf.length, 40);
  pcmBuf.copy(wav, 44);
  return wav;
}

// ══════════════════════════════════════════════════════════════════
//  腾讯云智聆口语评测 WebSocket
//  voice_format=2（WAV）+ rec_mode=1 + is_end=1 写入 URL 参数
//  单帧发送完整 WAV，无任何额外帧，服务端收到即开始评测
// ══════════════════════════════════════════════════════════════════

// ── SOE 响应字段规范化 ────────────────────────────────────────────
function normalizeSoeResponse(raw) {
  if (!raw || typeof raw !== 'object') return {};

  const r = {
    PronAccuracy:   raw.PronAccuracy   ?? raw.pron_accuracy   ?? 0,
    PronFluency:    raw.PronFluency    ?? raw.pron_fluency     ?? 0,
    PronCompletion: raw.PronCompletion ?? raw.pron_completion  ?? 100,
    SuggestedScore: raw.SuggestedScore ?? raw.suggested_score  ?? 0,
    SessionId:      raw.SessionId      ?? raw.session_id       ?? '',
  };

  r.Words = (raw.Words || raw.words || []).map(w => ({
    Word:          w.Word          ?? w.word          ?? '',
    MemBeginTime:  w.MemBeginTime  ?? w.mem_begin_time ?? 0,
    MemEndTime:    w.MemEndTime    ?? w.mem_end_time   ?? 0,
    PronAccuracy:  w.PronAccuracy  ?? w.pron_accuracy  ?? 0,
    PronFluency:   w.PronFluency   ?? w.pron_fluency   ?? 0,
    MatchTag:      w.MatchTag      ?? w.match_tag      ?? 0,
    PhoneInfos: (w.PhoneInfos || w.phone_infos || []).map(p => ({
      Phone:        p.Phone        ?? p.phone         ?? '',
      PronAccuracy: p.PronAccuracy ?? p.pron_accuracy ?? 0,
    })),
  }));

  return r;
}

// ── 主评测函数 ───────────────────────────────────────────────────
async function tencentSoeAssess(pcmBase64, refText) {
  if (!TENCENT_APP_ID || !TENCENT_SECRET_ID || !TENCENT_SECRET_KEY) {
    throw new Error('TENCENT_APP_ID / TENCENT_SECRET_ID / TENCENT_SECRET_KEY not configured');
  }

  // 前端传来的是纯 PCM Base64，加 WAV 头后发送（voice_format=2）
  const rawPcm   = Buffer.from(pcmBase64, 'base64');
  const wavBuf   = pcmToWav(rawPcm);
  const cleanRef = refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, '');
  const durSec   = (rawPcm.length / (16000 * 2)).toFixed(1);

  const timestamp = Math.floor(Date.now() / 1000);
  const expired   = timestamp + 86400;
  const nonce     = Math.floor(Math.random() * 1e8);
  const voiceId   = crypto.randomUUID().replace(/-/g, '');

  // URL 参数按字母序排列（HMAC-SHA1 签名要求）
  const params = {
    eval_mode:          '1',      // 句子模式
    expired:            String(expired),
    is_end:             '1',      // 告知服务端这是最后一包，收到即开始评测
    nonce:              String(nonce),
    rec_mode:           '1',      // 一次性上传（非流式）
    ref_text:           cleanRef,
    score_coeff:        '1.0',
    secretid:           TENCENT_SECRET_ID,
    seq:                '0',      // 包序号
    server_engine_type: '16k_zh',
    text_mode:          '0',
    timestamp:          String(timestamp),
    voice_format:       '2',      // WAV（带 RIFF 头）
    voice_id:           voiceId,
  };

  const sortedKeys   = Object.keys(params).sort();
  const queryForSign = sortedKeys.map(k => `${k}=${params[k]}`).join('&');
  const strToSign    = `soe.cloud.tencent.com/soe/api/${TENCENT_APP_ID}?${queryForSign}`;
  const signature    = crypto.createHmac('sha1', TENCENT_SECRET_KEY)
                             .update(strToSign).digest('base64');
  const urlQuery     = sortedKeys.map(k => `${k}=${encodeURIComponent(params[k])}`).join('&');
  const url = `wss://soe.cloud.tencent.com/soe/api/${TENCENT_APP_ID}?${urlQuery}&signature=${encodeURIComponent(signature)}`;

  console.log('[SOE WSS] voice_format=2 WAV, voiceId:', voiceId,
              'PCM:', rawPcm.length, '字节 WAV:', wavBuf.length, '字节 (约', durSec, 's), ref:', cleanRef);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let done     = false;
    let lastOkMsg = null;

    const finish = (err, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch(_) {}
      err ? reject(err) : resolve(data);
    };

    const timer = setTimeout(() => finish(new Error('Tencent SOE 超时 (20s)')), 20000);

    ws.on('open', () => {
      // 唯一一次发送：完整 WAV 二进制帧
      // is_end=1 已在 URL 中声明，服务端收到此帧即知传输完毕，立即评测
      console.log('[SOE WSS] 连接建立，发送 WAV %d 字节（仅此一帧）', wavBuf.length);
      ws.send(wavBuf);
    });

    ws.on('message', (data) => {
      if (done) return;
      let msg;
      try { msg = JSON.parse(data.toString()); }
      catch(e) { console.error('[SOE WSS] 非JSON:', data.toString().slice(0, 100)); return; }

      console.log('[SOE WSS] 消息:', JSON.stringify(msg).slice(0, 500));

      const code = msg.code ?? msg.Code;
      if (code !== undefined && code !== 0) {
        finish(new Error(`Tencent SOE 错误 code=${code}: ${msg.message || msg.Message || ''}`));
        return;
      }

      lastOkMsg = msg;
      const payload  = msg.result || msg.Result || msg;
      const isEnd    = msg.is_end === 1 || msg.final === 1 || msg.end === 1;
      const hasScore = payload.PronAccuracy   !== undefined
                    || payload.SuggestedScore !== undefined
                    || payload.pron_accuracy  !== undefined
                    || payload.suggested_score !== undefined;

      if (isEnd || hasScore) {
        console.log('[SOE WSS] 收到评测结果');
        finish(null, { Response: normalizeSoeResponse(payload) });
      }
    });

    ws.on('error', err => {
      console.error('[SOE WSS] 错误:', err.message);
      finish(err);
    });

    ws.on('close', (closeCode, reason) => {
      if (done) return;
      if (lastOkMsg) {
        const payload = lastOkMsg.result || lastOkMsg.Result || lastOkMsg;
        finish(null, { Response: normalizeSoeResponse(payload) });
      } else {
        finish(new Error(`SOE 关闭 code=${closeCode} reason=${reason}`));
      }
    });
  });
}


// ── 腾讯 → Azure 格式适配器 ──────────────────────────────────────
// 让 parseAzureResult 无需任何修改即可处理腾讯数据
function tencentToAzureFormat(tencentResp, refText) {
  const r = tencentResp.Response;

  // MatchTag → ErrorType
  const MATCH_TAG = { 0: 'None', 1: 'Mispronunciation', 2: 'Omission', 3: 'Insertion' };

  const words = (r.Words || []).map(w => {
    const errorType     = MATCH_TAG[w.MatchTag] || 'None';
    const offsetTicks   = (w.MemBeginTime || 0) * 10000;     // ms → 100ns
    const durationTicks = ((w.MemEndTime || 0) - (w.MemBeginTime || 0)) * 10000;

    // 构造 Phonemes（保留腾讯 PhoneInfos 的精度）
    const phonemes = (w.PhoneInfos || []).map(p => ({
      Phoneme: p.Phone || '',
      PronunciationAssessment: {
        AccuracyScore:   p.PronAccuracy || 0,
        NBestPhonemes:   []   // 腾讯无此数据，Tier D 将静默跳过
      }
    }));

    // 构造 Syllables（拼接 phones 近似音节）
    const phones = (w.PhoneInfos || []).map(p => p.Phone || '').join('');
    const syllables = [{
      Grapheme: w.Word,
      Phoneme:  phones,
      PronunciationAssessment: { AccuracyScore: w.PronAccuracy || 0 }
    }];

    return {
      Word:     w.Word,
      Offset:   offsetTicks,
      Duration: durationTicks,
      PronunciationAssessment: {
        AccuracyScore: w.PronAccuracy || 0,
        ErrorType:     errorType
      },
      Phonemes:  phonemes,
      Syllables: syllables
    };
  });

  return {
    RecognitionStatus: 'Success',
    NBest: [{
      PronunciationAssessment: {
        AccuracyScore:      r.PronAccuracy   || 0,
        CompletenessScore:  r.PronCompletion || 100,
        FluencyScore:       r.PronFluency    || 0,
        PronScore:          r.SuggestedScore || 0
      },
      Words:   words,
      Lexical: refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, '')
    }]
  };
}

// ══════════════════════════════════════════════════════════════════
//  OpenAI Whisper STT（双轨检测，可选）
// ══════════════════════════════════════════════════════════════════

async function whisperStt(pcmBase64) {
  if (!OPENAI_KEY) return '';
  try {
    const wavBuf = pcmToWav(Buffer.from(pcmBase64, 'base64'));
    const boundary = 'WBound' + Date.now().toString(36);
    const textFields = [
      { name: 'model',           value: 'whisper-1' },
      { name: 'language',        value: 'zh'        },
      { name: 'response_format', value: 'text'      },
    ];
    const textPart = textFields.map(f =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"\r\n\r\n${f.value}\r\n`
    ).join('');
    const fileHeader =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const bodyBuf = Buffer.concat([
      Buffer.from(textPart + fileHeader), wavBuf, Buffer.from(footer)
    ]);
    const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(bodyBuf.length),
      },
      body: bodyBuf,
    });
    if (!resp.ok) {
      console.error('[Whisper] HTTP错误:', resp.status, (await resp.text().catch(() => '')).slice(0, 200));
      return '';
    }
    const raw = await resp.text();
    const cleaned = raw.trim().replace(/[，。！？,.!?\s]/g, '').replace(/[^\u4e00-\u9fa5]/g, '');
    console.log('[Whisper] 识别结果:', cleaned);
    return cleaned;
  } catch(e) {
    console.error('[Whisper] 调用失败:', e.message);
    return '';
  }
}

// ══════════════════════════════════════════════════════════════════
//  双轨平翘舌/鼻音/声调检测
// ══════════════════════════════════════════════════════════════════

function dualTrackAnalysis(refChars, whisperText, pyMap) {
  if (!whisperText) return { whisperText: '', dualTrackErrors: [] };
  const whisperChars = Array.from(whisperText.replace(/\s/g, ''));
  if (!whisperChars.length) return { whisperText, dualTrackErrors: [] };

  const RETRO   = ['zh', 'ch', 'sh', 'r'];
  const FLAT    = ['z',  'c',  's' ];
  const LATERAL = ['l',  'n' ];
  const errors  = [];
  const minLen  = Math.min(refChars.length, whisperChars.length);

  for (let i = 0; i < minLen; i++) {
    const ref   = refChars[i];
    const heard = whisperChars[i];
    if (ref === heard) continue;

    const refPy   = normalizePy(pyMap[ref]   || CHAR_PY[ref]   || '');
    const heardPy = normalizePy(CHAR_PY[heard] || '');
    if (!refPy) continue;

    const refInit   = getInitial(refPy);
    const heardInit = getInitial(heardPy || '');
    const refBase   = refPy.replace(/\d$/, '');
    const heardBase = heardPy ? heardPy.replace(/\d$/, '') : '';
    const refTone   = getTone(refPy);
    const heardTone = heardPy ? getTone(heardPy) : 0;
    const TONE_ZH   = ['','第1声（高平）','第2声（上升）','第3声（低降升）','第4声（下降）','轻声'];

    let type = '', message = '', messageEn = '';

    if (refBase && heardBase && refBase === heardBase && refTone > 0 && heardTone > 0 && refTone !== heardTone) {
      type      = 'tone_confusion';
      message   = `"${ref}"声调有误：应读${TONE_ZH[refTone]||'第'+refTone+'声'}（${ref} ${refPy}），Whisper听到${TONE_ZH[heardTone]||'第'+heardTone+'声'}（${heard} ${heardPy}）`;
      messageEn = `"${ref}" tone error: should be tone ${refTone} (${refPy}), Whisper heard tone ${heardTone} ("${heard}" ${heardPy})`;
    } else if (RETRO.includes(refInit) && (FLAT.includes(heardInit) || LATERAL.includes(heardInit))) {
      type      = 'zh_z_confusion';
      message   = `"${ref}"（${refPy}）应读翘舌【${refInit}】，Whisper听到了"${heard}"${heardPy ? '（'+heardPy+'）' : ''}——疑似翘舌→平舌`;
      messageEn = `"${ref}" needs retroflex [${refInit}]; Whisper heard "${heard}" — likely retroflex→flat error`;
    } else if (FLAT.includes(refInit) && RETRO.includes(heardInit)) {
      type      = 'z_zh_confusion';
      message   = `"${ref}"（${refPy}）应读平舌【${refInit}】，Whisper听到了"${heard}"${heardPy ? '（'+heardPy+'）' : ''}——疑似平舌→翘舌`;
      messageEn = `"${ref}" needs flat [${refInit}]; Whisper heard "${heard}" — likely flat→retroflex error`;
    } else {
      type      = 'disagreement';
      message   = `"${ref}"（${refPy}）Whisper听到了"${heard}"${heardPy ? '（'+heardPy+'）' : ''}——两轨识别不一致`;
      messageEn = `"${ref}" (${refPy}): Whisper heard "${heard}" — recognition disagreement`;
    }

    errors.push({ position: i, targetChar: ref, targetPy: refPy,
                  whisperHeard: heard, whisperPy: heardPy, type, message, messageEn });
  }

  if (errors.length)
    console.log('[DualTrack] 检测到', errors.length, '个疑似错误:',
      errors.map(e => `"${e.targetChar}"→"${e.whisperHeard}"(${e.type})`).join(', '));

  return { whisperText, dualTrackErrors: errors };
}

// ══════════════════════════════════════════════════════════════════
//  常见汉字拼音表（覆盖主要平翘舌/前后鼻音/声调混淆字）
// ══════════════════════════════════════════════════════════════════

const CHAR_PY = {
  // ── 翘舌音字（zh/ch/sh/r）
  '知':'zhi1','直':'zhi2','值':'zhi2','执':'zhi2','植':'zhi2','职':'zhi2',
  '止':'zhi3','只':'zhi3','纸':'zhi3','指':'zhi3','至':'zhi4','志':'zhi4',
  '智':'zhi4','制':'zhi4','治':'zhi4','致':'zhi4','质':'zhi4',
  '中':'zhong1','忠':'zhong1','种':'zhong3','重':'zhong4','众':'zhong4',
  '主':'zhu3','住':'zhu4','注':'zhu4','助':'zhu4','著':'zhu4','祝':'zhu4',
  '猪':'zhu1','珠':'zhu1','诸':'zhu1','竹':'zhu2','煮':'zhu3','柱':'zhu4',
  '这':'zhe4','者':'zhe3','着':'zhe0','折':'zhe2','遮':'zhe1',
  '真':'zhen1','阵':'zhen4','珍':'zhen1','针':'zhen1','镇':'zhen4',
  '争':'zheng1','整':'zheng3','正':'zheng4','政':'zheng4','证':'zheng4','郑':'zheng4',
  '张':'zhang1','掌':'zhang3','章':'zhang1','丈':'zhang4','账':'zhang4',
  '长':'zhang3','找':'zhao3','照':'zhao4','招':'zhao1','赵':'zhao4',
  '展':'zhan3','站':'zhan4','战':'zhan4','沾':'zhan1',
  '准':'zhun3','砖':'zhuan1','转':'zhuan3','抓':'zhua1',
  '车':'che1','扯':'che3','彻':'che4',
  '吃':'chi1','赤':'chi4','迟':'chi2','尺':'chi3','痴':'chi1',
  '出':'chu1','处':'chu4','初':'chu1','触':'chu4','储':'chu3',
  '城':'cheng2','成':'cheng2','程':'cheng2','称':'cheng1','诚':'cheng2','承':'cheng2',
  '场':'chang3','长':'chang2','唱':'chang4','常':'chang2','尝':'chang2','昌':'chang1',
  '超':'chao1','炒':'chao3','朝':'chao2','潮':'chao2',
  '冲':'chong1','虫':'chong2','宠':'chong3',
  '穿':'chuan1','传':'chuan2','船':'chuan2','串':'chuan4',
  '春':'chun1','纯':'chun2','唇':'chun2',
  '吹':'chui1','锤':'chui2',
  '是':'shi4','事':'shi4','时':'shi2','市':'shi4','使':'shi3','世':'shi4',
  '式':'shi4','实':'shi2','师':'shi1','史':'shi3','始':'shi3','室':'shi4',
  '诗':'shi1','试':'shi4','识':'shi2','石':'shi2','食':'shi2',
  '说':'shuo1','烁':'shuo4',
  '手':'shou3','收':'shou1','受':'shou4','兽':'shou4','首':'shou3','守':'shou3',
  '树':'shu4','书':'shu1','数':'shu3','输':'shu1','熟':'shu2','束':'shu4','属':'shu3',
  '睡':'shui4','水':'shui3','谁':'shei2',
  '什':'shen2','深':'shen1','身':'shen1','神':'shen2','审':'shen3',
  '声':'sheng1','生':'sheng1','省':'sheng3','盛':'sheng4','升':'sheng1',
  '上':'shang4','商':'shang1','赏':'shang3','伤':'shang1',
  '少':'shao3','勺':'shao2','烧':'shao1','哨':'shao4',
  '社':'she4','设':'she4','蛇':'she2','舌':'she2',
  '山':'shan1','删':'shan1','善':'shan4','闪':'shan3','扇':'shan4',
  '人':'ren2','认':'ren4','任':'ren4','仁':'ren2',
  '热':'re4','日':'ri4',
  '如':'ru2','入':'ru4','软':'ruan3',
  '然':'ran2','让':'rang4','绕':'rao4','扰':'rao3','肉':'rou4','若':'ruo4',
  '荣':'rong2','融':'rong2','容':'rong2','绒':'rong2',
  '揉':'rou2','柔':'rou2',
  '染':'ran3','燃':'ran2',
  // ── 平舌音字（z/c/s）
  '资':'zi1','字':'zi4','自':'zi4','紫':'zi3','子':'zi3',
  '走':'zou3','足':'zu2','组':'zu3','祖':'zu3','租':'zu1','阻':'zu3',
  '做':'zuo4','坐':'zuo4','座':'zuo4','作':'zuo4','左':'zuo3','昨':'zuo2',
  '再':'zai4','载':'zai4','在':'zai4','灾':'zai1',
  '赞':'zan4','暂':'zan4','脏':'zang1','葬':'zang4',
  '菜':'cai4','采':'cai3','猜':'cai1','财':'cai2',
  '草':'cao3','曹':'cao2','操':'cao1','糙':'cao1',
  '层':'ceng2','曾':'ceng2',
  '从':'cong2','丛':'cong2','匆':'cong1','聪':'cong1',
  '此':'ci3','词':'ci2','次':'ci4','刺':'ci4','赐':'ci4','慈':'ci2',
  '粗':'cu1','促':'cu4','醋':'cu4',
  '存':'cun2','村':'cun1','寸':'cun4',
  '错':'cuo4','磋':'cuo1',
  '四':'si4','死':'si3','撕':'si1','丝':'si1','私':'si1','寺':'si4','司':'si1',
  '送':'song4','松':'song1','颂':'song4','宋':'song4',
  '苏':'su1','速':'su4','素':'su4','俗':'su2','酸':'suan1',
  '虽':'sui1','岁':'sui4','随':'sui2','隧':'sui4',
  '三':'san1','散':'san4','桑':'sang1',
  '色':'se4','涩':'se4','塞':'se1',
  '森':'sen1',
  '算':'suan4',
  // ── 前后鼻音字
  '安':'an1','暗':'an4','按':'an4','岸':'an3','案':'an4',
  '恩':'en1','嗯':'en2',
  '因':'yin1','音':'yin1','银':'yin2','饮':'yin3','印':'yin4',
  '温':'wen1','文':'wen2','问':'wen4','稳':'wen3',
  '民':'min2','敏':'min3','明':'ming2','命':'ming4',
  '今':'jin1','近':'jin4','进':'jin4','金':'jin1','紧':'jin3',
  '陈':'chen2',
  '宾':'bin1','品':'pin3','林':'lin2','心':'xin1','信':'xin4',
  '昂':'ang2','帮':'bang1','房':'fang2','方':'fang1','香':'xiang1',
  '名':'ming2',
  '星':'xing1','行':'xing2','形':'xing2','性':'xing4','姓':'xing4',
  '东':'dong1','风':'feng1','公':'gong1','工':'gong1',
  '等':'deng3','能':'neng2','冷':'leng3',
  '轻':'qing1','请':'qing3','情':'qing2','青':'qing1','庆':'qing4',
  '英':'ying1','应':'ying4','影':'ying3','营':'ying2',
  // ── 高频声调对
  '妈':'ma1','巴':'ba1','花':'hua1','喝':'he1','喊':'han3',
  '他':'ta1','她':'ta1','它':'ta1','家':'jia1','加':'jia1',
  '天':'tian1','先':'xian1','边':'bian1','年':'nian2','前':'qian2',
  '需':'xu1',
  '来':'lai2','才':'cai2','没':'mei2','还':'hai2',
  '国':'guo2','合':'he2','和':'he2','何':'he2',
  '学':'xue2','白':'bai2','同':'tong2','朋':'peng2','平':'ping2',
  '我':'wo3','你':'ni3','好':'hao3','也':'ye3','可':'ke3',
  '小':'xiao3','有':'you3','美':'mei3','所':'suo3','里':'li3',
  '想':'xiang3','买':'mai3','女':'nv3',
  '语':'yu3','比':'bi3','米':'mi3','体':'ti3',
  '不':'bu4','对':'dui4','大':'da4','去':'qu4',
  '要':'yao4','会':'hui4','看':'kan4','用':'yong4',
  '到':'dao4','但':'dan4','意':'yi4',
  '号':'hao4','电':'dian4','面':'mian4','汉':'han4',
  '站':'zhan4','下':'xia4','外':'wai4',
  '内':'nei4','右':'you4','后':'hou4','又':'you4',
  '吗':'ma0','呢':'ne0','吧':'ba0','啊':'a0','的':'de0','了':'le0',
  '过':'guo0','们':'men0','么':'me0',
  '卖':'mai4','迈':'mai4',
  '打':'da3','达':'da2','搭':'da1',
  '课':'ke4','科':'ke1','刻':'ke4',
  '图':'tu2','土':'tu3','兔':'tu4','突':'tu1',
  '高':'gao1','搞':'gao3','告':'gao4','糕':'gao1',
  '低':'di1','底':'di3','地':'di4',
  '多':'duo1','躲':'duo3','朵':'duo3',
  '果':'guo3',
  '化':'hua4','画':'hua4','话':'hua4','华':'hua2',
  '就':'jiu4','九':'jiu3','久':'jiu3','救':'jiu4',
  '快':'kuai4','块':'kuai4','筷':'kuai4',
  '力':'li4','立':'li4','历':'li4','例':'li4','粒':'li4',
  '免':'mian3','棉':'mian2','绵':'mian2',
  '念':'nian4','鸟':'niao3',
  '期':'qi1','起':'qi3','气':'qi4','取':'qu3','区':'qu1',
  '让':'rang4',
  '特':'te4','疼':'teng2',
  '位':'wei4','为':'wei4','围':'wei2','味':'wei4','微':'wei1',
  '夏':'xia4','吓':'xia4','虾':'xia1',
  '样':'yang4','羊':'yang2','养':'yang3','洋':'yang2',
  '以':'yi3','已':'yi3','椅':'yi3','一':'yi1',
  '勇':'yong3','拥':'yong1','永':'yong3',
  '早':'zao3','造':'zao4',
};

// ══════════════════════════════════════════════════════════════════
//  编辑距离对齐 + STT 字级替换检测
// ══════════════════════════════════════════════════════════════════

function alignChars(refArr, sttArr) {
  const m = refArr.length, n = sttArr.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1);
    for (let j = 0; j <= n; j++) {
      if (i === 0) { dp[i][j] = j; continue; }
      if (j === 0) { dp[i][j] = i; continue; }
      const same = refArr[i-1] === sttArr[j-1];
      dp[i][j] = same
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
    }
  }
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && refArr[i-1] === sttArr[j-1]) {
      ops.unshift({ type: 'match', ri: i-1, si: j-1 }); i--; j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i-1][j-1] + 1) {
      ops.unshift({ type: 'sub', ri: i-1, si: j-1 }); i--; j--;
    } else if (j === 0 || (i > 0 && dp[i-1][j] <= dp[i][j-1])) {
      ops.unshift({ type: 'del', ri: i-1, si: -1 }); i--;
    } else {
      ops.unshift({ type: 'ins', ri: -1, si: j-1 }); j--;
    }
  }
  return ops;
}

function detectSttMismatches(refChars, sttAlts, pyMap) {
  const mismatches = new Map();
  if (!sttAlts || !sttAlts.length) return mismatches;

  for (const sttText of sttAlts) {
    const sttChars = Array.from((sttText || '').replace(/\s/g, ''));
    if (!sttChars.length) continue;

    const ops = alignChars(refChars, sttChars);
    for (const op of ops) {
      if (op.type !== 'sub') continue;
      const ri = op.ri;
      if (mismatches.has(ri)) continue;

      const expected = refChars[ri];
      const got      = sttChars[op.si];
      const wantPy   = normalizePy(pyMap[expected] || CHAR_PY[expected] || '');
      const gotPy    = normalizePy(CHAR_PY[got] || '');
      if (!wantPy) continue;

      console.log(`[SttAlign] pos=${ri} expected="${expected}"(${wantPy}) got="${got}"(${gotPy})`);
      const diag = gotPy ? diagnoseError(wantPy, gotPy) : [];
      mismatches.set(ri, { expected, got, gotPy, diag });
    }
  }
  return mismatches;
}

// ══════════════════════════════════════════════════════════════════
//  Gemini 生成期望拼音
// ══════════════════════════════════════════════════════════════════

const pinyinCache = new Map();

const GEMINI_SYSTEM =
`你是中文语音学专家。给定一个中文句子，按实际朗读发音（而非字典本调）标注每个汉字的拼音和声调数字（1-4，轻声用0）。

【多音字规则（严格按语境判断）】
教：jiao1（来教你/教书）/ jiao4（教室/教育/教练）
长：zhang3（成长/长大/长辈）/ chang2（长城/很长/长度）
好：hao3（你好/好的/好吃）/ hao4（好学/嗜好/好奇）
行：xing2（行走/银行/旅行）/ hang2（行业/行列/内行）
觉：jiao4（睡觉/午觉）/ jue2（感觉/发觉/知觉）
乐：le4（快乐/欢乐）/ yue4（音乐/乐队/乐器）
着：zhe0（看着/走着/等着）/ zhao2（着急/着凉）/ zhuo2（着装）
了：le0（好了/走了/来了）/ liao3（了解/受不了/了不起）
的：de0（语气助词：我的/好的）/ di4（目的地/目的）
地：de0（慢慢地/认真地）/ di4（地方/土地/大地）
得：de0（走得快/做得好）/ de2（获得/得到/取得）/ dei3（得去/得行）
还：hai2（还是/还有/还好）/ huan2（归还/还钱/偿还）
看：kan4（看书/看见/看病）/ kan1（看守/看护）
数：shu3（数学/数量/数字）/ shuo4（数落/频数）
和：he2（和平/和谐/和好）/ he4（唱和/附和）/ huo4（掺和/搀和）
空：kong1（空气/天空/空中）/ kong4（空余/有空/抽空）
重：zhong4（重要/体重/重量）/ chong2（重复/重来/重新）
中：zhong1（中文/其中/中间）/ zhong4（中毒/中奖/中计）
间：jian1（空间/时间/房间）/ jian4（间隔/间接/间谍）
假：jia3（假如/假装/真假）/ jia4（假期/放假/暑假）
说：shuo1（说话/说明/听说）/ shui4（游说）
没：mei2（没有/没关系）/ mo4（淹没/沉没）
参：can1（参加/参观）/ shen1（人参/参差）
差：cha1（差别/差距）/ chai1（出差/差使）/ cha4（差不多/差劲）
转：zhuan3（转身/转变）/ zhuan4（转圈/转动）
当：dang1（当然/当时）/ dang4（上当/当铺）
便：bian4（方便/便宜0）/ pian2（便宜/便利）

【三声变调（两个三声相邻，前一变二声）】
你好→ni2 hao3；可以→ke2 yi3；所以→suo2 yi3；也许→ye2 xu3
了解→liao2 jie3；请问→qing2 wen3；展览→zhan2 lan3；购买→gou2 mai3
旅游→lv2 you2；水果→shui2 guo3；理解→li2 jie3；演讲→yan2 jiang3
允许→yun2 xu3；语法→yu2 fa3；导览→dao2 lan3；每种→mei2 zhong3

【"一"的变调】
四声前读二声：一个yi2ge4, 一样yi2yang4, 一起yi2qi3, 一次yi2ci4, 一定yi2ding4
一/二/三声前读四声：一天yi4tian1, 一年yi4nian2, 一般yi4ban1, 一些yi4xie1
单独/序数/末尾读一声：第一di4yi1, 第一次di4yi1ci4, 统一tong3yi1

【"不"的变调】
四声前读二声：不是bu2shi4, 不对bu2dui4, 不要bu2yao4, 不去bu2qu4, 不会bu2hui4
其他声前读四声：不来bu4lai2, 不能bu4neng2, 不好bu4hao3, 不知bu4zhi1

【轻声（标0）】
语气词：的0 地0 得0 了0 吗0 呢0 吧0 啊0 嘛0 呀0 着0 过0 么0 哦0 嗯0
常见轻声词（第二字标0）：
东西 意思 事情 朋友 知道 认识 明白 告诉 先生 学生 名字 眼睛 耳朵
鼻子 嘴巴 头发 衣服 地方 时候 日子 孩子 儿子 女儿 丈夫 妻子 奶奶
爸爸 妈妈 哥哥 弟弟 姐姐 妹妹 爷爷 奶奶 外公 外婆
上面 下面 里面 外面 前面 后面 里头 上头 外头 前头 后头
东边 西边 南边 北边 左边 右边 旁边 这里 那里 哪里
便宜（pian2 yi0）习惯 告诉 解释 休息 舒服 痛快

【儿化音】
哪儿na3r/这儿zhe4r/那儿na4r作独立词时，"儿"标er0
词尾儿化：一点儿/玩儿/事儿/小孩儿/门口儿/心眼儿 → 儿标er0
注意："儿子er2 zi0"中的儿er2不是儿化，是独立字

只返回纯JSON对象，格式：{"字":"pinyin+声调数字"}，不要任何其他文字、注释或markdown。
示例：{"你":"ni3","好":"hao3","吗":"ma0","知":"zhi1","道":"dao0"}`;

async function getPinyinMap(refText) {
  if (pinyinCache.has(refText)) {
    console.log('[Gemini] 缓存命中:', refText);
    return pinyinCache.get(refText);
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  console.log('[Gemini] 请求拼音 for:', refText);
  const body = {
    contents: [{ parts: [{ text: `${GEMINI_SYSTEM}\n\n句子：${refText}\n请返回每个汉字的拼音JSON：` }] }]
  };
  const resp = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  const data = await resp.json();
  console.log('[Gemini] HTTP状态:', resp.status, '原始返回:', JSON.stringify(data).slice(0, 400));
  if (!resp.ok) throw Object.assign(new Error(data?.error?.message || 'Gemini error'), { status: resp.status, body: data });

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  console.log('[Gemini] 文本返回:', raw);
  let pyMap;
  try {
    pyMap = JSON.parse(raw);
  } catch(e) {
    const m = raw.match(/\{[\s\S]+\}/);
    if (m) pyMap = JSON.parse(m[0]);
    else throw new Error('Gemini拼音返回格式错误: ' + raw.slice(0, 150));
  }
  pinyinCache.set(refText, pyMap);
  return pyMap;
}

async function getPinyinMapSafe(refText) {
  try {
    return { map: await getPinyinMap(refText), error: null };
  } catch(e) {
    const detail = { status: e.status ?? null, message: e.message ?? String(e), body: e.body ?? null };
    console.error('[Gemini] 拼音请求失败 status=%s message=%s', detail.status, detail.message);
    return { map: {}, error: detail };
  }
}

// ══════════════════════════════════════════════════════════════════
//  拼音辅助函数 + 精确诊断
// ══════════════════════════════════════════════════════════════════

function normalizePy(py) {
  return (py || '').toLowerCase().replace(/\s+(\d)/, '$1').trim();
}
function getTone(py) {
  const m = (py || '').match(/(\d)$/);
  return m ? parseInt(m[1]) : 0;
}
function getInitial(py) {
  py = (py || '').replace(/\d$/, '').toLowerCase().trim();
  for (const two of ['zh', 'ch', 'sh']) if (py.startsWith(two)) return two;
  for (const one of 'b p m f d t n l g k h j q x r z c s y w'.split(' '))
    if (py.startsWith(one)) return one;
  return '';
}
function getFinal(py) {
  const base = py.replace(/\d$/, '');
  return base.slice(getInitial(base).length) || base;
}

function extractUserPhoneme(ph) {
  const pa   = ph.PronunciationAssessment || {};
  const list = pa.NBestPhonemes || [];
  if (!list.length) return null;
  const refPhone = normalizePy(ph.Phoneme);
  const top = normalizePy(list[0].Phoneme || '');
  if (top && top !== refPhone) return top;
  return null;
}

function diagnoseError(refPy, userPy) {
  if (!refPy || !userPy) return [];
  const rN = normalizePy(refPy);
  const uN = normalizePy(userPy);
  if (rN === uN) return [];

  const rTone  = getTone(rN);
  const uTone  = getTone(uN);
  const rInit  = getInitial(rN);
  const uInit  = getInitial(uN);
  const rFinal = getFinal(rN);
  const uFinal = getFinal(uN);

  const RETROFLEX = ['zh', 'ch', 'sh', 'r'];
  const SIBILANT  = ['z', 'c', 's'];
  const NASAL_PAIRS = [
    ['an','ang'],['en','eng'],['in','ing'],['ian','iang'],
    ['uan','uang'],['n','ng'],['un','ong']
  ];

  const errors = [];

  if (rInit !== uInit) {
    const rRetro = RETROFLEX.includes(rInit);
    const rSibi  = SIBILANT.includes(rInit);
    const uRetro = RETROFLEX.includes(uInit);
    const uSibi  = SIBILANT.includes(uInit);
    if ((rRetro && uSibi) || (rSibi && uRetro)) {
      errors.push({
        cat: 'RETROFLEX',
        msg: `平翘舌：应读【${rInit||'零声母'}】你读成了【${uInit||'零声母'}】`,
        en:  `retroflex: should be "${rInit||'Ø'}", you said "${uInit||'Ø'}"`
      });
    } else if ((rInit === 'r' && (uInit === 'l' || uInit === 'n')) ||
               ((rInit === 'l' || rInit === 'n') && uInit === 'r')) {
      errors.push({
        cat: 'INITIAL',
        msg: `声母混淆【${rInit}】vs【${uInit}】（r需卷舌，l/n不卷舌）`,
        en:  `initial mix-up: "${rInit}" vs "${uInit}" (r needs tongue curl)`
      });
    } else if (rInit && uInit) {
      errors.push({
        cat: 'INITIAL',
        msg: `声母错误：应读【${rInit||'零声母'}】你读成了【${uInit||'零声母'}】`,
        en:  `initial: should be "${rInit||'Ø'}", you said "${uInit||'Ø'}"`
      });
    }
  }

  if (rInit === uInit && rFinal !== uFinal && rFinal && uFinal) {
    const nasalSwap = NASAL_PAIRS.some(([f, b]) =>
      (rFinal === f && uFinal === b) || (rFinal === b && uFinal === f));
    if (nasalSwap) {
      const isFront = rFinal.endsWith('n') && !rFinal.endsWith('ng');
      errors.push({
        cat: 'NASAL',
        msg: `前后鼻音：应读【${rFinal}】（${isFront?'前鼻音-n结尾':'后鼻音-ng结尾'}），你读成了【${uFinal}】`,
        en:  `nasal ending: "${rFinal}" (${isFront?'front -n':'back -ng'}), you said "${uFinal}"`
      });
    } else {
      errors.push({
        cat: 'VOWEL',
        msg: `韵母错误：应读【${rFinal}】你读成了【${uFinal}】`,
        en:  `vowel: should be "${rFinal}", you said "${uFinal}"`
      });
    }
  }

  if (rInit === uInit && rFinal === uFinal && rTone !== 0 && uTone && rTone !== uTone) {
    const TONE_NAMES = ['','第1声（ā 高平）','第2声（á 上升）','第3声（ǎ 低降升）','第4声（à 下降）','轻声'];
    errors.push({
      cat: 'TONE',
      msg: `声调错误：应读${TONE_NAMES[rTone]||'第'+rTone+'声'}，你读成了${TONE_NAMES[uTone]||'第'+uTone+'声'}`,
      en:  `tone: should be tone ${rTone}, you said tone ${uTone}`
    });
  }

  return errors;
}

// ══════════════════════════════════════════════════════════════════
//  Azure 响应格式兼容（适配器产出的数据也能用这些函数）
// ══════════════════════════════════════════════════════════════════

function wordAcc(w) { return Math.round((w.PronunciationAssessment || {}).AccuracyScore ?? w.AccuracyScore ?? 0); }
function wordErr(w) { return (w.PronunciationAssessment || {}).ErrorType || w.ErrorType || 'None'; }
function subAcc(p)  { return Math.round((p.PronunciationAssessment || {}).AccuracyScore ?? p.AccuracyScore ?? 0); }

// ══════════════════════════════════════════════════════════════════
//  核心解析（业务逻辑完整保留，接受适配器转换后的数据）
// ══════════════════════════════════════════════════════════════════

async function parseAzureResult(resp, refText, pyMap, sttText) {
  console.log('[parse] RecognitionStatus:', resp.RecognitionStatus);

  const nbest = resp.NBest && resp.NBest[0];
  if (!nbest) {
    console.error('[parse] 无 NBest:', JSON.stringify(resp));
    return { totalScore: 0, wordResults: [], debugInfo: resp.RecognitionStatus || 'NoNBest' };
  }

  const pa               = nbest.PronunciationAssessment || {};
  const accuracyScore    = pa.AccuracyScore     ?? nbest.AccuracyScore     ?? 0;
  const completenessScore= pa.CompletenessScore ?? nbest.CompletenessScore ?? 100;
  const fluencyScore     = pa.FluencyScore      ?? nbest.FluencyScore      ?? 0;
  let pronScore = Math.round(accuracyScore * 0.7 + completenessScore * 0.2 + fluencyScore * 0.1);
  if (pronScore === 0 && nbest.Words && nbest.Words.length > 0) {
    pronScore = Math.round(nbest.Words.reduce((s, w) => s + wordAcc(w), 0) / nbest.Words.length);
    console.log('[parse] 词级平均兜底 pronScore:', pronScore);
  }
  console.log('[parse] accuracy=%s completeness=%s fluency=%s → pronScore=%s | 词数:%s',
    accuracyScore, completenessScore, fluencyScore, pronScore, (nbest.Words || []).length);
  console.log('[parse] pyMap:', JSON.stringify(pyMap));

  const wordResults = [];

  // ── STT 预处理 ─────────────────────────────────────
  const refClean  = Array.from(refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, ''));
  const sttAlts   = Array.isArray(sttText) ? sttText : (sttText ? [sttText] : []);
  const sttMismap = sttAlts.length ? detectSttMismatches(refClean, sttAlts, pyMap) : new Map();
  if (sttMismap.size > 0) {
    console.log('[SttMis] 发现', sttMismap.size, '个字级差异:', JSON.stringify([...sttMismap.entries()]));
  }

  let refCharIdx = 0;

  const WEAK_CHARS = new Set([
    '的','地','得','着','过','了',
    '吗','呢','吧','啊','呀','嘛','么','哦','嗯','哈','喂',
  ]);

  for (const w of (nbest.Words || [])) {
    const text      = w.Word || '';
    const accuracy  = wordAcc(w);
    const errType   = wordErr(w);
    const phonemes  = w.Phonemes  || [];
    const syllables = w.Syllables || [];

    const wordHasDuration = (w.Duration || 0) > 0;

    console.log(`[parse] word="${text}" acc=${accuracy} err=${errType} ph=${phonemes.length} syl=${syllables.length} dur=${w.Duration||0}`);
    if (phonemes.length > 0 && phonemes[0].PronunciationAssessment) {
      console.log(`[parse] ph[0]="${phonemes[0].Phoneme}" NBest:`, JSON.stringify((phonemes[0].PronunciationAssessment.NBestPhonemes||[]).slice(0,3)));
    }

    const charArr = Array.from(text);
    const cMsgs   = charArr.map(() => []);
    const cLevel  = charArr.map(() => 0);

    const levelOf = (acc, err, ch) => {
      if (err === 'Omission') {
        if (!wordHasDuration) return 2;
      }
      const isWeak = WEAK_CHARS.has(ch);
      if (isWeak) {
        if (err === 'Mispronunciation' && acc < 70) return 1;
        return 0;
      }
      if (err === 'Mispronunciation' && acc < 60) return 2;
      if (acc < 60) return 1;
      if (err === 'Mispronunciation' && acc < 75) return 1;
      return 0;
    };

    charArr.forEach((ch, i) => {
      const globalIdx = refCharIdx + i;

      const syl = syllables.find(s => s.Grapheme === ch) || syllables[i] || null;
      if (syl) console.log(`[syl] char="${ch}" Phoneme="${syl.Phoneme}" Grapheme="${syl.Grapheme}" PA=${JSON.stringify(syl.PronunciationAssessment||{})}`);

      const charPhonemesByGrapheme = phonemes.filter(p => p.Grapheme === ch);
      const effectivePhonemes = charPhonemesByGrapheme.length > 0
        ? charPhonemesByGrapheme
        : charArr.length === 1
          ? phonemes
          : (() => {
              const ppc = Math.ceil(phonemes.length / charArr.length);
              return phonemes.slice(i * ppc, (i + 1) * ppc);
            })();
      const phFallback = effectivePhonemes[0] || null;

      const charAcc = syl ? subAcc(syl) : (phFallback ? subAcc(phFallback) : accuracy);
      cLevel[i] = levelOf(charAcc, errType, ch);

      // ── 基础错误标签 ──
      if (cLevel[i] === 2) {
        if (errType === 'Omission' && !wordHasDuration) cMsgs[i].push('漏读');
        else cMsgs[i].push(`准确度过低（${charAcc}分）`);
      } else if (cLevel[i] === 1) {
        if (errType === 'Insertion') cMsgs[i].push('多读');
        else if (errType === 'Mispronunciation') cMsgs[i].push('发音有误');
        else cMsgs[i].push(`发音需改进（${charAcc}分）`);
      }

      // ── 精确错误诊断 ──
      if (!(errType === 'Omission' && !wordHasDuration)) {
        const wantPy = normalizePy(pyMap[ch] || '');
        const wantTone = getTone(wantPy);

        let userSyllable = null;

        // STT 字符替换证据
        const sttMis = sttMismap.get(globalIdx);
        if (sttMis && sttMis.diag.length > 0) {
          console.log(`[SttMis] char="${ch}" pos=${globalIdx} got="${sttMis.got}" diag:`, JSON.stringify(sttMis.diag));
          sttMis.diag.forEach(e => {
            cMsgs[i].push(e.msg);
            if (e.cat === 'RETROFLEX' || e.cat === 'NASAL') {
              cLevel[i] = Math.max(cLevel[i], 2);
            } else {
              cLevel[i] = Math.max(cLevel[i], 1);
            }
          });
          if (!cMsgs[i].some(m => m.includes('发音'))) {
            cMsgs[i].unshift('发音有误');
          }
          userSyllable = userSyllable || sttMis.gotPy || null;
        }

        // 音节级声调检测（Tier E）
        if (syl && syl.Phoneme && wantPy && wantTone !== 0 && !userSyllable) {
          const sylPy   = normalizePy(syl.Phoneme);
          const sylTone = getTone(sylPy);
          const sylBase = sylPy.replace(/\d$/, '');
          const wantBase = wantPy.replace(/\d$/, '');
          console.log(`[TierE] char="${ch}" syl.Phoneme="${syl.Phoneme}" sylPy="${sylPy}" tone=${sylTone} wantTone=${wantTone} charAcc=${charAcc}`);
          if (sylBase === wantBase && sylTone > 0 && charAcc >= 40 && sylTone !== wantTone) {
            const sandhiExempt = (wantTone === 3 && sylTone === 2);
            if (!sandhiExempt) {
              userSyllable = sylPy;
              console.log(`[TierE] 声调偏差 char="${ch}" 期望${wantPy}(${wantTone}声) 检测到${sylPy}(${sylTone}声)`);
            } else {
              console.log(`[TierE] 变调豁免 char="${ch}" 3声→2声（连读规则）`);
            }
          }
        }

        // Tier D（NBest 翘舌/鼻音检测）— 腾讯无 NBest 数据时静默跳过
        if (wantPy && !sttMis && cLevel[i] === 0 && effectivePhonemes.length > 0) {
          const wInit  = getInitial(wantPy);
          const wFinal = getFinal(wantPy);
          const RETRO_INITS = ['zh', 'ch', 'sh', 'r'];
          const FLAT_INITS  = ['z', 'c', 's', 'l', 'n'];

          for (const ph of effectivePhonemes) {
            const nbl = (ph.PronunciationAssessment || {}).NBestPhonemes || [];
            if (!nbl.length) continue;
            const refPh = normalizePy(ph.Phoneme || '');

            if (RETRO_INITS.includes(wInit) && RETRO_INITS.includes(refPh)) {
              const flatAlt = nbl.slice(0, 3).find(n => {
                const p = normalizePy(n.Phoneme || '');
                return FLAT_INITS.includes(p) && (n.Score || 0) >= 0.15;
              });
              if (flatAlt) {
                const altPh = normalizePy(flatAlt.Phoneme || '');
                const conf  = Math.round((flatAlt.Score || 0) * 100);
                cMsgs[i].push(`平翘舌混淆：应读翘舌【${wInit}】，检测到平舌音【${altPh}】倾向（置信${conf}%）`);
                cLevel[i] = Math.max(cLevel[i], 1);
                console.log(`[TierD] char="${ch}" refPh="${refPh}" flatAlt="${altPh}" score=${conf}%`);
                break;
              }
            }

            const nasal_n  = ['n', 'an', 'en', 'in', 'un', 'ün', 'ian', 'uan'];
            const nasal_ng = ['ng', 'ang', 'eng', 'ing', 'ong', 'iong', 'uang', 'iang'];
            if (nasal_n.some(f => wFinal === f) || nasal_ng.some(f => wFinal === f)) {
              const wIsBack = nasal_ng.some(f => wFinal === f);
              const oppArr  = wIsBack ? nasal_n : nasal_ng;
              const oppAlt  = nbl.slice(0, 3).find(n => {
                const p = normalizePy(n.Phoneme || '');
                return oppArr.some(f => p === f || p.endsWith(f)) && (n.Score || 0) >= 0.15;
              });
              if (oppAlt) {
                const altPh = normalizePy(oppAlt.Phoneme || '');
                const conf  = Math.round((oppAlt.Score || 0) * 100);
                cMsgs[i].push(`前后鼻音混淆：应读【${wFinal}】（${wIsBack?'后鼻-ng':'前鼻-n'}），检测到【${altPh}】倾向（置信${conf}%）`);
                cLevel[i] = Math.max(cLevel[i], 1);
                console.log(`[TierD] char="${ch}" nasal wFinal="${wFinal}" altPh="${altPh}" score=${conf}%`);
                break;
              }
            }
          }
        }

        // Tier C：低准确度规则推断
        const isRetroflex = ['zh','ch','sh','r'].includes(getInitial(wantPy));
        if (wantPy && (charAcc < (isRetroflex ? 95 : 90) || errType === 'Mispronunciation')) {
          if (wantTone === 0 && charAcc < 55) {
            cMsgs[i].push('轻声字：读得过重，应短促轻读');
            if (cLevel[i] === 0) cLevel[i] = 1;
          }
          if (errType === 'Mispronunciation' && wantPy && cLevel[i] >= 1 && !sttMis) {
            const wInit  = getInitial(wantPy);
            const wFinal = getFinal(wantPy);
            const RETROFLEX_SET = ['zh', 'ch', 'sh', 'r'];
            const SIBILANT_SET  = ['z', 'c', 's'];
            const alreadyHasRetro = cMsgs[i].some(m => m.includes('翘舌') || m.includes('平舌'));
            const alreadyHasNasal = cMsgs[i].some(m => m.includes('鼻音'));
            if (!alreadyHasRetro) {
              if (RETROFLEX_SET.includes(wInit)) {
                cMsgs[i].push(`注意翘舌音声母【${wInit}】：舌尖上翘，不要读成平舌`);
              } else if (SIBILANT_SET.includes(wInit)) {
                cMsgs[i].push(`注意平舌音声母【${wInit}】：舌尖平放，不要读成翘舌`);
              }
            }
            if (!alreadyHasNasal) {
              if (wFinal.endsWith('ng')) {
                cMsgs[i].push(`注意后鼻音韵母【${wFinal}】：收尾 -ng（舌根抬起）`);
              } else if (wFinal.endsWith('n') && wFinal !== 'ng') {
                cMsgs[i].push(`注意前鼻音韵母【${wFinal}】：收尾 -n（舌尖抵上齿）`);
              }
            }
          }
        }

        // 声调检查
        if (wantPy && wantTone !== 0 && userSyllable) {
          const userTone = getTone(normalizePy(userSyllable));
          if (userTone && userTone !== wantTone) {
            const TONE_NAMES = ['','第1声（ā）','第2声（á）','第3声（ǎ）','第4声（à）'];
            const alreadyHasToneMsg = cMsgs[i].some(m => m.includes('声调'));
            if (!alreadyHasToneMsg) {
              cMsgs[i].push(`声调偏差：应${TONE_NAMES[wantTone]||'第'+wantTone+'声'}，识别${TONE_NAMES[userTone]||'第'+userTone+'声'}`);
              if (cLevel[i] === 0) cLevel[i] = 1;
            }
          }
        }

        // 儿化音检查
        const wantPy2 = normalizePy(pyMap[ch] || '');
        if (wantPy2 && wantPy2.includes('r') && ch === '儿' && wantTone === 0) {
          if (charAcc < 60) {
            cMsgs[i].push('儿化音：舌尖上卷，声音带卷舌色彩');
            cLevel[i] = Math.max(cLevel[i], 1);
          }
        }
      }

      console.log(`[parse] char="${ch}" acc=${charAcc} level=${cLevel[i]} msgs=${JSON.stringify(cMsgs[i])}`);
    });

    // 时间信息
    const wordOffsetSec   = (w.Offset   || 0) / 10_000_000;
    const wordDurationSec = (w.Duration || 0) / 10_000_000;
    const charDurSec      = charArr.length > 0 ? wordDurationSec / charArr.length : 0;

    charArr.forEach((ch, i) => {
      wordResults.push({
        content:   ch,
        perrLevel: cLevel[i],
        perrMsg:   cMsgs[i].join('；'),
        offset:    wordOffsetSec + i * charDurSec,
        duration:  charDurSec,
      });
    });
    refCharIdx += charArr.length;
  }

  // ── 分段线性映射 ──
  const segments = [
    [90, 100, 95, 100],
    [75,  89, 85,  94],
    [60,  74, 75,  84],
    [45,  59, 60,  74],
  ];
  function mapScore(raw) {
    for (const [s0, s1, d0, d1] of segments) {
      if (raw >= s0 && raw <= s1)
        return Math.round(d0 + (raw - s0) / (s1 - s0) * (d1 - d0));
    }
    return raw;
  }

  const rawScore   = pronScore;
  const totalScore = mapScore(rawScore);
  console.log(`[parse] rawScore=${rawScore} totalScore=${totalScore} wordResults=${wordResults.length}`);
  return { totalScore, rawScore, accuracyScore, completenessScore, fluencyScore, wordResults };
}

// ══════════════════════════════════════════════════════════════════
//  Vercel Serverless 入口
// ══════════════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!TENCENT_APP_ID || !TENCENT_SECRET_ID || !TENCENT_SECRET_KEY)
    return res.status(500).json({ error: 'TENCENT_APP_ID / TENCENT_SECRET_ID / TENCENT_SECRET_KEY env vars not configured' });

  try {
    // ── 解析请求体 ──
    let parsed = req.body;
    if (!parsed || typeof parsed !== 'object' || Buffer.isBuffer(parsed)) {
      let raw = '';
      await new Promise(resolve => { req.on('data', c => raw += c); req.on('end', resolve); });
      try { parsed = JSON.parse(raw); }
      catch { return res.status(400).json({ error: 'invalid JSON body' }); }
    }
    const { audioBase64, refText } = parsed;
    if (!audioBase64 || !refText)
      return res.status(400).json({ error: 'audioBase64 and refText are required' });

    // ── 并行调用：腾讯 SOE + Gemini 拼音 + Whisper（可选）──
    const [tencentResp, { map: pyMap, error: geminiErr }, whisperText] = await Promise.all([
      tencentSoeAssess(audioBase64, refText),
      getPinyinMapSafe(refText),
      whisperStt(audioBase64)
    ]);
    console.log('[handler] Whisper识别:', whisperText || '（空）');

    // ── 适配器：腾讯 → Azure 格式 ──
    const azureFormat = tencentToAzureFormat(tencentResp, refText);

    // ── 用 Whisper 作为 STT 来源 ──
    const sttText = whisperText ? [whisperText] : [];

    // ── 核心解析（全部业务逻辑在此）──
    const result = await parseAzureResult(azureFormat, refText, pyMap, sttText);

    // ── 双轨分析 ──
    const refClean = Array.from(refText.replace(/[，。！？,.!?\s、；：""''《》【】]/g, ''));
    const dualTrack = dualTrackAnalysis(refClean, whisperText, pyMap);
    result.dualTrackErrors = dualTrack.dualTrackErrors;
    result.whisperText     = dualTrack.whisperText;

    // ── _debug ──
    const tr = tencentResp.Response;
    result._debug = {
      engine:           'tencent-soe-ws',
      tencentRaw: {
        PronAccuracy:   tr.PronAccuracy,
        PronFluency:    tr.PronFluency,
        PronCompletion: tr.PronCompletion,
        SuggestedScore: tr.SuggestedScore,
        WordCount:      (tr.Words || []).length,
        SessionId:      tr.SessionId
      },
      rawScore:          result.rawScore,
      accuracyScore:     result.accuracyScore,
      completenessScore: result.completenessScore,
      fluencyScore:      result.fluencyScore,
      pyMap,
      whisperText:       whisperText || null,
      dualTrackErrors:   dualTrack.dualTrackErrors,
      geminiError:       geminiErr || null
    };

    res.status(200).json(result);
  } catch (err) {
    console.error('[evaluate] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
