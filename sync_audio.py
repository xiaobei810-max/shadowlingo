#!/usr/bin/env python3
"""
sync_audio.py — 批量音频预生成脚本
用法: python sync_audio.py

• 第 1-10 课：MiniMax TTS（已有）
• 林晚（Linwan）台词：Azure 官方 TTS（zh-CN-YunhaoNeural，年轻随性男声）

Azure 配置（运行脚本前设置环境变量）：
  export AZURE_SPEECH_KEY="你的 Azure Key"
  export AZURE_SPEECH_REGION="eastasia"   # 或 eastus / japaneast 等

Azure 免费额度：F0 套餐每月 50 万字符，完全够用。
注册地址：https://portal.azure.com → 搜索"Speech Services" → 创建（选 F0 免费层）
"""

import os
import json
import time
import requests

# ── MiniMax API 配置 ──────────────────────────────────────────────
MINIMAX_API_KEY = "sk-api-k0C134YCrEhkh7dQGQFhVK4B2gUxcdLIKbNrTZklQSMyG5ulacGpftRrzhL-RD2mc3qOySPXRdhCjVjfIR6ITzlm7xJrLUoDoF8Bdcqig47m0v37zwCrOxM"
MINIMAX_API_URL = "https://api.minimaxi.chat/v1/t2a_v2"
MINIMAX_MODEL   = "speech-01-hd-2.8"

# ── Azure TTS 配置（从环境变量读取）──────────────────────────────
AZURE_KEY    = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastasia")

# ── 角色 → MiniMax 声音 ID ────────────────────────────────────────
MINIMAX_VOICE_MAP = {
    "Nora":     "Chinese (Mandarin)_Gentle_Senior",
    "Mingxuan": "Chinese (Mandarin)_Gentleman",
    "Qiqi":     "Arrogant_Miss",
    "Staff":    "Chinese (Mandarin)_Gentle_Senior",
    "Cashier":  "presenter_male",
    "Huijie":   "Japanese_CalmLady",
    "David":    "English_Diligent_Man",
}

# ── 林晚 Azure TTS 参数（与 api/tts.js linwan 配置一致）────────────
LINWAN_VOICE  = "zh-CN-YunhaoNeural"
LINWAN_RATE   = "-5%"    # rateScale 0.95 → (0.95-1)*100 = -5%
LINWAN_PITCH  = "0%"

# ── 台词数据（1-10 课，MiniMax 合成）────────────────────────────────
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
    {"lesson": "06", "line": "v1", "role": "Qiqi",     "text": "食堂"},
    {"lesson": "06", "line": "v2", "role": "Qiqi",     "text": "面条"},
    {"lesson": "06", "line": "v3", "role": "Qiqi",     "text": "刷卡"},
    {"lesson": "06", "line": "v4", "role": "Qiqi",     "text": "回头"},
    # 第七课
    {"lesson": "07", "line": "01", "role": "Nora",     "text": "七七，我想买一些生活用品。"},
    {"lesson": "07", "line": "02", "role": "Qiqi",     "text": "超市里都有，你需要什么？"},
    {"lesson": "07", "line": "03", "role": "Nora",     "text": "我需要买毛巾和牙膏。"},
    {"lesson": "07", "line": "04", "role": "Qiqi",     "text": "在那边，我帮你找。"},
    {"lesson": "07", "line": "05", "role": "Nora",     "text": "你好，我要结账。"},
    {"lesson": "07", "line": "06", "role": "Cashier",  "text": "一共二十八块。"},
    {"lesson": "07", "line": "07", "role": "Nora",     "text": "我只有现金，给您五十。"},
    {"lesson": "07", "line": "08", "role": "Cashier",  "text": "好的，找您二十二块。"},
    {"lesson": "07", "line": "v1", "role": "Qiqi",     "text": "生活用品"},
    {"lesson": "07", "line": "v2", "role": "Qiqi",     "text": "超市"},
    {"lesson": "07", "line": "v3", "role": "Qiqi",     "text": "牙膏"},
    {"lesson": "07", "line": "v4", "role": "Qiqi",     "text": "结账"},
    # 第八课
    {"lesson": "08", "line": "01", "role": "David", "text": "你好，打扰一下。我可以有 Wi-Fi 密码吗？"},
    {"lesson": "08", "line": "02", "role": "Nora",  "text": "你是想问密码多少，对吧？是八个八。"},
    {"lesson": "08", "line": "03", "role": "David", "text": "对，密码多少！我的中文真是太糟糕了。"},
    {"lesson": "08", "line": "04", "role": "Nora",  "text": "没关系，慢慢来。我是 Nora，昨天刚到。"},
    {"lesson": "08", "line": "05", "role": "David", "text": "我是大卫。你的发音听起来很自然。"},
    {"lesson": "08", "line": "06", "role": "Nora",  "text": "谢谢。其实我的词汇量还不够。"},
    {"lesson": "08", "line": "07", "role": "David", "text": "太好了，以后我们可以在这里一起练习吗？"},
    {"lesson": "08", "line": "08", "role": "Nora",  "text": "当然可以，随时欢迎。"},
    {"lesson": "08", "line": "v1", "role": "David", "text": "打扰"},
    {"lesson": "08", "line": "v2", "role": "David", "text": "密码"},
    {"lesson": "08", "line": "v3", "role": "David", "text": "糟糕"},
    {"lesson": "08", "line": "v4", "role": "David", "text": "练习"},
]

