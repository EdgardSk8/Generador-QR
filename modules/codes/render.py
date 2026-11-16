"""Renderizado del QR en el servidor (respaldo sin JavaScript y descargas).

El editor del navegador es el que produce la vista previa con degradados, formas
y marcos; aquí se genera una versión fiel en colores planos para compartir o
incrustar sin JavaScript.
"""

from __future__ import annotations

import base64
import io
import re
from xml.sax.saxutils import escape as xml_escape

import segno
from PIL import Image, ImageChops, ImageDraw

MIME = {"png": "image/png", "svg": "image/svg+xml", "jpg": "image/jpeg",
        "jpeg": "image/jpeg", "webp": "image/webp", "pdf": "application/pdf"}

LOGO_REFERENCE_SIZE = 512  # misma escala que el editor del navegador


def _solid(fill: dict) -> str:
    if fill["type"] == "solid":
        return fill["color"]
    return fill["gradient"]["from"]


def _background(design: dict, transparent: bool) -> str | None:
    if transparent or design["background"]["transparent"]:
        return None
    return design["background"]["color"]


def _segno(code: dict):
    design = code["design"]
    return segno.make(
        code["content"],
        error=design["errorCorrection"].lower(),
        micro=False,
        boost_error=False,
    )


def _band_height(design: dict, size: int) -> int:
    """Alto de la banda del logotipo cuando va fuera del QR."""
    logo = design["logo"]
    if not logo.get("src") or logo.get("position") not in {"top", "bottom"}:
        return 0
    return max(1, int(round(size * 0.2)))


def _logo_band_scale(design: dict) -> float:
    size = min(max(float(design["logo"].get("size") or 0.2), 0.1), 0.22)
    return 0.6 + (size - 0.1) / 0.12 * 0.4


def _draw_logo_band(image: Image.Image, design: dict, size: int, band: int,
                    position: str) -> Image.Image:
    src = design["logo"].get("src") or ""
    match = re.match(r"^data:image/[a-zA-Z+]+;base64,(.+)$", src)
    if not match:
        return image
    try:
        raw = base64.b64decode(match.group(1))
        mark = Image.open(io.BytesIO(raw)).convert("RGBA")
    except (ValueError, OSError):
        return image

    max_h = max(8, int(round(band * 0.92 * _logo_band_scale(design))))
    max_w = max(8, int(round(size * 0.62)))
    mark = _fit_logo(mark, max_h)
    if mark.width > max_w:
        mark = _fit_logo(mark, max_w)
    x = (size - mark.width) // 2
    y = (band - mark.height) // 2 if position == "top" else size + (band - mark.height) // 2
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.paste(mark, (x, y), mark)
    return Image.alpha_composite(image, canvas)


def render_raster(code: dict, size: int = 1024, fmt: str = "PNG",
                  transparent: bool = False, margin: int | None = None) -> bytes:
    design = code["design"]
    border = design["quietZone"] if margin is None else max(0, int(margin))
    qr = _segno(code)
    background = _background(design, transparent)

    buffer = io.BytesIO()
    qr.save(
        buffer,
        kind="png",
        scale=16,
        border=border,
        dark=_solid(design["modules"]["fill"]),
        light=background,
        finder_dark=_solid(design["eyeFrame"]["fill"]),
    )
    buffer.seek(0)
    image = Image.open(buffer).convert("RGBA")
    image = image.resize((size, size), Image.LANCZOS)

    band = _band_height(design, size)
    position = design["logo"].get("position") or "center"
    if band:
        total = size + band
        canvas = Image.new("RGBA", (size, total), background or (0, 0, 0, 0))
        canvas.alpha_composite(image, (0, band if position == "top" else 0))
        image = _draw_logo_band(canvas, design, size, band, position)
    else:
        image = _apply_logo(image, design)

    output = io.BytesIO()
    if fmt in {"jpg", "jpeg"}:
        flat = Image.new("RGB", image.size, background or "#ffffff")
        flat.paste(image, mask=image.split()[3])
        flat.save(output, "JPEG", quality=95, optimize=True)
    elif fmt == "webp":
        image.save(output, "WEBP", quality=95, method=6)
    elif fmt == "pdf":
        flat = Image.new("RGB", image.size, background or "#ffffff")
        flat.paste(image, mask=image.split()[3])
        flat.save(output, "PDF", resolution=300.0)
    else:
        image.save(output, "PNG", optimize=True)
    return output.getvalue()


