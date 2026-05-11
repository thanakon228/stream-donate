import os
import yt_dlp
from config import OUTPUT_DIR


def download_video(url: str) -> str:
    """
    ดาวน์โหลดวิดีโอจาก URL
    return: path ของไฟล์วิดีโอที่ดาวน์โหลด
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    ydl_opts: dict = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]",
        "outtmpl": f"{OUTPUT_DIR}/source_%(id)s.%(ext)s",
        "quiet": False,
        "no_warnings": False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)
        return filename
