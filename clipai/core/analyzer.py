import json
import anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """
คุณคือระบบวิเคราะห์ไฮไลท์สตรีมวิดีโออัตโนมัติ
หน้าที่ของคุณคือวิเคราะห์ transcript และหาจุดที่น่าสนใจตามที่ผู้ใช้ต้องการ

กฎการตอบ:
1. ตอบเป็น JSON เท่านั้น ไม่มีข้อความอื่น
2. ระบุ start/end เป็น HH:MM:SS
3. ให้ end - start อยู่ระหว่าง 15 วินาที ถึง 2 นาที
4. score 1-5 (5 = ไฮไลท์ที่ดีที่สุด)
5. tags ควรเป็นภาษาอังกฤษ lowercase
"""


def analyze_highlights(transcript: str, user_prompt: str) -> list[dict]:
    """
    วิเคราะห์ transcript ด้วย Claude
    return: list ของ clip dict {"start","end","title","reason","score","tags"}
    """
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": f"""
Transcript:
{transcript}

ผู้ใช้ต้องการ: {user_prompt}

ตอบเป็น JSON format:
{{
  "clips": [
    {{
      "start": "HH:MM:SS",
      "end": "HH:MM:SS",
      "title": "ชื่อคลิป",
      "reason": "เหตุผลที่เลือกจุดนี้",
      "score": 1,
      "tags": ["tag1", "tag2"]
    }}
  ]
}}
"""
        }]
    )

    raw: str = message.content[0].text
    clean = raw.replace("```json", "").replace("```", "").strip()
    data: dict = json.loads(clean)
    return data.get("clips", [])
