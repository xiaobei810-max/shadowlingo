"""
migrate_meta_fields.py — one-shot migration, Commit 2.

Adds three top-level fields to each LESSONS entry, copying values from the
matching LESSONS_META entry:
  - title    (e.g. "机场相遇")
  - scene    (plain-text scene description)
  - correct  (the "natural vs textbook" comparison table)

Does NOT touch LESSONS_META and does NOT change any caller. After this
migration, both data sources carry these fields, so Commit 3 can switch
the two callers from META to LESSONS without breaking anything.

Idempotent: if a field already exists on a LESSONS entry, it is skipped.

Usage: python3 scripts/migrate_meta_fields.py
"""
import json
import json5
import pathlib
import re
import sys

HTML = pathlib.Path(__file__).parent.parent / "public" / "index.html"
src  = HTML.read_text(encoding="utf-8")


# ── reuse the array extractor from audit_lessons.py ───────────────────
def extract_array_literal(text, decl_name):
    marker = f"const {decl_name} = ["
    start  = text.find(marker)
    if start == -1:
        raise RuntimeError(f"not found: {decl_name}")
    i = start + len(marker) - 1
    depth = 0; in_str = None; in_lc = False; in_bc = False
    while i < len(text):
        ch  = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_lc:
            if ch == "\n": in_lc = False
            i += 1; continue
        if in_bc:
            if ch == "*" and nxt == "/": in_bc = False; i += 2; continue
            i += 1; continue
        if in_str:
            if ch == "\\": i += 2; continue
            if ch == in_str: in_str = None
            i += 1; continue
        if ch == "/" and nxt == "/": in_lc = True; i += 2; continue
        if ch == "/" and nxt == "*": in_bc = True; i += 2; continue
        if ch in ("'", '"', "`"): in_str = ch; i += 1; continue
        if ch == "[": depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0: return text[start + len(marker) - 1 : i + 1]
        i += 1
    raise RuntimeError("unterminated")


# ── parse META, build id -> {title, scene, correct} map ───────────────
LESSONS_META = json5.loads(extract_array_literal(src, "LESSONS_META"))

meta_by_id = {}
for m in LESSONS_META:
    mid = m["id"]
    if isinstance(mid, int):
        mid = f"lesson-{mid}"
    meta_by_id[mid] = m

print(f"Parsed {len(meta_by_id)} META entries: {sorted(meta_by_id.keys())}")


# ── JS-literal serializer ─────────────────────────────────────────────
def js_str(s):
    return '"' + (
        s.replace("\\", "\\\\")
         .replace('"', '\\"')
         .replace("\n", "\\n")
    ) + '"'


def js_value(v, indent):
    """Serialize a Python value to a JS literal. `indent` = column of this
    value's containing token (so nested content opens at indent+2)."""
    pad = " " * indent
    inner_pad = " " * (indent + 2)
    if isinstance(v, str):
        return js_str(v)
    if v is True:  return "true"
    if v is False: return "false"
    if v is None:  return "null"
    if isinstance(v, (int, float)):
        return json.dumps(v)
    if isinstance(v, list):
        if not v: return "[]"
        items = [js_value(x, indent + 2) for x in v]
        return "[\n" + ",\n".join(inner_pad + it for it in items) + "\n" + pad + "]"
    if isinstance(v, dict):
        if not v: return "{}"
        lines = [inner_pad + k + ": " + js_value(vv, indent + 2) for k, vv in v.items()]
        return "{\n" + ",\n".join(lines) + "\n" + pad + "}"
    raise ValueError(f"cannot serialize: {v!r}")


# ── walk the file, inject fields right after each `id: "lesson-N",` ──
# Only inside LESSONS (i.e. before `const LESSONS_META`).
lines = src.split("\n")
meta_start_idx = None
for i, ln in enumerate(lines):
    if "const LESSONS_META" in ln:
        meta_start_idx = i; break
if meta_start_idx is None:
    print("could not find LESSONS_META start"); sys.exit(1)

# Detect existing top-level fields per lesson, so we skip re-inserting.
# We look ahead from the `id:` line until the matching closing `},` at the
# same indent level — that's the lesson object body.
out = []
i = 0
inserted = []
while i < len(lines):
    line = lines[i]
    out.append(line)
    if i >= meta_start_idx:
        i += 1; continue
    m = re.match(r'^(\s+)id:\s*"(lesson-\d+)",\s*$', line)
    if not m:
        i += 1; continue
    indent_str = m.group(1)
    indent_n   = len(indent_str)
    lid        = m.group(2)
    meta       = meta_by_id.get(lid)
    if not meta:
        i += 1; continue

    # Look ahead to find the end of this lesson object: the line `      },`
    # at the same indent level (indent_n - 2, since `id:` is one level
    # deeper than the lesson object's braces).
    body_end = None
    parent_indent = " " * (indent_n - 2)
    for j in range(i + 1, meta_start_idx):
        if lines[j].rstrip() in (parent_indent + "},", parent_indent + "}"):
            body_end = j; break
    if body_end is None:
        print(f"warn: could not find end of lesson {lid}"); i += 1; continue

    body = "\n".join(lines[i:body_end])
    new_fields = []
    for fname in ("title", "scene", "correct"):
        if fname not in meta:
            continue
        # Skip if already present at top level (rough check: a line like `        title:` exists)
        pat = re.compile(r"^" + re.escape(indent_str) + re.escape(fname) + r":\s")
        if any(pat.match(ln) for ln in lines[i:body_end]):
            print(f"  [{lid}] {fname} already present — skip")
            continue
        val_str = js_value(meta[fname], indent_n)
        new_fields.append(f"{indent_str}{fname}: {val_str},")

    if new_fields:
        out.extend(new_fields)
        inserted.append((lid, [f.split(":")[0].strip() for f in new_fields]))
    i += 1

new_src = "\n".join(out)
if new_src == src:
    print("\nno changes needed.")
    sys.exit(0)

HTML.write_text(new_src, encoding="utf-8")
print(f"\n✅ Migrated {len(inserted)} lessons:")
for lid, fields in inserted:
    print(f"  {lid}: +{', '.join(fields)}")
