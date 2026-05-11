# โมดูลตัดคลิป — เรียก FFmpeg ผ่าน subprocess เพื่อตัดและใส่เอฟเฟคลงบนคลิป
import os
import subprocess
from effects.presets import build_filter_string, get_preset
from config import OUTPUT_DIR


def cut_clip(
    source_path: str,
    clip: dict,
    index: int,
    preset: str = "hype",
    custom_effects: list[str] | None = None,
) -> str:
    """
    ตัดคลิปเดียวจากไฟล์ต้นฉบับตาม timestamp ใน clip dict
    คืน path ของไฟล์คลิปที่ตัดแล้ว
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    start: str = clip["start"]
    end: str = clip["end"]
    # แปลงชื่อคลิปให้ใช้เป็นชื่อไฟล์ได้ (ไม่มีช่องว่างหรือ /)
    title: str = clip["title"].replace(" ", "_").replace("/", "-")
    output_path = f"{OUTPUT_DIR}/clip_{index:02d}_{title}.mp4"

    # ถ้าระบุ custom_effects มา ใช้แทน preset
    if custom_effects:
        vf_string = build_filter_string(custom_effects)
    else:
        vf_string = get_preset(preset)

    # สร้างคำสั่ง FFmpeg ทีละส่วนเพื่อให้อ่านง่าย
    cmd: list[str] = ["ffmpeg", "-y"]              # -y = เขียนทับถ้าไฟล์มีอยู่แล้ว
    cmd += ["-ss", start, "-to", end]              # กำหนดช่วงเวลาที่ต้องการ
    cmd += ["-i", source_path]                     # ไฟล์วิดีโอต้นทาง
    if vf_string:
        cmd += ["-vf", vf_string]                  # ใส่เอฟเฟค (ถ้ามี)
    cmd += ["-c:v", "libx264"]                     # เข้ารหัสวิดีโอด้วย H.264
    cmd += ["-c:a", "aac"]                         # เข้ารหัสเสียงด้วย AAC
    cmd += ["-movflags", "+faststart"]             # เล่นได้เลยก่อน download เสร็จ (web-friendly)
    cmd += [output_path]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr}")

    return output_path


def cut_all_clips(
    source_path: str,
    clips: list[dict],
    preset: str = "hype",
) -> list[str]:
    """วนตัดทุก clip ใน list แล้วคืน list ของ path ไฟล์ที่ตัดแล้ว"""
    output_paths: list[str] = []
    for i, clip in enumerate(clips):
        print(f"  ✂️  ตัดคลิป [{i+1}/{len(clips)}]: {clip['title']}")
        path = cut_clip(source_path, clip, i + 1, preset)
        output_paths.append(path)
        print(f"  ✅  บันทึก: {path}")
    return output_paths
