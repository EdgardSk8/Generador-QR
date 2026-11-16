"""API de generación masiva."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..core.http import base_url, json_error
from ..core.utils import ValidationError
from .service import bulk_create

bp = Blueprint("bulk_api", __name__, url_prefix="/api/lote")


@bp.post("/crear")
def create():
    data = request.get_json(silent=True) or {}
    try:
        result = bulk_create(
            data.get("tipo", ""),
            data.get("filas") or [],
            base_url(),
            design=data.get("design"),
            preset_id=data.get("preset_id"),
            folder_id=data.get("folder_id"),
            save=bool(data.get("guardar", True)),
            dynamic=bool(data.get("dinamico", False)),
        )
    except ValidationError as exc:
        return json_error(exc.errors)
    return jsonify({"ok": True, **result})
