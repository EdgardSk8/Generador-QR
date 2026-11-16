"""API de estadísticas y resumen del panel."""

from __future__ import annotations

from flask import Blueprint, abort, jsonify, request

from ..codes.api import serialize
from ..codes.service import count_codes, get_code, list_codes
from .service import recent_scans, stats, total_scans

bp = Blueprint("analytics_api", __name__, url_prefix="/api")


@bp.get("/estadisticas")
def stats_view():
    code_id = request.args.get("codigo", type=int)
    days = request.args.get("dias", default=30, type=int)
    if code_id and not get_code(code_id):
        abort(404)
    data = stats(code_id, days)
    if code_id:
        data["code"] = serialize(get_code(code_id))
    return jsonify({"ok": True, "stats": data})


@bp.get("/resumen")
def summary_view():
    counts = count_codes()
    recent = list_codes(limit=6)
    activity = stats(None, 14)
    return jsonify({
        "ok": True,
        "counts": counts,
        "scans": {"total": total_scans(), "period_total": activity["period_total"],
                  "series": activity["series"], "last_scan": activity["last_scan"]},
        "recent_codes": [serialize(code) for code in recent],
        "recent_scans": [
            {**row, "scanned_at": row["scanned_at"],
             "when": row["scanned_at"]}
            for row in recent_scans(8)
        ],
    })
