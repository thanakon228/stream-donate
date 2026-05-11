# เก็บ FFmpeg filter string ทุกตัว และ preset ที่ผสมเอฟเฟคไว้ล่วงหน้า

# ── เอฟเฟคแต่ละตัว (ใช้เป็น -vf argument ใน FFmpeg) ──────────────────────────
EFFECTS: dict[str, str] = {
    # กลุ่มเอฟเฟคภาพเคลื่อนไหว
    "zoom_in": "zoompan=z='min(zoom+0.002,1.3)':d=125:s=1280x720",  # ค่อยๆ ซูมเข้า
    "slowmo":  "setpts=2.0*PTS",   # สโลว์โมชั่น 0.5×
    "speedup": "setpts=0.5*PTS",   # เร่งความเร็ว 2×
    "shake":   "crop=iw-40:ih-40:20+10*sin(n/5):20+10*cos(n/5)",  # กล้องสั่น
    "flip":    "hflip",            # กลับซ้าย-ขวา
    "mirror":  "split[a][b];[a]crop=iw/2:ih:0:0[left];[b]crop=iw/2:ih:iw/2:0,hflip[right];[left][right]hstack",  # มิเรอร์

    # กลุ่มปรับสีและแสง
    "color_boost":  "eq=contrast=1.2:saturation=1.6:brightness=0.05",  # เพิ่มความสดของสี
    "color_grade":  "curves=r='0/0 0.5/0.45 1/0.9':g='0/0 0.5/0.5 1/1':b='0/0 0.5/0.6 1/1'",  # ปรับโทนสีแบบ cinematic
    "grayscale":    "hue=s=0",     # ขาวดำ
    "neon_glow":    "gblur=sigma=3,eq=contrast=1.4:brightness=0.1:saturation=2.0",  # เรืองแสงนีออน
    "cinematic":    "eq=contrast=1.1:saturation=0.85,vignette=PI/4",  # โทนหนังฝรั่ง

    # กลุ่มจัดเลย์เอาต์
    "letterbox": "pad=iw:ih*1.25:0:(oh-ih)/2:black",  # แถบดำบนล่างแบบหนัง
    "blur_bg":   "split[fg][bg];[bg]scale=1280:720,gblur=sigma=20[blurred];[blurred][fg]overlay=(W-w)/2:(H-h)/2",  # พื้นหลัง blur

    # กลุ่ม transition และแสงวาบ
    "flash_in":  "fade=t=in:st=0:d=0.3",   # แฟลชเข้า 0.3 วินาที
    "flash_out": "fade=t=out:st=0:d=0.3",  # แฟลชออก 0.3 วินาที
    "fadein":    "fade=t=in:st=0:d=0.5",   # fade เข้า 0.5 วินาที
    "fadeout":   "fade=t=out:d=0.5",       # fade ออก 0.5 วินาที
}

# ── ชุดเอฟเฟคสำเร็จรูป (เลือกใช้ด้วย --preset) ───────────────────────────────
PRESETS: dict[str, list[str]] = {
    "hype":      ["zoom_in", "shake", "color_boost", "flash_in"],         # เร้าใจ สำหรับเกม/แอ็กชัน
    "cinematic": ["slowmo", "letterbox", "color_grade", "fadein", "fadeout"],  # สไตล์หนัง
    "gaming":    ["color_boost", "neon_glow", "flash_in"],                # สีสันสดใสแบบเกม
    "clean":     ["fadein", "fadeout"],                                    # เรียบๆ ไม่มีเอฟเฟคหนัก
    "dramatic":  ["slowmo", "grayscale", "cinematic"],                    # ดราม่า ขาวดำ + สโลว์
}


def build_filter_string(effect_names: list[str]) -> str:
    """รับ list ชื่อเอฟเฟค → คืน string สำหรับ FFmpeg -vf (คั่นด้วยจุลภาค)"""
    filters = [EFFECTS[e] for e in effect_names if e in EFFECTS]
    return ",".join(filters) if filters else ""


def get_preset(preset_name: str) -> str:
    """รับชื่อ preset → คืน filter string พร้อมใช้งาน (คืน string ว่างถ้าไม่พบ)"""
    effects = PRESETS.get(preset_name, [])
    return build_filter_string(effects)
