"""API de plantillas de diseño."""

from __future__ import annotations

from flask import Blueprint, jsonify

from .service import default_design, public_presets

bp = Blueprint("design", __name__, url_prefix="/api")


@bp.get("/plantillas")
def list_presets():
    return jsonify({"ok": True, "presets": public_presets(),
                    "default": default_design()})
