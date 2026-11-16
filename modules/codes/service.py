"""Servicio de códigos QR: creación, edición, listado y carpetas."""

from __future__ import annotations

import sqlite3

from ..catalog.service import (accepts_dynamic, build_payload, get_type,
                               is_hosted)
from ..core.db import get_db
from ..core.utils import (ValidationError, clean_text, json_load, new_slug,
                          now_iso, parse_iso, utcnow)
from ..design.service import normalize_design

COLUMNS = ("id, slug, name, qr_type, fields, content, target, is_dynamic, status, "
           "expires_at, design, preset_id, folder_id, created_at, updated_at")


def _decode(row: sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    code = dict(row)
    code["fields"] = json_load(code["fields"], {})
    code["design"] = normalize_design(json_load(code["design"], {}))
    code["is_dynamic"] = bool(code["is_dynamic"])
    return code


def _unique_slug() -> str:
    db = get_db()
    for _ in range(20):
        candidate = new_slug(8)
        row = db.execute("SELECT 1 FROM codes WHERE slug = ?", (candidate,)).fetchone()
        if row is None:
            return candidate
    raise ValidationError({"slug": "No se pudo generar un identificador único"})


def _expiry(value) -> str | None:
    text = clean_text(value)
    if not text:
        return None
    parsed = parse_iso(text)
    if not parsed:
        raise ValidationError({"expires_at": "Fecha de expiración no válida"})
    return parsed.isoformat(timespec="seconds")


def _default_name(qtype: dict, values: dict) -> str:
    for key in ("title", "name", "full_name", "texto", "url", "ssid", "codigo"):
        candidate = clean_text(values.get(key), 60)
        if candidate:
            return candidate
    return qtype.get("label", "Código QR")


def _resolve_content(type_id: str, built: dict, is_dynamic: bool, slug: str,
                     base_url: str) -> tuple[str, str | None]:
    hosted = is_hosted(type_id)
    if hosted:
        return f"{base_url}/r/{slug}", None
    if is_dynamic:
        return f"{base_url}/r/{slug}", built["content"]
    return built["content"], None


def create_code(data: dict, base_url: str) -> dict:
    type_id = clean_text(data.get("type"))
    qtype = get_type(type_id)
    if not qtype:
        raise ValidationError({"type": "Tipo de código QR desconocido"})

    built = build_payload(type_id, data.get("fields") or {})
    dynamic = bool(data.get("is_dynamic")) or is_hosted(type_id)
    if dynamic and not accepts_dynamic(type_id):
        raise ValidationError({
            "is_dynamic": "Los códigos de este tipo son estáticos: el contenido viaja dentro del QR"
        })

    slug = _unique_slug()
    content, target = _resolve_content(type_id, built, dynamic, slug, base_url)
    now = now_iso()
    db = get_db()
    cursor = db.execute(
        f"INSERT INTO codes (slug, name, qr_type, fields, content, target, is_dynamic, "
        f"status, expires_at, design, preset_id, folder_id, created_at, updated_at) "
        f"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            slug,
            clean_text(data.get("name"), 120) or _default_name(qtype, built["values"]),
            type_id,
            _json(built["values"]),
            content,
            target,
            int(dynamic),
            "active" if str(data.get("status") or "active") == "active" else "paused",
            _expiry(data.get("expires_at")),
            _json(normalize_design(data.get("design"))),
            clean_text(data.get("preset_id"), 40) or None,
            _folder_id(data.get("folder_id")),
            now,
            now,
        ),
    )
    db.commit()
    return get_code(int(cursor.lastrowid))


def update_code(code_id: int, data: dict, base_url: str) -> dict:
    current = get_code(code_id)
    if not current:
        raise ValidationError({"id": "El código no existe"})

    type_id = clean_text(data.get("type")) or current["qr_type"]
    qtype = get_type(type_id)
    if not qtype:
        raise ValidationError({"type": "Tipo de código QR desconocido"})

    fields = data.get("fields")
    if fields is None:
        fields = current["fields"]
    built = build_payload(type_id, fields)

    dynamic = bool(data.get("is_dynamic", current["is_dynamic"])) or is_hosted(type_id)
    if dynamic and not accepts_dynamic(type_id):
        raise ValidationError({
            "is_dynamic": "Los códigos de este tipo son estáticos: el contenido viaja dentro del QR"
        })

    content, target = _resolve_content(type_id, built, dynamic, current["slug"], base_url)
    design = (normalize_design(data.get("design")) if data.get("design") is not None
              else current["design"])

    db = get_db()
    db.execute(
        "UPDATE codes SET name=?, qr_type=?, fields=?, content=?, target=?, is_dynamic=?, "
        "status=?, expires_at=?, design=?, preset_id=?, folder_id=?, updated_at=? WHERE id=?",
        (
            clean_text(data.get("name"), 120) or current["name"],
            type_id,
            _json(built["values"]),
            content,
            target,
            int(dynamic),
            clean_text(data.get("status")) or current["status"],
            _expiry(data["expires_at"]) if "expires_at" in data else current["expires_at"],
            _json(design),
            data.get("preset_id", current["preset_id"]),
            _folder_id(data.get("folder_id")) if "folder_id" in data else current["folder_id"],
            now_iso(),
            code_id,
        ),
    )
    db.commit()
    return get_code(code_id)


