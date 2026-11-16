"""Diagnóstico y versión."""

from __future__ import annotations

import platform
import sys

from flask import Blueprint, current_app, jsonify

from version import VERSION

bp = Blueprint("system", __name__)


@bp.get("/salud")
def health():
    return jsonify({"ok": True})


@bp.get("/version")
def version():
    return VERSION


@bp.get("/diagnostico")
def diagnostics():
    from ..core.db import get_db
    db = get_db()
    codes = db.execute("SELECT COUNT(*) AS total FROM codes").fetchone()["total"]
    scans = db.execute("SELECT COUNT(*) AS total FROM scans").fetchone()["total"]
    return jsonify({
        "version": VERSION,
        "empaquetado": bool(getattr(sys, "frozen", False)),
        "python": platform.python_version(),
        "plataforma": platform.platform(),
        "base_de_datos": current_app.config["DATABASE"],
        "url_publica": current_app.config["PUBLIC_BASE_URL"] or "(dinámica)",
        "codigos": codes,
        "escaneos": scans,
    })
