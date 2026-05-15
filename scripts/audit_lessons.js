/**
 * audit_lessons.js — one-shot audit, no code modifications.
 *
 * Goal: for each lesson, check whether LESSONS_META[i].dialogue can be
 * losslessly derived from LESSONS[i].sentences (using contextAbove /
 * contextBelow). Output a per-lesson diff report so we know which lessons
 * are safe to migrate to a single source of truth.
 *
 * Usage: node scripts/audit_lessons.js
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const src = fs.readFileSync(HTML_PATH, 'utf8');

// ── Step 1. Extract array literals via brace balancing ────────────────
function extractArray(src, declName) {
  const startMarker = 'const ' + declName + ' = [';
  const startIdx = src.indexOf(startMarker);
  if (startIdx === -1) throw new Error('not found: ' + declName);
  let i = startIdx + startMarker.length - 1; // position of opening [
  let depth = 0;
  let inStr = null; // null | "'" | '"' | '`'
  let inLineComment = false;
  let inBlockComment = false;
  for (; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inLineComment) { if (ch === '\n') inLineComment = false; continue; }
    if (inBlockComment) { if (ch === '*' && next === '/') { inBlockComment = false; i++; } continue; }
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
    if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        const literal = src.slice(startIdx + ('const ' + declName + ' = ').length, i + 1);
        return literal;
      }
    }
  }
  throw new Error('unterminated array: ' + declName);
}

// Eval JS array literals in a sandbox-ish way. The literals use plain JS
// (no functions or refs), so direct Function eval is safe enough here.
function evalArray(literal) {
  // eslint-disable-next-line no-new-func
  return new Function('return ' + literal + ';')();
}

const LESSONS_RAW = extractArray(src, 'LESSONS');
const META_RAW    = extractArray(src, 'LESSONS_META');
const LESSONS      = evalArray(LESSONS_RAW);
const LESSONS_META = evalArray(META_RAW);

console.log('Loaded', LESSONS.length, 'LESSONS and', LESSONS_META.length, 'LESSONS_META.\n');

// ── Step 2. Derive dialogue from sentences ────────────────────────────
// Heuristic: each sentence carries a learner line (s.zh) and optionally
// contextAbove (local line that precedes it) and contextBelow (local line
// that follows it). Walking sentences in order and emitting:
//   contextAbove(if new) -> learner zh -> contextBelow(if last-or-changes)
// should reproduce a full dialogue.
function deriveDialogue(sentences) {
  const out = [];
  let lastLocalZh = null;
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    if (s.contextAbove && s.contextAbove.zh !== lastLocalZh) {
      out.push({
        role: 'local',
        speaker: s.contextAbove.speaker || '',
        zh: s.contextAbove.zh || '',
      });
      lastLocalZh = s.contextAbove.zh;
    }
    out.push({
      role: s.role || 'learner',
      speaker: s.speaker || '',
      zh: s.zh || '',
    });
    if (s.contextBelow) {
      out.push({
        role: 'local',
        speaker: s.contextBelow.speaker || '',
        zh: s.contextBelow.zh || '',
      });
      lastLocalZh = s.contextBelow.zh;
    }
  }
  return out;
}

// ── Step 3. Compare derived vs actual META.dialogue ───────────────────
function normalizeZh(s) {
  return (s || '').replace(/\s+/g, '').replace(/<br\s*\/?>/gi, '');
}

function compareDialogue(derived, actual) {
  const issues = [];
  const n = Math.max(derived.length, actual.length);
  for (let i = 0; i < n; i++) {
    const d = derived[i];
    const a = actual[i];
    if (!d) { issues.push(`[${i}] missing in derived (actual has: ${a.speaker} | ${a.zh})`); continue; }
    if (!a) { issues.push(`[${i}] missing in actual (derived has: ${d.speaker} | ${d.zh})`); continue; }
    if (normalizeZh(d.zh) !== normalizeZh(a.zh)) {
      issues.push(`[${i}] zh mismatch:\n      derived: ${d.zh}\n      actual:  ${a.zh}`);
    }
    if (d.role !== a.role) {
      issues.push(`[${i}] role mismatch: derived=${d.role} actual=${a.role}`);
    }
  }
  return issues;
}

// ── Step 4. Report ────────────────────────────────────────────────────
const report = { perfect: [], minor: [], blocked: [] };

for (let i = 0; i < Math.max(LESSONS.length, LESSONS_META.length); i++) {
  const lesson = LESSONS[i];
  const meta   = LESSONS_META[i];
  const label  = `Lesson ${i + 1} (LESSONS.id=${lesson && lesson.id} | META.id=${meta && meta.id})`;
  console.log('═══', label, '═══');

  if (!lesson || !meta) {
    console.log('  ⚠️  one side missing — cannot audit\n');
    report.blocked.push({ idx: i, reason: 'one side missing' });
    continue;
  }
  if (!Array.isArray(lesson.sentences) || lesson.sentences.length === 0) {
    console.log('  ⚠️  no sentences[] — cannot derive\n');
    report.blocked.push({ idx: i, reason: 'no sentences' });
    continue;
  }
  if (!Array.isArray(meta.dialogue) || meta.dialogue.length === 0) {
    console.log('  ⚠️  no dialogue[] — nothing to compare\n');
    report.blocked.push({ idx: i, reason: 'no dialogue' });
    continue;
  }

  const derived = deriveDialogue(lesson.sentences);
  const issues  = compareDialogue(derived, meta.dialogue);

  console.log(`  sentences=${lesson.sentences.length}  derived=${derived.length}  actual=${meta.dialogue.length}`);
  if (issues.length === 0) {
    console.log('  ✅ perfect match — safe to derive\n');
    report.perfect.push(i);
  } else if (issues.length <= 2 && derived.length === meta.dialogue.length) {
    console.log('  🟡 minor diffs:');
    issues.forEach(s => console.log('    ' + s));
    console.log('');
    report.minor.push({ idx: i, issues });
  } else {
    console.log('  ❌ structural mismatch:');
    issues.slice(0, 8).forEach(s => console.log('    ' + s));
    if (issues.length > 8) console.log('    ...(' + (issues.length - 8) + ' more)');
    console.log('');
    report.blocked.push({ idx: i, reason: 'structural', count: issues.length });
  }
}

// ── Summary ────────────────────────────────────────────────────────────
console.log('\n══════════════ SUMMARY ══════════════');
console.log(`✅ Perfect (safe to derive): ${report.perfect.length}  →  lessons ${report.perfect.map(i => i + 1).join(', ') || '(none)'}`);
console.log(`🟡 Minor diffs (fixable):    ${report.minor.length}    →  lessons ${report.minor.map(o => o.idx + 1).join(', ') || '(none)'}`);
console.log(`❌ Blocked (keep manual):    ${report.blocked.length}    →  lessons ${report.blocked.map(o => o.idx + 1).join(', ') || '(none)'}`);
console.log('\nVerdict:');
if (report.blocked.length === 0 && report.minor.length === 0) {
  console.log('  🟢 ALL lessons can be derived. Safe to migrate to single source.');
} else if (report.blocked.length === 0) {
  console.log('  🟡 Most lessons OK; minor diffs can be normalized before migration.');
} else {
  console.log('  🔴 Some lessons need data fixes OR must keep dual structure for now.');
}
