# ไฟล์ตั้งค่าหลักของระบบ — โหลดค่าจาก .env หรือ environment variables
import os
from dotenv import load_dotenv

# โหลด .env เข้ามาก่อนอ่านค่า
load_dotenv()

# API Key สำหรับเรียกใช้ Claude (ต้องตั้งใน .env)
ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

# ขนาด Whisper model: tiny / base / small / medium / large
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")

# โฟลเดอร์สำหรับเก็บไฟล์ที่ดาวน์โหลดและคลิปที่ตัดแล้ว
OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")

# ความยาวสูงสุดของคลิปหนึ่งตอน (หน่วย: วินาที)
MAX_CLIP_DURATION: int = int(os.getenv("MAX_CLIP_DURATION", "120"))

# Claude model ที่ใช้วิเคราะห์ไฮไลท์
CLAUDE_MODEL: str = "claude-sonnet-4-6"
