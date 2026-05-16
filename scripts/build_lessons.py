"""
build_lessons.py — 从 lessons/lesson-*.js 重新生成 index.html 中的
LESSONS 数组。

工作流：
  1. 编辑 lessons/lesson-N.js（每个文件只包含一个 lesson 对象 { ... }）
  2. 跑 python3 scripts/build_lessons.py
  3. 脚本会把 index.html 里 const LESSONS = [...]; 那段整体替换成
     按 lesson-1.js 到 lesson-15.js 顺序拼合的结果
  4. index.html 其余部分（HTML/CSS/JS）100% 不动

替换是字符级精确的，只动 LESSONS = [ ... ]; 这一个块。
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent.parent
HTML = ROOT / "public" / "index.html"
LESSONS_DIR = ROOT / "lessons"


# ── 找 const LESSONS = [...]; 的字符级边界（含分号）─────────────────
def find_lessons_block(text):
    """返回 (block_start, block_end_exclusive)。
    block_start 指向 'const' 的 'c'；block_end 指向 ']' 之后的 ';' 的下一个字符。"""
    marker = "const LESSONS = ["
    s = text.find(marker)
    if s == -1:
        raise RuntimeError("LESSONS not found in index.html")
    i = s + len(marker) - 1   # '[' 的位置
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
                # 跳到 ']' 之后的 ';'
                j = i + 1
                while j < len(text) and text[j] in " \t":
                    j += 1
                if j < len(text) and text[j] == ";":
                    j += 1
                return (s, j)
        i += 1
    raise RuntimeError("LESSONS not closed")


# ── 读所有 lessons/lesson-N.js（按编号排序）──────────────────────────
def load_lesson_files():
    files = list(LESSONS_DIR.glob("lesson-*.js"))
    def num(p):
        m = re.search(r'lesson-(\d+)\.js$', p.name)
        return int(m.group(1)) if m else 9999
    files.sort(key=num)
    return [(num(p), p.read_text(encoding="utf-8").rstrip("\n")) for p in files]


# ── 把多个 lesson 字面量拼成完整 LESSONS = [...]; 块 ────────────────
COURSE_NUM_CN = {
    1:"一",2:"二",3:"三",4:"四",5:"五",
    6:"六",7:"七",8:"八",9:"九",10:"十",
    11:"十一",12:"十二",13:"十三",14:"十四",15:"十五",
}
def build_lessons_block(lessons):
    out = []
    out.append("const LESSONS = [")
    for i, (num, body) in enumerate(lessons):
        cn = COURSE_NUM_CN.get(num, str(num))
        comment = f"      // ── 第{cn}课 ──────────────────────────────────────────────────"
        out.append(comment)
        # body 是原始字面量（{ ... }），需要前缀 6 个空格
        # 但 body 本身首行已经有缩进吗？检查并规整
        body_lines = body.split("\n")
        # 首行去掉前导空白，加上 6 空格
        body_lines[0] = "      " + body_lines[0].lstrip()
        body_normalized = "\n".join(body_lines)
        # 末尾加 , 除了最后一个
        sep = "," if i < len(lessons) - 1 else ""
        out.append(body_normalized + sep)
    out.append("    ];")
    return "\n".join(out)


# ── 主流程 ──────────────────────────────────────────────────────────
def main():
    if not LESSONS_DIR.exists():
        print(f"❌ {LESSONS_DIR} 不存在，先跑 split_lessons.py")
        sys.exit(1)

    lessons = load_lesson_files()
    if not lessons:
        print("❌ lessons/ 目录里没有 lesson-*.js 文件"); sys.exit(1)
    print(f"读入 {len(lessons)} 个 lesson 文件")

    src = HTML.read_text(encoding="utf-8")
    block_start, block_end = find_lessons_block(src)
    new_block = build_lessons_block(lessons)

    # const LESSONS = ... 前缀是 4 个空格，要保持
    # find_lessons_block 找的是 'const' 起点，所以新块也是 'const' 开头，
    # 缩进需要外部 prefix——我们把 'const' 前的 4 空格留在 src 里不动
    # 即替换从 'const' 开始的部分
    new_src = src[:block_start] + new_block + src[block_end:]

    if new_src == src:
        print("✅ 无变化")
        return

    HTML.write_text(new_src, encoding="utf-8")
    delta = len(new_src) - len(src)
    print(f"✅ index.html 已更新（{'+'if delta>=0 else ''}{delta} 字节）")


if __name__ == "__main__":
    main()
