# โมดูลแปลงเสียง — ใช้ OpenAI Whisper แปลงเสียงจากวิดีโอเป็น transcript พร้อม timestamp
import whisper
from utils.timestamp import seconds_to_hhmmss


def transcribe_video(video_path: str, model_name: str = "base") -> str:
    """
    โหลด Whisper model แล้วแปลงเสียงจากไฟล์วิดีโอ
    คืน string หลายบรรทัดในรูปแบบ: [HH:MM:SS] ข้อความ
    """
    # โหลด model ลง RAM (ครั้งแรกจะดาวน์โหลด weight อัตโนมัติ)
    model = whisper.load_model(model_name)

    # transcribe คืน dict ที่มี key "segments" — แต่ละ segment มี start/end/text
    result = model.transcribe(video_path, verbose=False)

    lines: list[str] = []
    for segment in result["segments"]:
        # แปลงเวลาเริ่มต้นของ segment เป็น HH:MM:SS
        timestamp = seconds_to_hhmmss(segment["start"])
        text = segment["text"].strip()
        lines.append(f"[{timestamp}] {text}")

    return "\n".join(lines)