def render_svg(code: dict, transparent: bool = False, margin: int | None = None) -> bytes:
    design = code["design"]
    border = design["quietZone"] if margin is None else max(0, int(margin))
    qr = _segno(code)
    background = _background(design, transparent)

    buffer = io.BytesIO()
    qr.save(
        buffer,
        kind="svg",
        scale=10,
        border=border,
        dark=_solid(design["modules"]["fill"]),
        light=background,
        finder_dark=_solid(design["eyeFrame"]["fill"]),
    )
    raw = buffer.getvalue().decode("utf-8")
    body = re.search(r"<svg[^>]*>(.*)</svg>", raw, re.S).group(1)
    # Segno dibuja con un scale(10): lo quitamos para trabajar en unidades de
    # módulo y así poder colocar el logotipo con la misma geometría que el lienzo.
    body = re.sub(r'<g transform="scale\([\d.]+\)">', "<g>", body)

    units_w, units_h = qr.symbol_size(scale=1, border=border)
    position = design["logo"].get("position") or "center"
    in_band = bool(design["logo"].get("src")) and position in {"top", "bottom"}
    band = round(units_w * 0.2, 3) if in_band else 0
    total_h = units_h + band
    offset = band if position == "top" else 0
    background_solid = _background(design, False)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{units_w * 10}" '
        f'height="{round(total_h * 10, 2)}" viewBox="0 0 {units_w} {round(total_h, 3)}">'
    ]
    band_y = 0 if position == "top" else units_h
    if band and background_solid:
        parts.append(
            f'<rect x="0" y="{band_y}" width="{units_w}" height="{band}" '
            f'fill="{background_solid}"/>'
        )
    parts.append(
        f'<svg x="0" y="{offset}" width="{units_w}" height="{units_h}" '
        f'viewBox="0 0 {units_w} {units_h}">{body}</svg>'
    )
    if band:
        parts.append(_svg_band_logo(design, units_w, units_h, band, position))
    else:
        parts.append(_svg_center_logo(design, units_w, units_h))
    parts.append("</svg>")
    return "".join(parts).encode("utf-8")


def _svg_band_logo(design: dict, units_w: int, units_h: int, band: float,
                   position: str) -> str:
    src = design["logo"].get("src") or ""
    if not src.startswith("data:image/"):
        return ""
    max_h = band * 0.92 * _logo_band_scale(design)
    max_w = units_w * 0.62
    ratio = _logo_aspect(src)
    height = max_h
    width = height * ratio
    if width > max_w:
        width = max_w
        height = width / ratio
    band_y = 0 if position == "top" else units_h
    cx, cy = units_w / 2, band_y + band / 2
    href = xml_escape(src, {'"': "&quot;"})
    return (
        f'<image x="{cx - width / 2:.3f}" y="{cy - height / 2:.3f}" '
        f'width="{width:.3f}" height="{height:.3f}" '
        f'preserveAspectRatio="xMidYMid meet" href="{href}"/>'
    )


def _logo_aspect(src: str) -> float:
    match = re.match(r"^data:image/[a-zA-Z+]+;base64,(.+)$", src)
    if not match:
        return 1.0
    try:
        raw = base64.b64decode(match.group(1))
        with Image.open(io.BytesIO(raw)) as img:
            return img.width / img.height if img.height else 1.0
    except (ValueError, OSError):
        return 1.0


