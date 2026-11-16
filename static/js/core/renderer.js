// Renderizado del QR, composición de marcos y exportación a todos los formatos.
/* global QRCodeStyling, jsQR */

import { escapeHtml } from "./ui.js";

const FONT_STACKS = {
  sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Code", Consolas, monospace',
};

export function quietMargin(design, size) {
  return Math.round((size * Math.max(0, design.quietZone)) / 33);
}

function gradientOf(fillValue) {
  if (!fillValue || fillValue.type === "solid") return undefined;
  return {
    type: fillValue.type,
    rotation: (fillValue.gradient.rotation * Math.PI) / 180,
    colorStops: [
      { offset: 0, color: fillValue.gradient.from },
      { offset: 1, color: fillValue.gradient.to },
    ],
  };
}

export function buildOptions(content, design, size, marginOverride = null) {
  const options = {
    width: size,
    height: size,
    type: "canvas",
    data: content,
    margin: marginOverride === null ? quietMargin(design, size) : marginOverride,
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: design.errorCorrection,
    },
    dotsOptions: {
      type: design.modules.shape,
      color: design.modules.fill.color,
      gradient: gradientOf(design.modules.fill),
      roundSize: true,
    },
    backgroundOptions: {
      color: design.background.transparent ? "rgba(0,0,0,0)" : design.background.color,
    },
    cornersSquareOptions: {
      type: design.eyeFrame.shape,
      color: design.eyeFrame.fill.color,
      gradient: gradientOf(design.eyeFrame.fill),
    },
    cornersDotOptions: {
      type: design.eyeBall.shape,
      color: design.eyeBall.fill.color,
      gradient: gradientOf(design.eyeBall.fill),
    },
  };
  return options;
}

