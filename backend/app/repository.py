"""SQLite storage; immutable request snapshots keep pagination stable."""

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path


class Repository:
    def __init__(self, path: str):
        self.path = path

    @contextmanager
    def connection(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.execute("PRAGMA journal_mode = WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS contexts (id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS requests (
                    id TEXT PRIMARY KEY,
                    context_id TEXT NOT NULL REFERENCES contexts(id),
                    prompt TEXT NOT NULL,
                    language TEXT NOT NULL,
                    status TEXT NOT NULL,
                    message TEXT,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS insights (
                    request_id TEXT NOT NULL REFERENCES requests(id),
                    position INTEGER NOT NULL,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (request_id, position)
                );
            """)

    def context_exists(self, context_id: str) -> bool:
        with self.connection() as db:
            return (
                db.execute("SELECT 1 FROM contexts WHERE id = ?", (context_id,)).fetchone()
                is not None
            )

    def save(self, *, request_id, context_id, prompt, language, status, insights, message=None):
        with self.connection() as db:
            db.execute("INSERT OR IGNORE INTO contexts(id) VALUES (?)", (context_id,))
            db.execute(
                """INSERT INTO requests(id, context_id, prompt, language, status, message)
                          VALUES (?, ?, ?, ?, ?, ?)""",
                (request_id, context_id, prompt, language, status, message),
            )
            db.executemany(
                "INSERT INTO insights(request_id, position, payload) VALUES (?, ?, ?)",
                [
                    (request_id, i, json.dumps(item, ensure_ascii=False))
                    for i, item in enumerate(insights)
                ],
            )

    def read_page(self, request_id: str, page: int, page_size: int):
        with self.connection() as db:
            request = db.execute("SELECT * FROM requests WHERE id = ?", (request_id,)).fetchone()
            if request is None:
                return None
            total = db.execute(
                "SELECT COUNT(*) FROM insights WHERE request_id = ?", (request_id,)
            ).fetchone()[0]
            rows = db.execute(
                """SELECT payload FROM insights WHERE request_id = ?
                                 ORDER BY position LIMIT ? OFFSET ?""",
                (request_id, page_size, (page - 1) * page_size),
            ).fetchall()
            return dict(request), [json.loads(row["payload"]) for row in rows], total
