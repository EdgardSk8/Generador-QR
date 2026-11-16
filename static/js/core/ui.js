// Utilidades de interfaz: tema, navegación, avisos, modales y API.

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

export function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(Number(value) || 0);
}

export function formatDate(value, withTime = false) {
  if (!value) return "—";
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  const date = new Date(isDateOnly ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  const options = withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return date.toLocaleDateString("es-MX", options);
}

export class ApiError extends Error {
  constructor(errors, status) {
    super("Error de validación");
    this.errors = errors || {};
    this.status = status;
  }
  firstMessage() {
    const first = Object.values(this.errors)[0];
    return typeof first === "string" ? first : "Revisa los datos del formulario";
  }
}

export async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    body: options.body && typeof options.body !== "string"
      ? JSON.stringify(options.body)
      : options.body,
  });
  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError(data && data.errors, response.status);
  }
  return data;
}

export function toast(message, kind = "ok", timeout = 4200) {
  const host = $("#toasts");
  if (!host) return;
  const text = String(message);
  // Si el mismo aviso sigue visible no se duplica al repetir la acción.
  const repeated = Array.from(host.querySelectorAll(".toast"))
    .find((node) => node.dataset.message === text);
  if (repeated) return;

  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  node.dataset.message = text;
  node.innerHTML = `${icon(kind === "bad" ? "alert" : "check", "icon icon-sm")}<span>${escapeHtml(text)}</span>`;
  host.appendChild(node);
  setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    node.style.transition = "opacity .2s, transform .2s";
    setTimeout(() => node.remove(), 220);
  }, timeout);
}

export function confirmDialog({ title, message, confirmText = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <span class="stat-badge" style="background:${danger ? "var(--danger-soft)" : "var(--primary-soft)"};color:${danger ? "var(--danger)" : "var(--primary-strong)"}">
            ${icon(danger ? "alert" : "check")}
          </span>
          <div><h2>${escapeHtml(title)}</h2></div>
        </div>
        <div class="modal-body">${escapeHtml(message)}</div>
        <div class="modal-foot">
          <button class="btn" data-cancel>Cancelar</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-cancel]")) close(false);
      if (event.target.closest("[data-confirm]")) close(true);
    });
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-confirm]").focus();
  });
}

export function promptDialog({ title, label, value = "", placeholder = "", confirmText = "Guardar" }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><div><h2>${escapeHtml(title)}</h2></div></div>
        <div class="modal-body">
          <div class="field">
            <label class="field-label" for="promptInput">${escapeHtml(label)}</label>
            <input class="input" id="promptInput" maxlength="60" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn" data-cancel>Cancelar</button>
          <button class="btn btn-primary" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const input = backdrop.querySelector("#promptInput");
    const close = (result) => { backdrop.remove(); resolve(result); };
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop || event.target.closest("[data-cancel]")) close(null);
      if (event.target.closest("[data-confirm]")) close(input.value.trim() || null);
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Enter") close(input.value.trim() || null);
      if (event.key === "Escape") close(null);
    });
    document.body.appendChild(backdrop);
    input.focus();
    input.select();
  });
}

/* ---------- Almacenamiento local (plantillas y favoritos) ---------- */

export function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

export function writeStore(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    /* almacenamiento no disponible */
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function setBusy(button, busy, busyLabel) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${escapeHtml(busyLabel || "Procesando…")}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

export function slugFilename(name, extension) {
  const base = String(name || "codigo-qr")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "codigo-qr";
  return `${base}.${extension}`;
}

/* ---------- Tema y navegación ---------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $$("[data-theme-icon]").forEach((node) => {
    node.innerHTML = `<use href="#i-${theme === "dark" ? "sun" : "moon"}"/>`;
  });
  $$("[data-theme-label]").forEach((node) => {
    node.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  });
  try { localStorage.setItem("qr-theme", theme); } catch (_error) { /* sin almacenamiento */ }
}

export function initChrome() {
  applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  $("#themeToggle")?.addEventListener("click", () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  });

  const toggle = $("#menuToggle");
  toggle?.addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#scrim")?.addEventListener("click", () => document.body.classList.remove("nav-open"));
  $$(".sidebar .nav-link").forEach((link) => {
    link.addEventListener("click", () => document.body.classList.remove("nav-open"));
  });
}

initChrome();
