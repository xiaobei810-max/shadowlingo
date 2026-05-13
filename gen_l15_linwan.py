"""
一次性脚本：仅用 Azure TTS 生成第 15 课林晚的 4 句静态 MP3。
用法（在本地终端运行，不要把密钥贴进对话）：
  AZURE_SPEECH_KEY="你的密钥" python3 gen_l15_linwan.py
"""
import os, requests, pathlib

AZURE_KEY    = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastasia")

VOICE = "zh-CN-YunhaoNeural"
RATE  = "-5%"
PITCH = "0%"

LINES = [
    ("L15_02_Linwan.mp3", "原来是夏七七。怪不得。"),
    ("L15_04_Linwan.mp3", "摄影社确实看重作品。你为什么想加入摄影社？"),
    ("L15_06_Linwan.mp3", "我们加个微信吧，我把报名的具体要求发给你。"),
    ("L15_08_Linwan.mp3", "好了。面试的时候，记得带上你的作品和我的笔记本。"),
]

out_dir = pathlib.Path(__file__).parent / "public/audio/lesson15"
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
