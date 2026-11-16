"""Utilidades HTTP compartidas."""

from __future__ import annotations

from flask import current_app, request


def base_url() -> str:
    """URL pública con la que se construyen los enlaces cortos."""
    configured = (current_app.config.get("PUBLIC_BASE_URL") or "").rstrip("/")
    if configured:
        return configured
    return request.host_url.rstrip("/")


def json_error(errors: dict, status: int = 400):
    from flask import jsonify
    return jsonify({"ok": False, "errors": errors}), status