# ── 林晚台词（Azure TTS，YunhaoNeural）───────────────────────────
# 包含：第13课对话台词 + 角色介绍问候语
# lesson_key: audioMap.json 里的 lesson key（"lesson13"）
# line_key:   对话行号（"1"/"7"）或 "greeting"（问候语）
LINWAN_SCRIPT = [
    # ── 第 13 课对话台词 ──────────────────────────────────────────
    # 对应 LESSONS_META[12].dialogue[0]（audioMap key "1"）
    {
        "lesson_key": "lesson13",
        "line_key":   "1",
        "filename":   "L13_01_Linwan.mp3",
        "text":       "如果不知道怎么选，一般可以点「正常冰、正常糖」。",
    },
    # 对应 LESSONS_META[12].dialogue[6]（audioMap key "7"）
    {
        "lesson_key": "lesson13",
        "line_key":   "7",
        "filename":   "L13_07_Linwan.mp3",
        "text":       "没关系。对刚来的留学生来说，中文菜单确实有点难。",
    },
    # ── 第 14 课对话台词（找到失主）─────────────────────────────────
    # 对应 LESSONS_META[13].dialogue[1]（audioMap key "2"）
    {
        "lesson_key": "lesson14",
        "line_key":   "2",
        "filename":   "L14_02_Linwan.mp3",
        "text":       "机场？那有可能，上周我刚从外地坐飞机回来。",
    },
    # 对应 LESSONS_META[13].dialogue[3]（audioMap key "4"）
    {
        "lesson_key": "lesson14",
        "line_key":   "4",
        "filename":   "L14_04_Linwan.mp3",
        "text":       "对，我一直找不到那个笔记本。",
    },
    # 对应 LESSONS_META[13].dialogue[5]（audioMap key "6"）
    {
        "lesson_key": "lesson14",
        "line_key":   "6",
        "filename":   "L14_06_Linwan.mp3",
        "text":       "那太好了，我什么时候方便去拿？",
    },
    # 对应 LESSONS_META[13].dialogue[7]（audioMap key "8"）
    {
        "lesson_key": "lesson14",
        "line_key":   "8",
        "filename":   "L14_08_Linwan.mp3",
        "text":       "你怎么知道我是摄影社的？",
    },
    # ── 角色介绍问候语（非对话，独立文件）──────────────────────────
    # 对应 CHARACTER_DB.linwan.greeting，由 charIntroPlayGreeting() 读取
    {
        "lesson_key": None,           # 不注册到 lesson audioMap
        "line_key":   None,
        "filename":   "linwan_greeting.mp3",
        "subdir":     "linwan",       # 存到 /public/audio/linwan/
        "text":       "如果不知道怎么选，点「正常」就可以。",
    },
]


