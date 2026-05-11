# FastAPI web app — รับคำสั่งจาก browser, รัน pipeline ใน background, ส่ง progress กลับแบบ real-time
import asyncio
import uuid
from pathlib import Path
from typing import AsyncGenerator

from fastapi import BackgroundTasks, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI
from pydantic import BaseModel

from config import OUTPUT_DIR

app = FastAPI(title="ClipAI")

# เก็บสถานะ job ทุกตัวใน memory (ล้างเองเมื่อ server restart)
jobs: dict[str, dict] = {}


class RunRequest(BaseModel):
    url: str
    prompt: str = "หาจุดที่น่าสนใจและน่าตื่นเต้นที่สุด"
    preset: str = "hype"
    model: str = "base"


async def run_pipeline(job_id: str, req: RunRequest) -> None:
    """รัน download → transcribe → analyze → cut ใน background thread"""
    job = jobs[job_id]

    def log(msg: str) -> None:
        job["messages"].append(msg)

    try:
        # ขั้นที่ 1: ดาวน์โหลดวิดีโอ
        log("กำลังดาวน์โหลดวิดีโอ...")
        from core.downloader import download_video
        video_path = await asyncio.to_thread(download_video, req.url)
        log(f"ดาวน์โหลดสำเร็จ: {Path(video_path).name}")

        # ขั้นที่ 2: แปลงเสียงเป็น transcript
        log(f"กำลัง transcribe ด้วย Whisper [{req.model}]...")
        from core.transcriber import transcribe_video
        transcript = await asyncio.to_thread(transcribe_video, video_path, req.model)
        log(f"Transcript พร้อมแล้ว ({len(transcript.splitlines())} บรรทัด)")

        # ขั้นที่ 3: ให้ Claude วิเคราะห์ไฮไลท์
        log(f'Claude กำลังวิเคราะห์: "{req.prompt}"')
        from core.analyzer import analyze_highlights
        clips = await asyncio.to_thread(analyze_highlights, transcript, req.prompt)
        log(f"พบ {len(clips)} ไฮไลท์")

        # ขั้นที่ 4: ตัดคลิปด้วย FFmpeg
        log(f"กำลังตัดคลิปด้วย FFmpeg (preset: {req.preset})...")
        from core.editor import cut_clip
        output_files = []
        for i, clip in enumerate(clips):
            log(f"ตัดคลิป [{i + 1}/{len(clips)}]: {clip['title']}")
            path = await asyncio.to_thread(cut_clip, video_path, clip, i + 1, req.preset)
            output_files.append({
                "title": clip["title"],
                "start": clip["start"],
                "end": clip["end"],
                "score": clip.get("score", 0),
                "filename": Path(path).name,
            })
            log(f"บันทึก: {Path(path).name}")

        job["status"] = "done"
        job["clips"] = output_files
        log("เสร็จสิ้น!")

    except Exception as e:
        job["status"] = "error"
        log(f"เกิดข้อผิดพลาด: {e}")


@app.post("/api/run")
async def start_run(req: RunRequest, background_tasks: BackgroundTasks) -> dict:
    """รับคำสั่งจาก UI, สร้าง job และเริ่ม pipeline ใน background"""
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "running", "messages": [], "clips": []}
    background_tasks.add_task(run_pipeline, job_id, req)
    return {"job_id": job_id}


@app.get("/api/status/{job_id}")
async def stream_status(
    job_id: str,
    from_index: int = Query(0, alias="from"),
) -> StreamingResponse:
    """ส่ง log กลับแบบ real-time ผ่าน Server-Sent Events (รองรับ reconnect ด้วย ?from=N)"""

    async def event_stream() -> AsyncGenerator[str, None]:
        last_idx = from_index
        idle_ticks = 0

        while True:
            job = jobs.get(job_id)
            if not job:
                yield "data: ไม่พบ job\n\n"
                break

            # ส่ง message ใหม่ที่ client ยังไม่ได้รับ
            msgs = job["messages"]
            while last_idx < len(msgs):
                yield f"data: {msgs[last_idx]}\n\n"
                last_idx += 1
                idle_ticks = 0

            # แจ้ง event เสร็จ/ผิดพลาดแล้วปิด stream
            if job["status"] in ("done", "error"):
                yield f"event: done\ndata: {job['status']}\n\n"
                break

            # keepalive ทุก 25 วินาที ป้องกัน Railway/proxy ตัด connection
            idle_ticks += 1
            if idle_ticks >= 50:
                yield ": keepalive\n\n"
                idle_ticks = 0

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/clips/{job_id}")
async def get_clips(job_id: str) -> dict:
    """คืนรายการคลิปที่ตัดแล้วพร้อมสถานะของ job"""
    job = jobs.get(job_id)
    if not job:
        return {"clips": [], "status": "not_found"}
    return {"clips": job.get("clips", []), "status": job["status"]}


@app.get("/api/download/{filename}")
async def download_clip(filename: str) -> FileResponse:
    """ดาวน์โหลดไฟล์คลิป — ป้องกัน path traversal ด้วย Path().name"""
    safe_name = Path(filename).name
    file_path = Path(OUTPUT_DIR) / safe_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="ไม่พบไฟล์")
    return FileResponse(file_path, media_type="video/mp4", filename=safe_name)


# เสิร์ฟ static files (public/index.html) — ต้องอยู่หลัง API routes เสมอ
app.mount("/", StaticFiles(directory="public", html=True), name="static")