def duplicate_code(code_id: int, base_url: str) -> dict:
    current = get_code(code_id)
    if not current:
        raise ValidationError({"id": "El código no existe"})
    slug = _unique_slug()
    content, target = _resolve_content(current["qr_type"], {"content": current["target"] or current["content"]},
                                       current["is_dynamic"], slug, base_url)
    now = now_iso()
    db = get_db()
    cursor = db.execute(
        f"INSERT INTO codes (slug, name, qr_type, fields, content, target, is_dynamic, "
        f"status, expires_at, design, preset_id, folder_id, created_at, updated_at) "
        f"VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            slug,
            f"{current['name']} (copia)",
            current["qr_type"],
            _json(current["fields"]),
            content,
            target,
            int(current["is_dynamic"]),
            current["status"],
            current["expires_at"],
            _json(current["design"]),
            current["preset_id"],
            current["folder_id"],
            now,
            now,
        ),
    )
    db.commit()
    return get_code(int(cursor.lastrowid))


def delete_code(code_id: int) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM codes WHERE id = ?", (code_id,))
    db.commit()
    return cursor.rowcount > 0


def get_code(code_id: int) -> dict | None:
    row = get_db().execute(f"SELECT {COLUMNS} FROM codes WHERE id = ?", (code_id,)).fetchone()
    return _decode(row)


def get_code_by_slug(slug: str) -> dict | None:
    row = get_db().execute(f"SELECT {COLUMNS} FROM codes WHERE slug = ?", (slug,)).fetchone()
    return _decode(row)


def list_codes(search: str = "", folder_id=None, qr_type: str = "", mode: str = "",
               limit: int = 300) -> list[dict]:
    clauses: list[str] = []
    params: list = []
    if search:
        clauses.append("(name LIKE ? OR content LIKE ?)")
        params += [f"%{search}%", f"%{search}%"]
    if folder_id:
        clauses.append("folder_id = ?")
        params.append(int(folder_id))
    if qr_type:
        clauses.append("qr_type = ?")
        params.append(qr_type)
    if mode == "dynamic":
        clauses.append("is_dynamic = 1")
    elif mode == "static":
        clauses.append("is_dynamic = 0")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = get_db().execute(
        f"SELECT {COLUMNS} FROM codes {where} ORDER BY id DESC LIMIT ?", (*params, limit)
    ).fetchall()
    return [_decode(row) for row in rows]


def count_codes() -> dict:
    row = get_db().execute(
        "SELECT COUNT(*) AS total, SUM(is_dynamic) AS dynamic FROM codes"
    ).fetchone()
    return {"total": row["total"] or 0, "dynamic": row["dynamic"] or 0,
            "static": (row["total"] or 0) - (row["dynamic"] or 0)}


def is_expired(code: dict) -> bool:
    expires = parse_iso(code.get("expires_at"))
    return bool(expires and expires < utcnow())


def is_available(code: dict) -> bool:
    return code["status"] == "active" and not is_expired(code)


def _json(value) -> str:
    import json
    return json.dumps(value, ensure_ascii=False)


# --------------------------------------------------------------------------- #
# Carpetas
# --------------------------------------------------------------------------- #

def _folder_id(value):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def list_folders() -> list[dict]:
    rows = get_db().execute(
        "SELECT f.id, f.name, f.created_at, COUNT(c.id) AS total "
        "FROM folders f LEFT JOIN codes c ON c.folder_id = f.id "
        "GROUP BY f.id ORDER BY f.name"
    ).fetchall()
    return [dict(row) for row in rows]


def create_folder(name: str) -> dict:
    text = clean_text(name, 60)
    if not text:
        raise ValidationError({"name": "Escribe un nombre para la carpeta"})
    db = get_db()
    try:
        cursor = db.execute("INSERT INTO folders (name, created_at) VALUES (?, ?)", (text, now_iso()))
        db.commit()
    except sqlite3.IntegrityError as exc:
        raise ValidationError({"name": "Ya existe una carpeta con ese nombre"}) from exc
    return {"id": int(cursor.lastrowid), "name": text, "total": 0}


def delete_folder(folder_id: int) -> bool:
    db = get_db()
    cursor = db.execute("DELETE FROM folders WHERE id = ?", (folder_id,))
    db.commit()
    return cursor.rowcount > 0
