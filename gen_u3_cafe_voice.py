"""
一次性脚本：为第三单元（cafe-encounter）的 2 段诺拉语音生成 MP3。
用法：
  AZURE_SPEECH_KEY="你的密钥" python3 gen_u3_cafe_voice.py
"""
import os, requests, pathlib

AZURE_KEY    = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastasia")

VOICE = "zh-CN-XiaochenNeural"   # 诺拉：温暖年轻女声
RATE  = "-5%"
PITCH = "0%"

DIARY_SR_TEXT = (
    "湖边的晚风真的很凉快，吹走了白天的燥热。"
    "今天第一次去东门外的商业街逛了逛，"
    "北京终于不再只是地图上的名字，而是热闹的橱窗、飘着香味的小吃摊，还有那种充满活力的生活气息。"
    "在咖啡馆点单确实是个不小的挑战，那些关于糖分和冰块的选项，比课本上的语法难多了。"
    "还好遇到了林晚，帮我解决了点单的小尴尬。"
    "回宿舍后得开始整理相册了。既然决定报名摄影社，就要拿出最好的作品。"
    "虽然听说面试会很严格，但我还是想去试试看，希望能通过。"
)

MEMORY_03_TEXT = (
    "从咖啡馆出来后，我们刚好顺路回学校。"
    "比起刚才那个需要应对各种点单挑战的咖啡馆，"
    "这段安静回校的小路，反而让我觉得更轻松。"
    "他走得并不快，话也不多，这种不用刻意找话题的相处方式，"
    "让这段有些尴尬的路，在午后的微风里变得温和了起来。"
    "这是我在京华大学的第一场校外冒险。以这种方式收尾，感觉还不错。"
)

LINES = [
    ("diary_sr.mp3",  DIARY_SR_TEXT),
    ("memory_03.mp3", MEMORY_03_TEXT),
]

out_dir = pathlib.Path(
    "/Users/zxb/shadowlingo/.claude/worktrees/hungry-cray-55fcfe/public/assets/gacha/cafe-encounter"
)
out_dir.mkdir(parents=True, exist_ok=True)

if not AZURE_KEY:
    raise SystemExit("❌ 请先设置 AZURE_SPEECH_KEY 环境变量")

url = f"https://{AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1"

for filename, text in LINES:
    dest = out_dir / filename
    if dest.exists():
        print(f"⏭  跳过（已存在）: {filename}")
        continue
    ssml = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>"
            f"<voice name='{VOICE}'><prosody rate='{RATE}' pitch='{PITCH}'>{text}</prosody></voice></speak>")
    headers = {
        "Ocp-Apim-Subscription-Key": AZURE_KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
    }
    r = requests.post(url, headers=headers, data=ssml.encode("utf-8"), timeout=30)
    if r.status_code == 200:
        dest.write_bytes(r.content)
        print(f"✅ 生成完成: {filename}  ({len(r.content)} 字节)")
    else:
        print(f"❌ 失败: {filename}  HTTP {r.status_code}  {r.text[:120]}")

print("\n全部完成。")
