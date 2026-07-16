import json
import sqlite3
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from app.models.schemas import BriefGenerateRequest, BriefGenerateResponse, GenerationItem, ValidationIssue

DB_PATH = Path(__file__).resolve().parents[2] / "storage" / "app.db"


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS generations (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            brief_type TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            body TEXT NOT NULL,
            risk_notice TEXT NOT NULL,
            citations_json TEXT NOT NULL,
            quality_score INTEGER NOT NULL,
            review_issues_json TEXT NOT NULL,
            request_json TEXT NOT NULL
        )
        """
    )
    return conn


def save_generation(request: BriefGenerateRequest, response: BriefGenerateResponse) -> str:
    generation_id = str(uuid4())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO generations (
                id, created_at, brief_type, title, summary, body, risk_notice,
                citations_json, quality_score, review_issues_json, request_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                generation_id,
                datetime.now().isoformat(),
                request.brief_type,
                response.title,
                response.summary,
                response.body,
                response.risk_notice,
                json.dumps(response.citations, ensure_ascii=False),
                response.quality_score,
                json.dumps([issue.model_dump() for issue in response.review_issues], ensure_ascii=False),
                json.dumps(request.model_dump(), ensure_ascii=False),
            ),
        )
    return generation_id


def list_generations(limit: int = 50) -> list[GenerationItem]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, created_at, brief_type, title, summary, body, risk_notice,
                   citations_json, quality_score, review_issues_json
            FROM generations
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_row_to_generation(row) for row in rows]


def _row_to_generation(row) -> GenerationItem:
    return GenerationItem(
        id=row[0],
        created_at=datetime.fromisoformat(row[1]),
        brief_type=row[2],
        title=row[3],
        summary=row[4],
        body=row[5],
        risk_notice=row[6],
        citations=_safe_json_list(row[7]),
        quality_score=int(row[8] or 0),
        review_issues=_safe_issues(row[9]),
    )


def _safe_json_list(value: str) -> list[str]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item is not None]


def _safe_issues(value: str) -> list[ValidationIssue]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    issues: list[ValidationIssue] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        level = item.get("level")
        if level not in {"info", "warning", "error"}:
            level = "info"
        issues.append(
            ValidationIssue(
                level=level,
                field=str(item.get("field") or "storage"),
                message=str(item.get("message") or ""),
            )
        )
    return issues