# ── MiniMax 合成函数 ─────────────────────────────────────────────
def synthesize_minimax(text: str, voice_id: str, retries: int = 3) -> bytes:
    headers = {
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type":  "application/json",
    }
    payload = {
        "model": MINIMAX_MODEL,
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
            r = requests.post(MINIMAX_API_URL, headers=headers, json=payload, timeout=60)
            r.raise_for_status()
            data = r.json()
            base_resp = data.get("base_resp", {})
            if base_resp.get("status_code") != 0:
                raise RuntimeError(f"API 错误: {base_resp.get('status_msg')}")
            return bytes.fromhex(data["data"]["audio"])
        except Exception as e:
            print(f"  ⚠ 第 {attempt} 次尝试失败: {e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
            else:
                raise


# ── Azure TTS 合成函数 ───────────────────────────────────────────
def synthesize_azure(text: str, voice: str = LINWAN_VOICE,
                     rate: str = LINWAN_RATE, pitch: str = LINWAN_PITCH,
                     retries: int = 3) -> bytes:
    """调用 Azure 官方 TTS REST API，返回 MP3 字节"""
    if not AZURE_KEY:
        raise RuntimeError(
            "未设置 AZURE_SPEECH_KEY 环境变量。\n"
            "请先执行：export AZURE_SPEECH_KEY=\"你的Key\"\n"
            "注册地址：https://portal.azure.com → Speech Services → 创建（F0 免费层）"
        )

    ssml = (
        f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>"
        f"<voice name='{voice}'>"
        f"<prosody rate='{rate}' pitch='{pitch}'>{text}</prosody>"
        f"</voice></speak>"
    )
    url = f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type":              "application/ssml+xml",
        "X-Microsoft-OutputFormat":  "audio-24khz-96kbitrate-mono-mp3",
        "User-Agent":                "EchoChinese/1.0",
    }
    for attempt in range(1, retries + 1):
        try:
            r = requests.post(url, headers=headers,
                              data=ssml.encode("utf-8"), timeout=30)
            if r.status_code == 401:
                raise RuntimeError("Azure Key 无效或已过期，请检查 AZURE_SPEECH_KEY")
            if r.status_code == 400:
                raise RuntimeError(f"Azure SSML 格式错误: {r.text[:200]}")
            r.raise_for_status()
            return r.content
        except RuntimeError:
            raise
        except Exception as e:
            print(f"  ⚠ 第 {attempt} 次尝试失败: {e}")
            if attempt < retries:
                time.sleep(2 ** attempt)
            else:
                raise


# ── 主流程 ─────────────────────────────────────────────────────────
def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    audio_root = os.path.join(script_dir, "public", "audio")
    os.makedirs(audio_root, exist_ok=True)

    # 读取已有的 audioMap（增量写入，不破坏已有数据）
    map_path  = os.path.join(audio_root, "audioMap.json")
    audio_map = {}
    if os.path.exists(map_path):
        with open(map_path, encoding="utf-8") as f:
            audio_map = json.load(f)

    # ── 第一阶段：MiniMax 批量合成（1-10 课）──────────────────────
    total   = len(SCRIPT)
    success = skipped = 0
    print(f"🎙  MiniMax TTS — 共 {total} 条台词\n")

    for entry in SCRIPT:
        lesson   = entry["lesson"]
        line     = entry["line"]
        role     = entry["role"]
        text     = entry["text"]

        folder   = os.path.join(audio_root, f"lesson{lesson}")
        os.makedirs(folder, exist_ok=True)
        filename = f"L{lesson}_{line}_{role}.mp3"
        filepath = os.path.join(folder, filename)
        url_path = f"/audio/lesson{lesson}/{filename}"

        map_key      = f"lesson{lesson}"
        line_key     = line if line.startswith("v") else str(int(line))
        audio_map.setdefault(map_key, {})[line_key] = url_path

        if os.path.exists(filepath) and os.path.getsize(filepath) > 1024:
            print(f"  ✓ 跳过（已存在）  L{lesson}_{line}_{role}")
            skipped += 1
            continue

        voice_id = MINIMAX_VOICE_MAP.get(role)
        if not voice_id:
            print(f"  ⚠ 未知角色 '{role}'，跳过")
            continue

        label = text[:20] + "…" if len(text) > 20 else text
        print(f"  🔊 合成  L{lesson}_{line}_{role}  │  {label}")
        try:
            audio_bytes = synthesize_minimax(text, voice_id)
            with open(filepath, "wb") as f:
                f.write(audio_bytes)
            print(f"      → 保存  {filename}  ({len(audio_bytes)//1024} KB)")
            success += 1
        except Exception as e:
            print(f"      ✗ 失败: {e}")
        time.sleep(0.6)

    print(f"\n✅ MiniMax 完成  成功 {success} / 跳过 {skipped} / 共 {total}\n")

    # ── 第二阶段：Azure TTS（林晚台词）────────────────────────────
    linwan_total   = len(LINWAN_SCRIPT)
    linwan_success = linwan_skipped = 0

    print(f"🎙  Azure TTS（林晚 YunhaoNeural）— 共 {linwan_total} 条\n")

    for entry in LINWAN_SCRIPT:
        subdir   = entry.get("subdir", f"lesson{entry.get('lesson_key','')[-2:]}" if entry.get("lesson_key") else "linwan")
        folder   = os.path.join(audio_root, subdir if not entry.get("lesson_key") else entry["lesson_key"].replace("lesson", "lesson"))
        # 规范化路径
        if entry.get("lesson_key"):
            folder = os.path.join(audio_root, entry["lesson_key"].replace("lesson", "lesson"))
        else:
            folder = os.path.join(audio_root, entry.get("subdir", "linwan"))

        os.makedirs(folder, exist_ok=True)
        filename = entry["filename"]
        filepath = os.path.join(folder, filename)
        text     = entry["text"]

        # 注册到 audioMap（对话台词；问候语不注册，由前端直接引用路径）
        if entry.get("lesson_key") and entry.get("line_key"):
            url_path = f"/audio/{entry['lesson_key']}/{filename}"
            audio_map.setdefault(entry["lesson_key"], {})[entry["line_key"]] = url_path

        if os.path.exists(filepath) and os.path.getsize(filepath) > 1024:
            print(f"  ✓ 跳过（已存在）  {filename}")
            linwan_skipped += 1
            continue

        label = text[:25] + "…" if len(text) > 25 else text
        print(f"  🔊 合成  {filename}  │  {label}")
        try:
            audio_bytes = synthesize_azure(text)
            with open(filepath, "wb") as f:
                f.write(audio_bytes)
            print(f"      → 保存  {filename}  ({len(audio_bytes)//1024} KB)")
            linwan_success += 1
        except Exception as e:
            print(f"      ✗ 失败: {e}")
            if "AZURE_SPEECH_KEY" in str(e):
                print("\n⚠  请先设置环境变量再运行：")
                print("   export AZURE_SPEECH_KEY=\"你的Key\"")
                print("   export AZURE_SPEECH_REGION=\"eastasia\"")
                break
        time.sleep(0.3)

    print(f"\n✅ Azure 完成  成功 {linwan_success} / 跳过 {linwan_skipped} / 共 {linwan_total}\n")

    # ── 写入 audioMap.json ─────────────────────────────────────────
    with open(map_path, "w", encoding="utf-8") as f:
        json.dump(audio_map, f, ensure_ascii=False, indent=2)
    print(f"📄 audioMap.json 已更新：{map_path}")


if __name__ == "__main__":
    main()
