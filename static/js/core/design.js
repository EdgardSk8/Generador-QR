// Esquema del diseño, normalización y verificación de legibilidad.

export const MODULE_SHAPES = [
  { value: "square", label: "Cuadrado" },
  { value: "rounded", label: "Redondeado" },
  { value: "extra-rounded", label: "Muy redondeado" },
  { value: "dots", label: "Puntos" },
  { value: "classy", label: "Clásico" },
  { value: "classy-rounded", label: "Clásico suave" },
];

export const EYE_FRAME_SHAPES = [
  { value: "square", label: "Cuadrado" },
  { value: "extra-rounded", label: "Redondeado" },
  { value: "dot", label: "Circular" },
];

export const EYE_BALL_SHAPES = [
  { value: "square", label: "Cuadrado" },
  { value: "dot", label: "Círculo" },
];

export const FRAME_STYLES = [
  { value: "none", label: "Sin marco" },
  { value: "border", label: "Borde fino" },
  { value: "rounded", label: "Marco redondeado" },
  { value: "card", label: "Tarjeta" },
  { value: "banner-top", label: "Banda superior" },
  { value: "banner-bottom", label: "Banda inferior" },
];

export const ERROR_LEVELS = [
  { value: "L", label: "L · 7 %" },
  { value: "M", label: "M · 15 %" },
  { value: "Q", label: "Q · 25 %" },
  { value: "H", label: "H · 30 %" },
];

export const DEFAULT_DESIGN = {
  version: 1,
  quietZone: 4,
  errorCorrection: "Q",
  modules: {
    shape: "square",
    fill: { type: "solid", color: "#111111", gradient: { from: "#111111", to: "#2563eb", rotation: 45 } },
  },
  eyeFrame: {
    shape: "square",
    fill: { type: "solid", color: "#111111", gradient: { from: "#111111", to: "#2563eb", rotation: 45 } },
  },
  eyeBall: {
    shape: "square",
    fill: { type: "solid", color: "#111111", gradient: { from: "#111111", to: "#2563eb", rotation: 45 } },
  },
  background: { color: "#ffffff", transparent: false },
  logo: { src: "", size: 0.2, margin: 6, clearBackground: true, position: "center", round: false },
  frame: {
    style: "none",
    text: "",
    textColor: "#0f172a",
    background: "#ffffff",
    accent: "#2563eb",
    font: "sans",
    fontSize: 0.055,
    padding: 0.06,
    radius: 0.05,
  },
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Límites de seguridad del logotipo: el hueco libre (logo + margen) no debe
// superar este porcentaje del ancho del QR para que siga siendo legible.
export const LOGO_SIZE_MAX = 0.22;
export const LOGO_CLEARANCE_MAX = 0.24;

export function cloneDesign(design) {
  return JSON.parse(JSON.stringify(design));
}

function color(value, fallback, allowTransparent = false) {
  const text = String(value || "").trim();
  if (allowTransparent && text.toLowerCase() === "transparent") return "transparent";
  if (!HEX_RE.test(text)) return fallback;
  const raw = text.replace("#", "").toLowerCase();
  return `#${raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw}`;
}

function ratio(value, fallback, low, high) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(high, Math.max(low, number));
}

function fill(raw, fallback) {
  const source = raw && typeof raw === "object" ? raw : {};
  const gradient = source.gradient && typeof source.gradient === "object" ? source.gradient : {};
  const type = ["solid", "linear", "radial"].includes(source.type) ? source.type : fallback.type;
  return {
    type,
    color: color(source.color, fallback.color),
    gradient: {
      from: color(gradient.from, fallback.gradient.from),
      to: color(gradient.to, fallback.gradient.to),
      rotation: Math.round(ratio(gradient.rotation, 45, 0, 360)),
    },
  };
}

