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
    ตัดคลิปจาก source video
    return: path ของคลิปที่ตัดแล้ว
    """
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    start: str = clip["start"]
    end: str = clip["end"]
    title: str = clip["title"].replace(" ", "_").replace("/", "-")
    output_path = f"{OUTPUT_DIR}/clip_{index:02d}_{title}.mp4"

    if custom_effects:
        vf_string = build_filter_string(custom_effects)
    else:
        vf_string = get_preset(preset)

    cmd: list[str] = ["ffmpeg", "-y"]
    cmd += ["-ss", start, "-to", end]
    cmd += ["-i", source_path]
    if vf_string:
        cmd += ["-vf", vf_string]
    cmd += ["-c:v", "libx264"]
    cmd += ["-c:a", "aac"]
    cmd += ["-movflags", "+faststart"]
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
    """ตัดทุก clip และ return list ของ output path"""
    output_paths: list[str] = []
    for i, clip in enumerate(clips):
        print(f"  ✂️  ตัดคลิป [{i+1}/{len(clips)}]: {clip['title']}")
        path = cut_clip(source_path, clip, i + 1, preset)
        output_paths.append(path)
        print(f"  ✅  บันทึก: {path}")
    return output_paths
