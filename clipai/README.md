# ClipAI — ระบบตัดคลิปไฮไลท์อัตโนมัติ

ระบบที่ดาวน์โหลดวิดีโอ → แปลงเสียงเป็น transcript → ให้ Claude วิเคราะห์จุดที่น่าสนใจ → ตัดคลิปพร้อมเอฟเฟคด้วย FFmpeg โดยอัตโนมัติ

```
ลิงก์วิดีโอ
     │
     ▼
yt-dlp (ดาวน์โหลด)
     │
     ▼
Whisper (เสียง → transcript + timestamp)
     │
     ▼
Claude API (วิเคราะห์ไฮไลท์ตาม prompt)
     │
     ▼
FFmpeg (ตัดคลิป + ใส่เอฟเฟค)
     │
     ▼
ไฟล์คลิปไฮไลท์
```

---

## โครงสร้างโปรเจกต์

```
clipai/
├── main.py                  # จุดเริ่มต้น (CLI)
├── config.py                # ค่าตั้งค่าทั้งหมด
├── requirements.txt         # dependencies Python
├── .env.example             # ตัวอย่างไฟล์ตั้งค่า API key
│
├── core/
│   ├── downloader.py        # ดาวน์โหลดวิดีโอด้วย yt-dlp
│   ├── transcriber.py       # แปลงเสียงด้วย Whisper
│   ├── analyzer.py          # วิเคราะห์ไฮไลท์ด้วย Claude API
│   └── editor.py            # ตัดคลิปและใส่เอฟเฟคด้วย FFmpeg
│
├── effects/
│   └── presets.py           # ชุดเอฟเฟค FFmpeg สำเร็จรูป
│
├── utils/
│   ├── timestamp.py         # แปลงเวลา HH:MM:SS ↔ วินาที
│   └── logger.py            # ระบบ log
│
└── output/                  # ไฟล์ที่ตัดออกมา (สร้างอัตโนมัติ)
```

---

## การติดตั้ง

### 1. ติดตั้ง FFmpeg (ต้องติดตั้งใน system ก่อน)

```bash
# macOS
brew install ffmpeg

# Ubuntu / Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

### 2. ติดตั้ง Python dependencies

```bash
python -m venv venv
source venv/bin/activate      # macOS / Linux
# หรือ venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

### 3. ตั้งค่า API Key

```bash
cp .env.example .env
```

แล้วแก้ไข `.env` ใส่ค่าของคุณ:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx
WHISPER_MODEL=base
OUTPUT_DIR=./output
MAX_CLIP_DURATION=120
```

---

## วิธีใช้งาน

### รันแบบเต็ม (ดาวน์โหลด → transcript → วิเคราะห์ → ตัดคลิป)

```bash
python main.py "https://www.youtube.com/watch?v=VIDEO_ID" \
  --prompt "หาจุดที่มี kill streak และ ace" \
  --preset hype \
  --model base
```

### มีไฟล์วิดีโออยู่แล้ว ข้ามการดาวน์โหลด

```bash
python main.py "https://..." \
  --skip-download \
  --video ./output/source_abc123.mp4 \
  --prompt "หาจุดที่ตลก"
```

### วิเคราะห์จาก transcript ที่บันทึกไว้แล้ว

```bash
python main.py analyze-only transcript.txt \
  --prompt "หาจุด rank up"
```

---

## ตัวเลือก CLI

| ตัวเลือก | ค่าเริ่มต้น | คำอธิบาย |
|----------|------------|----------|
| `--prompt` / `-p` | หาจุดที่น่าสนใจ | บอก Claude ว่าต้องการไฮไลท์แบบไหน |
| `--preset` / `-e` | `hype` | ชุดเอฟเฟค FFmpeg ที่ใช้ตัดคลิป |
| `--model` / `-m` | `base` | Whisper model สำหรับแปลงเสียง |
| `--skip-download` | `false` | ข้ามการดาวน์โหลด ใช้ไฟล์ที่มีอยู่ |
| `--video` / `-v` | — | Path ไฟล์วิดีโอ (ใช้คู่กับ `--skip-download`) |

---

## ชุดเอฟเฟค (Presets)

| ชื่อ | เหมาะสำหรับ | เอฟเฟคที่ใช้ |
|------|------------|-------------|
| `hype` | เกม / แอ็กชัน | ซูมเข้า + กล้องสั่น + สีสด + แสงวาบ |
| `cinematic` | ดราม่า / ไฮไลท์หนัง | สโลว์โมชั่น + letterbox + ปรับสี + fade |
| `gaming` | สไตล์เกม | สีสด + นีออน + แสงวาบ |
| `clean` | ทั่วไป / เรียบๆ | fade in / fade out |
| `dramatic` | อารมณ์ / ดราม่า | สโลว์โมชั่น + ขาวดำ + cinematic |

---

## ตัวเลือก Whisper Model

| Model | ขนาด | ความแม่น | ความเร็ว |
|-------|------|----------|----------|
| `tiny` | 39MB | ต่ำ | เร็วมาก |
| `base` | 74MB | ปานกลาง | เร็ว |
| `small` | 244MB | ดี | ปานกลาง |
| `medium` | 769MB | ดีมาก | ช้า |
| `large` | 1550MB | ดีที่สุด | ช้ามาก |

> แนะนำ `base` สำหรับทดสอบ, `small` สำหรับใช้งานจริง

---

## Platform ที่รองรับ

- YouTube (`youtube.com`, `youtu.be`)
- Twitch (`twitch.tv/videos/...` — เฉพาะ VOD สาธารณะ)
- Facebook Live (`facebook.com`)
- TikTok

---

## ข้อควรระวัง

| ประเด็น | รายละเอียด |
|---------|------------|
| **ลิขสิทธิ์** | ดาวน์โหลดเฉพาะวิดีโอที่ได้รับอนุญาตหรือเป็นของตัวเอง |
| **RAM สำหรับ Whisper** | model `large` ต้องการ RAM ประมาณ 10GB |
| **FFmpeg PATH** | ต้องติดตั้ง FFmpeg ใน system PATH ก่อนรัน |
| **Claude API Rate Limit** | ถ้า transcript ยาวมากให้แบ่ง chunk ก่อนส่ง |

---

## Dependencies หลัก

- [anthropic](https://pypi.org/project/anthropic/) — Claude API
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — ดาวน์โหลดวิดีโอ
- [openai-whisper](https://github.com/openai/whisper) — แปลงเสียงเป็นข้อความ
- [ffmpeg-python](https://github.com/kkroening/ffmpeg-python) — ตัดและแต่งคลิป
- [typer](https://typer.tiangolo.com/) — CLI framework
- [rich](https://github.com/Textualize/rich) — แสดงผลสวยงามใน terminal
