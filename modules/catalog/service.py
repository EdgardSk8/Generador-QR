"""Lógica de los tipos de código QR.

La especificación vive en ``data/qr_types.json`` y la comparten el servidor y el
navegador, de modo que el contenido se construye con una sola definición.
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import quote, urlparse

from ..core.config import DATA_DIR
from ..core.utils import (ValidationError, clean_text, is_safe_url,
                          normalize_url)

PLACEHOLDER = re.compile(r"\{([a-zA-Z0-9_]+)\}")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

_catalog: dict | None = None


def load_catalog() -> dict:
    global _catalog
    if _catalog is None:
        path = DATA_DIR / "qr_types.json"
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        types = {item["id"]: item for item in data["types"]}
        for item in types.values():
            item["_fields"] = {field["name"]: field for field in item.get("fields", [])}
        data["_types"] = types
        _catalog = data
    return _catalog


def public_spec() -> dict:
    """Catálogo serializable para el navegador (sin claves internas)."""
    catalog = load_catalog()
    return {
        "version": catalog.get("version", 1),
        "categories": catalog["categories"],
        "types": [
            {key: value for key, value in item.items() if not key.startswith("_")}
            for item in catalog["types"]
        ],
    }


def get_types() -> dict[str, dict]:
    return load_catalog()["_types"]


def get_type(type_id: str) -> dict | None:
    return get_types().get(type_id)


def is_hosted(type_id: str) -> bool:
    qtype = get_type(type_id)
    return bool(qtype and qtype.get("hosted"))


def accepts_dynamic(type_id: str) -> bool:
    qtype = get_type(type_id)
    if not qtype:
        return False
    return bool(qtype.get("hosted") or qtype.get("dynamic"))


# --------------------------------------------------------------------------- #
# Normalización y validación
# --------------------------------------------------------------------------- #

def _clean_repeater(value, field: dict) -> list[dict]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return []
    if not isinstance(value, list):
        return []
    limit = int(field.get("max", 50))
    keys = list((field.get("item") or {}).keys()) or ["label", "url"]
    rows: list[dict] = []
    for item in value[:limit]:
        if not isinstance(item, dict):
            continue
        row = {key: clean_text(item.get(key), 500) for key in keys}
        if any(row.values()):
            rows.append(row)
    return rows


def normalize_values(qtype: dict, values: dict | None) -> dict:
    raw = dict(values or {})
    normalized: dict = {}
    for field in qtype.get("fields", []):
        name = field["name"]
        value = raw.get(name, field.get("default", ""))
        ftype = field.get("type")
        if ftype == "checkbox":
            if isinstance(value, str):
                normalized[name] = value.strip().lower() in {"1", "true", "on", "si", "sí", "yes"}
            else:
                normalized[name] = bool(value)
        elif ftype == "repeater":
            normalized[name] = _clean_repeater(value, field)
        elif ftype == "url":
            normalized[name] = normalize_url(clean_text(value, field.get("maxlength")))
        else:
            normalized[name] = clean_text(value, field.get("maxlength"))
    return normalized


def _valid_url(value: str) -> bool:
    candidate = normalize_url(value)
    parsed = urlparse(candidate)
    if parsed.scheme in ("mailto", "tel"):
        return len(candidate) > len(parsed.scheme) + 1
    return bool(parsed.netloc) and ("." in parsed.netloc or parsed.netloc == "localhost")


def validate(qtype: dict, values: dict) -> dict[str, str]:
    errors: dict[str, str] = {}
    for field in qtype.get("fields", []):
        name = field["name"]
        ftype = field.get("type")
        value = values.get(name)

        if ftype == "repeater":
            rows = value or []
            has_content = any(
                str(row.get("url") or row.get("nombre") or "").strip() for row in rows
            )
            if field.get("required") and not has_content:
                errors[name] = "Añade al menos un elemento con enlace o nombre"
            elif any(row.get("url") and not _valid_url(row["url"]) for row in rows):
                errors[name] = "Hay un enlace con formato no válido"
            continue

        if field.get("required"):
            if ftype == "checkbox" and not value:
                errors[name] = "Este campo es obligatorio"
                continue
            if ftype != "checkbox" and not str(value or "").strip():
                errors[name] = "Este campo es obligatorio"
                continue

        text = str(value or "")
        if not text:
            continue
        if field.get("maxlength") and len(text) > int(field["maxlength"]):
            errors[name] = f"Máximo {field['maxlength']} caracteres"
        elif ftype == "email" and not EMAIL_RE.match(text):
            errors[name] = "Correo electrónico no válido"
        elif ftype == "url" and not _valid_url(text):
            errors[name] = "Enlace no válido (usa https://...)"
        elif field.get("pattern") and not re.fullmatch(field["pattern"], text):
            errors[name] = "Formato no válido"

    any_required = qtype.get("any_required") or []
    if any_required and not any(str(values.get(name) or "").strip() for name in any_required):
        errors[any_required[0]] = "Completa al menos uno de estos campos"
    return errors


# --------------------------------------------------------------------------- #
# Construcción del contenido
# --------------------------------------------------------------------------- #

def _escape(value: str, mode: str) -> str:
    if mode == "wifi":
        return re.sub(r'([\\;,":])', r"\\\1", value)
    if mode == "mecard":
        return re.sub(r'([\\;:,"])', r"\\\1", value)
    return value


def _escape_vcard(value: str) -> str:
    text = re.sub(r"([\\;,])", r"\\\1", value or "")
    return text.replace("\r\n", "\n").replace("\n", "\\n")


def _render_template(template: str, values: dict, field_map: dict,
                     escape_mode: str, drop_empty: bool) -> str:
    lines: list[str] = []
    for line in template.split("\n"):
        names = PLACEHOLDER.findall(line)
        if drop_empty and names:
            if all(not str(values.get(name) or "").strip() for name in names):
                continue

        def replace(match: re.Match) -> str:
            name = match.group(1)
            field = field_map.get(name, {})
            value = values.get(name, "")
            if isinstance(value, bool):
                text = "true" if value else ""
            else:
                text = str(value or "")
            if field.get("encode") == "url":
                text = quote(text, safe="")
            return _escape(text, field.get("escape") or escape_mode)

        lines.append(PLACEHOLDER.sub(replace, line))
    return "\n".join(lines).strip()


def _build_vcard(values: dict) -> str:
    first = values.get("first_name", "")
    last = values.get("last_name", "")
    full = " ".join(part for part in (first, last) if part)
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"N:{_escape_vcard(last)};{_escape_vcard(first)};;;",
        f"FN:{_escape_vcard(full)}",
    ]
    if values.get("org"):
        lines.append(f"ORG:{_escape_vcard(values['org'])}")
    if values.get("title"):
        lines.append(f"TITLE:{_escape_vcard(values['title'])}")
    if values.get("phone"):
        lines.append(f"TEL;TYPE=CELL:{_escape_vcard(values['phone'])}")
    if values.get("email"):
        lines.append(f"EMAIL;TYPE=INTERNET:{_escape_vcard(values['email'])}")
    if values.get("website"):
        lines.append(f"URL:{_escape_vcard(values['website'])}")
    if any(values.get(key) for key in ("street", "city", "country")):
        street = _escape_vcard(values.get("street", ""))
        city = _escape_vcard(values.get("city", ""))
        country = _escape_vcard(values.get("country", ""))
        lines.append(f"ADR;TYPE=WORK:;;{street};{city};;{country}")
    if values.get("note"):
        lines.append(f"NOTE:{_escape_vcard(values['note'])}")
    lines.append("END:VCARD")
    return "\n".join(lines)


def _build_mecard(values: dict) -> str:
    parts = [f"N:{_escape(values.get('name', ''), 'mecard')}"]
    if values.get("phone"):
        parts.append(f"TEL:{_escape(values['phone'], 'mecard')}")
    if values.get("email"):
        parts.append(f"EMAIL:{_escape(values['email'], 'mecard')}")
    if values.get("address"):
        parts.append(f"ADR:{_escape(values['address'], 'mecard')}")
    return "MECARD:" + ";".join(parts) + ";;"


def _build_email(values: dict) -> str:
    address = values.get("to", "")
    params = []
    if values.get("subject"):
        params.append("subject=" + quote(values["subject"], safe=""))
    if values.get("body"):
        params.append("body=" + quote(values["body"], safe=""))
    return "mailto:" + address + ("?" + "&".join(params) if params else "")


def _build_whatsapp(values: dict) -> str:
    digits = re.sub(r"\D", "", values.get("numero", ""))
    url = f"https://wa.me/{digits}"
    if values.get("mensaje"):
        url += "?text=" + quote(values["mensaje"], safe="")
    return url


_SOCIAL_BASES = {
    "instagram": "https://instagram.com/{user}",
    "facebook": "https://facebook.com/{user}",
    "tiktok": "https://tiktok.com/@{user}",
    "x": "https://x.com/{user}",
    "linkedin": "https://linkedin.com/in/{user}",
    "youtube": "https://youtube.com/@{user}",
    "telegram": "https://t.me/{user}",
}


def _build_social(values: dict) -> str:
    if values.get("url"):
        return normalize_url(values["url"])
    network = values.get("network") or "instagram"
    user = (values.get("usuario") or "").strip().lstrip("@")
    if not user:
        raise ValidationError({"usuario": "Indica el usuario o el enlace de tu perfil"})
    return _SOCIAL_BASES.get(network, "https://instagram.com/{user}").format(user=user)


def _ical_datetime(value: str) -> str:
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return ""
    return parsed.strftime("%Y%m%dT%H%M%S")


def _build_event(values: dict) -> str:
    start = _ical_datetime(values.get("start", ""))
    if not start:
        raise ValidationError({"start": "Indica una fecha de inicio válida"})
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Plataforma QR//ES",
        "BEGIN:VEVENT",
        f"SUMMARY:{values.get('title', '')}",
        f"DTSTART:{start}",
    ]
    end = _ical_datetime(values.get("end", ""))
    if end:
        lines.append(f"DTEND:{end}")
    if values.get("location"):
        lines.append(f"LOCATION:{values['location']}")
    if values.get("description"):
        lines.append("DESCRIPTION:" + values["description"].replace("\n", "\\n"))
    if values.get("url"):
        lines.append(f"URL:{normalize_url(values['url'])}")
    lines += ["END:VEVENT", "END:VCALENDAR"]
    return "\r\n".join(lines)


_BUILDERS = {
    "email": _build_email,
    "whatsapp": _build_whatsapp,
    "social": _build_social,
    "vcard": _build_vcard,
    "mecard": _build_mecard,
    "event": _build_event,
}


def build_payload(type_id: str, values: dict | None) -> dict:
    """Devuelve ``{type, values, content, hosted}`` o lanza ValidationError."""
    qtype = get_type(type_id)
    if not qtype:
        raise ValidationError({"type": "Tipo de código QR desconocido"})

    normalized = normalize_values(qtype, values)
    errors = validate(qtype, normalized)
    if errors:
        raise ValidationError(errors)

    hosted = qtype.get("hosted", "")
    if hosted:
        return {"type": type_id, "values": normalized, "content": "", "hosted": hosted}

    builder = _BUILDERS.get(qtype.get("builder", ""))
    if builder:
        content = builder(normalized)
    else:
        content = _render_template(
            qtype.get("template", ""),
            normalized,
            qtype["_fields"],
            qtype.get("escape", "none"),
            bool(qtype.get("dropEmptyLines")),
        )

    if type_id in {"url", "media_link", "media_video", "media_audio", "media_pdf",
                   "encuesta", "resena"}:
        content = normalize_url(content)
    if not content:
        raise ValidationError({"type": "El contenido del código QR está vacío"})
    if type_id in {"url", "social", "whatsapp", "media_link", "media_video",
                   "media_audio", "media_pdf", "encuesta", "resena"}:
        if not is_safe_url(content):
            raise ValidationError({"url": "El enlace debe empezar por http:// o https://"})
    return {"type": type_id, "values": normalized, "content": content, "hosted": ""}


def landing_kind(type_id: str) -> str:
    qtype = get_type(type_id)
    return (qtype or {}).get("hosted", "")
