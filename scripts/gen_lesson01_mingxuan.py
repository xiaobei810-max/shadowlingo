"""
生成第 1 课明轩（赵明轩，对话中的 local 角色）台词的静态 MP3 文件。

引擎：edge-tts（Python 包），与 app 的 api/tts.js 使用同一个免费
      Microsoft Edge TTS 服务，声音/语速/音调参数完全对齐。

明轩（local）参数 —— 摘自 api/tts.js 的 VOICES.local：
    voice  = zh-CN-YunxiNeural
    rate   = +2%   (rateScale 1.02 × rate 1.0 → round((1.02-1)*100)% )
    pitch  = +2%
    format = audio-24khz-96kbitrate-mono-mp3（edge-tts 默认即此格式）

用法：
    python3 scripts/gen_lesson01_mingxuan.py

输出：
    public/audio/lesson01/L01_01_Mingxuan.mp3 … L01_04_Mingxuan.mp3

注：本脚本不修改任何 app 代码，也不改 audioMap.json；已存在的文件自动跳过。
"""

import asyncio
import pathlib
import sys

try:
    import edge_tts
except ImportError:
    sys.exit("❌ 缺少 edge-tts 库，请运行：pip3 install edge-tts")

# ── 与 api/tts.js 对齐的明轩（local）声音参数 ────────────────────
VOICE = "zh-CN-YunxiNeural"
RATE  = "+2%"    # rateScale 1.02 × rate 1.0
PITCH = "+2%"    # api/tts.js 用百分比；edge-tts 默认只收 Hz，下面手动注入

OUT_DIR = pathlib.Path(__file__).parent.parent / "public/audio/lesson01"

# 第 1 课明轩的全部台词（序号 → 文本），序号即文件名中的 NN
LINES = [
    (1, "请问，你是京华大学的留学生，诺拉吗？"),
    (2, "太好了！我叫明轩，是来接你的。"),
    (3, "没事。行李给我吧。"),
    (4, "往前走，右拐坐大巴。"),
]


async def synth(text: str, dest: pathlib.Path) -> int:
    # pitch 用合法的 Hz 占位构造，再覆盖成 +2% —— 绕过 edge-tts 的
    # "^[+-]\d+Hz$" 校验，使最终 SSML 的 prosody pitch 与 api/tts.js 一致
    comm = edge_tts.Communicate(text, VOICE, rate=RATE, pitch="+0Hz")
    comm.tts_config.pitch = PITCH

    data = bytearray()
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            data.extend(chunk["data"])
    dest.write_bytes(data)
    return len(data)


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"输出目录：{OUT_DIR}")
    print(f"声音：{VOICE}  rate={RATE}  pitch={PITCH}\n")

    for idx, text in LINES:
        filename = f"L01_{idx:02d}_Mingxuan.mp3"
        dest = OUT_DIR / filename
        if dest.exists():
            print(f"⏭  跳过（已存在）: {filename}")
            continue

        print(f"🔊 合成中: [{idx:02d}] {text}")
        try:
            n = await synth(text, dest)
            print(f"   ✅ 已保存: {filename}  ({n:,} 字节)")
        except Exception as e:  # noqa: BLE001
            print(f"   ❌ 合成失败: {e}")

    print("\n全部完成。")


if __name__ == "__main__":
    asyncio.run(main())
