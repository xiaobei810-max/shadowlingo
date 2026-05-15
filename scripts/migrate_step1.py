"""
migrate_step1.py — Step 1 of LESSONS / LESSONS_META consolidation.

Does two things, both confined to LESSONS (not LESSONS_META):

  1. Lesson 5: rewrite into the 8-sentence flat structure (like Lesson 3).
     - New scene + coverScene text
     - 8 sentences mixing local/learner roles
     - vocab, insiderTip, cgImage, etc. untouched

  2. Lessons 6, 8, 9, 11, 13: rename every `contextBelow:` → `contextAbove:`
     inside that lesson, so the first speaker renders on top.
     None of these lessons currently have contextAbove (verified by audit),
     so renaming is a safe in-place flip.

Usage: python3 scripts/migrate_step1.py
"""
import pathlib
import re

HTML = pathlib.Path(__file__).parent.parent / "public" / "index.html"
src  = HTML.read_text(encoding="utf-8")
lines = src.split("\n")

# ── locate LESSONS_META start (everything before this is the LESSONS array) ──
meta_start = next(i for i, ln in enumerate(lines) if "const LESSONS_META" in ln)


def find_lesson_bounds(lid):
    """Return (start_brace_line, end_brace_line) for the given lesson id, scanning LESSONS only."""
    for i, ln in enumerate(lines):
        if i >= meta_start: break
        if re.match(r'^        id: "' + re.escape(lid) + r'",\s*$', ln):
            # `{` is on previous non-blank line at indent 6
            j = i - 1
            while j >= 0 and lines[j].rstrip() != "      {":
                j -= 1
            start = j
            # matching `},` at indent 6
            for k in range(i + 1, meta_start):
                if lines[k].rstrip() in ("      },", "      }"):
                    return (start, k)
    raise RuntimeError(f"lesson not found: {lid}")


# ── Step A: rename contextBelow → contextAbove in 5 lessons ───────────
TO_FLIP = ["lesson-6", "lesson-8", "lesson-9", "lesson-11", "lesson-13"]
flip_count = 0
for lid in TO_FLIP:
    s, e = find_lesson_bounds(lid)
    for k in range(s, e + 1):
        new = re.sub(r'\bcontextBelow:', 'contextAbove:', lines[k])
        if new != lines[k]:
            flip_count += 1
            lines[k] = new
print(f"[A] Flipped {flip_count} 'contextBelow:' -> 'contextAbove:' in {TO_FLIP}")


# ── Step B: rewrite Lesson 5 (scene, coverScene, sentences) ───────────
def replace_block(start_pat_rstrip, end_pat_rstrip, new_block_lines, bounds):
    """Replace lines[start..end] inclusive within `bounds`, where:
       - start line is the first line whose rstrip() matches `start_pat_rstrip`
       - end line is the first line after start whose rstrip() matches `end_pat_rstrip`
    Returns the line-delta (positive = added lines)."""
    s, e = bounds
    cs = None
    for k in range(s, e + 1):
        if lines[k].rstrip() == start_pat_rstrip:
            cs = k; break
    if cs is None:
        raise RuntimeError(f"block start not found: {start_pat_rstrip!r}")
    ce = None
    for k in range(cs + 1, e + 1):
        if lines[k].rstrip() == end_pat_rstrip:
            ce = k; break
    if ce is None:
        raise RuntimeError(f"block end not found: {end_pat_rstrip!r}")
    delta = len(new_block_lines) - (ce - cs + 1)
    lines[cs:ce + 1] = new_block_lines
    return delta


l5_bounds = find_lesson_bounds("lesson-5")

# 1. Replace scene line (single-line field)
for k in range(l5_bounds[0], l5_bounds[1] + 1):
    if re.match(r'^        scene:', lines[k]):
        lines[k] = '        scene: "诺拉打开 402 宿舍的门，见到了她未来的中国室友夏七七。",'
        print("[B] Updated Lesson 5 scene")
        break

