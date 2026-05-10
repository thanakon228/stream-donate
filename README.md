# 🎙️ Stream Donation System

ระบบรับโดเนทสำหรับสตรีมเมอร์ พร้อม Text-to-Speech อ่านข้อความออกเสียง, แสดง alert ใน OBS และจัดการการตั้งค่าผ่าน Dashboard

---

## 🌐 หน้าต่างๆ

| หน้า | URL | ใช้สำหรับ |
|---|---|---|
| หน้าโดเนท | `/donate.html` | แชร์ให้ผู้ชมกรอกโดเนท |
| OBS Overlay | `/overlay.html` | ใส่เป็น Browser Source ใน OBS |
| Dashboard | `/dashboard.html` | จัดการการตั้งค่าทั้งหมด |

---

## 📄 หน้า Donate

ฟอร์มสำหรับผู้ชมกรอกข้อมูลโดเนท

- **ฟอร์มโดเนท** — ชื่อ, จำนวนเงิน (ขั้นต่ำ 20 THB), ข้อความ (300 ตัวอักษร)
- **ปุ่มจำนวนด่วน** — กด preset เพื่อเติมยอดอัตโนมัติ
- **ล็อคจำนวน** — สตรีมเมอร์สามารถล็อคยอดไม่ให้ผู้ชมเปลี่ยนได้
- **แนบสลิป** — อัปโหลดสลิป JPG/PNG/WEBP ≤ 10MB ยืนยันก่อนส่ง
- **กันสลิปซ้ำ** — ตรวจสอบ 2 ชั้น (in-memory lock 1 ชม. + ประวัติโดเนท)
- **เลือก TTS Provider** — แสดงตัวเลือก ElevenLabs / Google เมื่อมีทั้งคู่
- **Epic Alert picker** — เลือกเอฟเฟกต์พิเศษสำหรับโดเนทขนาดใหญ่

### 🎭 สไตล์การพูด 22 แบบ (ค่าเริ่มต้น = สุ่ม)

| กลุ่ม | สไตล์ |
|---|---|
| 😊 Positive | ⚡ตื่นเต้น · 😄ดีใจ · 🌟ร่าเริง · 🦁ภาคภูมิ · 💕โรแมนติก · 🥺น่ารัก · 💝ซึ้งใจ |
| 😢 Emotional | 😢เศร้า · 😭ร้องไห้ · 😤โกรธ · 😱กลัว · 😰ประหม่า |
| 🎭 Dramatic | 😲ประหลาดใจ · 🎭ดราม่า · 🔥มหากาพย์ |
| 😂 Comic | 😂ขำขัน · 😏เยาะเย้ย |
| 🤫 Calm | 🤫กระซิบ · 🌙ลึกลับ · 😴ง่วงนอน |
| 🎲 Special | **สุ่ม** (ค่าเริ่มต้น) · 😐ปกติ |

---

## 📺 OBS Overlay

ใส่ URL `/overlay.html` เป็น **Browser Source** ใน OBS

- **Alert popup** — แสดงชื่อ, จำนวน, ข้อความเมื่อมีโดเนทใหม่แบบ real-time
- **เล่นเสียง TTS** — รองรับทั้ง MP3 (ElevenLabs / Neural2) และ WAV (Gemini)
- **Tier animation** — แต่ละระดับมี animation ต่างกัน
- **Epic Alert** — เอฟเฟกต์พิเศษ 5 สไตล์ (Meteor / Lightning / Dragon / Galaxy / Cyber)
- **แสดงบัญชีรับเงิน** — แสดงข้อมูลบัญชีใน alert (เปิด/ปิดได้)
- **Queue** — alert แสดงทีละรายการ ไม่ทับกัน

---

## 🎙️ ระบบ Text-to-Speech

### ElevenLabs
- ใช้ model `eleven_v3` — รองรับ action tags เช่น `[laughs]` `[sighs]` `[gasps]` `[whispering]`
- ปรับระดับ Expressiveness (0–1) ได้
- เลือก Voice ID ได้

### Google TTS — ระบบ Tiered 2 ระดับ

| ยอดโดเนท | Provider | คุณสมบัติ |
|---|---|---|
| ≥ N บาท (ตั้งค่าได้) | **Gemini TTS** (AI Studio) | เสียงธรรมชาติ, รองรับสไตล์ |
| < N บาท | **Neural2** (Cloud TTS) | ฟรี, เร็ว |

**Gemini TTS Models ที่รองรับ:**
- `gemini-2.5-flash-preview-tts`
- `gemini-2.5-pro-preview-tts`
- `gemini-3.1-flash-tts-preview`

### การ map สไตล์ต่อ Provider

| Provider | วิธีใส่สไตล์ |
|---|---|
| ElevenLabs | Action tags เช่น `[excited]`, `[whispering]`, `[sobbing]` |
| Gemini | Natural language เช่น "Speak with excitement and high energy:" |
| Neural2 | Strip tags ออก (ไม่รองรับ) |

