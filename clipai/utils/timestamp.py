# ฟังก์ชันช่วยแปลงรูปแบบเวลาระหว่าง HH:MM:SS กับ seconds


def hhmmss_to_seconds(ts: str) -> float:
    """แปลง HH:MM:SS หรือ MM:SS หรือ SS → วินาที (float)"""
    parts = ts.split(":")
    if len(parts) == 3:
        # รูปแบบ HH:MM:SS
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        # รูปแบบ MM:SS
        m, s = parts
        return int(m) * 60 + float(s)
    # รูปแบบ SS เพียงอย่างเดียว
    return float(parts[0])


def seconds_to_hhmmss(seconds: float) -> str:
    """แปลงวินาที → HH:MM:SS (ตัดทศนิยมทิ้ง)"""
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def clip_duration(start: str, end: str) -> float:
    """คำนวณความยาวของคลิปจาก timestamp เริ่มต้น–สิ้นสุด (หน่วย: วินาที)"""
    return hhmmss_to_seconds(end) - hhmmss_to_seconds(start)
