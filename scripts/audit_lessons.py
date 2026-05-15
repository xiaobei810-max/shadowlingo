"""
audit_lessons.py — one-shot audit, no code modifications.

Checks whether LESSONS_META[i].dialogue can be losslessly derived from
LESSONS[i].sentences via contextAbove / contextBelow. Outputs a per-lesson
report so we know which lessons are safe to migrate to a single source.

Usage: python3 scripts/audit_lessons.py
"""
import json5
import pathlib
import re
import sys

HTML = pathlib.Path(__file__).parent.parent / "public" / "index.html"
src  = HTML.read_text(encoding="utf-8")


def extract_array_literal(text, decl_name):
    """Find `const NAME = [...]` and return the array literal string."""
    marker = f"const {decl_name} = ["
    start  = text.find(marker)
    if start == -1:
        raise RuntimeError(f"not found: {decl_name}")
    i = start + len(marker) - 1   # position of opening '['
    depth = 0
    in_str = None       # None | "'" | '"' | '`'
    in_line_cmt  = False
    in_block_cmt = False
    while i < len(text):
        ch  = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_line_cmt:
            if ch == "\n": in_line_cmt = False
            i += 1; continue
        if in_block_cmt:
            if ch == "*" and nxt == "/":
                in_block_cmt = False; i += 2; continue
            i += 1; continue
        if in_str:
            if ch == "\\": i += 2; continue
            if ch == in_str: in_str = None
            i += 1; continue
        if ch == "/" and nxt == "/": in_line_cmt  = True; i += 2; continue
        if ch == "/" and nxt == "*": in_block_cmt = True; i += 2; continue
        if ch in ("'", '"', "`"): in_str = ch; i += 1; continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return text[start + len(marker) - 1 : i + 1]
        i += 1
    raise RuntimeError(f"unterminated array: {decl_name}")


LESSONS_RAW = extract_array_literal(src, "LESSONS")
META_RAW    = extract_array_literal(src, "LESSONS_META")

# json5 handles: unquoted keys, single quotes, trailing commas, comments.
# But it doesn't handle JS template literals — confirm none present.
for name, raw in (("LESSONS", LESSONS_RAW), ("LESSONS_META", META_RAW)):
    if "`" in raw:
        print(f"warn: backticks in {name}; json5 may fail", file=sys.stderr)

try:
    LESSONS      = json5.loads(LESSONS_RAW)
    LESSONS_META = json5.loads(META_RAW)
except Exception as e:
    print("json5 parse error:", e)
    sys.exit(1)

print(f"Loaded {len(LESSONS)} LESSONS and {len(LESSONS_META)} LESSONS_META.\n")


# ── derive dialogue from sentences ────────────────────────────────────
def derive_dialogue(sentences):
    out = []
    last_local_zh = None
    for s in sentences:
        ca = s.get("contextAbove")
        if ca and ca.get("zh") != last_local_zh:
            out.append({
                "role": "local",
                "speaker": ca.get("speaker", ""),
                "zh": ca.get("zh", ""),
            })
            last_local_zh = ca.get("zh")
        out.append({
            "role": s.get("role", "learner"),
            "speaker": s.get("speaker", ""),
            "zh": s.get("zh", ""),
        })
        cb = s.get("contextBelow")
        if cb:
            out.append({
                "role": "local",
                "speaker": cb.get("speaker", ""),
                "zh": cb.get("zh", ""),
            })
            last_local_zh = cb.get("zh")
    return out


def norm_zh(s):
    return re.sub(r"\s+", "", re.sub(r"<br\s*/?>", "", s or "", flags=re.I))


def compare(derived, actual):
    issues = []
    n = max(len(derived), len(actual))
    for i in range(n):
        d = derived[i] if i < len(derived) else None
        a = actual[i]  if i < len(actual)  else None
        if d is None:
            issues.append(f"[{i}] missing in derived (actual: {a.get('speaker','')} | {a.get('zh','')})"); continue
        if a is None:
            issues.append(f"[{i}] missing in actual  (derived: {d.get('speaker','')} | {d.get('zh','')})"); continue
        if norm_zh(d["zh"]) != norm_zh(a.get("zh", "")):
            issues.append(f"[{i}] zh mismatch:\n      derived: {d['zh']}\n      actual:  {a.get('zh','')}")
        if d["role"] != a.get("role"):
            issues.append(f"[{i}] role mismatch: derived={d['role']} actual={a.get('role')}")
    return issues


# ── per-lesson report ─────────────────────────────────────────────────
report = {"perfect": [], "minor": [], "blocked": []}

n = max(len(LESSONS), len(LESSONS_META))
for i in range(n):
    lesson = LESSONS[i] if i < len(LESSONS) else None
    meta   = LESSONS_META[i] if i < len(LESSONS_META) else None
    lid    = lesson and lesson.get("id")
    mid    = meta   and meta.get("id")
    print(f"═══ Lesson {i+1} (LESSONS.id={lid} | META.id={mid}) ═══")

    if not lesson or not meta:
        print("  ⚠️  one side missing\n")
        report["blocked"].append((i, "one side missing")); continue
    sents = lesson.get("sentences") or []
    dlg   = meta.get("dialogue") or []
    if not sents:
        print("  ⚠️  no sentences[]\n"); report["blocked"].append((i, "no sentences")); continue
    if not dlg:
        print("  ⚠️  no dialogue[]\n");  report["blocked"].append((i, "no dialogue"));  continue

    derived = derive_dialogue(sents)
    issues  = compare(derived, dlg)
    print(f"  sentences={len(sents)}  derived={len(derived)}  actual={len(dlg)}")

    if not issues:
        print("  ✅ perfect match\n")
        report["perfect"].append(i)
    elif len(issues) <= 2 and len(derived) == len(dlg):
        print("  🟡 minor diffs:")
        for s in issues: print("    " + s)
        print()
        report["minor"].append((i, issues))
    else:
        print("  ❌ structural mismatch:")
        for s in issues[:8]: print("    " + s)
        if len(issues) > 8: print(f"    ...({len(issues) - 8} more)")
        print()
        report["blocked"].append((i, f"structural ({len(issues)} issues)"))

# ── summary ───────────────────────────────────────────────────────────
print("\n══════════════ SUMMARY ══════════════")
print(f"✅ Perfect (safe to derive): {len(report['perfect'])}  →  lessons {', '.join(str(i+1) for i in report['perfect']) or '(none)'}")
print(f"🟡 Minor diffs (fixable):    {len(report['minor'])}  →  lessons {', '.join(str(o[0]+1) for o in report['minor']) or '(none)'}")
print(f"❌ Blocked (manual review):  {len(report['blocked'])}  →  lessons {', '.join(str(o[0]+1) for o in report['blocked']) or '(none)'}")
print()
if not report["blocked"] and not report["minor"]:
    print("  🟢 ALL lessons can be derived. Safe to migrate.")
elif not report["blocked"]:
    print("  🟡 Most lessons OK; minor diffs can be normalized.")
else:
    print("  🔴 Some lessons need data fixes OR must keep dual structure.")