**Priority สไตล์:** สไตล์ผู้ชม > Global style ใน dashboard > ปกติ

---

## 🏆 Donation Tiers

| Tier | ยอดขั้นต่ำ | ชื่อ | Animation |
|---|---|---|---|
| 💝 Basic | 0 THB | ทั่วไป | slideUp |
| 💜 Nice | 20 THB | น้ำใจ | bounceIn |
| 💙 Good | 50 THB | ใจดี | sparkle |
| 💚 Super | 100 THB | ซูเปอร์ | burst |
| 👑 VIP | 200 THB | วีไอพี | vip |
| 🔥 Boss | 500 THB | บอส | boss |

---

## 🧾 ระบบตรวจสลิป

- ตรวจสอบสลิปผ่าน **EasySlip API** (v1 multipart / v2 base64)
- **กันสลิปซ้ำ 2 ชั้น** — in-memory lock 1 ชม. + ตรวจประวัติ
- **Required mode** — บังคับแนบสลิปก่อนส่งโดเนท
- กำหนดยอดขั้นต่ำจากสลิปที่ผ่านการยืนยันเพื่อแสดง TTS picker

---

## 📊 Dashboard

### หมวดการตั้งค่า

| หมวด | รายละเอียด |
|---|---|
| **General** | ชื่อสตรีม, สกุลเงิน, ยอดขั้นต่ำ, ระยะเวลา alert, ล็อคจำนวน |
| **ElevenLabs** | API key, Voice ID, Model, Expressiveness slider, Action tags cheatsheet |
| **Google TTS** | Cloud TTS key, Gemini API key, model, voice, threshold tier, legacy voice, global style |
| **ทดสอบ TTS** | ปุ่มทดสอบเสียงพร้อมเล่นให้ฟังทันทีจาก dashboard |
| **Tiers** | กำหนด minAmount, สี, icon, animation ต่อ tier |
| **Epic Alert** | เปิด/ปิด, ยอดขั้นต่ำ, สไตล์ default |
| **สลิป** | เปิด/ปิดระบบ, required mode, EasySlip key, API version |
| **บัญชีรับเงิน** | เพิ่ม/ลบ/เรียงลำดับบัญชีธนาคาร/พร้อมเพย์ |
| **Theme** | เลือก 8 ธีม |
| **ทดสอบ** | ทดสอบ custom / ตาม tier / Epic Alert |
| **Bot** | บอทส่งโดเนทจำลองอัตโนมัติ |
| **สำรองข้อมูล** | Export/Import JSON, Railway ENV config |

### 🎨 Themes ที่รองรับ
Purple Galaxy · Neon Cyber · Fire Gold · Ocean Deep · Sakura · Midnight Gold · Arctic Ice · Forest Night

### 🤖 Donation Bot
- ส่งโดเนทจำลองอัตโนมัติตามเวลาที่กำหนด
- ตั้ง interval, ชื่อ, ยอด min/max
- คลังข้อความที่แก้ไข/ลบ/เพิ่มได้

### 💾 Export / Import การตั้งค่า
- **Export JSON** — ไฟล์ชื่อมีวันที่ พร้อม timestamp ใน JSON
- **Import JSON** — dialog ยืนยัน + preview การตั้งค่าก่อน overwrite (ป้องกัน API key หาย)
- **Export Railway Config** — copy ค่า `CONFIG=` ไปวางใน Railway Variables
- **โหลดจาก ENV** — reset config.json ให้ reload จาก `CONFIG` env var ทันที โดยไม่ต้อง redeploy

---

## ⚙️ Environment Variables

| ตัวแปร | รายละเอียด |
|---|---|
| `CONFIG` | JSON string ของการตั้งค่าทั้งหมด (Railway) |
| `ELEVEN_LABS_KEY` | ElevenLabs API key |
| `GOOGLE_TTS_KEY` | Google Cloud TTS API key |
| `GEMINI_API_KEY` | Google AI Studio API key สำหรับ Gemini TTS |
| `EASY_SLIP_KEY` | EasySlip API key |

---

## 🚀 Deploy

```bash
# Clone และติดตั้ง
git clone https://github.com/thanakon228/stream-donate.git
cd stream-donate
npm install

# รันในเครื่อง
node server.js
```

Deploy อัตโนมัติผ่าน **Railway** เมื่อ push to `master`

---

## 🛠️ Tech Stack

- **Backend** — Node.js, Express, Socket.IO
- **TTS** — ElevenLabs API, Google Cloud TTS, Google Gemini TTS (AI Studio)
- **Slip Verify** — EasySlip API
- **Deploy** — Railway
- **Frontend** — Vanilla HTML/CSS/JS (ไม่มี framework)
