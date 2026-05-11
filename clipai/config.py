import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
OUTPUT_DIR: str = os.getenv("OUTPUT_DIR", "./output")
MAX_CLIP_DURATION: int = int(os.getenv("MAX_CLIP_DURATION", "120"))
CLAUDE_MODEL: str = "claude-sonnet-4-6"
