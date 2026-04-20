/**
 * detectToneSandhi.examples.tsx
 *
 * Shows how to use the detectToneSandhi utility in:
 *   A) Vanilla JS  — for the current ShadowLingo single-file HTML app
 *   B) React / TSX — for a future component-based rewrite
 */

// ════════════════════════════════════════════════════════════════════════════
// A · VANILLA JS  (embed directly in index.html <script> block)
// ════════════════════════════════════════════════════════════════════════════

/*
─── CSS to paste into your <style> block ───────────────────────────────────

.sandhi-mark {
  position: relative;
  display: inline-block;
}
.sandhi-mark::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -2px;
  border-bottom: 2px dashed #f97316;   /* orange-500 */
  pointer-events: none;
}
.sandhi-dot {
  display: inline-block;
  width: 4px; height: 4px;
  border-radius: 50%;
  background: #f97316;
  vertical-align: top;
  margin-left: 1px;
}

────────────────────────────────────────────────────────────────────────── */

/**
 * Vanilla JS: renderSandhiPinyin
 *
 * Renders pinyin tokens inside `container`, adding an orange dashed underline
 * and a tooltip on syllables that undergo tone sandhi.
 *
 * @param {HTMLElement} container  - Target DOM node; its innerHTML will be replaced
 * @param {string[]}    pinyinArr  - e.g. ['wǒ', 'gěi', 'nǐ', 'xiàn', 'jīn']
 * @param {string[]}    [charArr]  - Optional Chinese chars for 不/一 rules
 * @param {boolean}     [show]     - Set false to suppress the visual indicator
 */
function renderSandhiPinyin(container, pinyinArr, charArr, show = true) {
  // detectToneSandhi must be available in scope (inline or imported)
  const results = detectToneSandhi(pinyinArr, charArr);
  container.innerHTML = '';

  results.forEach(r => {
    const span = document.createElement('span');
    span.textContent = r.pinyin;

    if (r.isSandhi && show) {
      span.classList.add('sandhi-mark');
      span.title = `实际读 ${r.actualTone} 声 · ${r.rule}`;
    }

    container.appendChild(span);
    container.appendChild(document.createTextNode(' ')); // space between syllables
  });
}

// ─── Usage inside fcShowCard() ──────────────────────────────────────────────
//
// const chars    = '多少钱我给你现金'.split('');
// const pinyins  = ['duō','shǎo','qián','wǒ','gěi','nǐ','xiàn','jīn'];
// const pyRow    = document.getElementById('fc-py-row');
// renderSandhiPinyin(pyRow, pinyins, chars);


// ════════════════════════════════════════════════════════════════════════════
// B · REACT / TSX  (for a future component-based version of ShadowLingo)
// ════════════════════════════════════════════════════════════════════════════

import React from 'react';
import { detectToneSandhi, SandhiResult } from './detectToneSandhi';

// ─── Sub-component: single pinyin token ────────────────────────────────────

interface TokenProps {
  result: SandhiResult;
  showSandhi?: boolean;
}

function PinyinToken({ result: r, showSandhi = true }: TokenProps) {
  const hasMark = r.isSandhi && showSandhi;

  return (
    <span
      className="relative inline-block select-none"
      title={hasMark ? `实际读 ${r.actualTone} 声 · ${r.rule}` : undefined}
    >
      {/* The pinyin text — orange when sandhi, blue otherwise */}
      <span
        className={
          hasMark
            ? 'text-orange-300 font-medium'
            : 'text-blue-300 font-medium'
        }
      >
        {r.pinyin}
      </span>

      {/* Dashed orange underline to signal sandhi */}
      {hasMark && (
        <span
          className="absolute bottom-0 left-0 right-0"
          style={{ borderBottom: '2px dashed #f97316' }}
          aria-hidden
        />
      )}

      {/* Optional: tiny dot indicator above the syllable */}
      {hasMark && (
        <span
          className="absolute -top-1 right-0 w-1 h-1 rounded-full bg-orange-400"
          aria-hidden
        />
      )}
    </span>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

interface SandhiPinyinProps {
  /** Array of pinyin syllables with Unicode tone marks */
  pinyinArray: string[];
  /** Parallel array of Chinese characters (required for 不/一 rules) */
  charArray?: string[];
  /** Whether to render sandhi visual indicators (default true) */
  showSandhi?: boolean;
  /** Whether to show the Chinese character below each pinyin token */
  showChars?: boolean;
}

/**
 * React component that renders a row of pinyin tokens with sandhi indicators.
 *
 * @example
 * <SandhiPinyin
 *   pinyinArray={['wǒ', 'gěi', 'nǐ', 'xiàn', 'jīn']}
 *   charArray={['我', '给', '你', '现', '金']}
 *   showSandhi
 *   showChars
 * />
 */
export function SandhiPinyin({
  pinyinArray,
  charArray,
  showSandhi = true,
  showChars  = false,
}: SandhiPinyinProps) {
  const results = detectToneSandhi(pinyinArray, charArray);

  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-2 justify-center">
      {results.map((r, i) => (
        <div key={i} className="flex flex-col items-center">
          <PinyinToken result={r} showSandhi={showSandhi} />
          {showChars && r.char && (
            <span className="text-base text-slate-200 leading-tight mt-0.5">
              {r.char}
            </span>
          )}
        </div>
      ))}

      {/* Legend */}
      {showSandhi && results.some(r => r.isSandhi) && (
        <div className="w-full mt-2 flex items-center gap-1.5 justify-center">
          <span
            className="inline-block w-4 h-0"
            style={{ borderBottom: '2px dashed #f97316' }}
          />
          <span className="text-xs text-slate-400">
            变调提示 · tone changes in speech
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Example usage in a lesson sentence card ───────────────────────────────
//
// <SandhiPinyin
//   pinyinArray={['wǒ', 'gěi', 'nǐ', 'xiàn', 'jīn']}
//   charArray={  ['我',  '给',  '你',  '现',   '金' ]}
//   showSandhi
//   showChars
// />
//
// Expected output:
//   wǒ  (orange, dashed underline — 3+3 sandhi with gěi)
//   gěi (blue, no marker)
//   nǐ  (blue, no marker — 3 followed by non-3)
//   xiàn (blue)
//   jīn  (blue)
//
// More test cases:
//   ['bù', 'yòng']  +  ['不', '用']  →  不 becomes bú  (Rule 2)
//   ['yī', 'gè']    +  ['一', '个']  →  一 becomes yí  (Rule 3, T4 follows)
//   ['yī', 'tiān']  +  ['一', '天']  →  一 becomes yì  (Rule 3, T1 follows)
//   ['dì', 'yī']    +  ['第', '一']  →  no sandhi      (ordinal exception)
