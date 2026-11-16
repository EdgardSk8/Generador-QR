"""Acceso a SQLite con una conexión por petición."""

from __future__ import annotations

import os
import sqlite3

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    qr_type TEXT NOT NULL,
    fields TEXT NOT NULL DEFAULT '{}',
    content TEXT NOT NULL,
    target TEXT,
    is_dynamic INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TEXT,
    design TEXT NOT NULL DEFAULT '{}',
    preset_id TEXT,
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_id INTEGER NOT NULL REFERENCES codes(id) ON DELETE CASCADE,
    scanned_at TEXT NOT NULL,
    day TEXT NOT NULL,
    device TEXT,
    os TEXT,
    browser TEXT,
    country TEXT,
    referer TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_code ON scans(code_id, scanned_at);
CREATE INDEX IF NOT EXISTS idx_scans_day ON scans(day);
CREATE INDEX IF NOT EXISTS idx_codes_folder ON codes(folder_id);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        path = current_app.config["DATABASE"]
        directory = os.path.dirname(path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        conn = sqlite3.connect(path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def close_db(_error=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    db = get_db()
    db.executescript(SCHEMA)
    db.commit()


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()
