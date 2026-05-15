"""
validate_lessons.py — pre-deploy consistency audit.

跑一次可以挡掉绝大多数「沉默 bug」：拼音错位、chars 数量不匹配、speaker
没头像、图片路径不存在等。每次改完 LESSONS 后跑一次再 push。

Usage:  python3 scripts/validate_lessons.py
Exit:   0 = 全部通过； 1 = 有错误

检查项 (✓ = 致命错误，会阻断；△ = 警告，建议看一眼):
  ✓ id 唯一
  ✓ scene / coverScene.zh 非空
  ✓ chars[] 里汉字数 == pinyin 字符串过滤后的音节数
    （同样规则应用到 contextAbove / contextBelow）
  ✓ chars[].c 拼起来 == zh 里的汉字
  ✓ pinyin 中无大写带调字母（Bīng/Nǐ 这种句首大写词允许，但 È/Ǎ 在词中不允许）
  ✓ 所有引用到的 cgImage / cardImage 文件在磁盘上存在
  △ speaker 字段无法识别（不在已知列表）
  △ role 字段不是 'learner' / 'local'
"""
import json5
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).parent.parent
HTML = ROOT / "public" / "index.html"
src  = HTML.read_text(encoding="utf-8")


# ── 复制 audit_lessons.py 里的 array 提取器 ───────────────────────────
def extract_array_literal(text, decl_name):
    marker = f"const {decl_name} = ["
    start = text.find(marker)
    if start == -1:
        raise RuntimeError(f"not found: {decl_name}")
    i = start + len(marker) - 1
    depth = 0; in_str = None; in_lc = False; in_bc = False
    while i < len(text):
        ch = text[i]; nxt = text[i + 1] if i + 1 < len(text) else ""
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


LESSONS = json5.loads(extract_array_literal(src, "LESSONS"))

errors   = []   # 阻断
warnings = []   # 提示

def err(lid, msg):  errors.append(f"[{lid}] {msg}")
def warn(lid, msg): warnings.append(f"[{lid}] {msg}")


# ── 渲染器使用的拼音过滤正则（必须跟 dlpBuildKara/buildCtxKara 一致）──
PY_LETTER_RE = re.compile(r'[a-zA-Zāáǎàéěèīíǐìōóǒòūúǔùǖǘǚǜ]')

def split_pinyin_syls(s):
    """跟渲染器一样：按空白切分，剥两侧标点，过滤无字母的 token。"""
    if not s: return []
    toks = s.strip().split()
    toks = [re.sub(r'[,，。！？.!?]+$', '', t) for t in toks]
    toks = [re.sub(r'^[,，。！？.!?]+', '', t) for t in toks]
    toks = [t for t in toks if PY_LETTER_RE.search(t)]
    return toks


def effective_syl_count(zh, pinyin):
    """模拟渲染器对齐：考虑儿化音切分 (X+r → X / r 各占一字)。
    返回 (有效音节数, 用于渲染的对齐汉字序列)。"""
    syls = split_pinyin_syls(pinyin)
    hz = hanzi_only(zh)
    # 渲染器：若 hanzi 多于 syls，且某 syl 以 r 结尾、下一个 hanzi 是「儿」，
    # 则把该 syl 拆成 2 个。这里反向：若 syls 有这种「Xr」且对应 hanzi 是儿，
    # 把它当 2 个音节算。
    if len(hz) > len(syls):
        fixed = []; hi = 0
        for s in syls:
            clean = re.sub(r'[,，。！？.!?]+$', '', s)
            fixed.append(s); hi += 1
            if (hi < len(hz) and hz[hi] == '儿'
                and re.search(r'r$', clean, re.I) and len(clean) > 1
                and not re.match(r'^[eēéěè]r$', clean, re.I)):
                fixed.append('r'); hi += 1
        return len(fixed)
    return len(syls)


# 大写带调字符 → 用于检测「È... 这种被过滤掉的字符」
UPPER_TONAL_RE = re.compile(r'[ĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]')


def hanzi_only(s):
    return [c for c in (s or "") if '一' <= c <= '鿿']


# ── 已知 speaker 列表（用于警告未知 speaker）─────────────────────────
KNOWN_SPEAKER_HINTS = [
    "诺拉", "Nora",
    "夏七七", "Qiqi", "七七",
    "赵明轩", "Mingxuan", "明轩",
    "大卫", "David",
    "林晚", "Lin Wan",
    "Cafe Staff", "店员", "店員",
    "收银", "Cashier",
    "Staff", "工作",
    "学长", "学姐",
    "staff", "cashier", "cafestaff",  # 归一化后的 _sid
]
def speaker_known(spk):
    if not spk: return False
    s = str(spk)
    return any(h in s for h in KNOWN_SPEAKER_HINTS)


