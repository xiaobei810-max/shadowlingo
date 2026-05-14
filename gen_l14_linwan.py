"""
一次性脚本：仅用 Azure TTS 生成第 14 课林晚的 4 句静态 MP3。
用法：
  AZURE_SPEECH_KEY="你的密钥" python3 gen_l14_linwan.py
"""
import os, requests, pathlib

AZURE_KEY    = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastasia")

VOICE = "zh-CN-YunhaoNeural"
RATE  = "-5%"
PITCH = "0%"

LINES = [
    ("L14_02_Linwan.mp3", "机场？那有可能，上周我刚从外地坐飞机回来。"),
    ("L14_04_Linwan.mp3", "对，我一直找不到那个笔记本。"),
    ("L14_06_Linwan.mp3", "那太好了，我什么时候方便去拿？"),
    ("L14_08_Linwan.mp3", "你怎么知道我是摄影社的？"),
]

out_dir = pathlib.Path(__file__).parent / "public/audio/lesson14"
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
