/**
 * acousticAnalyzer.js — 基于 Web Audio API 的声学层平翘舌检测
 *
 * 原理：平舌音(s/z/c) 高频噪声集中在 4000–8000 Hz；
 *       翘舌音(sh/zh/ch) 能量集中在 2000–4000 Hz，F3 明显偏低。
 *       通过计算两频段能量比，直接在音频信号层判断声母类型。
 *
 * 完全在浏览器本地运行，无需额外 API 调用。
 */
(function (global) {
  'use strict';

  // ── 可配置常量 ────────────────────────────────────────────────
  var CONFIG = {
    FFT_SIZE:         2048,   // FFT 点数（16kHz 下频率分辨率 ≈ 7.8 Hz/bin）
    CONSONANT_SKIP_MS: 15,    // 跳过字起始的过渡段（毫秒）
    CONSONANT_TAKE_MS: 150,   // 分析声母段的时长（毫秒）
    LOW_BAND_LO:      2000,   // 翘舌音主能量带下限 (Hz)
    LOW_BAND_HI:      4000,   // 翘舌音主能量带上限 (Hz)
    HIGH_BAND_LO:     4000,   // 平舌音主能量带下限 (Hz)
    HIGH_BAND_HI:     8000,   // 平舌音主能量带上限 (Hz)
    FLAT_THRESHOLD:   1.2,    // ratio > 此值 → 平舌音倾向 (s/z/c)（降低以捕捉更多边界）
    RETRO_THRESHOLD:  0.75,   // ratio < 此值 → 翘舌音倾向 (sh/zh/ch)（提高以捕捉更多边界）
    MIN_ENERGY:       1e-7,   // 静音过滤阈值（低于此值忽略）
    MIN_CONFIDENCE:   0.32,   // 最低置信度（降低以捕捉置信度较低但可疑的案例）
  };

  // ── 声母纠正提示 ──────────────────────────────────────────────
  var TIPS = {
    'zh': 'zh：舌尖上卷贴近硬腭，气流从缝隙挤出，声带不振动',
    'ch': 'ch：舌尖上卷，送气（比 zh 气流更强）',
    'sh': 'sh：舌尖上卷，不贴硬腭，留缝隙发摩擦音',
    'r':  'r：舌尖上卷，声带振动，带摩擦感',
    'z':  'z：舌尖抵上齿背，不卷舌，声带振动',
    'c':  'c：舌尖抵上齿背，不卷舌，强送气',
    's':  's：舌尖靠近上齿，不卷舌，发摩擦音',
  };

  var RETRO_SET = { zh: 1, ch: 1, sh: 1, r: 1 };
  var FLAT_SET  = { z: 1, c: 1, s: 1 };

  // ── Radix-2 原地 FFT（Cooley-Tukey）─────────────────────────
  function fft(re, im) {
    var n = re.length;
    // 位反转置换
    for (var i = 0, j = 0; i < n; i++) {
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
    }
    // 蝶形运算
    for (var len = 2; len <= n; len <<= 1) {
      var half = len >> 1;
      var ang  = -2 * Math.PI / len;
      var wRe  = Math.cos(ang), wIm = Math.sin(ang);
      for (var i = 0; i < n; i += len) {
        var cRe = 1, cIm = 0;
        for (var k = 0; k < half; k++) {
          var uRe = re[i + k],       uIm = im[i + k];
          var vRe = re[i + k + half] * cRe - im[i + k + half] * cIm;
          var vIm = re[i + k + half] * cIm + im[i + k + half] * cRe;
          re[i + k]        = uRe + vRe;  im[i + k]        = uIm + vIm;
          re[i + k + half] = uRe - vRe;  im[i + k + half] = uIm - vIm;
          var nRe = cRe * wRe - cIm * wIm;
          cIm = cRe * wIm + cIm * wRe;
          cRe = nRe;
        }
      }
    }
  }

  // ── 从 AudioBuffer 提取指定时间段的功率谱 ────────────────────
  // audioBuffer: 16kHz AudioBuffer（来自 OfflineAudioContext 渲染结果）
  // startSec: 起始时间（秒）
  // takeSec: 分析时长（秒）
  // 返回: { power: Float64Array(N/2), sampleRate, fftSize }
  function extractSpectrum(audioBuffer, startSec, takeSec) {
    var sr    = audioBuffer.sampleRate;           // 16000
    var data  = audioBuffer.getChannelData(0);
    var N     = CONFIG.FFT_SIZE;                  // 2048
    var start = Math.max(0, Math.round(startSec * sr));
    var take  = Math.round(takeSec * sr);
    take = Math.min(take, data.length - start);

    var re = new Float64Array(N);
    var im = new Float64Array(N);

    // Hann 窗 + 填充样本
    for (var i = 0; i < N; i++) {
      var s    = (i < take) ? data[start + i] : 0;
      var hann = 0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1)));
      re[i] = s * hann;
      im[i] = 0;
    }

    fft(re, im);

    // 单边功率谱（前 N/2 个 bin）
    var power = new Float64Array(N / 2);
    for (var k = 0; k < N / 2; k++) {
      power[k] = (re[k] * re[k] + im[k] * im[k]) / (N * N);
    }

    return { power: power, sampleRate: sr, fftSize: N };
  }

  // ── 计算指定频段内的总能量 ───────────────────────────────────
  function bandEnergy(spectrum, freqLo, freqHi) {
    var res  = spectrum.sampleRate / spectrum.fftSize;
    var lo   = Math.round(freqLo / res);
    var hi   = Math.min(Math.round(freqHi / res), spectrum.power.length - 1);
    var e    = 0;
    for (var k = lo; k <= hi; k++) e += spectrum.power[k];
    return e;
  }

  // ── 核心函数2：分类声母 ───────────────────────────────────────
  // spectrum: extractSpectrum 的返回值
  // 返回: { type: 'flat'|'retroflex'|'uncertain'|'silence', ratio, confidence, lowE, highE }
  function classifyInitialConsonant(spectrum) {
    var lowE  = bandEnergy(spectrum, CONFIG.LOW_BAND_LO,  CONFIG.LOW_BAND_HI);
    var highE = bandEnergy(spectrum, CONFIG.HIGH_BAND_LO, CONFIG.HIGH_BAND_HI);
    var total = lowE + highE;

    if (total < CONFIG.MIN_ENERGY) {
      return { type: 'silence', ratio: 0, confidence: 0, lowE: lowE, highE: highE };
    }

    var ratio = highE / (lowE + 1e-12);
    var type, confidence;

    if (ratio > CONFIG.FLAT_THRESHOLD) {
      type = 'flat';
      // 比阈值超出越多，置信度越高
      confidence = Math.min(1, (ratio - CONFIG.FLAT_THRESHOLD) / CONFIG.FLAT_THRESHOLD);
    } else if (ratio < CONFIG.RETRO_THRESHOLD) {
      type = 'retroflex';
      confidence = Math.min(1, (CONFIG.RETRO_THRESHOLD - ratio) / CONFIG.RETRO_THRESHOLD);
    } else {
      type = 'uncertain';
      confidence = 0;
    }

    return { type: type, ratio: ratio, confidence: confidence, lowE: lowE, highE: highE };
  }

  // ── 从拼音字符串提取声母 ──────────────────────────────────────
  // py: 带调号的拼音，如 "shi4", "zuo4", "ren2"
  function getInitialFromPinyin(py) {
    if (!py) return '';
    var s = py.toLowerCase().replace(/[āáǎàēéěèīíǐìōóǒòūúǔùüǖǘǚǜ]/g, function (c) {
      return 'aeiouuu'[['āáǎà','ēéěè','īíǐì','ōóǒò','ūúǔù','üǖǘǚǜ'].findIndex(function(g){return g.indexOf(c)>=0;})];
    }).replace(/[12345]$/, '').trim();
    if (s.length >= 2 && (s.slice(0,2) === 'zh' || s.slice(0,2) === 'ch' || s.slice(0,2) === 'sh')) {
      return s.slice(0, 2);
    }
    var one = s[0] || '';
    return ('bpmfdtnlgkhzcsryjwq'.indexOf(one) >= 0) ? one : '';
  }

  // ── 核心函数3：主分析函数 ─────────────────────────────────────
  // audioBuffer : 16kHz AudioBuffer（convertToPCM 返回的 rendered buffer）
  // wordTimings : result.wordResults — 每个元素含 { content, offset, duration, perrLevel }
  //               offset/duration 已由后端换算为秒
  // pyMap       : { char: pinyin } — 来自 s.chars
  //
  // 返回: Array<{char, position, targetInitial, detectedType, ratio, confidence, message, type}>
  function analyzeZhZConfusion(audioBuffer, wordTimings, pyMap) {
    var errors = [];
    if (!audioBuffer || !wordTimings || !wordTimings.length) return errors;

    var skipSec = CONFIG.CONSONANT_SKIP_MS / 1000;
    var takeSec = CONFIG.CONSONANT_TAKE_MS / 1000;

    for (var i = 0; i < wordTimings.length; i++) {
      var wt = wordTimings[i];
      if (!wt || wt.offset == null || !wt.duration) continue;

      var ch = wt.content;
      var py = pyMap && pyMap[ch];
      if (!py) continue;

      var targetInit = getInitialFromPinyin(py);
      if (!targetInit) continue;

      var isTargetRetro = !!RETRO_SET[targetInit];
      var isTargetFlat  = !!FLAT_SET[targetInit];
      if (!isTargetRetro && !isTargetFlat) continue;

      // 字的起始时刻 + skipSec 处开始分析，取 takeSec
      var analyzeStart = wt.offset + skipSec;
      // 确保分析窗口在字的时间范围内
      var availableSec = Math.max(0, wt.duration - skipSec);
      if (availableSec < 0.03) continue;  // 字太短，跳过
      var actualTake = Math.min(takeSec, availableSec);

      var spectrum = extractSpectrum(audioBuffer, analyzeStart, actualTake);
      var cls      = classifyInitialConsonant(spectrum);

      console.log(
        '[Acoustic] char="' + ch + '" init=' + targetInit +
        ' ratio=' + cls.ratio.toFixed(2) +
        ' conf=' + cls.confidence.toFixed(2) +
        ' type=' + cls.type +
        ' lowE=' + cls.lowE.toExponential(2) +
        ' highE=' + cls.highE.toExponential(2)
      );

      if (cls.type === 'silence' || cls.type === 'uncertain') continue;
      if (cls.confidence < CONFIG.MIN_CONFIDENCE) continue;

      var mismatch =
        (isTargetRetro && cls.type === 'flat') ||
        (isTargetFlat  && cls.type === 'retroflex');
      if (!mismatch) continue;

      // 新句式格式："市" 声母应为翘舌sh，而不是平舌音。
      var zhMsg = '"' + ch + '" 声母应为' + (isTargetRetro ? '翘舌' : '平舌') + targetInit
                + '，而不是' + (isTargetRetro ? '平舌音' : '翘舌音') + '。';
      var enMsg = '"' + ch + '" initial should be ' + (isTargetRetro ? 'retroflex ' : 'flat ')
                + targetInit + ', not the ' + (isTargetRetro ? 'flat' : 'retroflex') + ' consonant.';
      var tip = TIPS[targetInit] || '';

      errors.push({
        char:          ch,
        position:      i,
        targetInitial: targetInit,
        detectedType:  cls.type,
        ratio:         Math.round(cls.ratio * 100) / 100,
        confidence:    Math.round(cls.confidence * 100) / 100,
        zh:            zhMsg,
        en:            enMsg,
        tip:           tip,   // 保留供调试
        type:          isTargetRetro ? 'zh_z_acoustic' : 'z_zh_acoustic',
      });
    }

    return errors;
  }

  // ── 公共 API ──────────────────────────────────────────────────
  global.acousticAnalyzer = {
    analyzeZhZConfusion:      analyzeZhZConfusion,
    classifyInitialConsonant: classifyInitialConsonant,
    extractSpectrum:          extractSpectrum,
    getInitialFromPinyin:     getInitialFromPinyin,
    CONFIG:                   CONFIG,
  };

})(typeof window !== 'undefined' ? window : this);
