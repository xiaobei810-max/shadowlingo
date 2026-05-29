"""
通用台词音频生成器 —— 给定课号，自动生成该课所有角色的台词 MP3。

用法：
    python3 scripts/gen_lesson_audio.py 1            # 生成第 1 课全部音频
    python3 scripts/gen_lesson_audio.py lesson05     # 也可写 lesson05 / lesson-5
    python3 scripts/gen_lesson_audio.py 3 --dry-run  # 只打印清单，不实际合成

做什么：
    1. 从 public/index.html 解析指定课的全部台词（两种 schema 都支持）
    2. 按 app 的 _speakerRole 规则识别每句的角色（Nora/明轩/七七/David/林晚/收银员/工作人员…）
    3. 用 api/tts.js 里对应角色的声音参数，经 edge-tts 合成
    4. 输出到 public/audio/lessonXX/，按全局对话轮次编号（轮次号 = 播放顺序，
       与 app 现有 audioMap.json 命名一致）
       例如：L03_01_Mingxuan.mp3  L03_02_Nora.mp3  L03_03_Mingxuan.mp3 …

不修改任何 app 代码，也不改 audioMap.json；已存在的文件自动跳过。
"""

import asyncio
import pathlib
import re
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("❌ 缺少 edge-tts 库，请运行：pip3 install edge-tts")

ROOT      = pathlib.Path(__file__).parent.parent
INDEX     = ROOT / "public" / "index.html"
AUDIO_DIR = ROOT / "public" / "audio"

# ── 声音参数：完全对齐 api/tts.js 的 VOICES ──────────────────────
#   role -> (voice, rateScale, pitch_str)
#   最终 rate% = round((rateScale * 1.0 - 1) * 100)
VOICES = {
    "local":          ("zh-CN-YunxiNeural",              1.02, "+2%"),
    "learner":        ("en-US-AvaMultilingualNeural",    0.82, "+6%"),
    "linyue":         ("zh-CN-XiaoxiaoNeural",           1.00, "+4%"),
    "qiqi":           ("zh-CN-XiaoxiaoNeural",           1.08, "+5%"),
    "cashier":        ("zh-CN-YunyangNeural",            1.00, "0%"),
    "david":          ("en-US-AndrewMultilingualNeural", 0.88, "+3%"),
    "cafestaff":      ("zh-CN-YunjianNeural",            1.00, "0%"),
    "cafestaff_fast": ("zh-CN-YunjianNeural",            1.13, "+2%"),
    "linwan":         ("zh-CN-YunhaoNeural",             0.95, "0%"),
}

# role -> 文件名里的角色 token（沿用 audioMap.json 既有命名）
TOKEN = {
    "learner":        "Nora",
    "local":          "Mingxuan",
    "linyue":         "Linyue",
    "qiqi":           "Qiqi",
    "cashier":        "Cashier",
    "david":          "David",
    "cafestaff":      "Cafestaff",
    "cafestaff_fast": "Cafestaff",
    "linwan":         "Linwan",
}


# ── speaker -> role：逐条移植 index.html 的 _speakerRole() ─────────
def _is_cashier(s):    return "收银" in s or "Cashier" in s
def _is_cafestaff(s):  return s == "cafestaff" or "店员" in s or "店員" in s or "Cafe Staff" in s
def _is_staff(s):
    return (s in ("staff", "cafestaff", "cashier")
            or "Staff" in s or "工作" in s or "收银" in s or "Cashier" in s
            or "店员" in s or "店員" in s or "Cafe Staff" in s)
def _is_qiqi(s):   return s == "qiqi" or re.search("qiqi", s, re.I) or "七七" in s or "夏七七" in s
def _is_david(s):  return s == "david" or re.search("david", s, re.I) or "大卫" in s
def _is_linwan(s):
    return (s == "linwan" or re.search(r"linwan", s, re.I)
            or re.search(r"lin\s*wan", s, re.I) or "林晚" in s)


def speaker_role(speaker, lesson_num):
    s = str(speaker or "")
    if s in ("nora", "learner") or re.search("nora", s, re.I) or "诺拉" in s:
        return "learner"
    if _is_cashier(s):
        return "cashier"
    if _is_cafestaff(s):
        return "cafestaff_fast" if lesson_num == 12 else "cafestaff"
    if _is_staff(s):
        return "linyue"
    if _is_qiqi(s):
        return "qiqi"
    if _is_david(s):
        return "david"
    if _is_linwan(s):
        return "linwan"
    return "local"


# ── 从 index.html 解析指定课的台词 ───────────────────────────────
_STR = r'"((?:[^"\\]|\\.)*)"'   # 匹配带转义的双引号字符串


def _field(text, key):
    m = re.search(key + r"\s*:\s*" + _STR, text)
    return m.group(1) if m else None


def _extract_sentences_array(html, lesson_num):
    """返回指定课 sentences: [...] 的内部文本（不含最外层方括号）。"""
    m = re.search(r'id:\s*"lesson-%d"' % lesson_num, html)
    if not m:
        raise SystemExit(f"❌ 在 index.html 里找不到 lesson-{lesson_num}")
    sidx = html.index("sentences:", m.end())
    bidx = html.index("[", sidx)
    # 字符串感知的括号平衡扫描，找到与 bidx 配对的 ]
    depth, instr, i, n = 0, None, bidx, len(html)
    while i < n:
        ch = html[i]
        if instr:
            if ch == "\\":
                i += 2; continue
            if ch == instr:
                instr = None
        elif ch in "\"'":
            instr = ch
        elif ch in "[{":
            depth += 1
        elif ch in "]}":
            depth -= 1
            if depth == 0:
                return html[bidx + 1:i]
        i += 1
    raise SystemExit(f"❌ lesson-{lesson_num} 的 sentences 数组括号不闭合")


