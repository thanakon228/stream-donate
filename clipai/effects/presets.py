EFFECTS: dict[str, str] = {
    # Video Filters
    "zoom_in": "zoompan=z='min(zoom+0.002,1.3)':d=125:s=1280x720",
    "slowmo":  "setpts=2.0*PTS",
    "speedup": "setpts=0.5*PTS",
    "shake":   "crop=iw-40:ih-40:20+10*sin(n/5):20+10*cos(n/5)",
    "flip":    "hflip",
    "mirror":  "split[a][b];[a]crop=iw/2:ih:0:0[left];[b]crop=iw/2:ih:iw/2:0,hflip[right];[left][right]hstack",

    # Color Filters
    "color_boost":  "eq=contrast=1.2:saturation=1.6:brightness=0.05",
    "color_grade":  "curves=r='0/0 0.5/0.45 1/0.9':g='0/0 0.5/0.5 1/1':b='0/0 0.5/0.6 1/1'",
    "grayscale":    "hue=s=0",
    "neon_glow":    "gblur=sigma=3,eq=contrast=1.4:brightness=0.1:saturation=2.0",
    "cinematic":    "eq=contrast=1.1:saturation=0.85,vignette=PI/4",

    # Layout Filters
    "letterbox": "pad=iw:ih*1.25:0:(oh-ih)/2:black",
    "blur_bg":   "split[fg][bg];[bg]scale=1280:720,gblur=sigma=20[blurred];[blurred][fg]overlay=(W-w)/2:(H-h)/2",

    # Flash/Transition
    "flash_in":  "fade=t=in:st=0:d=0.3",
    "flash_out": "fade=t=out:st=0:d=0.3",
    "fadein":    "fade=t=in:st=0:d=0.5",
    "fadeout":   "fade=t=out:d=0.5",
}

PRESETS: dict[str, list[str]] = {
    "hype":      ["zoom_in", "shake", "color_boost", "flash_in"],
    "cinematic": ["slowmo", "letterbox", "color_grade", "fadein", "fadeout"],
    "gaming":    ["color_boost", "neon_glow", "flash_in"],
    "clean":     ["fadein", "fadeout"],
    "dramatic":  ["slowmo", "grayscale", "cinematic"],
}


def build_filter_string(effect_names: list[str]) -> str:
    """รับ list ชื่อเอฟเฟค → return FFmpeg -vf string"""
    filters = [EFFECTS[e] for e in effect_names if e in EFFECTS]
    return ",".join(filters) if filters else ""


def get_preset(preset_name: str) -> str:
    """รับชื่อ preset → return filter string"""
    effects = PRESETS.get(preset_name, [])
    return build_filter_string(effects)
