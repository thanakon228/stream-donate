# ใช้ Python 3.11 slim เป็น base image
FROM python:3.11-slim

# ติดตั้ง FFmpeg, git และ build tools ที่ Whisper ต้องการ
RUN apt-get update && \
    apt-get install -y ffmpeg git build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# ติดตั้ง torch แบบ CPU-only ก่อน (ลดขนาดจาก ~2.5GB เหลือ ~200MB)
# ป้องกัน build timeout บน Railway
RUN pip install --no-cache-dir \
    torch \
    --index-url https://download.pytorch.org/whl/cpu

# ติดตั้ง dependencies ที่เหลือ
RUN pip install --no-cache-dir -r requirements.txt

# Copy โค้ดทั้งหมด
COPY . .

# สร้างโฟลเดอร์ output สำหรับเก็บคลิปที่ตัดแล้ว
RUN mkdir -p output public

# Railway จะส่ง PORT มาเป็น env var อัตโนมัติ
EXPOSE 8000

CMD uvicorn web:app --host 0.0.0.0 --port ${PORT:-8000}
