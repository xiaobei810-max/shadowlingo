#!/usr/bin/env python3
"""
sync_audio.py — MiniMax TTS 批量合成脚本
用法: python sync_audio.py
生成 public/audio/lesson01-05 的 MP3 文件，并更新 public/audio/audioMap.json
"""

import os
import json
import time
import requests

# ── API 配置 ──────────────────────────────────────────────────────────
API_KEY  = "sk-api-k0C134YCrEhkh7dQGQFhVK4B2gUxcdLIKbNrTZklQSMyG5ulacGpftRrzhL-RD2mc3qOySPXRdhCjVjfIR6ITzlm7xJrLUoDoF8Bdcqig47m0v37zwCrOxM"
API_URL  = "https://api.minimaxi.chat/v1/t2a_v2"
MODEL    = "speech-01-hd-2.8"

# ── 角色 → 声音 ID 映射 ────────────────────────────────────────────────
VOICE_MAP = {
    "Nora":     "Chinese (Mandarin)_Gentle_Senior",
    "Mingxuan": "Chinese (Mandarin)_Gentleman",
    "Linwan":   "male-qn-jingying-jingpin",
    "Qiqi":     "Arrogant_Miss",
    "Staff":    "Chinese (Mandarin)_Gentle_Senior",   # 行政人员用温和女声
    "Huijie":   "Japanese_CalmLady",
    "David":    "English_Diligent_Man",
}

