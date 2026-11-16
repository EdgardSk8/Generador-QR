"""API HTTP de los códigos QR guardados."""

from __future__ import annotations

import io

from flask import Blueprint, abort, jsonify, request, send_file

from ..catalog.service import get_type, is_hosted
from ..core.http import base_url, json_error
from ..core.utils import ValidationError, slugify
from .render import render
from .service import (count_codes, create_code, create_folder, delete_code,
                      delete_folder, duplicate_code, get_code, is_available,
                      is_expired, list_codes, list_folders, update_code)

bp = Blueprint("codes_api", __name__, url_prefix="/api")


def serialize(code: dict) -> dict:
    data = dict(code)
    data["landing"] = is_hosted(code["qr_type"])
    data["expired"] = is_expired(code)
    data["available"] = is_available(code)
    data["type_label"] = (get_type(code["qr_type"]) or {}).get("label", code["qr_type"])
    data["target"] = code.get("target")
    return data


@bp.get("/codigos")
def list_view():
    codes = list_codes(
        search=request.args.get("q", "").strip(),
        folder_id=request.args.get("carpeta") or None,
        qr_type=request.args.get("tipo", ""),
        mode=request.args.get("modo", ""),
    )
    return jsonify({"ok": True, "codes": [serialize(code) for code in codes],
                    "folders": list_folders(), "counts": count_codes()})


@bp.post("/codigos")
def create_view():
    try:
        code = create_code(request.get_json(silent=True) or {}, base_url())
    except ValidationError as exc:
        return json_error(exc.errors)
    return jsonify({"ok": True, "code": serialize(code)}), 201


@bp.get("/codigos/<int:code_id>")
def detail_view(code_id: int):
    code = get_code(code_id)
    if not code:
        abort(404)
    return jsonify({"ok": True, "code": serialize(code)})


@bp.put("/codigos/<int:code_id>")
def update_view(code_id: int):
    try:
        code = update_code(code_id, request.get_json(silent=True) or {}, base_url())
    except ValidationError as exc:
        return json_error(exc.errors)
    return jsonify({"ok": True, "code": serialize(code)})


@bp.delete("/codigos/<int:code_id>")
def delete_view(code_id: int):
    if not delete_code(code_id):
        abort(404)
    return jsonify({"ok": True})


@bp.post("/codigos/<int:code_id>/duplicar")
def duplicate_view(code_id: int):
    try:
        code = duplicate_code(code_id, base_url())
    except ValidationError as exc:
        return json_error(exc.errors)
    return jsonify({"ok": True, "code": serialize(code)}), 201


@bp.get("/codigos/<int:code_id>.<fmt>")
def image_view(code_id: int, fmt: str):
    code = get_code(code_id)
    if not code:
        abort(404)
    try:
        size = min(4096, max(128, int(request.args.get("tamano", 1024))))
        margin = request.args.get("margen")
        payload, mime = render(
            code,
            fmt=fmt,
            size=size,
            transparent=request.args.get("transparente") in {"1", "true"},
            margin=int(margin) if margin not in (None, "") else None,
        )
    except (ValueError, KeyError):
        abort(400)
    return send_file(
        io.BytesIO(payload),
        mimetype=mime,
        as_attachment=request.args.get("descargar") in {"1", "true"},
        download_name=f"{slugify(code['name'])}.{fmt}",
        max_age=0,
    )


@bp.get("/carpetas")
def folders_view():
    return jsonify({"ok": True, "folders": list_folders()})


@bp.post("/carpetas")
def create_folder_view():
    data = request.get_json(silent=True) or {}
    try:
        folder = create_folder(data.get("name", ""))
    except ValidationError as exc:
        return json_error(exc.errors)
    return jsonify({"ok": True, "folder": folder}), 201


@bp.delete("/carpetas/<int:folder_id>")
def delete_folder_view(folder_id: int):
    if not delete_folder(folder_id):
        abort(404)
    return jsonify({"ok": True})
