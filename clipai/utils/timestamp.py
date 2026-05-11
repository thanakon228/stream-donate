def hhmmss_to_seconds(ts: str) -> float:
    """แปลง HH:MM:SS → seconds"""
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def seconds_to_hhmmss(seconds: float) -> str:
    """แปลง seconds → HH:MM:SS"""
    total = int(seconds)
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    return f"{h:02d}:{m:02d}:{s:02d}"


def clip_duration(start: str, end: str) -> float:
    """คำนวณความยาวของคลิปเป็นวินาที"""
    return hhmmss_to_seconds(end) - hhmmss_to_seconds(start)
