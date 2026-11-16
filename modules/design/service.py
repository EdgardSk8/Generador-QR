"""Esquema del diseño y plantillas predefinidas."""

from __future__ import annotations

import copy
import json
import re

from ..core.config import DATA_DIR

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")

MODULE_SHAPES = {"square", "rounded", "dots", "classy", "classy-rounded", "extra-rounded"}
EYE_FRAME_SHAPES = {"square", "extra-rounded", "dot"}
EYE_BALL_SHAPES = {"square", "dot"}
FILL_TYPES = {"solid", "linear", "radial"}
FRAME_STYLES = {"none", "border", "rounded", "card", "banner-top", "banner-bottom"}
FONTS = {"sans", "serif", "mono"}
ERROR_LEVELS = {"L", "M", "Q", "H"}

# Logotipo: formatos admitidos y tamaño máximo del data URI almacenado.
LOGO_PREFIXES = ("data:image/png;", "data:image/jpeg;", "data:image/jpg;",
                 "data:image/webp;", "http://", "https://")
LOGO_MAX_LENGTH = 900_000

DEFAULT_DESIGN = {
    "version": 1,
    "quietZone": 4,
    "errorCorrection": "Q",
    "modules": {
        "shape": "square",
        "fill": {"type": "solid", "color": "#111111",
                 "gradient": {"from": "#111111", "to": "#2563eb", "rotation": 45}},
    },
    "eyeFrame": {
        "shape": "square",
        "fill": {"type": "solid", "color": "#111111",
                 "gradient": {"from": "#111111", "to": "#2563eb", "rotation": 45}},
    },
    "eyeBall": {
        "shape": "square",
        "fill": {"type": "solid", "color": "#111111",
                 "gradient": {"from": "#111111", "to": "#2563eb", "rotation": 45}},
    },
    "background": {"color": "#ffffff", "transparent": False},
    "logo": {"src": "", "size": 0.2, "margin": 6, "clearBackground": True, "position": "center", "round": False},
    "frame": {
        "style": "none",
        "text": "",
        "textColor": "#0f172a",
        "background": "#ffffff",
        "accent": "#2563eb",
        "font": "sans",
        "fontSize": 0.055,
        "padding": 0.06,
        "radius": 0.05,
    },
}

_presets: list[dict] | None = None


def _color(value, fallback: str, allow_transparent: bool = False) -> str:
    text = str(value or "").strip()
    if allow_transparent and text.lower() == "transparent":
        return "transparent"
    return text if HEX_RE.match(text) else fallback


def _ratio(value, fallback: float, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return min(high, max(low, number))


def _fill(raw, fallback: dict) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    fill_type = str(raw.get("type") or fallback["type"]).lower()
    gradient = raw.get("gradient") if isinstance(raw.get("gradient"), dict) else {}
    return {
        "type": fill_type if fill_type in FILL_TYPES else fallback["type"],
        "color": _color(raw.get("color"), fallback["color"]),
        "gradient": {
            "from": _color(gradient.get("from"), fallback["gradient"]["from"]),
            "to": _color(gradient.get("to"), fallback["gradient"]["to"]),
            "rotation": int(_ratio(gradient.get("rotation"), 45, 0, 360)),
        },
    }


def normalize_design(raw: dict | None) -> dict:
    """Valida y completa un diseño; nunca lanza excepción."""
    source = raw if isinstance(raw, dict) else {}
    design = copy.deepcopy(DEFAULT_DESIGN)

    level = str(source.get("errorCorrection") or default_level()).upper()
    design["errorCorrection"] = level if level in ERROR_LEVELS else DEFAULT_DESIGN["errorCorrection"]
    design["quietZone"] = int(_ratio(source.get("quietZone"), 4, 0, 10))

    for key, shapes in (("modules", MODULE_SHAPES), ("eyeFrame", EYE_FRAME_SHAPES),
                        ("eyeBall", EYE_BALL_SHAPES)):
        section = source.get(key) if isinstance(source.get(key), dict) else {}
        shape = str(section.get("shape") or design[key]["shape"]).lower()
        design[key]["shape"] = shape if shape in shapes else design[key]["shape"]
        design[key]["fill"] = _fill(section.get("fill"), design[key]["fill"])

    background = source.get("background") if isinstance(source.get("background"), dict) else {}
    design["background"] = {
        "color": _color(background.get("color"), "#ffffff", allow_transparent=True),
        "transparent": bool(background.get("transparent")),
    }

    logo = source.get("logo") if isinstance(source.get("logo"), dict) else {}
    src = str(logo.get("src") or "").strip()
    if src and (len(src) > LOGO_MAX_LENGTH or not src.startswith(LOGO_PREFIXES)):
        src = ""
    position = str(logo.get("position") or "center").lower()
    design["logo"] = {
        "src": src,
        "size": round(_ratio(logo.get("size"), DEFAULT_DESIGN["logo"]["size"], 0.1, 0.22), 3),
        "margin": int(_ratio(logo.get("margin"), 6, 0, 20)),
        "clearBackground": bool(logo.get("clearBackground", True)),
        "position": position if position in {"center", "top", "bottom"} else "center",
        "round": False,
    }

    # Con logotipo el diseño se resuelve solo: nivel H, tamaño y margen seguros.
    if design["logo"]["src"]:
        design["errorCorrection"] = "H"
        design["logo"]["size"] = min(design["logo"]["size"], 0.22)
        max_margin = max(0, round((0.24 - design["logo"]["size"]) * 256))
        design["logo"]["margin"] = min(design["logo"]["margin"], max_margin)

    frame = source.get("frame") if isinstance(source.get("frame"), dict) else {}
    style = str(frame.get("style") or "none").lower()
    font = str(frame.get("font") or "sans").lower()
    design["frame"] = {
        "style": style if style in FRAME_STYLES else "none",
        "text": str(frame.get("text") or "")[:60],
        "textColor": _color(frame.get("textColor"), "#0f172a"),
        "background": _color(frame.get("background"), "#ffffff"),
        "accent": _color(frame.get("accent"), "#2563eb"),
        "font": font if font in FONTS else "sans",
        "fontSize": round(_ratio(frame.get("fontSize"), 0.055, 0.03, 0.12), 3),
        "padding": round(_ratio(frame.get("padding"), 0.06, 0.02, 0.18), 3),
        "radius": round(_ratio(frame.get("radius"), 0.05, 0, 0.2), 3),
    }
    return design


def default_level() -> str:
    return DEFAULT_DESIGN["errorCorrection"]


def default_design() -> dict:
    return copy.deepcopy(DEFAULT_DESIGN)


def load_presets() -> list[dict]:
    global _presets
    if _presets is None:
        with (DATA_DIR / "design_presets.json").open(encoding="utf-8") as handle:
            data = json.load(handle)
        _presets = data.get("presets", [])
    return _presets


def public_presets() -> list[dict]:
    """Plantillas con el diseño ya normalizado, listas para aplicar."""
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "description": item.get("description", ""),
            "tags": item.get("tags", []),
            "design": normalize_design(item.get("design")),
        }
        for item in load_presets()
    ]


def find_preset(preset_id: str) -> dict | None:
    for item in load_presets():
        if item["id"] == preset_id:
            return item
    return None
