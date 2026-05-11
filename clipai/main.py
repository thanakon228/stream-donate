import typer
from rich.console import Console
from rich.table import Table
from core.downloader import download_video
from core.transcriber import transcribe_video
from core.analyzer import analyze_highlights
from core.editor import cut_all_clips
from config import WHISPER_MODEL

app = typer.Typer(help="ClipAI — ตัดไฮไลท์อัตโนมัติ")
console = Console()


@app.command()
def run(
    url: str = typer.Argument(..., help="URL ของวิดีโอ/สตรีม"),
    prompt: str = typer.Option(
        "หาจุดที่น่าสนใจและน่าตื่นเต้นที่สุด", "--prompt", "-p"
    ),
    preset: str = typer.Option(
        "hype",
        "--preset",
        "-e",
        help="เอฟเฟค: hype / cinematic / gaming / clean / dramatic",
    ),
    model: str = typer.Option(
        WHISPER_MODEL, "--model", "-m",
        help="Whisper model: tiny/base/small/medium/large",
    ),
    skip_dl: bool = typer.Option(False, "--skip-download", help="ข้ามการดาวน์โหลด"),
    video: str | None = typer.Option(
        None, "--video", "-v", help="Path ไฟล์วิดีโอ (ถ้า --skip-download)"
    ),
) -> None:
    """รันระบบตัดไฮไลท์แบบเต็ม: download → transcribe → analyze → cut"""
    console.rule("[bold yellow]ClipAI เริ่มต้น[/bold yellow]")

    # Step 1: Download
    if skip_dl and video:
        video_path = video
        console.print(f"[cyan]ใช้ไฟล์:[/cyan] {video_path}")
    else:
        console.print("[cyan]กำลังดาวน์โหลดวิดีโอ...[/cyan]")
        video_path = download_video(url)
        console.print(f"[green]ดาวน์โหลดสำเร็จ:[/green] {video_path}")

    # Step 2: Transcribe
    console.print(f"\n[cyan]กำลัง transcribe ด้วย Whisper [{model}]...[/cyan]")
    transcript = transcribe_video(video_path, model_name=model)
    console.print(
        f"[green]Transcript พร้อมแล้ว ({len(transcript.splitlines())} บรรทัด)[/green]"
    )

    # Step 3: Analyze
    console.print(f"\n[cyan]Claude กำลังวิเคราะห์: \"{prompt}\"[/cyan]")
    clips = analyze_highlights(transcript, prompt)
    console.print(f"[green]พบ {len(clips)} ไฮไลท์[/green]")

    table = Table(title="ไฮไลท์ที่พบ", style="yellow")
    table.add_column("#", style="dim")
    table.add_column("Title", style="bold white")
    table.add_column("Start", style="cyan")
    table.add_column("End", style="cyan")
    table.add_column("Score", style="yellow")
    table.add_column("Tags")
    for i, c in enumerate(clips):
        stars = "★" * c.get("score", 0)
        tags = ", ".join(c.get("tags", []))
        table.add_row(str(i + 1), c["title"], c["start"], c["end"], stars, tags)
    console.print(table)

    # Step 4: Cut
    console.print(f"\n[cyan]กำลังตัดคลิปด้วย FFmpeg (preset: {preset})...[/cyan]")
    output_paths = cut_all_clips(video_path, clips, preset=preset)

    console.rule("[bold green]เสร็จสิ้น[/bold green]")
    for p in output_paths:
        console.print(f"  {p}")


@app.command()
def analyze_only(
    transcript_file: str = typer.Argument(..., help="Path ไฟล์ transcript .txt"),
    prompt: str = typer.Option("หาจุดที่น่าสนใจ", "--prompt", "-p"),
) -> None:
    """วิเคราะห์ไฮไลท์จาก transcript ที่มีอยู่แล้ว"""
    with open(transcript_file, "r", encoding="utf-8") as f:
        transcript = f.read()
    clips = analyze_highlights(transcript, prompt)
    for i, c in enumerate(clips):
        console.print(
            f"[{i+1}] {c['title']} ({c['start']} → {c['end']}) {'★' * c.get('score', 0)}"
        )


if __name__ == "__main__":
    app()
