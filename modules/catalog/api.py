"""API del catálogo de tipos de QR."""

from __future__ import annotations

from flask import Blueprint, jsonify, request

from ..core.utils import ValidationError
from .service import build_payload, public_spec

bp = Blueprint("catalog", __name__, url_prefix="/api")


@bp.get("/tipos")
def list_types():
    return jsonify(public_spec())


@bp.post("/contenido")
def build_content():
    data = request.get_json(silent=True) or {}
    try:
        result = build_payload(data.get("type", ""), data.get("fields") or {})
    except ValidationError as exc:
        return jsonify({"ok": False, "errors": exc.errors}), 400
    return jsonify({"ok": True, "content": result["content"],
                    "hosted": result["hosted"], "values": result["values"]})
