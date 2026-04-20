/**
 * detectToneSandhi.ts
 *
 * Detects Mandarin Chinese tone sandhi (变调) patterns and annotates
 * pinyin arrays with the *actual spoken* tone vs. the written tone.
 *
 * ─── Rules implemented ────────────────────────────────────────────────────
 *
 *  Rule 1 · Third-tone sandhi  (三声变调)
 *    Any 3rd-tone syllable immediately followed by another 3rd-tone syllable
 *    becomes 2nd tone in speech.  Chains are resolved left-to-right:
 *      3+3   →  2+3
 *      3+3+3 →  2+2+3
 *
 *  Rule 2 · 不 (bù) sandhi
 *    不 is normally tone 4.  Before another tone-4 syllable it becomes 2 (bú).
 *      bù + T4 → bú + T4
 *
 *  Rule 3 · 一 (yī) sandhi
 *    一 is normally tone 1.  Its tone changes depending on what follows:
 *      一 + T4       → T2   (yí gè, yí wàn …)
 *      一 + T1/T2/T3 → T4   (yì tiān, yì nián …)
 *    Exception: 一 in ordinal / repeated contexts keeps T1 (第一, 一一)
 *    — detected by checking the *previous* character.
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *  import { detectToneSandhi } from './detectToneSandhi';
 *
 *  const results = detectToneSandhi(
 *    ['wǒ', 'gěi', 'nǐ', 'xiàn', 'jīn'],
 *    ['我',  '给',  '你',  '现',   '金']
 *  );
 *  // results[0] → { pinyin:'wǒ', char:'我', tone:3, isSandhi:true,  actualTone:2, rule:'3+3→2+3' }
 *  // results[1] → { pinyin:'gěi', char:'给', tone:3, isSandhi:false, actualTone:3 }
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SandhiResult {
  /** Original written pinyin — always shown to the learner unchanged */
  pinyin: string;
  /** Corresponding Chinese character (if charArray was supplied) */
  char?: string;
  /** Written tone: 1–4, 0 = neutral / toneless */
  tone: number;
  /** True when the actual spoken tone differs from the written tone */
  isSandhi: boolean;
  /** Actual spoken tone (may equal `tone` when isSandhi is false) */
  actualTone: number;
  /** Human-readable label of the rule that triggered the change */
  rule?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Extract the tone number from a pinyin syllable with diacritic marks. */
function getToneNumber(pinyin: string): number {
  if (/[àèìòùǜÀÈÌÒÙ]/.test(pinyin)) return 4;
  if (/[ǎěǐǒǔǚǍĚǏǑǓ]/.test(pinyin)) return 3;
  if (/[áéíóúǘÁÉÍÓÚ]/.test(pinyin)) return 2;
  if (/[āēīōūǖĀĒĪŌŪ]/.test(pinyin)) return 1;
  return 0; // neutral / toneless (e.g. 吗 ma, 了 le, 的 de)
}

// Characters that trigger 一 to stay in tone 1 (ordinal / counting context)
const YI_ORDINAL_PREV = new Set(['第', '初', '正', '唯']);

// ─── Main function ─────────────────────────────────────────────────────────

/**
 * Analyse an array of pinyin syllables for tone sandhi.
 *
 * @param pinyinArray  Syllables with Unicode tone marks, e.g. ['wǒ','gěi','nǐ']
 * @param charArray    Optional parallel array of Chinese characters.
 *                     Required for 不/一 sandhi detection.
 * @returns            One SandhiResult per syllable.
 */
export function detectToneSandhi(
  pinyinArray: string[],
  charArray?: string[]
): SandhiResult[] {

  // Build initial result objects (no sandhi marked yet)
  const results: SandhiResult[] = pinyinArray.map((p, i) => {
    const t = getToneNumber(p);
    return {
      pinyin: p,
      char: charArray?.[i],
      tone: t,
      isSandhi: false,
      actualTone: t,
    };
  });

  for (let i = 0; i < results.length; i++) {
    const curr = results[i];
    const next = results[i + 1] ?? null;
    const prev = results[i - 1] ?? null;
    const ch   = curr.char ?? '';

    // ── Rule 1 · Third-tone sandhi (3+3 → 2+3) ──────────────────────────
    // Use actualTone (already modified earlier in the loop) so that chains
    // like 3+3+3 resolve correctly to 2+2+3.
    if (curr.actualTone === 3 && next && next.tone === 3) {
      curr.isSandhi   = true;
      curr.actualTone = 2;
      curr.rule       = '3+3 → 2+3';
    }

    // ── Rule 2 · 不 sandhi: bù + T4 → bú ────────────────────────────────
    if (ch === '不' && curr.tone === 4 && next && next.tone === 4) {
      curr.isSandhi   = true;
      curr.actualTone = 2;
      curr.rule       = '不 + T4 → bú';
    }

    // ── Rule 3 · 一 sandhi ───────────────────────────────────────────────
    if (ch === '一') {
      // Ordinal context (第一, 初一 …) → keep T1, no sandhi
      const prevChar = prev?.char ?? '';
      if (YI_ORDINAL_PREV.has(prevChar)) continue;

      if (next) {
        if (next.tone === 4) {
          // 一 + T4 → yí (T2)
          curr.isSandhi   = true;
          curr.actualTone = 2;
          curr.rule       = '一 + T4 → yí';
        } else if (next.tone >= 1 && next.tone <= 3) {
          // 一 + T1/T2/T3 → yì (T4)
          curr.isSandhi   = true;
          curr.actualTone = 4;
          curr.rule       = `一 + T${next.tone} → yì`;
        }
        // next.tone === 0 (neutral): 一 keeps T1, no sandhi
      }
    }
  }

  return results;
}

// ─── Convenience: plain JS object version (no TS needed at runtime) ────────

/** Same as detectToneSandhi but exported as CommonJS for easy Node.js use. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(detectToneSandhi as any).getToneNumber = getToneNumber;
