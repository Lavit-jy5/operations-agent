import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.models.schemas import LogItem

DB_PATH = Path(__file__).resolve().parents[2] / "storage" / "app.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS logs (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            summary TEXT NOT NULL,
            status TEXT NOT NULL
        )
        """
    )
    return conn


def add_log(log_type: str, summary: str, status: str = "success") -> str:
    log_id = str(uuid4())
    with _connect() as conn:
        conn.execute(
            "INSERT INTO logs (id, type, created_at, summary, status) VALUES (?, ?, ?, ?, ?)",
            (log_id, log_type, datetime.now().isoformat(), summary, status),
        )
    return log_id


def list_logs(limit: int = 50) -> list[LogItem]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, type, created_at, summary, status FROM logs ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    return [
        LogItem(
            id=row[0],
            type=row[1],
            created_at=datetime.fromisoformat(row[2]),
            summary=row[3],
            status=row[4],
        )
        for row in rows
    ]