def _svg_center_logo(design: dict, width: int, height: int) -> str:
    src = design["logo"].get("src") or ""
    if not src.startswith("data:image/"):
        return ""
    box = width * design["logo"]["size"]
    ratio = _logo_aspect(src)
    if ratio >= 1:
        target_w, target_h = box, box / ratio
    else:
        target_w, target_h = box * ratio, box
    pad = design["logo"]["margin"] * width / LOGO_REFERENCE_SIZE
    clear_w = target_w + pad * 2
    clear_h = target_h + pad * 2
    center_x, center_y = width / 2, height / 2
    href = xml_escape(src, {'"': "&quot;"})
    snippet = ""

    background = _background(design, False)
    if design["logo"]["clearBackground"] and background:
        snippet += (
            f'<rect x="{center_x - clear_w / 2:.3f}" y="{center_y - clear_h / 2:.3f}" '
            f'width="{clear_w:.3f}" height="{clear_h:.3f}" fill="{background}"/>'
        )

    left = center_x - target_w / 2
    top = center_y - target_h / 2
    snippet += (
        f'<image x="{left:.3f}" y="{top:.3f}" width="{target_w:.3f}" height="{target_h:.3f}" '
        f'preserveAspectRatio="xMidYMid meet" href="{href}"/>'
    )
    return snippet


def _apply_logo(image: Image.Image, design: dict) -> Image.Image:
    src = design["logo"].get("src") or ""
    match = re.match(r"^data:image/[a-zA-Z+]+;base64,(.+)$", src)
    if not match:
        return image
    try:
        raw = base64.b64decode(match.group(1))
        mark = Image.open(io.BytesIO(raw)).convert("RGBA")
    except (ValueError, OSError):
        return image

    box = max(8, int(min(image.size) * design["logo"]["size"]))
    mark = _fit_logo(mark, box)
    pad = max(0, int(design["logo"]["margin"] * image.width / LOGO_REFERENCE_SIZE))
    clear_w = mark.width + pad * 2
    clear_h = mark.height + pad * 2
    center_x, center_y = image.width // 2, image.height // 2

    if design["logo"]["clearBackground"]:
        left = center_x - clear_w // 2
        top = center_y - clear_h // 2
        box_rect = (left, top, left + clear_w, top + clear_h)
        background = _background(design, False)
        if background:
            layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
            ImageDraw.Draw(layer).rectangle(box_rect, fill=background)
            image = Image.alpha_composite(image, layer)
        else:
            hole = Image.new("L", image.size, 255)
            ImageDraw.Draw(hole).rectangle(box_rect, fill=0)
            image = image.copy()
            image.putalpha(ImageChops.multiply(image.getchannel("A"), hole))

    x = center_x - mark.width // 2
    y = center_y - mark.height // 2
    canvas = Image.new("RGBA", image.size, (0, 0, 0, 0))
    canvas.paste(mark, (x, y), mark)
    return Image.alpha_composite(image, canvas)


def _fit_logo(mark: Image.Image, box: int) -> Image.Image:
    """Ajusta la imagen al cuadro sin deformarla ni recortarla."""
    scale = min(box / mark.width, box / mark.height)
    size = (max(1, round(mark.width * scale)), max(1, round(mark.height * scale)))
    return mark.resize(size, Image.LANCZOS)


def render(code: dict, fmt: str = "png", size: int = 1024,
           transparent: bool = False, margin: int | None = None) -> tuple[bytes, str]:
    fmt = fmt.lower()
    if fmt == "svg":
        return render_svg(code, transparent, margin), MIME["svg"]
    if fmt == "pdf":
        return render_raster(code, size, "pdf", transparent, margin), MIME["pdf"]
    if fmt in {"jpg", "jpeg"}:
        return render_raster(code, size, "jpg", transparent, margin), MIME["jpg"]
    if fmt == "webp":
        return render_raster(code, size, "webp", transparent, margin), MIME["webp"]
    return render_raster(code, size, "png", transparent, margin), MIME["png"]
