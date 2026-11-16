"""Redirección de QR dinámicos y páginas alojadas."""

from __future__ import annotations

from collections import OrderedDict

from flask import (Blueprint, Response, abort, redirect, render_template,
                   request)

from ..analytics.service import record_scan
from ..catalog.service import get_type, is_hosted
from ..codes.service import get_code_by_slug, is_available, is_expired

from ..core.utils import is_safe_url

bp = Blueprint("dynamic", __name__)


def _client_meta() -> dict:
    country = (request.headers.get("CF-IPCountry")
               or request.headers.get("X-Country-Code") or "")
    return {
        "user_agent": request.headers.get("User-Agent", ""),
        "country": country,
        "referer": request.headers.get("Referer", ""),
    }


@bp.get("/r/<slug>")
def follow(slug: str):
    code = get_code_by_slug(slug)
    if not code:
        return render_template("estado.html", title="Enlace no encontrado",
                               message="Este código QR no existe o fue eliminado.",
                               status="404"), 404

    if code["status"] != "active":
        return render_template("estado.html", title="Enlace pausado",
                               message="El propietario ha pausado este código QR.",
                               status="pausado"), 410

    if is_expired(code):
        return render_template("estado.html", title="Enlace expirado",
                               message="Este código QR superó su fecha de expiración.",
                               status="expirado"), 410

    meta = _client_meta()
    record_scan(code["id"], meta["user_agent"], meta["country"], meta["referer"])

    if is_hosted(code["qr_type"]):
        return render_template("landing.html", code=code, page=build_landing(code))

    target = code.get("target") or code["content"]
    if not is_safe_url(target):
        abort(404)
    return redirect(target, code=302)


@bp.get("/l/<slug>")
def landing(slug: str):
    code = get_code_by_slug(slug)
    if not code or not is_hosted(code["qr_type"]):
        abort(404)
    if not is_available(code):
        return render_template("estado.html", title="Página no disponible",
                               message="Esta página está pausada o expiró.",
                               status="pausado"), 410
    return render_template("landing.html", code=code, page=build_landing(code))


@bp.get("/l/<slug>/contacto.vcf")
def download_contact(slug: str):
    code = get_code_by_slug(slug)
    if not code or code["qr_type"] != "tarjeta":
        abort(404)
    values = code["fields"]
    full = values.get("full_name", "")
    first, _, last = full.partition(" ")
    lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        f"N:{last};{first};;;",
        f"FN:{full}",
    ]
    for key, label in (("org", "ORG"), ("title", "TITLE"), ("phone", "TEL;TYPE=CELL"),
                       ("email", "EMAIL;TYPE=INTERNET"), ("website", "URL")):
        if values.get(key):
            lines.append(f"{label}:{values[key]}")
    if values.get("address"):
        lines.append(f"ADR;TYPE=WORK:;;{values['address']};;;;")
    if values.get("about"):
        lines.append("NOTE:" + values["about"].replace("\n", "\\n"))
    lines.append("END:VCARD")
    payload = "\r\n".join(lines)
    filename = (values.get("full_name") or "contacto").replace(" ", "-").lower()
    return Response(
        payload,
        mimetype="text/vcard",
        headers={"Content-Disposition": f'attachment; filename="{filename}.vcf"'},
    )


def build_landing(code: dict) -> dict:
    """Adapta los campos guardados a la estructura que pinta la plantilla."""
    qtype = get_type(code["qr_type"]) or {}
    kind = qtype.get("hosted", "")
    values = code["fields"]
    page = {
        "kind": kind,
        "type_label": qtype.get("label", ""),
        "title": "",
        "subtitle": "",
        "photo": "",
        "about": "",
        "facts": [],
        "buttons": [],
        "images": [],
        "groups": [],
        "vcf": url_for_contact(code["slug"]) if kind == "tarjeta" else "",
    }

    if kind == "links":
        page["title"] = values.get("title", "")
        page["subtitle"] = values.get("subtitle", "")
        page["photo"] = values.get("avatar", "")
        page["buttons"] = values.get("links", [])

    elif kind == "tarjeta":
        page["title"] = values.get("full_name", "")
        page["subtitle"] = " · ".join(part for part in (values.get("title"), values.get("org")) if part)
        page["photo"] = values.get("photo", "")
        page["about"] = values.get("about", "")
        if values.get("phone"):
            page["buttons"].append({"label": "Llamar", "url": f"tel:{values['phone']}", "icon": "phone"})
            page["buttons"].append({"label": "WhatsApp", "url": "https://wa.me/" + "".join(
                ch for ch in values["phone"] if ch.isdigit()), "icon": "whatsapp"})
        if values.get("email"):
            page["buttons"].append({"label": "Escribir correo", "url": f"mailto:{values['email']}", "icon": "mail"})
        if values.get("website"):
            page["buttons"].append({"label": "Sitio web", "url": values["website"], "icon": "link"})
        if values.get("address"):
            page["facts"].append({"icon": "map", "text": values["address"]})
        page["buttons"] += values.get("links", [])

    elif kind == "negocio":
        page["title"] = values.get("name", "")
        page["subtitle"] = values.get("tagline", "")
        page["photo"] = values.get("logo", "")
        page["about"] = values.get("about", "")
        for key, icon in (("address", "map"), ("hours", "clock"), ("phone", "phone"),
                          ("email", "mail"), ("website", "link")):
            if values.get(key):
                page["facts"].append({"icon": icon, "text": values[key]})
        page["buttons"] = values.get("links", []) or []
        if not page["buttons"]:
            if values.get("phone"):
                page["buttons"].append({"label": "Llamar", "url": f"tel:{values['phone']}", "icon": "phone"})
            if values.get("website"):
                page["buttons"].append({"label": "Visitar sitio web", "url": values["website"], "icon": "link"})

    elif kind == "menu":
        page["title"] = values.get("title", "")
        page["subtitle"] = values.get("subtitle", "")
        currency = values.get("currency") or "$"
        groups: "OrderedDict[str, list]" = OrderedDict()
        for item in values.get("items", []):
            section = item.get("seccion") or "General"
            groups.setdefault(section, []).append({
                "name": item.get("nombre", ""),
                "description": item.get("descripcion", ""),
                "price": f"{currency}{item.get('precio', '')}".strip(),
            })
        page["groups"] = [{"name": name, "entries": items} for name, items in groups.items()]

    elif kind == "galeria":
        page["title"] = values.get("title", "")
        page["subtitle"] = values.get("subtitle", "")
        page["images"] = values.get("images", [])

    return page


def url_for_contact(slug: str) -> str:
    return f"/l/{slug}/contacto.vcf"


@bp.app_template_filter("hosted_kind")
def hosted_kind(type_id: str) -> str:
    qtype = get_type(type_id) or {}
    return qtype.get("hosted", "")


__all__ = ["bp", "build_landing"]
