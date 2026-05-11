import whisper
from utils.timestamp import seconds_to_hhmmss


def transcribe_video(video_path: str, model_name: str = "base") -> str:
    """
    แปลงเสียงจากวิดีโอเป็น transcript พร้อม timestamp
    return: transcript string รูปแบบ [HH:MM:SS] ข้อความ
    """
    model = whisper.load_model(model_name)
    result = model.transcribe(video_path, verbose=False)

    lines: list[str] = []
    for segment in result["segments"]:
        timestamp = seconds_to_hhmmss(segment["start"])
        text = segment["text"].strip()
        lines.append(f"[{timestamp}] {text}")

    return "\n".join(lines)
