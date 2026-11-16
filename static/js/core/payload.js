// Construcción del contenido del QR a partir de la especificación del servidor.
// Debe comportarse igual que modules/catalog/service.py.

let catalogCache = null;

export async function loadCatalog() {
  if (!catalogCache) {
    const response = await fetch("/api/tipos");
    if (!response.ok) throw new Error("No se pudo cargar el catálogo de tipos");
    catalogCache = await response.json();
  }
  return catalogCache;
}

export function typeById(catalog, id) {
  return (catalog?.types || []).find((item) => item.id === id) || null;
}

export function typesByCategory(catalog, categoryId) {
  return (catalog?.types || []).filter((item) => item.category === categoryId);
}

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/;

function clean(value, maxLength) {
  let text = value === null || value === undefined ? "" : String(value);
  text = text.replace(/\u0000/g, "").trim();
  if (maxLength) text = text.slice(0, Number(maxLength));
  return text;
}

export function normalizeUrl(value) {
  const text = clean(value);
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(text)) return text;
  return `https://${text.replace(/^\/+/, "")}`;
}

export function normalizeValues(type, values = {}) {
  const out = {};
  (type?.fields || []).forEach((field) => {
    const raw = values[field.name] ?? field.default ?? "";
    if (field.type === "checkbox") {
      out[field.name] = typeof raw === "string"
        ? ["1", "true", "on", "si", "sí", "yes"].includes(raw.toLowerCase())
        : Boolean(raw);
    } else if (field.type === "repeater") {
      const rows = Array.isArray(raw) ? raw : [];
      out[field.name] = rows
        .slice(0, Number(field.max || 50))
        .map((row) => Object.fromEntries(
          Object.keys(field.item || { label: 1, url: 1 })
            .map((key) => [key, clean(row?.[key], 300)])
        ))
        .filter((row) => Object.values(row).some(Boolean));
    } else if (field.type === "url") {
      out[field.name] = normalizeUrl(clean(raw, field.maxlength));
    } else {
      out[field.name] = clean(raw, field.maxlength);
    }
  });
  return out;
}

function validUrl(value) {
  try {
    const candidate = normalizeUrl(value);
    const url = new URL(candidate);
    if (url.protocol === "mailto:" || url.protocol === "tel:") return candidate.length > 8;
    return Boolean(url.hostname) && (url.hostname.includes(".") || url.hostname === "localhost");
  } catch (_error) {
    return false;
  }
}

export function validate(type, values) {
  const errors = {};
  (type?.fields || []).forEach((field) => {
    const name = field.name;
    const value = values[name];

    if (field.type === "repeater") {
      const rows = value || [];
      const hasContent = rows.some((row) => String(row.url || row.nombre || "").trim());
      if (field.required && !hasContent) {
        errors[name] = "Añade al menos un elemento con enlace o nombre";
      } else if (rows.some((row) => row.url && !validUrl(row.url))) {
        errors[name] = "Hay un enlace con formato no válido";
      }
      return;
    }

    if (field.required) {
      if (field.type === "checkbox" && !value) {
        errors[name] = "Este campo es obligatorio";
        return;
      }
      if (field.type !== "checkbox" && !String(value || "").trim()) {
        errors[name] = "Este campo es obligatorio";
        return;
      }
    }

    const text = String(value || "");
    if (!text) return;
    if (field.maxlength && text.length > Number(field.maxlength)) {
      errors[name] = `Máximo ${field.maxlength} caracteres`;
    } else if (field.type === "email" && !EMAIL_RE.test(text)) {
      errors[name] = "Correo electrónico no válido";
    } else if (field.type === "url" && !validUrl(text)) {
      errors[name] = "Enlace no válido (usa https://...)";
    } else if (field.pattern && !new RegExp(field.pattern).test(text)) {
      errors[name] = "Formato no válido";
    }
  });

  const anyRequired = type?.any_required || [];
  if (anyRequired.length && !anyRequired.some((name) => String(values[name] || "").trim())) {
    errors[anyRequired[0]] = "Completa al menos uno de estos campos";
  }
  return errors;
}

