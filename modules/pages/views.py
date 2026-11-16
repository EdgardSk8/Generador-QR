"""Páginas HTML de la interfaz."""

from __future__ import annotations

import base64
from io import BytesIO

import qrcode
from flask import Blueprint, abort, render_template, request

from ..codes.service import get_code

bp = Blueprint("pages", __name__)


@bp.get("/")
def dashboard():
    return render_template("dashboard.html", active="dashboard", page_title="Panel")


@bp.get("/crear")
def create():
    code = None
    code_id = request.args.get("code", type=int)
    if code_id:
        code = get_code(code_id)
        if not code:
            abort(404)
    return render_template(
        "crear.html",
        active="crear",
        page_title="Editar código" if code else "Crear código QR",
        edit_code=code,
        initial_type=(code["qr_type"] if code else request.args.get("tipo", "")),
    )


@bp.get("/mis-codigos")
def codes():
    return render_template("codigos.html", active="codigos", page_title="Mis códigos")


@bp.get("/plantillas")
def templates():
    return render_template("plantillas.html", active="plantillas", page_title="Plantillas")


@bp.get("/estadisticas")
def analytics():
    return render_template("estadisticas.html", active="estadisticas",
                           page_title="Estadísticas", code_id=None)


@bp.get("/estadisticas/<int:code_id>")
def analytics_detail(code_id: int):
    code = get_code(code_id)
    if not code:
        abort(404)
    return render_template("estadisticas.html", active="estadisticas",
                           page_title="Estadísticas", code_id=code_id, code=code)


@bp.get("/lote")
def bulk():
    return render_template("lote.html", active="lote", page_title="Generación masiva")


@bp.route("/clasico", methods=["GET", "POST"])
def legacy():
    """Generador original de una sola URL; se conserva sin cambios."""
    qr_image = None
    if request.method == "POST":
        url = request.form.get("url", "")
        img = qrcode.make(url)
        buffer = BytesIO()
        img.save(buffer)
        buffer.seek(0)
        qr_image = base64.b64encode(buffer.getvalue()).decode("utf-8")
    return render_template("index.html", qr_image=qr_image)