# ── 台词数据（1-5 课，每课 8 句）────────────────────────────────────────
SCRIPT = [
    # 第一课
    {"lesson": "01", "line": "01", "role": "Nora",     "text": "你好，请问去市区怎么走？"},
    {"lesson": "01", "line": "02", "role": "Mingxuan", "text": "往前走，右拐坐大巴。"},
    {"lesson": "01", "line": "03", "role": "Nora",     "text": "谢谢。大巴到京华大学吗？"},
    {"lesson": "01", "line": "04", "role": "Mingxuan", "text": "你是去京华大学的留学生吗？"},
    {"lesson": "01", "line": "05", "role": "Nora",     "text": "对，我是诺拉。"},
    {"lesson": "01", "line": "06", "role": "Mingxuan", "text": "太好了！我是来接你的。"},
    {"lesson": "01", "line": "07", "role": "Nora",     "text": "真的吗？太感谢了。"},
    {"lesson": "01", "line": "08", "role": "Mingxuan", "text": "我叫明轩。行李给我吧。"},
    # 第二课
    {"lesson": "02", "line": "01", "role": "Nora",     "text": "我们需要买票吗？"},
    {"lesson": "02", "line": "02", "role": "Mingxuan", "text": "不用，上车扫码。"},
    {"lesson": "02", "line": "03", "role": "Nora",     "text": "我还没有微信。"},
    {"lesson": "02", "line": "04", "role": "Mingxuan", "text": "没事，我帮你付。"},
    {"lesson": "02", "line": "05", "role": "Nora",     "text": "多少钱？我给你现金。"},
    {"lesson": "02", "line": "06", "role": "Mingxuan", "text": "二十块。不用急。"},
    {"lesson": "02", "line": "07", "role": "Nora",     "text": "机场离学校远吗？"},
    {"lesson": "02", "line": "08", "role": "Mingxuan", "text": "有点远，要一个小时。"},
    # 第二课 生词（line key 以 "v" 开头，区别于对话行）
    {"lesson": "02", "line": "v1", "role": "Mingxuan", "text": "买票"},
    {"lesson": "02", "line": "v2", "role": "Mingxuan", "text": "扫码"},
    {"lesson": "02", "line": "v3", "role": "Mingxuan", "text": "现金"},
    {"lesson": "02", "line": "v4", "role": "Mingxuan", "text": "远"},
    # 第三课
    {"lesson": "03", "line": "01", "role": "Mingxuan", "text": "我们到了。先去报到。"},
    {"lesson": "03", "line": "02", "role": "Nora",     "text": "好。需要什么东西？"},
    {"lesson": "03", "line": "03", "role": "Mingxuan", "text": "你的护照和照片。"},
    {"lesson": "03", "line": "04", "role": "Nora",     "text": "给。都在这个袋子里。"},
    {"lesson": "03", "line": "05", "role": "Staff",    "text": "诺拉是吗？这是房卡。"},
    {"lesson": "03", "line": "06", "role": "Nora",     "text": "谢谢。我的宿舍在哪儿？"},
    {"lesson": "03", "line": "07", "role": "Staff",    "text": "三号楼，四层，四零二。"},
    {"lesson": "03", "line": "08", "role": "Mingxuan", "text": "走吧，我帮你拿箱子。"},
    # 第四课
    {"lesson": "04", "line": "01", "role": "Nora",     "text": "三号楼离这儿远吗？"},
    {"lesson": "04", "line": "02", "role": "Mingxuan", "text": "不远，就在超市旁边。"},
    {"lesson": "04", "line": "03", "role": "Nora",     "text": "太好了。箱子很重。"},
    {"lesson": "04", "line": "04", "role": "Mingxuan", "text": "没事。前面有电梯。"},
    {"lesson": "04", "line": "05", "role": "Nora",     "text": "我们去四层，对吧？"},
    {"lesson": "04", "line": "06", "role": "Mingxuan", "text": "对。四零二房间。"},
    {"lesson": "04", "line": "07", "role": "Nora",     "text": "到了。就是这个门。"},
    {"lesson": "04", "line": "08", "role": "Mingxuan", "text": "你开门，我拿行李。"},
    # 第五课
    {"lesson": "05", "line": "01", "role": "Qiqi",     "text": "你好！你是我的新室友？"},
    {"lesson": "05", "line": "02", "role": "Nora",     "text": "你好，我是诺拉。"},
    {"lesson": "05", "line": "03", "role": "Qiqi",     "text": "快进来！我叫夏七七。"},
    {"lesson": "05", "line": "04", "role": "Mingxuan", "text": "行李放这儿了。我先走了。"},
    {"lesson": "05", "line": "05", "role": "Nora",     "text": "今天真的太谢谢你了。"},
    {"lesson": "05", "line": "06", "role": "Mingxuan", "text": "不客气。你好好休息。"},
    {"lesson": "05", "line": "07", "role": "Qiqi",     "text": "学长再见！诺拉，你饿吗？"},
    {"lesson": "05", "line": "08", "role": "Nora",     "text": "有一点。我们去吃饭吧。"},
    # 第六课
    {"lesson": "06", "line": "01", "role": "Qiqi",     "text": "食堂到了。你想吃什么？"},
    {"lesson": "06", "line": "02", "role": "Nora",     "text": "我想吃面条。在哪里买？"},
    {"lesson": "06", "line": "03", "role": "Qiqi",     "text": "前面那个窗口。你有校园卡吗？"},
    {"lesson": "06", "line": "04", "role": "Nora",     "text": "还没有。可以用现金吗？"},
    {"lesson": "06", "line": "05", "role": "Qiqi",     "text": "食堂不能用现金。我帮你刷卡吧。"},
    {"lesson": "06", "line": "06", "role": "Nora",     "text": "太谢谢了。我回头还给你。"},
    {"lesson": "06", "line": "07", "role": "Qiqi",     "text": "没事，不着急。我们去那边坐吧。"},
    {"lesson": "06", "line": "08", "role": "Nora",     "text": "好的。这个面条闻起来真香！"},
    # 第六课 生词
    {"lesson": "06", "line": "v1", "role": "Qiqi",     "text": "食堂"},
    {"lesson": "06", "line": "v2", "role": "Qiqi",     "text": "面条"},
    {"lesson": "06", "line": "v3", "role": "Qiqi",     "text": "刷卡"},
    {"lesson": "06", "line": "v4", "role": "Qiqi",     "text": "回头"},
]