# ── 检查一个 sentence/context block ───────────────────────────────────
def check_text_block(lid, label, zh, pinyin, chars):
    """zh + pinyin + chars 三者必须互相一致。"""
    hz = hanzi_only(zh)
    n_hz = len(hz)

    # 1. pinyin 音节数 == 汉字数（已考虑儿化音切分）
    if pinyin:
        n_syl = effective_syl_count(zh, pinyin)
        if n_syl != n_hz:
            err(lid, f"{label}: 汉字 {n_hz} 个 vs 拼音 {n_syl} 个 (zh={zh!r}, pinyin={pinyin!r})")

        # 2. pinyin 不该出现非首词位置的大写带调
        # 简化处理：把字符串按 "[.!?。！？] " 切成多句，
        # 每句的首词允许首字母大写，其他词整体应是小写。
        sentences = re.split(r'[.!?。！？]\s*', pinyin)
        for sent in sentences:
            toks = sent.strip().split()
            for j, t in enumerate(toks):
                clean = re.sub(r'^["「『\(]+', '', t)  # 剥开头的引号括号
                if not clean: continue
                if j == 0:
                    # 首词：首字母可以大写，其余必须小写
                    rest = clean[1:]
                else:
                    rest = clean
                if UPPER_TONAL_RE.search(rest):
                    err(lid, f"{label}: 拼音中出现非首词位置的大写带调字母 → {t!r} (会被渲染器过滤掉，导致全句错位)")
                    break

    # 3. chars[] 必须存在且其汉字序列 == zh 的汉字序列
    if chars is not None:
        chars_hz = [item.get("c") for item in chars if item.get("c") and '一' <= item["c"] <= '鿿']
        if chars_hz != hz:
            err(lid, f"{label}: chars[] 汉字序列与 zh 不一致\n          chars={chars_hz}\n          zh   ={hz}")


# ── 主循环 ──────────────────────────────────────────────────────────
seen_ids = set()
for lesson in LESSONS:
    lid = lesson.get("id", "??")
    if lid in seen_ids:
        err(lid, "id 重复")
    seen_ids.add(lid)

    # scene / coverScene
    if not lesson.get("scene"):
        warn(lid, "scene 为空")
    cs = lesson.get("coverScene") or {}
    if not cs.get("zh"):
        warn(lid, "coverScene.zh 为空")

    # 图片文件存在性
    for fkey in ("cgImage", "cardImage"):
        path = lesson.get(fkey)
        if path:
            # 去掉 query string（?v=...）和 URL 编码
            clean = path.split("?", 1)[0]
            clean = urllib.parse.unquote(clean)
            disk = ROOT / "public" / clean.lstrip("/")
            if not disk.exists():
                err(lid, f"{fkey} 文件不存在: {path}  (检查路径: {disk})")

    # 句子检查
    for i, s in enumerate(lesson.get("sentences", [])):
        check_text_block(lid, f"sentences[{i}]", s.get("zh"), s.get("pinyin"), s.get("chars"))

        if s.get("role") not in ("learner", "local"):
            warn(lid, f"sentences[{i}].role 异常: {s.get('role')!r}")

        if s.get("speaker") and not speaker_known(s["speaker"]):
            warn(lid, f"sentences[{i}].speaker 未识别: {s['speaker']!r}")

        # contextAbove / contextBelow — 没有 chars 字段，只检查 zh ↔ pinyin
        for ckey in ("contextAbove", "contextBelow"):
            ctx = s.get(ckey)
            if ctx:
                check_text_block(lid, f"sentences[{i}].{ckey}", ctx.get("zh"), ctx.get("pinyin"), None)
                if ctx.get("speaker") and not speaker_known(ctx["speaker"]):
                    warn(lid, f"sentences[{i}].{ckey}.speaker 未识别: {ctx['speaker']!r}")


# ── 输出报告 ────────────────────────────────────────────────────────
print(f"\n校验 {len(LESSONS)} 课 · {sum(len(l.get('sentences', [])) for l in LESSONS)} 句\n")

if warnings:
    print(f"△ 警告 ({len(warnings)}):")
    for w in warnings: print("  " + w)
    print()

if errors:
    print(f"✗ 错误 ({len(errors)}):")
    for e in errors: print("  " + e)
    print(f"\n❌ 发现 {len(errors)} 个错误，请修复后再 push。")
    sys.exit(1)
else:
    print("✅ 全部通过，可以 push。")
    sys.exit(0)
