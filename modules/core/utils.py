"""Utilidades comunes sin dependencias del framework."""

from __future__ import annotations

import json
import re
import secrets
import unicodedata
from datetime import date, datetime, timezone
from typing import Any


class ValidationError(ValueError):
    """Error de validación con detalle por campo."""

    def __init__(self, errors: dict[str, str]):
        super().__init__("Datos inválidos")
        self.errors = errors


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return utcnow().isoformat(timespec="seconds")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


_SLUG_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"


def new_slug(length: int = 8) -> str:
    """Identificador corto, sin caracteres ambiguos (0/o, 1/l/i)."""
    return "".join(secrets.choice(_SLUG_ALPHABET) for _ in range(length))


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-") or "qr"


def json_load(value: Any, default: Any = None) -> Any:
    if value is None or value == "":
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def clean_text(value: Any, max_length: int | None = None) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else ""
    text = str(value).replace("\x00", "").strip()
    if max_length is not None:
        text = text[:max_length]
    return text


def normalize_url(value: str) -> str:
    """Añade https:// cuando falta el esquema y respeta esquemas conocidos."""
    text = clean_text(value)
    if not text:
        return ""
    if text.lower().startswith(("http://", "https://")):
        return text
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", text):
        return text
    return "https://" + text.lstrip("/")


def is_safe_url(value: str) -> bool:
    text = (value or "").strip().lower()
    return text.startswith(("http://", "https://"))


def human_day(value: str) -> str:
    """'2026-11-16' -> '16 nov 2026'."""
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError):
        return value or ""
    months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    return f"{parsed.day} {months[parsed.month - 1]} {parsed.year}"


def short_datetime(value: str | None) -> str:
    parsed = parse_iso(value)
    if not parsed:
        return ""
    return parsed.astimezone().strftime("%d/%m/%Y %H:%M")
