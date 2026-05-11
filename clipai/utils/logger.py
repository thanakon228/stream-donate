# ตั้งค่า logger กลางของโปรเจกต์ — ใช้ Rich เพื่อแสดงผลสวยงามใน terminal
import logging
from rich.logging import RichHandler

# กำหนดรูปแบบ log และ handler เพียงครั้งเดียวตอน import
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True)],
)

# ใช้ logger นี้ในทุก module: from utils.logger import logger
logger = logging.getLogger("clipai")