def _iter_objects(inner):
    """从数组内部文本里依次切出每个顶层 { ... } 对象文本。"""
    i, n = 0, len(inner)
    while i < n:
        if inner[i] == "{":
            start, depth, instr = i, 0, None
            while i < n:
                ch = inner[i]
                if instr:
                    if ch == "\\":
                        i += 2; continue
                    if ch == instr:
                        instr = None
                elif ch in "\"'":
                    instr = ch
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        yield inner[start:i + 1]
                        i += 1
                        break
                i += 1
        else:
            i += 1


def _strip_nested(objtext):
    """移除 contextAbove/contextBelow/chars 子结构，以便取顶层 zh/role/speaker。"""
    t = re.sub(r'context(?:Above|Below)\s*:\s*\{[^{}]*\}', "", objtext)
    t = re.sub(r'chars\s*:\s*\[[^\]]*\]', "", t)
    return t


def parse_lesson(html, lesson_num):
    """返回对话顺序的台词列表：[{role, speaker, zh}, ...]，已去重相邻重复。"""
    inner = _extract_sentences_array(html, lesson_num)
    lines = []
    last_zh = None

    def emit(role, speaker, zh):
        nonlocal last_zh
        if not zh or zh == last_zh:   # 跳过空串与相邻重复（contextBelow == 下一句 contextAbove）
            return
        lines.append({"role": role, "speaker": speaker, "zh": zh})
        last_zh = zh

    for obj in _iter_objects(inner):
        above = re.search(r'contextAbove\s*:\s*\{([^{}]*)\}', obj)
        below = re.search(r'contextBelow\s*:\s*\{([^{}]*)\}', obj)
        stripped = _strip_nested(obj)
        own_zh   = _field(stripped, "zh")
        own_role = _field(stripped, "role")
        own_spk  = _field(stripped, "speaker")

        if above:
            spk = _field(above.group(1), "speaker")
            emit(speaker_role(spk, lesson_num), spk, _field(above.group(1), "zh"))

        if own_zh:
            if own_spk:
                role = speaker_role(own_spk, lesson_num)
            elif own_role == "learner":
                role = "learner"
            else:
                role = "local"
            emit(role, own_spk, own_zh)

        if below:
            spk = _field(below.group(1), "speaker")
            emit(speaker_role(spk, lesson_num), spk, _field(below.group(1), "zh"))

    return lines


# ── edge-tts 合成 ────────────────────────────────────────────────
async def synth(text, role, dest):
    voice, scale, pitch = VOICES[role]
    rate_pct = round((scale * 1.0 - 1) * 100)
    rate = f"{rate_pct:+d}%"
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch="+0Hz")
    comm.tts_config.pitch = pitch   # 绕过 edge-tts 只收 Hz 的校验，与 api/tts.js 的百分比一致
    data = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            data.extend(chunk["data"])
    dest.write_bytes(data)
    return len(data)


# ── 主流程 ──────────────────────────────────────────────────────
def parse_lesson_num(arg):
    m = re.search(r"(\d+)", arg)
    if not m:
        raise SystemExit(f"❌ 无法识别课号：{arg}（示例：1 / lesson05 / lesson-12）")
    return int(m.group(1))


async def main():
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    dry  = "--dry-run" in sys.argv
    if not args:
        raise SystemExit("用法：python3 scripts/gen_lesson_audio.py <课号> [--dry-run]")

    lesson_num = parse_lesson_num(args[0])
    nn = f"{lesson_num:02d}"
    html = INDEX.read_text(encoding="utf-8")
    lines = parse_lesson(html, lesson_num)

    if not lines:
        raise SystemExit(f"❌ lesson-{lesson_num} 没有解析到任何台词")

    out_dir = AUDIO_DIR / f"lesson{nn}"
    print(f"第 {lesson_num} 课 · 共 {len(lines)} 句台词 · 输出目录 {out_dir}")
    print("=" * 72)

    # 按全局对话轮次编号（与 app 现有 audioMap.json 命名一致：轮次号 = 播放顺序）
    plan = []
    for turn, ln in enumerate(lines, start=1):
        role = ln["role"]
        token = TOKEN[role]
        filename = f"L{nn}_{turn:02d}_{token}.mp3"
        voice = VOICES[role][0]
        plan.append((filename, role, voice, ln["zh"]))
        print(f"  {filename:24s} [{role:14s} {voice:32s}] {ln['zh']}")

    print("=" * 72)
    if dry:
        print("（--dry-run：未实际合成）")
        return

    out_dir.mkdir(parents=True, exist_ok=True)
    ok = skip = fail = 0
    for filename, role, _voice, zh in plan:
        dest = out_dir / filename
        if dest.exists():
            print(f"⏭  跳过（已存在）: {filename}")
            skip += 1
            continue
        try:
            n = await synth(zh, role, dest)
            print(f"✅ {filename}  ({n:,} 字节)")
            ok += 1
        except Exception as e:  # noqa: BLE001
            print(f"❌ {filename}  合成失败: {e}")
            fail += 1

    print("=" * 72)
    print(f"完成：新生成 {ok} · 跳过 {skip} · 失败 {fail}")


if __name__ == "__main__":
    asyncio.run(main())
