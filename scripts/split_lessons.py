"""
split_lessons.py — 一次性把 public/index.html 里的 LESSONS 数组
拆成 lessons/lesson-N.js 独立文件。

输出：
  lessons/lesson-1.js   ← 每个文件包含一个完整 lesson 对象字面量（{ ... }）
  lessons/lesson-2.js
  ...
  lessons/lesson-15.js

不修改 index.html。配合 build_lessons.py 使用：
  - 编辑某课时只动它自己的文件
  - 跑 build_lessons.py 把所有文件回填到 index.html

Usage:  python3 scripts/split_lessons.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
HTML = ROOT / "public" / "index.html"
OUT  = ROOT / "lessons"

src = HTML.read_text(encoding="utf-8")


# ── 找 LESSONS = [...] 的边界 ────────────────────────────────────────
def find_lessons_array_bounds(text):
    """返回 (start_idx, end_idx) — start 指向 '['，end 指向 ']'。"""
    marker = "const LESSONS = ["
    s = text.find(marker)
    if s == -1:
        raise RuntimeError("LESSONS not found")
    i = s + len(marker) - 1   # 指向 '['
    depth = 0; in_str = None; in_lc = False; in_bc = False
    while i < len(text):
        ch = text[i]; nxt = text[i+1] if i+1 < len(text) else ""
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
            if depth == 0:
                return (s + len(marker) - 1, i)
        i += 1
    raise RuntimeError("LESSONS not closed")


# ── 在数组内找每个 lesson 对象 { ... } 的边界 ─────────────────────────
def find_top_level_objects(text, lo, hi):
    """text[lo..hi] 是 '[' ... ']'。返回每个顶层 {...} 的 (start, end) 列表。"""
    objs = []
    i = lo + 1   # 跳过 '['
    in_str = None; in_lc = False; in_bc = False
    while i <= hi:
        ch = text[i]; nxt = text[i+1] if i+1 < len(text) else ""
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
        if ch == "{":
            # 找到对象起点，扫到匹配的 '}'
            start = i
            depth = 1
            i += 1
            in_str2 = None; in_lc2 = False; in_bc2 = False
            while i <= hi and depth > 0:
                c = text[i]; n = text[i+1] if i+1 < len(text) else ""
                if in_lc2:
                    if c == "\n": in_lc2 = False
                    i += 1; continue
                if in_bc2:
                    if c == "*" and n == "/": in_bc2 = False; i += 2; continue
                    i += 1; continue
                if in_str2:
                    if c == "\\": i += 2; continue
                    if c == in_str2: in_str2 = None
                    i += 1; continue
                if c == "/" and n == "/": in_lc2 = True; i += 2; continue
                if c == "/" and n == "*": in_bc2 = True; i += 2; continue
                if c in ("'", '"', "`"): in_str2 = c; i += 1; continue
                if c == "{": depth += 1
                elif c == "}":
                    depth -= 1
                    if depth == 0:
                        objs.append((start, i))
                        i += 1
                        break
                i += 1
            continue
        i += 1
    return objs


# ── 主流程 ──────────────────────────────────────────────────────────
arr_lo, arr_hi = find_lessons_array_bounds(src)
objs = find_top_level_objects(src, arr_lo, arr_hi)
print(f"找到 {len(objs)} 个 lesson 对象")

if len(objs) != 15:
    print(f"⚠️  期望 15 个，实际 {len(objs)} 个，停止")
    sys.exit(1)

OUT.mkdir(exist_ok=True)

for idx, (s, e) in enumerate(objs):
    body = src[s:e+1]  # 包含 { 和 }
    # 提取 id 字段确认编号
    m = re.search(r'id:\s*"(lesson-\d+)"', body)
    if not m:
        print(f"⚠️  对象 {idx} 找不到 id"); continue
    lid = m.group(1)
    out_path = OUT / f"{lid}.js"
    out_path.write_text(body + "\n", encoding="utf-8")
    print(f"  写入 {out_path.relative_to(ROOT)} ({len(body)} 字节)")

print(f"\n✅ 拆分完成，共 {len(objs)} 个文件")
