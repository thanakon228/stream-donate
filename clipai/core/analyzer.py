# โมดูลวิเคราะห์ไฮไลท์ — ส่ง transcript ให้ Claude แล้วรับ JSON รายการคลิปที่น่าสนใจ
import json
import anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

# สร้าง client ครั้งเดียวตอน import (ประหยัด overhead)
client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

# System prompt บอก Claude ว่าต้องตอบกลับเป็น JSON เท่านั้น
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
    ส่ง transcript พร้อม prompt ของผู้ใช้ไปให้ Claude วิเคราะห์
    คืน list ของ dict แต่ละตัวมี: start, end, title, reason, score, tags
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

    # ลบ markdown code block ออกก่อน parse JSON (Claude บางครั้งใส่ ```json มาด้วย)
    raw: str = message.content[0].text
    clean = raw.replace("```json", "").replace("```", "").strip()
    data: dict = json.loads(clean)
    return data.get("clips", [])