async function loadLogo(design) {
  const src = design.logo.src;
  if (!src) return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

/**
 * Dibuja el logotipo centrado respetando su proporción.
 * `margin` amplía el hueco libre (misma escala que el servidor: px a 512 de referencia).
 */
function fitLogoBox(image, box) {
  const ratio = image.width / image.height || 1;
  return ratio >= 1
    ? { width: box, height: box / ratio }
    : { width: box * ratio, height: box };
}

function drawLogo(ctx, design, size, logo, transparent) {
  if (!logo) return;
  const box = Math.max(8, Math.round(size * design.logo.size));
  const target = fitLogoBox(logo, box);
  const pad = Math.max(0, Math.round((size * design.logo.margin) / 512));
  const clearW = Math.round(target.width) + pad * 2;
  const clearH = Math.round(target.height) + pad * 2;
  const center = size / 2;

  // Hueco ajustado a la forma real del logo: rectángulo recto, sin esquinas redondeadas.
  if (design.logo.clearBackground) {
    ctx.save();
    if (transparent || design.background.transparent) {
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.fillStyle = design.background.color || "#ffffff";
    }
    ctx.fillRect(center - clearW / 2, center - clearH / 2, clearW, clearH);
    ctx.restore();
  }

  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(logo, center - target.width / 2, center - target.height / 2,
    target.width, target.height);
  ctx.restore();
}

/**
 * Coloca el logotipo en la banda superior/inferior, sin tocar los módulos del QR.
 */
function drawLogoInBand(ctx, design, size, logo, metrics) {
  const scale = 0.6 + (Math.min(Math.max(design.logo.size, 0.1), 0.22) - 0.1) / 0.12 * 0.4;
  const maxHeight = Math.max(8, metrics.logoBand * 0.92 * scale);
  const maxWidth = size * 0.62;
  const ratio = logo.width / logo.height || 1;
  let height = maxHeight;
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  const cx = metrics.width / 2;
  const cy = metrics.logoBandY + metrics.logoBand / 2;
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(logo, cx - width / 2, cy - height / 2, width, height);
  ctx.restore();
}

export function createQrInstance(content, design, size, marginOverride = null) {
  return new QRCodeStyling(buildOptions(content, design, size, marginOverride));
}

async function qrBitmap(content, design, size, marginOverride = null) {
  const instance = createQrInstance(content, design, size, marginOverride);
  const blob = await instance.getRawData("png");
  if (!blob) throw new Error("No se pudo generar la imagen del QR");
  return createImageBitmap(blob);
}

export function frameMetrics(design, size) {
  const style = design.frame.style || "none";
  const pad = style === "none" ? 0 : Math.round(size * design.frame.padding);
  const hasText = Boolean(design.frame.text) && style !== "none";
  const band = hasText ? Math.round(size * design.frame.fontSize * 3) : 0;
  const position = design.logo.position || "center";
  // La banda del logotipo lo saca fuera del QR para que no tape módulos.
  const bandMode = Boolean(design.logo.src) && (position === "top" || position === "bottom");
  const logoBand = bandMode ? Math.round(size * 0.2) : 0;
  const topBand = style === "banner-top" ? band : 0;
  const bottomBand = style !== "none" && style !== "banner-top" ? band : 0;
  const topLogo = bandMode && position === "top" ? logoBand : 0;
  const bottomLogo = bandMode && position === "bottom" ? logoBand : 0;
  const width = size + pad * 2;
  const height = pad * 2 + topBand + bottomBand + topLogo + bottomLogo + size;
  const qrX = pad;
  const qrY = pad + topBand + topLogo;
  const bandY = style === "banner-top" ? 0 : height - band;
  const logoBandY = position === "top"
    ? pad + topBand
    : height - bottomBand - logoBand;
  return {
    style, pad, band, hasText, width, height, qrX, qrY, bandY,
    logoBand, logoBandY, bandMode,
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function composeCanvas(source, design, size, { transparent = false, logo = null } = {}) {
  const metrics = frameMetrics(design, size);
  const canvas = document.createElement("canvas");
  canvas.width = metrics.width;
  canvas.height = metrics.height;
  const ctx = canvas.getContext("2d");
  const transparentOutput = transparent || design.background.transparent;

  if (metrics.bandMode && metrics.style === "none" && !transparentOutput) {
    ctx.fillStyle = design.background.color;
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }

  if (metrics.style !== "none") {
    const fillColor = design.frame.background;
    if (!(transparentOutput && design.frame.style !== "border")) {
      roundRect(ctx, 0, 0, metrics.width, metrics.height,
        metrics.width * design.frame.radius);
      ctx.fillStyle = transparentOutput ? design.frame.background : fillColor;
      ctx.fill();
    }
    if (metrics.style === "rounded" || metrics.style === "card") {
      ctx.lineWidth = Math.max(2, size * 0.007);
      ctx.strokeStyle = design.frame.accent;
      roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2,
        metrics.width - ctx.lineWidth, metrics.height - ctx.lineWidth,
        metrics.width * design.frame.radius);
      ctx.stroke();
    }
    if (metrics.style === "border") {
      const line = Math.max(2, size * 0.006);
      ctx.lineWidth = line;
      ctx.strokeStyle = design.frame.accent;
      roundRect(ctx, line / 2 + 1, line / 2 + 1, metrics.width - line - 2,
        metrics.height - line - 2, Math.max(4, metrics.width * 0.03));
      ctx.stroke();
    }
  }

  if (metrics.band > 0 && (metrics.style === "banner-top" || metrics.style === "banner-bottom")) {
    ctx.fillStyle = design.frame.accent;
    ctx.fillRect(0, metrics.bandY, metrics.width, metrics.band);
  } else if (metrics.band > 0 && metrics.style === "card") {
    ctx.fillStyle = design.frame.accent;
    ctx.fillRect(metrics.pad, metrics.bandY, metrics.width - metrics.pad * 2, Math.max(2, size * 0.004));
  }

  ctx.drawImage(source, metrics.qrX, metrics.qrY, size, size);

  if (logo) {
    if (metrics.bandMode) {
      drawLogoInBand(ctx, design, size, logo, metrics);
    } else {
      ctx.save();
      ctx.translate(metrics.qrX, metrics.qrY);
      drawLogo(ctx, design, size, logo, transparentOutput);
      ctx.restore();
    }
  }

  if (metrics.hasText && metrics.band > 0) {
    const fontSize = Math.round(size * design.frame.fontSize);
    ctx.fillStyle = design.frame.textColor;
    ctx.font = `600 ${fontSize}px ${FONT_STACKS[design.frame.font] || FONT_STACKS.sans}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let text = design.frame.text;
    const maxWidth = metrics.width - metrics.pad * 2;
    while (ctx.measureText(text).width > maxWidth && text.length > 4) {
      text = `${text.slice(0, -2).trim()}…`;
    }
    ctx.fillText(text, metrics.width / 2, metrics.bandY + metrics.band / 2);
  }

  return canvas;
}

function canvasToBlob(canvas, format) {
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[format] || "image/png";
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Exportación fallida"))),
      mime, format === "png" ? undefined : 0.95);
  });
}

async function svgFromQr(content, design, size, marginOverride) {
  const instance = createQrInstance(content, design, size, marginOverride);
  const blob = await instance.getRawData("svg");
  return blob.text();
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, (char) => ({
    "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;",
  }[char]));
}

function svgLogoMarkup(design, size, transparent, logo = null) {
  if (!design.logo.src || !logo) return "";
  const box = size * design.logo.size;
  const target = fitLogoBox(logo, box);
  const pad = Math.max(0, (size * design.logo.margin) / 512);
  const clearW = target.width + pad * 2;
  const clearH = target.height + pad * 2;
  const center = size / 2;
  const parts = [];

  if (design.logo.clearBackground && !transparent && !design.background.transparent) {
    parts.push(`<rect x="${(center - clearW / 2).toFixed(2)}" y="${(center - clearH / 2).toFixed(2)}" ` +
      `width="${clearW.toFixed(2)}" height="${clearH.toFixed(2)}" ` +
      `fill="${design.background.color}"/>`);
  }

  parts.push(`<image x="${(center - target.width / 2).toFixed(2)}" y="${(center - target.height / 2).toFixed(2)}" ` +
    `width="${target.width.toFixed(2)}" height="${target.height.toFixed(2)}" ` +
    `preserveAspectRatio="xMidYMid meet" href="${escapeXml(design.logo.src)}"/>`);
  return parts.join("");
}

function svgBandLogo(design, metrics, logo) {
  if (!logo) return "";
  const scale = 0.6 + (Math.min(Math.max(design.logo.size, 0.1), 0.22) - 0.1) / 0.12 * 0.4;
  const maxHeight = Math.max(8, metrics.logoBand * 0.92 * scale);
  const maxWidth = metrics.width * 0.62;
  const ratio = logo.width / logo.height || 1;
  let height = maxHeight;
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  const x = (metrics.width - width) / 2;
  const y = metrics.logoBandY + (metrics.logoBand - height) / 2;
  return `<image x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" ` +
    `height="${height.toFixed(2)}" preserveAspectRatio="xMidYMid meet" ` +
    `href="${escapeXml(design.logo.src)}"/>`;
}

async function renderSvg(content, design, size, { transparent = false } = {}) {
  const inner = await svgFromQr(content, design, size, null);
  const metrics = frameMetrics(design, size);
  const transparentOutput = transparent || design.background.transparent;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${metrics.width}" height="${metrics.height}" viewBox="0 0 ${metrics.width} ${metrics.height}">`,
  ];

  if (metrics.style !== "none") {
    if (!transparentOutput || metrics.style === "border") {
      parts.push(`<rect width="${metrics.width}" height="${metrics.height}" rx="${metrics.width * design.frame.radius}" fill="${design.frame.background}"/>`);
    }
    if (metrics.style === "rounded" || metrics.style === "card") {
      const line = Math.max(2, size * 0.007);
      parts.push(`<rect x="${line / 2}" y="${line / 2}" width="${metrics.width - line}" height="${metrics.height - line}" rx="${metrics.width * design.frame.radius}" fill="none" stroke="${design.frame.accent}" stroke-width="${line}"/>`);
    }
    if (metrics.style === "border") {
      const line = Math.max(2, size * 0.006);
      parts.push(`<rect x="${line / 2 + 1}" y="${line / 2 + 1}" width="${metrics.width - line - 2}" height="${metrics.height - line - 2}" rx="${Math.max(4, metrics.width * 0.03)}" fill="none" stroke="${design.frame.accent}" stroke-width="${line}"/>`);
    }
  }

  if (metrics.band > 0 && (metrics.style === "banner-top" || metrics.style === "banner-bottom")) {
    parts.push(`<rect x="0" y="${metrics.bandY}" width="${metrics.width}" height="${metrics.band}" fill="${design.frame.accent}"/>`);
  }

  const nested = inner.replace(/<\?xml[^>]*\?>/, "").replace(/<svg\b/, `<svg x="${metrics.qrX}" y="${metrics.qrY}"`);
  const logoImage = design.logo.src ? await loadLogo(design) : null;
  const overlayLogo = metrics.bandMode ? "" : svgLogoMarkup(design, size, transparentOutput, logoImage);
  parts.push(nested.replace(/<\/svg>\s*$/, `${overlayLogo}</svg>`));

  if (metrics.bandMode) {
    if (metrics.style === "none" && !transparentOutput) {
      parts.push(`<rect x="0" y="${metrics.logoBandY}" width="${metrics.width}" ` +
        `height="${metrics.logoBand}" fill="${design.background.color}"/>`);
    }
    parts.push(svgBandLogo(design, metrics, logoImage));
  }

  if (metrics.hasText && metrics.band > 0) {
    const fontSize = Math.round(size * design.frame.fontSize);
    parts.push(
      `<text x="${metrics.width / 2}" y="${metrics.bandY + metrics.band / 2 + fontSize * 0.35}" ` +
      `font-family="${escapeXml(FONT_STACKS[design.frame.font] || FONT_STACKS.sans)}" ` +
      `font-size="${fontSize}" font-weight="600" fill="${design.frame.textColor}" ` +
      `text-anchor="middle">${escapeXml(design.frame.text)}</text>`
    );
  }

  parts.push("</svg>");
  return new Blob([parts.join("")], { type: "image/svg+xml" });
}

async function renderPdf(content, design, name, size = 2048, { transparent = false } = {}) {
  const bitmap = await qrBitmap(content, design, size);
  const logo = await loadLogo(design);
  const canvas = composeCanvas(bitmap, design, size, { transparent, logo });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  const title = name || "Código QR";
  doc.text(title, pageWidth / 2, margin + 4, { align: "center", maxWidth: pageWidth - margin * 2 });

  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - 18;
  const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
  const drawWidth = canvas.width * ratio;
  const drawHeight = canvas.height * ratio;
  const x = (pageWidth - drawWidth) / 2;
  const y = margin + 12;

  doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, drawWidth, drawHeight,
    undefined, "FAST");
  return doc.output("blob");
}

export async function exportBlob({ content, design, name = "", format = "png",
  size = 1024, transparent = false }) {
  const fmt = String(format).toLowerCase();
  if (fmt === "svg") return renderSvg(content, design, size, { transparent });
  if (fmt === "pdf") return renderPdf(content, design, name, Math.max(2048, size), { transparent });
  if (fmt === "jpeg") return exportBlob({ content, design, name, format: "jpg", size, transparent });
  const bitmap = await qrBitmap(content, design, size);
  const logo = await loadLogo(design);
  const canvas = composeCanvas(bitmap, design, size, { transparent, logo });
  return canvasToBlob(canvas, fmt);
}

export async function drawPreview(canvas, content, design, size = 520) {
  const bitmap = await qrBitmap(content, design, size);
  const logo = await loadLogo(design);
  const composed = composeCanvas(bitmap, design, size, { logo });
  canvas.width = composed.width;
  canvas.height = composed.height;
  canvas.style.width = `${Math.min(composed.width, 340)}px`;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(composed, 0, 0);
}

export async function drawThumbnail(canvas, content, design, size = 300) {
  const bitmap = await qrBitmap(content, design, size);
  const logo = await loadLogo(design);
  const composed = composeCanvas(bitmap, design, size, { logo });
  canvas.width = composed.width;
  canvas.height = composed.height;
  canvas.getContext("2d").drawImage(composed, 0, 0);
}

export async function decodeCheck(content, design) {
  if (typeof jsQR !== "function") return { ok: false, decoded: "" };
  const size = 512;
  try {
    const bitmap = await qrBitmap(content, design, size);
    const logo = await loadLogo(design);
    const composed = composeCanvas(bitmap, design, size, { logo });
    const canvas = document.createElement("canvas");
    canvas.width = composed.width;
    canvas.height = composed.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(composed, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result = jsQR(pixels.data, composed.width, composed.height,
      { inversionAttempts: "attemptBoth" });
    if (!result) return { ok: false, decoded: "" };
    let decoded = result.data;
    if (result.binaryData && result.binaryData.length) {
      try {
        decoded = new TextDecoder("utf-8", { fatal: false })
          .decode(new Uint8Array(result.binaryData));
      } catch (_error) { /* se conserva el texto del lector */ }
    }
    return { ok: true, decoded };
  } catch (error) {
    return { ok: false, decoded: "", error };
  }
}

export function zipSafeName(name, index, extension = "png") {
  const base = String(name || `codigo-${index + 1}`)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
    || `codigo-${index + 1}`;
  return `${String(index + 1).padStart(3, "0")}-${base}.${extension}`;
}

export { escapeHtml };