function escapeValue(value, mode) {
  if (mode === "wifi") return String(value).replace(/([\\;,":])/g, "\\$1");
  if (mode === "mecard") return String(value).replace(/([\\;:,"])/g, "\\$1");
  return String(value);
}

function escapeVcard(value) {
  return String(value || "").replace(/([\\;,])/g, "\\$1").replace(/\r\n|\n/g, "\\n");
}

function renderTemplate(template, values, type) {
  const fieldMap = Object.fromEntries((type.fields || []).map((field) => [field.name, field]));
  const dropEmpty = Boolean(type.dropEmptyLines);
  const lines = [];
  String(template || "").split("\n").forEach((line) => {
    const names = [...line.matchAll(PLACEHOLDER)].map((match) => match[1]);
    if (dropEmpty && names.length && names.every((name) => !String(values[name] ?? "").trim())) {
      return;
    }
    lines.push(line.replace(PLACEHOLDER, (_match, name) => {
      const field = fieldMap[name] || {};
      let text = values[name];
      if (typeof text === "boolean") text = text ? "true" : "";
      text = text === null || text === undefined ? "" : String(text);
      if (field.encode === "url") text = encodeURIComponent(text);
      return escapeValue(text, field.escape || type.escape || "none");
    }));
  });
  return lines.join("\n").trim();
}

function buildVcard(values) {
  const first = values.first_name || "";
  const last = values.last_name || "";
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVcard(last)};${escapeVcard(first)};;;`,
    `FN:${escapeVcard([first, last].filter(Boolean).join(" "))}`,
  ];
  if (values.org) lines.push(`ORG:${escapeVcard(values.org)}`);
  if (values.title) lines.push(`TITLE:${escapeVcard(values.title)}`);
  if (values.phone) lines.push(`TEL;TYPE=CELL:${escapeVcard(values.phone)}`);
  if (values.email) lines.push(`EMAIL;TYPE=INTERNET:${escapeVcard(values.email)}`);
  if (values.website) lines.push(`URL:${escapeVcard(values.website)}`);
  if (values.street || values.city || values.country) {
    lines.push(`ADR;TYPE=WORK:;;${escapeVcard(values.street)};${escapeVcard(values.city)};;${escapeVcard(values.country)}`);
  }
  if (values.note) lines.push(`NOTE:${escapeVcard(values.note)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

function buildMecard(values) {
  const parts = [`N:${escapeValue(values.name || "", "mecard")}`];
  if (values.phone) parts.push(`TEL:${escapeValue(values.phone, "mecard")}`);
  if (values.email) parts.push(`EMAIL:${escapeValue(values.email, "mecard")}`);
  if (values.address) parts.push(`ADR:${escapeValue(values.address, "mecard")}`);
  return `MECARD:${parts.join(";")};;`;
}

function buildEmail(values) {
  const params = [];
  if (values.subject) params.push(`subject=${encodeURIComponent(values.subject)}`);
  if (values.body) params.push(`body=${encodeURIComponent(values.body)}`);
  return `mailto:${values.to || ""}${params.length ? `?${params.join("&")}` : ""}`;
}

function buildWhatsapp(values) {
  const digits = String(values.numero || "").replace(/\D/g, "");
  const text = values.mensaje ? `?text=${encodeURIComponent(values.mensaje)}` : "";
  return `https://wa.me/${digits}${text}`;
}

const SOCIAL_BASES = {
  instagram: "https://instagram.com/{user}",
  facebook: "https://facebook.com/{user}",
  tiktok: "https://tiktok.com/@{user}",
  x: "https://x.com/{user}",
  linkedin: "https://linkedin.com/in/{user}",
  youtube: "https://youtube.com/@{user}",
  telegram: "https://t.me/{user}",
};

function buildSocial(values) {
  if (values.url) return normalizeUrl(values.url);
  const user = String(values.usuario || "").trim().replace(/^@/, "");
  if (!user) return "";
  const base = SOCIAL_BASES[values.network] || SOCIAL_BASES.instagram;
  return base.replace("{user}", encodeURIComponent(user));
}

function buildEvent(values) {
  const toIcal = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  };
  const start = toIcal(values.start);
  if (!start) return "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plataforma QR//ES",
    "BEGIN:VEVENT",
    `SUMMARY:${values.title || ""}`,
    `DTSTART:${start}`,
  ];
  const end = toIcal(values.end);
  if (end) lines.push(`DTEND:${end}`);
  if (values.location) lines.push(`LOCATION:${values.location}`);
  if (values.description) lines.push(`DESCRIPTION:${String(values.description).replace(/\n/g, "\\n")}`);
  if (values.url) lines.push(`URL:${normalizeUrl(values.url)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

const BUILDERS = {
  email: buildEmail,
  whatsapp: buildWhatsapp,
  social: buildSocial,
  vcard: buildVcard,
  mecard: buildMecard,
  event: buildEvent,
};

const URL_TYPES = new Set(["url", "social", "whatsapp", "media_link", "media_video",
  "media_audio", "media_pdf", "encuesta", "resena"]);

export function buildPayload(type, rawValues) {
  if (!type) return { content: "", errors: { type: "Tipo desconocido" }, values: {} };
  const values = normalizeValues(type, rawValues);
  const errors = validate(type, values);
  if (Object.keys(errors).length) return { content: "", errors, values };

  if (type.hosted) {
    return { content: `${location.origin}/l/vista-previa`, errors: {}, values, hosted: type.hosted };
  }

  const builder = BUILDERS[type.builder];
  let content = builder ? builder(values) : renderTemplate(type.template, values, type);
  if (URL_TYPES.has(type.id) && content) content = normalizeUrl(content);
  if (!content) {
    return { content: "", errors: { type: "El contenido del código QR está vacío" }, values };
  }
  return { content, errors: {}, values };
}
