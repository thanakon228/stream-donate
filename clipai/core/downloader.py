# โมดูลดาวน์โหลดวิดีโอ — ใช้ yt-dlp รองรับ YouTube, Twitch, TikTok, Facebook
import os
import yt_dlp
from config import OUTPUT_DIR


def download_video(url: str) -> str:
    """ดาวน์โหลดวิดีโอจาก URL แล้วคืน path ของไฟล์ที่บันทึก"""
    # สร้างโฟลเดอร์ output ถ้ายังไม่มี
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    ydl_opts: dict = {
        # เลือก quality สูงสุด: video mp4 + audio m4a รวมกัน
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
        # ตั้งชื่อไฟล์ตาม video ID เพื่อไม่ให้ชนกัน
        "outtmpl": f"{OUTPUT_DIR}/source_%(id)s.%(ext)s",
        "quiet": False,
        "no_warnings": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        return filename