export function normalizeDesign(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const design = cloneDesign(DEFAULT_DESIGN);

  const level = String(source.errorCorrection || "Q").toUpperCase();
  design.errorCorrection = ["L", "M", "Q", "H"].includes(level) ? level : "Q";
  design.quietZone = Math.round(ratio(source.quietZone, 4, 0, 10));

  [["modules", MODULE_SHAPES], ["eyeFrame", EYE_FRAME_SHAPES], ["eyeBall", EYE_BALL_SHAPES]]
    .forEach(([key, shapes]) => {
      const section = source[key] && typeof source[key] === "object" ? source[key] : {};
      const shape = String(section.shape || design[key].shape).toLowerCase();
      design[key].shape = shapes.some((item) => item.value === shape) ? shape : design[key].shape;
      design[key].fill = fill(section.fill, design[key].fill);
    });

  const background = source.background && typeof source.background === "object" ? source.background : {};
  design.background = {
    color: color(background.color, "#ffffff", true),
    transparent: Boolean(background.transparent),
  };

  const logo = source.logo && typeof source.logo === "object" ? source.logo : {};
  const src = String(logo.src || "");
  design.logo = {
    src: /^(data:image\/|https?:\/\/)/.test(src) ? src : "",
    size: Number(ratio(logo.size, 0.2, 0.1, LOGO_SIZE_MAX).toFixed(3)),
    margin: Math.round(ratio(logo.margin, 6, 0, 20)),
    clearBackground: logo.clearBackground !== false,
    // Sobre el QR (centro) o en una banda arriba/abajo, para no tapar módulos.
    position: ["center", "top", "bottom"].includes(logo.position) ? logo.position : "center",
    // El recorte circular se retiró: el logotipo se muestra completo, sin deformar.
    round: false,
  };

  // Con logotipo el código se resuelve solo: nivel H, tamaño y margen seguros.
  if (design.logo.src) {
    design.errorCorrection = "H";
    design.logo.size = Math.min(design.logo.size, LOGO_SIZE_MAX);
    const maxMargin = Math.max(0, Math.round((LOGO_CLEARANCE_MAX - design.logo.size) * 256));
    design.logo.margin = Math.min(design.logo.margin, maxMargin);
  }

  const frame = source.frame && typeof source.frame === "object" ? source.frame : {};
  design.frame = {
    style: FRAME_STYLES.some((item) => item.value === frame.style) ? frame.style : "none",
    text: String(frame.text || "").slice(0, 60),
    textColor: color(frame.textColor, "#0f172a"),
    background: color(frame.background, "#ffffff"),
    accent: color(frame.accent, "#2563eb"),
    font: ["sans", "serif", "mono"].includes(frame.font) ? frame.font : "sans",
    fontSize: Number(ratio(frame.fontSize, 0.055, 0.03, 0.12).toFixed(3)),
    padding: Number(ratio(frame.padding, 0.06, 0.02, 0.18).toFixed(3)),
    radius: Number(ratio(frame.radius, 0.05, 0, 0.2).toFixed(3)),
  };
  return design;
}

/* ---------- Color y contraste ---------- */

export function hexToRgb(hex) {
  let text = String(hex || "").replace("#", "").trim();
  if (text.length === 3) text = text.split("").map((ch) => ch + ch).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(text.slice(0, 2), 16),
    g: parseInt(text.slice(2, 4), 16),
    b: parseInt(text.slice(4, 6), 16),
  };
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

export function fillColors(fillValue) {
  if (fillValue.type === "solid") return [fillValue.color];
  return [fillValue.gradient.from, fillValue.gradient.to];
}

/* ---------- Verificación de legibilidad ---------- */

export function evaluateDesign(design, { hasContent = true } = {}) {
  const checks = [];
  const background = design.background.transparent ? "#ffffff" : design.background.color;
  const colors = [
    ...fillColors(design.modules.fill),
    ...fillColors(design.eyeFrame.fill),
    ...fillColors(design.eyeBall.fill),
  ];
  const worst = Math.min(...colors.map((color) => contrastRatio(color, background)));

  if (design.background.transparent) {
    checks.push({ level: "warn", text: "Fondo transparente: comprueba el contraste sobre el soporte final." });
  }
  if (worst >= 7) {
    checks.push({ level: "ok", text: `Contraste excelente (${worst.toFixed(1)}:1).` });
  } else if (worst >= 4.5) {
    checks.push({ level: "ok", text: `Contraste suficiente (${worst.toFixed(1)}:1).` });
  } else if (worst >= 3) {
    checks.push({ level: "warn", text: `Contraste justo (${worst.toFixed(1)}:1). Oscurece los módulos o aclara el fondo.` });
  } else {
    checks.push({ level: "bad", text: `Contraste insuficiente (${worst.toFixed(1)}:1). El QR puede no escanearse.` });
  }

  if (design.quietZone >= 4) {
    checks.push({ level: "ok", text: `Zona de silencio correcta (${design.quietZone} módulos).` });
  } else if (design.quietZone >= 2) {
    checks.push({ level: "warn", text: `Zona de silencio ajustada (${design.quietZone} módulos). Se recomiendan 4.` });
  } else {
    checks.push({ level: "bad", text: "Sin zona de silencio suficiente: deja al menos 2 módulos libres." });
  }

  const hasLogo = Boolean(design.logo.src);
  if (hasLogo && (design.logo.position === "top" || design.logo.position === "bottom")) {
    checks.push({ level: "ok", text: "Logotipo fuera del código: no tapa ningún módulo y la lectura sigue intacta." });
  } else if (hasLogo) {
    checks.push({ level: "ok", text: "Logotipo dentro del tamaño seguro: corrección H y máximo verificado con lectura real." });
  } else if (design.errorCorrection === "L") {
    checks.push({ level: "warn", text: "Corrección L es frágil: usa al menos M." });
  }

  if (!hasContent) {
    checks.push({ level: "warn", text: "Completa el formulario para generar el código." });
  }
  return checks;
}