# ── 音频合成核心函数 ────────────────────────────────────────────────────
def synthesize(text: str, voice_id: str, retries: int = 3) -> bytes:
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model": MODEL,
        "text":  text,
        "stream": False,
        "voice_setting": {
            "voice_id": voice_id,
            "speed": 1.0,
            "vol":   1.0,
            "pitch": 0,
        },
        "audio_setting": {
            "sample_rate": 32000,
            "bitrate":     128000,
            "format":      "mp3",
            "channel":     1,
        },
    }

    for attempt in range(1, retries + 1):
        try:
            r = requests.post(API_URL, headers=headers, json=payload, timeout=60)
            r.raise_for_status()
            data = r.json()

            base_resp = data.get("base_resp", {})
            if base_resp.get("status_code") != 0:
                raise RuntimeError(f"API 错误: {base_resp.get('status_msg')}")

            audio_hex = data["data"]["audio"]
            return bytes.fromhex(audio_hex)

        except Exception as e:
            print(f"  ⚠ 第 {attempt} 次尝试失败: {e}")
            if attempt < retries:
                time.sleep(2 ** attempt)   # 指数退避
            else:
                raise

# ── 主流程 ─────────────────────────────────────────────────────────────
def main():
    # 确定输出根目录（相对脚本位置）
    script_dir  = os.path.dirname(os.path.abspath(__file__))
    audio_root  = os.path.join(script_dir, "public", "audio")
    os.makedirs(audio_root, exist_ok=True)

    audio_map   = {}   # { "lesson01": { "1": "/audio/lesson01/L01_01_Nora.mp3", ... } }
    total       = len(SCRIPT)
    success     = 0
    skipped     = 0

    print(f"🎙  MiniMax TTS 批量合成  —  共 {total} 条台词\n")

    for entry in SCRIPT:
        lesson  = entry["lesson"]       # "01"
        line    = entry["line"]         # "01"
        role    = entry["role"]         # "Nora"
        text    = entry["text"]

        # 文件路径
        folder    = os.path.join(audio_root, f"lesson{lesson}")
        os.makedirs(folder, exist_ok=True)
        filename  = f"L{lesson}_{line}_{role}.mp3"
        filepath  = os.path.join(folder, filename)
        url_path  = f"/audio/lesson{lesson}/{filename}"

        # 更新映射表
        map_key   = f"lesson{lesson}"
        if map_key not in audio_map:
            audio_map[map_key] = {}
        # 对话行: "01"→"1"；生词行: "v1"→"v1"（保持原样）
        map_line_key = line if line.startswith("v") else str(int(line))
        audio_map[map_key][map_line_key] = url_path

        # 跳过已存在的文件
        if os.path.exists(filepath) and os.path.getsize(filepath) > 1024:
            print(f"  ✓ 跳过（已存在）  L{lesson}_{line}_{role}")
            skipped += 1
            continue

        # 获取声音 ID
        voice_id = VOICE_MAP.get(role)
        if not voice_id:
            print(f"  ⚠ 未知角色 '{role}'，跳过")
            continue

        print(f"  🔊 合成  L{lesson}_{line}_{role}  │  {text[:20]}…" if len(text) > 20 else
              f"  🔊 合成  L{lesson}_{line}_{role}  │  {text}")

        try:
            audio_bytes = synthesize(text, voice_id)
            with open(filepath, "wb") as f:
                f.write(audio_bytes)
            size_kb = len(audio_bytes) // 1024
            print(f"      → 保存成功  {filename}  ({size_kb} KB)")
            success += 1
        except Exception as e:
            print(f"      ✗ 失败: {e}")

        # 礼貌延迟，避免触发限速（约 2 req/s）
        time.sleep(0.6)

    # ── 写入 audioMap.json ─────────────────────────────────────────────
    map_path = os.path.join(audio_root, "audioMap.json")
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(audio_map, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 完成！  成功 {success} / 跳过 {skipped} / 共 {total}")
    print(f"📄 映射表已写入: {map_path}")


if __name__ == "__main__":
    main()
