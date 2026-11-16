"""Creación por lotes: valida y guarda un código por fila."""

from __future__ import annotations

from ..catalog.service import build_payload, get_type
from ..codes.service import create_code
from ..core.utils import ValidationError, clean_text


def bulk_create(type_id: str, rows: list[dict], base_url: str, *,
                design: dict | None = None, preset_id: str | None = None,
                folder_id=None, save: bool = True, dynamic: bool = False,
                not_found: str = "error") -> dict:
    """Procesa las filas y devuelve creados y errores por índice.

    Con ``save=False`` solo se valida y se devuelve el contenido, sin escribir
    en la base de datos (permite previsualizar antes de confirmar).
    """
    qtype = get_type(type_id)
    if not qtype:
        raise ValidationError({"tipo": "Tipo de código QR desconocido"})
    if not rows:
        raise ValidationError({"filas": "No hay filas para procesar"})
    if len(rows) > 500:
        raise ValidationError({"filas": "Máximo 500 filas por lote"})

    created: list[dict] = []
    errors: list[dict] = []
    for index, row in enumerate(rows, start=1):
        fields = {key: value for key, value in row.items() if key != "nombre"}
        payload = {"type": type_id, "fields": fields, "design": design or {},
                   "preset_id": preset_id, "folder_id": folder_id,
                   "is_dynamic": dynamic, "name": row.get("nombre", "")}
        try:
            if save:
                code = create_code(payload, base_url)
                created.append({"id": code["id"], "name": code["name"],
                                "slug": code["slug"], "content": code["content"],
                                "design": code["design"], "qr_type": code["qr_type"]})
            else:
                built = build_payload(type_id, fields)
                created.append({"id": None, "name": clean_text(row.get("nombre"), 120),
                                "slug": None, "content": built["content"],
                                "design": None, "qr_type": type_id})
        except ValidationError as exc:
            errors.append({"fila": index, "errores": exc.errors,
                           "datos": {key: clean_text(value, 120) for key, value in row.items()}})

    return {"creados": created, "errores": errors, "total": len(rows),
            "guardados": save}
