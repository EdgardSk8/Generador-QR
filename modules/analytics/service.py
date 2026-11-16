"""Servicio de estadísticas de escaneo.

Solo se guardan datos agregables y no identificativos: dispositivo, sistema
operativo, navegador y país (si el servidor recibe la cabecera del CDN). No se
almacena la IP ni el agente de usuario completo.
"""

from __future__ import annotations

import re
from datetime import timedelta

from ..core.db import get_db
from ..core.utils import now_iso, utcnow

_BROWSERS = [
    ("Edge", r"Edg/|EdgA/|EdgiOS/"),
    ("Samsung Internet", r"SamsungBrowser"),
    ("Opera", r"OPR/|Opera"),
    ("Firefox", r"Firefox/"),
    ("Chrome", r"Chrome/|CriOS/"),
    ("Safari", r"Safari/"),
]

_OS = [
    ("Android", r"Android"),
    ("iOS", r"iPhone|iPad|iPod"),
    ("Windows", r"Windows"),
    ("macOS", r"Mac OS X|Macintosh"),
    ("Linux", r"Linux|X11"),
]


def parse_user_agent(user_agent: str) -> dict:
    ua = user_agent or ""
    if re.search(r"iPad|Tablet", ua):
        device = "Tablet"
    elif re.search(r"Mobi|iPhone|iPod|Android.*Mobile", ua):
        device = "Móvil"
    elif not ua:
        device = "Desconocido"
    else:
        device = "Escritorio"

    os_name = next((name for name, pattern in _OS if re.search(pattern, ua)), "Otro")
    browser = next((name for name, pattern in _BROWSERS if re.search(pattern, ua)), "Otro")
    return {"device": device, "os": os_name, "browser": browser}


def record_scan(code_id: int, user_agent: str = "", country: str = "", referer: str = "") -> None:
    info = parse_user_agent(user_agent)
    moment = utcnow()
    db = get_db()
    db.execute(
        "INSERT INTO scans (code_id, scanned_at, day, device, os, browser, country, referer) "
        "VALUES (?,?,?,?,?,?,?,?)",
        (
            code_id,
            moment.isoformat(timespec="seconds"),
            moment.date().isoformat(),
            info["device"],
            info["os"],
            info["browser"],
            (country or "")[:40] or None,
            (referer or "")[:200] or None,
        ),
    )
    db.commit()


def _group(table: str, code_id: int | None, since: str) -> dict[str, int]:
    query = f"SELECT {table} AS key, COUNT(*) AS total FROM scans WHERE day >= ?"
    params: list = [since]
    if code_id:
        query += " AND code_id = ?"
        params.append(code_id)
    query += f" GROUP BY {table} ORDER BY total DESC LIMIT 8"
    rows = get_db().execute(query, params).fetchall()
    return {row["key"] or "Desconocido": row["total"] for row in rows}


def stats(code_id: int | None = None, days: int = 30) -> dict:
    days = max(1, min(int(days or 30), 365))
    since = (utcnow() - timedelta(days=days - 1)).date().isoformat()
    db = get_db()

    filter_sql = " AND code_id = ?" if code_id else ""
    params: list = [since] + ([code_id] if code_id else [])

    rows = db.execute(
        f"SELECT day, COUNT(*) AS total FROM scans WHERE day >= ?{filter_sql} GROUP BY day",
        params,
    ).fetchall()
    by_day = {row["day"]: row["total"] for row in rows}

    series = []
    start = utcnow().date() - timedelta(days=days - 1)
    for offset in range(days):
        day = (start + timedelta(days=offset)).isoformat()
        series.append({"day": day, "total": by_day.get(day, 0)})

    lifetime_params = [code_id] if code_id else []
    lifetime = db.execute(
        f"SELECT COUNT(*) AS total, MAX(scanned_at) AS last FROM scans WHERE 1=1{filter_sql}",
        lifetime_params,
    ).fetchone()

    period_total = sum(by_day.values())
    peak = max(series, key=lambda item: item["total"])
    active_days = sum(1 for item in series if item["total"])

    return {
        "days": days,
        "since": since,
        "total": lifetime["total"] or 0,
        "last_scan": lifetime["last"],
        "period_total": period_total,
        "daily_average": round(period_total / days, 1),
        "active_days": active_days,
        "peak": peak,
        "series": series,
        "device": _group("device", code_id, since),
        "os": _group("os", code_id, since),
        "browser": _group("browser", code_id, since),
        "country": _group("country", code_id, since),
    }


def recent_scans(limit: int = 8) -> list[dict]:
    rows = get_db().execute(
        "SELECT s.scanned_at, s.device, s.os, s.browser, s.country, c.name, c.id "
        "FROM scans s JOIN codes c ON c.id = s.code_id "
        "ORDER BY s.id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


def total_scans() -> int:
    row = get_db().execute("SELECT COUNT(*) AS total FROM scans").fetchone()
    return row["total"] or 0


def scans_by_day(days: int = 14) -> list[dict]:
    return stats(None, days)["series"]


__all__ = ["parse_user_agent", "record_scan", "stats", "recent_scans",
           "total_scans", "scans_by_day", "now_iso"]
