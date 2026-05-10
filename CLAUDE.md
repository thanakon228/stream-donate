# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # ติดตั้ง dependencies
node server.js    # รันเซิร์ฟเวอร์ (port 3000)
```

ไม่มี test suite หรือ linter — ทดสอบด้วยการรัน server แล้วเปิด browser

## Architecture

โปรเจคนี้เป็น **single-file Express server + 3 static HTML pages** ไม่มี build step และไม่ใช้ framework ฝั่ง frontend

### server.js (958+ บรรทัด)

ไฟล์เดียวที่รัน backend ทั้งหมด โครงสร้างภายใน:

| ส่วน | บรรทัดโดยประมาณ | หน้าที่ |
|------|-----------------|---------|
| Config system | 40–181 | `DEFAULTS`, `deepMerge()`, `loadConfig()`, `saveConfig()` |
| Auth & Rate Limit | หลัง `saveDonation()` | `requireAuth()`, `makeRateLimit()`, `limitDonate`, `limitTts` |
| TTS engine | 228–419 | `generateTTS()` — รองรับ ElevenLabs / Gemini / Neural2 |
| API Routes | 420+ | Express routes ทั้งหมด |
| Bot engine | ~844–910 | `startBot()`, `stopBot()`, `fireBotDonation()` |

### Config priority (สูงสุด → ต่ำสุด)
1. Individual env vars (`EASYSLIP_KEY`, `GOOGLE_TTS_KEY`, ฯลฯ)
2. `config.json` บน disk
3. `CONFIG` env var (JSON string — วิธีหลักบน Railway)
4. `DEFAULTS` object ใน server.js

`config.json` และ `donations.json` **ไม่ได้ commit** (อยู่ใน .gitignore) — สร้างใหม่อัตโนมัติตอน startup

### Static pages (public/)

| ไฟล์ | ผู้ใช้ | หน้าที่ |
|------|--------|---------|
| `donate.html` | ผู้ชม | กรอกโดเนท, แนบสลิป, เลือก TTS style |
| `overlay.html` | OBS Browser Source | รับ `new_donation` event ผ่าน Socket.IO แล้วแสดง alert + เล่นเสียง |
| `dashboard.html` | สตรีมเมอร์ | ตั้งค่าทุกอย่าง, ทดสอบ TTS/alert |

ทั้งสามไฟล์เป็น self-contained HTML ขนาดใหญ่ (CSS + JS ฝังใน `<style>` และ `<script>` เดียวกัน)

### Real-time flow

```
donate.html  →  POST /api/donate  →  server.js generates TTS  →  io.emit('new_donation')  →  overlay.html plays alert
```

### TTS providers

- **ElevenLabs** — ใช้ action tags `[laughs]` ฯลฯ กับ `eleven_v3`
- **Gemini TTS** — ใช้ natural language prefix, return PCM → แปลง WAV ด้วย `pcmToWav()`
- **Google Neural2** — legacy, free tier, strip action tags ออกก่อนส่ง

STYLE_MAP ใน server.js map style key → `elevenTag` / `geminiPrefix` ต่อ provider

### Security middleware (ที่เพิ่มมา)

- `requireAuth` — ตรวจ `x-admin-token` header กับ `ADMIN_TOKEN` env var (ถ้าไม่ตั้งค่า = เปิดทั้งหมด)
- `limitDonate` / `limitTts` — in-memory rate limit, ไม่ใช้ external package
- `esc()` ใน donate.html — escape HTML ก่อนใส่ใน innerHTML (ป้องกัน XSS จาก EasySlip response)

### Deployment

- Railway auto-deploy จาก `git push origin master`
- ตั้ง `ADMIN_TOKEN` และ `ALLOWED_ORIGINS` ใน Railway Variables เพื่อเปิด auth และ CORS lockdown
- `saveConfig()` / `saveDonation()` ใช้ atomic write (write `.tmp` → rename) เพื่อป้องกัน corruption