# 2. Replace coverScene block
delta1 = replace_block(
    "        coverScene: {",
    "        },",
    [
        "        coverScene: {",
        "          zh: '诺拉打开 402 宿舍的门，<br>见到了她未来的中国室友夏七七。',",
        '          en: "Nora opens the door to room 402 and meets her future Chinese roommate, Xia Qiqi."',
        "        },",
    ],
    l5_bounds,
)
print(f"[B] Updated Lesson 5 coverScene (line delta {delta1:+d})")
l5_bounds = (l5_bounds[0], l5_bounds[1] + delta1)

# 3. Replace sentences block
new_sentences = [
    "        sentences: [",
    '          { zh: "你好！你是我的新室友？", pinyin: "Nǐ hǎo! Nǐ shì wǒ de xīn shì yǒu?", en: "Hello! Are you my new roommate?", role: "local", speaker: "夏七七 · Xia Qiqi", start: 0, end: 0, praise: "👋 七七主动招呼，亲切自然！", hint: "【你是…？】用反问式确认身份，比直问【你是不是】更随意", chars: [{ c: "你", p: "ni3" }, { c: "好", p: "hao3" }, { c: "你", p: "ni3" }, { c: "是", p: "shi4" }, { c: "我", p: "wo3" }, { c: "的", p: "de5" }, { c: "新", p: "xin1" }, { c: "室", p: "shi4" }, { c: "友", p: "you3" }] },',
    '          { zh: "你好，我是诺拉。以后请多指教。", pinyin: "Nǐ hǎo, wǒ shì Nuò lā. Yǐ hòu qǐng duō zhǐ jiào.", en: "Hello, I\'m Nora. Please take care of me from now on.", role: "learner", speaker: "诺拉 · Nora", start: 0, end: 0, praise: "🌸 礼貌又地道！Polite intro!", hint: "【请多指教】是中文里初次见面表达谦逊与友好的经典句式，校园、职场都好用", chars: [{ c: "你", p: "ni3" }, { c: "好", p: "hao3" }, { c: "我", p: "wo3" }, { c: "是", p: "shi4" }, { c: "诺", p: "nuo4" }, { c: "拉", p: "la1" }, { c: "以", p: "yi3" }, { c: "后", p: "hou4" }, { c: "请", p: "qing3" }, { c: "多", p: "duo1" }, { c: "指", p: "zhi3" }, { c: "教", p: "jiao4" }] },',
    '          { zh: "快进来！我叫夏七七，你可以叫我七七。", pinyin: "Kuài jìn lái! Wǒ jiào Xià Qī qī, nǐ kě yǐ jiào wǒ Qī qī.", en: "Come in! My name is Xia Qiqi, you can call me Qiqi.", role: "local", speaker: "夏七七 · Xia Qiqi", start: 0, end: 0, praise: "🎉 拉近距离的小昵称！", hint: "【你可以叫我…】是中文里拉近距离的暖心句式", chars: [{ c: "快", p: "kuai4" }, { c: "进", p: "jin4" }, { c: "来", p: "lai2" }, { c: "我", p: "wo3" }, { c: "叫", p: "jiao4" }, { c: "夏", p: "xia4" }, { c: "七", p: "qi1" }, { c: "七", p: "qi1" }, { c: "你", p: "ni3" }, { c: "可", p: "ke3" }, { c: "以", p: "yi3" }, { c: "叫", p: "jiao4" }, { c: "我", p: "wo3" }, { c: "七", p: "qi1" }, { c: "七", p: "qi1" }] },',
    '          { zh: "诺拉，行李放这儿了。我就先走了。", pinyin: "Nuò lā, xíng li fàng zhèr le. Wǒ jiù xiān zǒu le.", en: "Nora, I\'ve put the luggage here. I\'ll be on my way.", role: "local", speaker: "赵明轩 · Zhao Mingxuan", start: 0, end: 0, praise: "👍 干净利落地告别！", hint: "【我就先走了】比单说【我先走了】更柔和 · 加【就】缓冲离开的突兀感", chars: [{ c: "诺", p: "nuo4" }, { c: "拉", p: "la1" }, { c: "行", p: "xing2" }, { c: "李", p: "li5" }, { c: "放", p: "fang4" }, { c: "这", p: "zhe4" }, { c: "儿", p: "r5" }, { c: "了", p: "le5" }, { c: "我", p: "wo3" }, { c: "就", p: "jiu4" }, { c: "先", p: "xian1" }, { c: "走", p: "zou3" }, { c: "了", p: "le5" }] },',
    '          { zh: "今天真的太谢谢你了。", pinyin: "Jīn tiān zhēn de tài xiè xie nǐ le.", en: "Thank you so much for today.", role: "learner", speaker: "诺拉 · Nora", start: 0, end: 0, praise: "💖 道谢真挚自然！Heartfelt thanks!", hint: "【真的太…了】是中文表达情感强度的金句结构，比单说【谢谢】走心得多", chars: [{ c: "今", p: "jin1" }, { c: "天", p: "tian1" }, { c: "真", p: "zhen1" }, { c: "的", p: "de5" }, { c: "太", p: "tai4" }, { c: "谢", p: "xie4" }, { c: "谢", p: "xie5" }, { c: "你", p: "ni3" }, { c: "了", p: "le5" }] },',
    '          { zh: "不客气。你们俩好好休息吧。", pinyin: "Bú kè qi. Nǐ men liǎ hǎo hǎo xiū xi ba.", en: "You\'re welcome. Both of you get a good rest.", role: "local", speaker: "赵明轩 · Zhao Mingxuan", start: 0, end: 0, praise: "😊 暖心又自然的告别！", hint: "【你们俩】= \'you two\' — 比【你们两个】更口语化亲切", chars: [{ c: "不", p: "bu2" }, { c: "客", p: "ke4" }, { c: "气", p: "qi5" }, { c: "你", p: "ni3" }, { c: "们", p: "men5" }, { c: "俩", p: "lia3" }, { c: "好", p: "hao3" }, { c: "好", p: "hao3" }, { c: "休", p: "xiu1" }, { c: "息", p: "xi5" }, { c: "吧", p: "ba5" }] },',
    '          { zh: "好的，学长再见。", pinyin: "Hǎo de, xué zhǎng zài jiàn.", en: "Okay, goodbye senior.", role: "learner", speaker: "诺拉 · Nora", start: 0, end: 0, praise: "🎓 用了【学长】超地道！", hint: "【学长】是校园里对高年级男生的礼貌称呼，比直接叫名字更得体", chars: [{ c: "好", p: "hao3" }, { c: "的", p: "de5" }, { c: "学", p: "xue2" }, { c: "长", p: "zhang3" }, { c: "再", p: "zai4" }, { c: "见", p: "jian4" }] },',
    '          { zh: "学长再见！诺拉，你一定饿了吧？我们去食堂吃饭！", pinyin: "Xué zhǎng zài jiàn! Nuò lā, nǐ yí dìng è le ba? Wǒ men qù shí táng chī fàn!", en: "Bye, senior! Nora, you must be hungry, right? Let\'s eat at the cafeteria!", role: "local", speaker: "夏七七 · Xia Qiqi", start: 0, end: 0, praise: "🍜 七七活泼又贴心！", hint: "【你一定…吧？】= \'you must be…right?\' — 推测对方状态的常用句式", chars: [{ c: "学", p: "xue2" }, { c: "长", p: "zhang3" }, { c: "再", p: "zai4" }, { c: "见", p: "jian4" }, { c: "诺", p: "nuo4" }, { c: "拉", p: "la1" }, { c: "你", p: "ni3" }, { c: "一", p: "yi2" }, { c: "定", p: "ding4" }, { c: "饿", p: "e4" }, { c: "了", p: "le5" }, { c: "吧", p: "ba5" }, { c: "我", p: "wo3" }, { c: "们", p: "men5" }, { c: "去", p: "qu4" }, { c: "食", p: "shi2" }, { c: "堂", p: "tang2" }, { c: "吃", p: "chi1" }, { c: "饭", p: "fan4" }] }',
    "        ],",
]
delta2 = replace_block(
    "        sentences: [",
    "        ],",
    new_sentences,
    l5_bounds,
)
print(f"[B] Updated Lesson 5 sentences (line delta {delta2:+d})")


# ── write back ────────────────────────────────────────────────────────
HTML.write_text("\n".join(lines), encoding="utf-8")
print("\n✅ Step 1 migration done.")
