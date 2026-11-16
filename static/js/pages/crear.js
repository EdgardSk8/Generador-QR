// Página Crear / Editar QR: formulario dinámico + editor de diseño + vista previa.

import {
  $, $$, api, debounce, downloadBlob, escapeHtml, promptDialog, readStore,
  setBusy, slugFilename, toast, writeStore,
} from "../core/ui.js";
import { buildPayload, loadCatalog, typeById } from "../core/payload.js";
import {
  DEFAULT_DESIGN, EYE_BALL_SHAPES, EYE_FRAME_SHAPES, ERROR_LEVELS, FRAME_STYLES,
  LOGO_CLEARANCE_MAX, LOGO_SIZE_MAX, MODULE_SHAPES, cloneDesign, evaluateDesign,
  normalizeDesign,
} from "../core/design.js";
import { decodeCheck, drawPreview, exportBlob } from "../core/renderer.js";

const initial = JSON.parse($("#initial-data").textContent);
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CUSTOM_PRESETS_KEY = "qr-custom-presets";
const PRESET_HANDOFF_KEY = "qr-preset-handoff";

const SOLID_PALETTE = [
  { color: "#111111", label: "Negro" },
  { color: "#334155", label: "Grafito" },
  { color: "#1d4ed8", label: "Azul" },
  { color: "#1e3a8a", label: "Azul marino" },
  { color: "#4f46e5", label: "Índigo" },
  { color: "#7e22ce", label: "Violeta" },
  { color: "#be185d", label: "Fucsia" },
  { color: "#b91c1c", label: "Rojo" },
  { color: "#c2410c", label: "Naranja" },
  { color: "#b45309", label: "Ámbar" },
  { color: "#15803d", label: "Verde" },
  { color: "#0f766e", label: "Verde azulado" },
];

const state = {
  catalog: null,
  presets: [],
  typeId: "",
  values: {},
  design: normalizeDesign(DEFAULT_DESIGN),
  presetId: null,
  name: "",
  folderId: "",
  expires: "",
  dynamic: false,
  previewSize: 320,
  mode: "sencillo",
  fullDesign: null,
  showPayload: false,
  fitting: false,
  fitFor: "",
  logoMax: LOGO_SIZE_MAX,
  logoLimitFor: "",
  logoQr: "",
  editId: initial.code?.id || null,
  content: "",
  errors: {},
};

/* ---------- Arranque ---------- */

async function boot() {
  try {
    state.catalog = await loadCatalog();
    const presetsResponse = await api("/api/plantillas");
    state.presets = [...presetsResponse.presets, ...readStore(CUSTOM_PRESETS_KEY, [])];
  } catch (error) {
    toast("No se pudo cargar la configuración inicial", "bad");
    return;
  }

  if (initial.code) {
    const code = initial.code;
    state.typeId = code.qr_type;
    state.values = { ...code.fields };
    state.design = normalizeDesign(code.design);
    state.presetId = code.preset_id || null;
    state.name = code.name || "";
    state.folderId = code.folder_id || "";
    state.expires = (code.expires_at || "").slice(0, 10);
    state.dynamic = Boolean(code.is_dynamic);
    state.mode = "completo";
  } else {
    state.typeId = initial.initial_type || "url";
    if (!typeById(state.catalog, state.typeId)) state.typeId = "url";
    const savedMode = (() => {
      try { return localStorage.getItem("qr-mode"); } catch (_error) { return null; }
    })();
    state.mode = savedMode === "completo" ? "completo" : "sencillo";
    const handoff = sessionStorage.getItem(PRESET_HANDOFF_KEY);
    if (handoff) {
      sessionStorage.removeItem(PRESET_HANDOFF_KEY);
      try {
        const pending = JSON.parse(handoff);
        state.design = normalizeDesign(pending.design);
        state.presetId = pending.id || null;
        state.mode = "completo";
      } catch (_error) { /* handoff corrupto */ }
    }
  }

  if (state.mode === "sencillo") state.design = simpleDesign();
  else state.fullDesign = cloneDesign(state.design);

  try {
    state.showPayload = localStorage.getItem("qr-show-payload") === "1";
  } catch (_error) { /* sin almacenamiento */ }

  const modeRadio = document.querySelector(`input[name="qrMode"][value="${state.mode}"]`);
  if (modeRadio) modeRadio.checked = true;

  renderTypePicker();
  renderForm();
  renderDesignPanel();
  $("#codeName").value = state.name;
  syncDynamicField();
  bindPageEvents();
  syncInspector();
  updatePreview();

  if (state.editId) {
    $("#saveBtn").innerHTML = '<svg class="icon icon-sm"><use href="#i-save"/></svg> Guardar cambios';
  }
}

/* ---------- Selector de tipos ---------- */

function typeButtonHtml(type) {
  return `
    <button type="button" class="type-btn ${type.id === state.typeId ? "is-active" : ""}" data-type="${type.id}" title="${escapeHtml(type.description || type.label)}">
      <svg class="icon"><use href="#i-${type.icon}"/></svg>
      <span>${escapeHtml(type.label)}</span>
    </button>`;
}

function renderTypePicker() {
  const host = $("#typePicker");
  const active = state.catalog.types.find((type) => type.id === state.typeId);
  const legacy = active && active.hidden ? `
      <div class="type-category">
        <div class="type-category-head">
          <svg class="icon icon-sm"><use href="#i-${active.icon}"/></svg>
          <span>Tipo heredado</span>
        </div>
        <div class="type-grid">${typeButtonHtml(active)}</div>
        <p class="field-help">Este tipo ya no se ofrece para códigos nuevos, pero se conserva para los que ya existen.</p>
      </div>` : "";

  host.innerHTML = legacy + state.catalog.categories.map((category) => {
    const types = state.catalog.types.filter((type) => type.category === category.id && !type.hidden);
    if (!types.length) return "";
    return `
      <div class="type-category">
        <div class="type-category-head">
          <svg class="icon icon-sm"><use href="#i-${category.icon}"/></svg>
          <span>${escapeHtml(category.label)}</span>
        </div>
        <div class="type-grid">
          ${types.map(typeButtonHtml).join("")}
        </div>
      </div>`;
  }).join("");

  host.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (!button || button.dataset.type === state.typeId) return;
    switchType(button.dataset.type);
  });
}

function switchType(typeId) {
  state.typeId = typeId;
  state.values = {};
  state.errors = {};
  $$(".type-btn").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.type === typeId);
  });
  renderForm();
  syncDynamicField();
  updatePreview();
  const card = $("#contentCard");
  if (card) card.open = false;
}

/* ---------- Formulario dinámico ---------- */

function currentType() {
  return typeById(state.catalog, state.typeId);
}

function controlHtml(field) {
  const name = field.name;
  const value = state.values[name] ?? field.default ?? "";
  const required = field.required ? "required" : "";
  const maxlength = field.maxlength ? `maxlength="${field.maxlength}"` : "";
  const placeholder = escapeHtml(field.placeholder || "");
  const common = `data-field="${name}" id="f-${name}" class="input" ${maxlength} placeholder="${placeholder}"`;

  if (field.type === "textarea") {
    return `<textarea ${common} rows="${field.rows || 3}">${escapeHtml(value)}</textarea>`;
  }
  if (field.type === "select") {
    const options = (field.options || []).map((option) => `
      <option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? "selected" : ""}>${escapeHtml(option.label)}</option>`);
    return `<select data-field="${name}" id="f-${name}" class="select">${options.join("")}</select>`;
  }
  if (field.type === "checkbox") {
    return `<label class="checkbox"><input type="checkbox" data-field="${name}" id="f-${name}" ${value ? "checked" : ""}><span>${escapeHtml(field.label)}</span></label>`;
  }
  const inputType = {
    url: "url", email: "email", tel: "tel", password: "password",
    date: "date", datetime: "datetime-local", number: "number",
  }[field.type] || "text";
  return `<input type="${inputType}" ${common} value="${escapeHtml(value)}" ${required}>`;
}

function hintHtml(text) {
  if (!text) return "";
  return `<span class="hint">
      <button type="button" class="hint-btn" aria-label="Ayuda">?</button>
      <span class="hint-bubble">${escapeHtml(text)}</span>
    </span>`;
}

function labelRowHtml(field) {
  return `<div class="row-between" style="gap:6px">
      <label class="field-label" for="f-${field.name}">${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}</label>
      ${hintHtml(field.help)}
    </div>`;
}

function fieldHtml(field) {
  if (field.type === "repeater") {
    return `
      <div class="field" data-field-wrap="${field.name}">
        <div class="row-between">
          <span class="field-label">${escapeHtml(field.label)}${field.required ? ' <span class="req">*</span>' : ""}</span>
          <div class="row" style="gap:6px">
            ${hintHtml(field.help)}
            <button type="button" class="btn btn-sm" data-add="${field.name}">
              <svg class="icon icon-sm"><use href="#i-plus"/></svg> Añadir
            </button>
          </div>
        </div>
        <div class="stack-sm" data-repeater="${field.name}"></div>
        <p class="field-error hidden" data-error="${field.name}"></p>
      </div>`;
  }
  if (field.type === "checkbox") {
    return `<div class="field" data-field-wrap="${field.name}">
      <div class="row" style="gap:8px">${controlHtml(field)}${hintHtml(field.help)}</div>
    </div>`;
  }
  return `
    <div class="field" data-field-wrap="${field.name}">
      ${labelRowHtml(field)}
      ${controlHtml(field)}
      <p class="field-error hidden" data-error="${field.name}"></p>
    </div>`;
}

function renderForm() {
  const type = currentType();
  $("#formTitle").textContent = type.label;
  $("#typeBadge").textContent = type.label;
  const form = $("#contentForm");
  form.innerHTML = type.fields.map(fieldHtml).join("");
  type.fields.filter((field) => field.type === "repeater").forEach(renderRepeater);
  renderErrors();
}

function renderRepeater(field) {
  const host = $(`[data-repeater="${field.name}"]`);
  if (!host) return;
  const rows = state.values[field.name] || [];
  const keys = Object.entries(field.item || { label: "Texto", url: "URL" });
  if (!rows.length) {
    host.innerHTML = `<p class="field-help">Todavía no hay elementos.</p>`;
    return;
  }
  host.innerHTML = rows.map((row, index) => `
    <div class="card" style="box-shadow:none" data-row="${index}">
      <div class="card-body tight stack-sm">
        <div class="row-between">
          <span class="badge">${index + 1}</span>
          <button type="button" class="icon-btn" data-remove="${field.name}" data-index="${index}" title="Quitar">
            <svg class="icon icon-sm"><use href="#i-trash"/></svg>
          </button>
        </div>
        ${keys.map(([key, label]) => `
          <input class="input" data-repeater-field="${field.name}" data-index="${index}" data-key="${key}"
                 placeholder="${escapeHtml(label)}" value="${escapeHtml(row?.[key] || "")}">`).join("")}
      </div>
    </div>`).join("");
}

function renderErrors() {
  const type = currentType();
  type.fields.forEach((field) => {
    const node = $(`[data-error="${field.name}"]`);
    const input = $(`[data-field="${field.name}"]`);
    const message = state.errors[field.name];
    if (node) {
      node.textContent = message || "";
      node.classList.toggle("hidden", !message);
    }
    if (input) input.classList.toggle("is-invalid", Boolean(message));
  });
}

/* ---------- Eventos del formulario ---------- */

function bindFormEvents() {
  const form = $("#contentForm");

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (target.dataset.repeaterField) {
      const fieldName = target.dataset.repeaterField;
      const index = Number(target.dataset.index);
      const key = target.dataset.key;
      const rows = [...(state.values[fieldName] || [])];
      rows[index] = { ...rows[index], [key]: target.value };
      state.values[fieldName] = rows;
      schedulePreview();
      return;
    }
    const field = target.dataset.field;
    if (!field) return;
    state.values[field] = target.type === "checkbox" ? target.checked : target.value;
    schedulePreview();
  });

  form.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    state.values[field] = event.target.type === "checkbox"
      ? event.target.checked
      : event.target.value;
    updatePreview();
  });

  form.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    if (add) {
      const fieldName = add.dataset.add;
      const type = currentType();
      const field = type.fields.find((item) => item.name === fieldName);
      const rows = [...(state.values[fieldName] || [])];
      if (rows.length >= Number(field.max || 30)) {
        toast(`Máximo ${field.max} elementos`, "bad");
        return;
      }
      rows.push({});
      state.values[fieldName] = rows;
      renderRepeater(field);
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const fieldName = remove.dataset.remove;
      const type = currentType();
      const field = type.fields.find((item) => item.name === fieldName);
      const rows = [...(state.values[fieldName] || [])];
      rows.splice(Number(remove.dataset.index), 1);
      state.values[fieldName] = rows;
      renderRepeater(field);
      schedulePreview();
    }
  });
}

/* ---------- Dinámico / estático ---------- */

function syncDynamicField() {
  const type = currentType();
  const toggle = $("#dynamicToggle");
  const help = $("#dynamicHelp");
  const supportsDynamic = type.dynamic || Boolean(type.hosted);

  $("#dynamicField").classList.toggle("hidden", false);
  if (type.hosted) {
    state.dynamic = true;
    toggle.checked = true;
    toggle.disabled = true;
    help.textContent = "Este tipo se publica como página alojada: siempre usa una URL corta y registra estadísticas.";
  } else if (supportsDynamic) {
    toggle.disabled = false;
    toggle.checked = state.dynamic;
    help.textContent = "La URL corta permite cambiar el destino sin reimprimir y ver escaneos. Al desactivarlo, el contenido queda fijo dentro del QR.";
  } else {
    state.dynamic = false;
    toggle.checked = false;
    toggle.disabled = true;
    help.textContent = "Este tipo es estático: el contenido viaja dentro del código QR y no se puede editar después.";
  }
}

/* ---------- Vista previa ---------- */

const schedulePreview = debounce(() => updatePreview(), 170);

async function updatePreview() {
  const type = currentType();
  if (!type) return;
  const built = buildPayload(type, state.values);
  state.errors = built.errors;
  state.content = built.content;
  renderErrors();

  const canvas = $("#previewCanvas");
  const empty = $("#previewEmpty");

  if (!built.content) {
    canvas.classList.add("hidden");
    empty.classList.remove("hidden");
    $("#previewPayload").textContent = Object.keys(built.errors).length
      ? "Completa los campos obligatorios"
      : "—";
    $("#contentKind").textContent = state.dynamic ? "Dinámico" : "Estático";
    $("#contentLink").classList.add("hidden");
    $("#togglePayload").classList.add("hidden");
    renderChecks([], false);
    return;
  }

  empty.classList.add("hidden");
  canvas.classList.remove("hidden");
  $("#togglePayload").classList.remove("hidden");
  $("#previewPayload").textContent = built.content;
  const kind = $("#contentKind");
  kind.textContent = type.hosted ? "Página alojada" : state.dynamic ? "Dinámico" : "Estático";
  kind.className = `badge ${state.dynamic || type.hosted ? "badge-success" : "badge"}`;

  const link = $("#contentLink");
  if (/^https?:\/\//i.test(built.content)) {
    link.href = built.content;
    link.classList.remove("hidden");
  } else {
    link.classList.add("hidden");
  }

  try {
    await drawPreview(canvas, built.content, state.design, 520);
    canvas.style.width = `${state.previewSize}px`;
  } catch (error) {
    console.error(error);
    toast("No se pudo dibujar la vista previa", "bad");
  }

  const checks = evaluateDesign(state.design, { hasContent: true });
  renderChecks(checks, true);
  scheduleDecode(built.content);
}

function canonical(text) {
  return String(text ?? "").replace(/[^\x20-\x7E]/g, "?");
}

function decodedMatches(decoded, content) {
  return decoded === content || canonical(decoded) === canonical(content);
}

const scheduleDecode = debounce(async (content) => {
  if (!content) return;
  const result = await decodeCheck(content, state.design);
  const node = $("#checkDecode");
  if (!node) return;
  if (result.ok && decodedMatches(result.decoded, content)) {
    node.className = "check-item ok";
    node.innerHTML = '<svg class="icon icon-sm"><use href="#i-check"/></svg><span>Lectura verificada: un lector real decodifica el contenido correcto.</span>';
  } else if (result.ok) {
    node.className = "check-item warn";
    node.innerHTML = '<svg class="icon icon-sm"><use href="#i-alert"/></svg><span>El QR se lee, pero el contenido decodificado no coincide exactamente.</span>';
  } else {
    node.className = "check-item bad";
    node.innerHTML = '<svg class="icon icon-sm"><use href="#i-alert"/></svg><span>No se pudo decodificar el QR con este diseño. Revisa el contraste y la posición del logotipo.</span>';
  }
  await syncLogoLimit(content);
}, 650);

function renderChecks(checks, withDecode) {
  const host = $("#checks");
  const icons = { ok: "check", warn: "alert", bad: "alert" };
  host.innerHTML = checks.map((item) => `
    <div class="check-item ${item.level}">
      <svg class="icon icon-sm"><use href="#i-${icons[item.level] || "check"}"/></svg>
      <span>${escapeHtml(item.text)}</span>
    </div>`).join("")
    + (withDecode ? '<div class="check-item" id="checkDecode"><span class="muted">Comprobando lectura…</span></div>' : "");
}

/* ---------- Editor de diseño ---------- */

function fillEditor(prefix, label) {
  const fill = state.design[prefix].fill;
  const solidActive = fill.type === "solid";
  return `
    <div class="divider"></div>
    <div class="field">
      <div class="row-between">
        <span class="field-label">${escapeHtml(label)}</span>
        <div class="segmented" data-filltype="${prefix}">
          <button type="button" data-value="solid" class="${solidActive ? "is-active" : ""}">Sólido</button>
          <button type="button" data-value="linear" class="${fill.type === "linear" ? "is-active" : ""}">Lineal</button>
          <button type="button" data-value="radial" class="${fill.type === "radial" ? "is-active" : ""}">Radial</button>
        </div>
      </div>
      <div class="input-group ${solidActive ? "" : "hidden"}" data-solid="${prefix}">
        <input class="input-color" type="color" data-path="${prefix}.fill.color" value="${fill.color}" style="max-width:52px">
        <input class="input mono" data-path="${prefix}.fill.color" data-color-text value="${fill.color}" maxlength="7" aria-label="Color ${escapeHtml(label)}">
      </div>
      <div class="field-row ${solidActive ? "hidden" : ""}" data-gradient="${prefix}">
        <div class="field">
          <label class="field-label">Desde</label>
          <input class="input-color" type="color" data-path="${prefix}.fill.gradient.from" value="${fill.gradient.from}">
        </div>
        <div class="field">
          <label class="field-label">Hasta</label>
          <input class="input-color" type="color" data-path="${prefix}.fill.gradient.to" value="${fill.gradient.to}">
        </div>
      </div>
      <div class="range-row ${solidActive ? "hidden" : ""}" data-gradient="${prefix}">
        <input type="range" min="0" max="360" step="5" data-path="${prefix}.fill.gradient.rotation" value="${fill.gradient.rotation}">
        <span class="range-value">${fill.gradient.rotation}°</span>
      </div>
    </div>`;
}

function shapeGrid(prefix, shapes) {
  const current = state.design[prefix].shape;
  return `<div class="shape-grid" data-shapes="${prefix}">
    ${shapes.map((shape) => `
      <button type="button" class="shape-btn ${shape.value === current ? "is-active" : ""}" data-shape="${shape.value}" data-shapes-for="${prefix}">
        <span class="shape-swatch"></span>
        <span>${escapeHtml(shape.label)}</span>
      </button>`).join("")}
  </div>`;
}

function heading(iconName, text) {
  return `<svg class="icon icon-sm"><use href="#i-${iconName}"/></svg><span>${text}</span>`;
}

function renderDesignPanel() {
  const d = state.design;
  $("#presetsLink")?.classList.toggle("hidden", state.mode === "sencillo");
  const openSections = [...($("#designPanel")?.querySelectorAll("details") || [])].map((node) => node.open);
  if (state.mode === "sencillo") {
    renderSimplePanel();
    restoreOpenSections(openSections);
    syncLogoMarginLimit();
    syncLogoSizeLimit();
    return;
  }

  $("#designPanel").innerHTML = `
    <details class="accordion" open>
      <summary>${heading("palette", "Plantillas rápidas")}</summary>
      <div class="accordion-body">
        <div class="row" id="presetChips">
          ${state.presets.map((preset) => `
            <button type="button" class="chip ${state.presetId === preset.id ? "is-active" : ""}" data-preset="${preset.id}" title="${escapeHtml(preset.description || "")}">
              ${escapeHtml(preset.name)}
            </button>`).join("")}
          <button type="button" class="chip" data-save-template="1" title="Guardar el diseño actual como plantilla">
            + Guardar diseño
          </button>
        </div>
      </div>
    </details>

    <details class="accordion" open>
      <summary>${heading("palette", "Colores")}</summary>
      <div class="accordion-body">
        <div class="field">
          <div class="row-between">
            <span class="field-label">Color del QR</span>
            <label class="palette-custom" title="Color personalizado">
              <input type="color" id="paletteCustom" data-palette-custom value="${d.modules.fill.color}" aria-label="Color personalizado">
            </label>
          </div>
          ${paletteHtml()}
          <p class="field-help">Se aplica a los módulos y a las esquinas del código.</p>
        </div>

        <div class="field">
          <div class="row-between">
            <span class="field-label">Color de fondo</span>
            <label class="checkbox"><input type="checkbox" data-path="background.transparent" ${d.background.transparent ? "checked" : ""}><span>Transparente</span></label>
          </div>
          <div class="input-group ${d.background.transparent ? "hidden" : ""}" data-bg>
            <input class="input-color" type="color" data-path="background.color" value="${d.background.color}" style="max-width:52px">
            <input class="input mono" data-path="background.color" data-color-text value="${d.background.color}" maxlength="7" aria-label="Color de fondo">
          </div>
          <p class="field-help">Se ve en la vista previa y en el archivo descargado.</p>
        </div>

        <details class="accordion nested">
          <summary>${heading("eye", "Degradados y detalle por zona")}</summary>
          <div class="accordion-body">
            ${fillEditor("modules", "Módulos")}
            ${fillEditor("eyeFrame", "Esquinas exteriores")}
            ${fillEditor("eyeBall", "Centro de las esquinas")}
          </div>
        </details>
      </div>
    </details>

    <details class="accordion">
      <summary>${heading("qr", "Forma de los módulos")}</summary>
      <div class="accordion-body">${shapeGrid("modules", MODULE_SHAPES)}</div>
    </details>

    <details class="accordion">
      <summary>${heading("grid", "Esquinas")}</summary>
      <div class="accordion-body stack-sm">
        <span class="field-label">Marco exterior</span>
        ${shapeGrid("eyeFrame", EYE_FRAME_SHAPES)}
        <span class="field-label">Centro</span>
        ${shapeGrid("eyeBall", EYE_BALL_SHAPES)}
      </div>
    </details>

    <details class="accordion">
      <summary>${heading("image", "Logotipo")}</summary>
      <div class="accordion-body stack-sm">
        ${logoEditorInner()}
      </div>
    </details>

    <details class="accordion">
      <summary>${heading("card", "Marco y texto")}</summary>
      <div class="accordion-body stack-sm">
        <div class="field">
          <label class="field-label" for="frameStyle">Estilo del marco</label>
          <select class="select" data-path="frame.style" id="frameStyle">
            ${FRAME_STYLES.map((style) => `<option value="${style.value}" ${d.frame.style === style.value ? "selected" : ""}>${style.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="frameText">Texto</label>
          <input class="input" data-path="frame.text" id="frameText" maxlength="60" value="${escapeHtml(d.frame.text)}" placeholder="Escanéame, Ver menú, Más información…">
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Color del texto</label>
            <input class="input-color" type="color" data-path="frame.textColor" value="${d.frame.textColor}">
          </div>
          <div class="field">
            <label class="field-label">Color del marco</label>
            <input class="input-color" type="color" data-path="frame.background" value="${d.frame.background}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label class="field-label">Color de acento</label>
            <input class="input-color" type="color" data-path="frame.accent" value="${d.frame.accent}">
          </div>
          <div class="field">
            <label class="field-label" for="frameFont">Tipografía</label>
            <select class="select" data-path="frame.font" id="frameFont">
              <option value="sans" ${d.frame.font === "sans" ? "selected" : ""}>Sans (moderna)</option>
              <option value="serif" ${d.frame.font === "serif" ? "selected" : ""}>Serif (elegante)</option>
              <option value="mono" ${d.frame.font === "mono" ? "selected" : ""}>Monoespaciada</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Tamaño del texto</label>
          <div class="range-row">
            <input type="range" min="3" max="9" step="0.5" data-path="frame.fontSize" data-scale="0.01" value="${Math.round(d.frame.fontSize * 100)}">
            <span class="range-value">${Math.round(d.frame.fontSize * 100)}%</span>
          </div>
        </div>
        <div class="field">
          <label class="field-label">Espaciado del marco</label>
          <div class="range-row">
            <input type="range" min="2" max="18" step="1" data-path="frame.padding" data-scale="0.01" value="${Math.round(d.frame.padding * 100)}">
            <span class="range-value">${Math.round(d.frame.padding * 100)}%</span>
          </div>
        </div>
      </div>
    </details>

    <details class="accordion">
      <summary>${heading("eye", "Legibilidad")}</summary>
      <div class="accordion-body stack-sm">
        <div class="field">
          <label class="field-label" for="ecLevel">Corrección de errores</label>
          <select class="select" data-path="errorCorrection" id="ecLevel">
            ${ERROR_LEVELS.map((level) => `<option value="${level.value}" ${d.errorCorrection === level.value ? "selected" : ""}>${level.label}</option>`).join("")}
          </select>
          <p class="field-help">Con logotipo se aplica nivel H automáticamente.</p>
        </div>
        <div class="field">
          <label class="field-label">Zona de silencio (módulos)</label>
          <div class="range-row">
            <input type="range" min="0" max="10" step="1" data-path="quietZone" value="${d.quietZone}">
            <span class="range-value">${d.quietZone}</span>
          </div>
        </div>
      </div>
    </details>`;

  restoreOpenSections(openSections);
  syncLogoMarginLimit();
  syncLogoSizeLimit();
}

/** Mantiene abiertas (o cerradas) las secciones tal y como las tenía el usuario. */
function restoreOpenSections(openSections) {
  if (!openSections.length) return;
  const nodes = [...($("#designPanel")?.querySelectorAll("details") || [])];
  nodes.forEach((node, index) => {
    if (index < openSections.length) node.open = openSections[index];
  });
}

function logoEditorInner() {
  const d = state.design;
  return `
        <div class="logo-preview">
          ${d.logo.src
            ? `<img class="logo-thumb" src="${d.logo.src}" alt="Logotipo">`
            : `<span class="logo-thumb" style="display:grid;place-items:center;color:var(--muted)"><svg class="icon"><use href="#i-image"/></svg></span>`}
          <div class="stack-sm" style="flex:1">
            <input type="file" id="logoInput" accept="image/png,image/jpeg,image/webp" class="input" style="padding:6px">
            <button type="button" class="btn btn-sm" id="removeLogo" ${d.logo.src ? "" : "disabled"}>Quitar logotipo</button>
          </div>
        </div>
        ${state.logoQr ? `<p class="field-hint field-hint-warn">Esta imagen ya es un código QR (${escapeHtml(state.logoQr.slice(0, 60))}). Superpuesta se ve mal y, al escanear, puede leerse ese otro contenido: colócala arriba o debajo del QR.</p>` : ""}
        <div class="field">
          <div class="row-between">
            <label class="field-label" for="logoPosition">Posición</label>
            ${hintHtml("Sobre el QR el logotipo se superpone al centro. Arriba o abajo lo coloca fuera del código, sin tapar módulos: ideal para logotipos oscuros o con detalles finos.")}
          </div>
          <select class="select" id="logoPosition" data-path="logo.position">
            <option value="center" ${d.logo.position === "center" ? "selected" : ""}>Sobre el QR</option>
            <option value="top" ${d.logo.position === "top" ? "selected" : ""}>Arriba del QR</option>
            <option value="bottom" ${d.logo.position === "bottom" ? "selected" : ""}>Debajo del QR</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label">Tamaño</label>
          <div class="range-row">
            <input type="range" min="10" max="${Math.round((isLogoInBand() ? LOGO_SIZE_MAX : state.logoMax) * 100)}" step="1" data-path="logo.size" data-scale="0.01" value="${Math.round(d.logo.size * 100)}">
            <span class="range-value">${Math.round(d.logo.size * 100)}%</span>
          </div>
          <p class="field-hint" id="logoSizeHint"></p>
        </div>
        <div class="field">
          <div class="row-between">
            <label class="field-label">Margen de separación</label>
            ${hintHtml("Espacio libre alrededor del logotipo para que no toque los módulos del QR. Mejora la lectura; se limita solo para no dañarla.")}
          </div>
          <div class="range-row">
            <input type="range" min="0" max="30" step="1" data-path="logo.margin" value="${d.logo.margin}">
            <span class="range-value">${d.logo.margin}</span>
          </div>
        </div>
        <label class="checkbox"><input type="checkbox" data-path="logo.clearBackground" ${d.logo.clearBackground ? "checked" : ""}><span>Fondo detrás del logotipo</span></label>`;
}

function paletteHtml() {
  const fill = state.design.modules.fill;
  const current = fill.type === "solid" ? fill.color.toLowerCase() : "";
  return `<div class="palette">
    ${SOLID_PALETTE.map((item) => `
      <button type="button" class="swatch ${item.color.toLowerCase() === current ? "is-active" : ""}"
              data-color="${item.color}" title="${item.label}" aria-label="${item.label}"
              style="--swatch:${item.color}"></button>`).join("")}
  </div>`;
}

function renderSimplePanel() {
  $("#designPanel").innerHTML = `
    <details class="accordion" open>
      <summary>${heading("image", "Logotipo (opcional)")}</summary>
      <div class="accordion-body stack-sm">${logoEditorInner()}</div>
    </details>
    <p class="field-help">Modo sencillo: QR negro sobre blanco, máxima compatibilidad al escanear. Cambia a «Completo» para colores, formas y marcos.</p>`;
}

function simpleDesign() {
  const design = normalizeDesign(DEFAULT_DESIGN);
  design.logo = { ...state.design.logo };
  design.quietZone = state.design.quietZone;
  design.background = { ...state.design.background };
  return design;
}

function updateRangeLabel(input) {
  const label = input?.parentElement?.querySelector(".range-value");
  if (!label) return;
  if (input.dataset.scale) {
    label.textContent = `${Math.round(Number(input.value) * Number(input.dataset.scale) * 100)}%`;
  } else {
    label.textContent = input.value + (input.dataset.path?.includes("rotation") ? "°" : "");
  }
}

function clampLogo() {
  const logo = state.design.logo;
  if (!logo.src) {
    syncLogoMarginLimit();
    return;
  }
  logo.size = Math.min(logo.size, LOGO_SIZE_MAX);
  state.design.errorCorrection = "H";
  const maxMargin = Math.max(0, Math.round((LOGO_CLEARANCE_MAX - logo.size) * 256));
  if (logo.margin > maxMargin) logo.margin = maxMargin;

  const sizeInput = $('#designPanel [data-path="logo.size"]');
  if (sizeInput) {
    sizeInput.value = Math.round(logo.size * 100);
    updateRangeLabel(sizeInput);
  }
  syncLogoMarginLimit();
  syncLogoSizeLimit();
  const levelSelect = $("#ecLevel");
  if (levelSelect) levelSelect.value = "H";
}

/** El logotipo fuera del QR no necesita hueco ni margen: no tapa módulos. */
function isLogoInBand() {
  const position = state.design.logo.position || "center";
  return position === "top" || position === "bottom";
}

/** El margen solo tiene sentido con hueco blanco y nunca puede romper la lectura. */
function syncLogoMarginLimit() {
  const inBand = isLogoInBand();
  const clear = $('#designPanel [data-path="logo.clearBackground"]');
  if (clear) {
    clear.disabled = inBand;
    clear.closest(".checkbox")?.classList.toggle("is-disabled", inBand);
  }
  const input = $('#designPanel [data-path="logo.margin"]');
  if (!input) return;
  const hasLogo = Boolean(state.design.logo.src);
  const limit = hasLogo
    ? Math.max(0, Math.round((LOGO_CLEARANCE_MAX - state.design.logo.size) * 256))
    : 30;
  input.max = String(Math.max(0, limit));
  input.disabled = inBand || !hasLogo || !state.design.logo.clearBackground || limit === 0;
  input.closest(".field")?.classList.toggle("is-disabled", input.disabled);
  if (Number(input.value) > limit) input.value = String(limit);
  updateRangeLabel(input);
}

/**
 * El tamaño máximo del logotipo no se recorta a escondidas: se mide con
 * decodificación real y el control se limita a ese valor.
 */
function syncLogoSizeLimit() {
  const slider = $('#designPanel [data-path="logo.size"]');
  const hint = $("#logoSizeHint");
  const inBand = isLogoInBand();
  const capPercent = Math.round(LOGO_SIZE_MAX * 100);
  const maxPercent = inBand ? capPercent : Math.round(state.logoMax * 100);
  if (slider) {
    slider.max = String(maxPercent);
    if (Number(slider.value) > maxPercent) {
      slider.value = String(maxPercent);
      state.design.logo.size = Number(slider.value) / 100;
    }
    updateRangeLabel(slider);
  }
  if (!hint) return;
  if (inBand) {
    hint.textContent = "Fuera del QR: este tamaño no afecta la lectura.";
  } else if (maxPercent < capPercent) {
    hint.textContent = `Máximo con lectura segura: ${maxPercent} %. ` +
      "Para un logotipo más grande, muévelo arriba o debajo del QR.";
  } else {
    hint.textContent = "";
  }
}

/**
 * Busca el tamaño más grande que un lector real sigue decodificando con este
 * contenido. La rejilla del QR es fija, así que lo que se adapta es el máximo.
 */
async function measureMaxLogoSize(content) {
  if (!content || !state.design.logo.src || isLogoInBand()) return LOGO_SIZE_MAX;
  const marginFor = (size) => Math.min(
    state.design.logo.margin,
    Math.max(0, Math.round((LOGO_CLEARANCE_MAX - size) * 256)),
  );
  const probe = async (size) => {
    const draft = {
      ...state.design,
      logo: { ...state.design.logo, size, margin: marginFor(size) },
    };
    const result = await decodeCheck(content, draft);
    // Se exige que el contenido leído sea el del código: si el logotipo lleva
    // su propio QR, el lector puede devolver ese otro contenido.
    return Boolean(result.ok) && decodedMatches(result.decoded, content);
  };

  if (await probe(LOGO_SIZE_MAX)) return LOGO_SIZE_MAX;
  let low = 0.1;
  let high = LOGO_SIZE_MAX;
  let best = 0.1;
  for (let step = 0; step < 6; step += 1) {
    const mid = Math.round(((low + high) / 2) * 100) / 100;
    if (await probe(mid)) {
      best = mid;
      low = mid;
    } else {
      high = mid;
    }
  }
  return Math.max(0.1, best);
}

/** Recalcula el límite solo cuando cambia el contenido o el diseño (no al mover el tamaño). */
async function syncLogoLimit(content) {
  if (!state.design.logo.src) {
    state.logoMax = LOGO_SIZE_MAX;
    state.logoLimitFor = "";
    syncLogoSizeLimit();
    return;
  }
  const signature = `${content}|${JSON.stringify({
    ...state.design,
    logo: { ...state.design.logo, size: 0, margin: 0 },
  })}`;
  if (state.logoLimitFor !== signature) {
    state.logoLimitFor = signature;
    state.logoMax = await measureMaxLogoSize(content);
  }
  if (!isLogoInBand() && state.design.logo.size > state.logoMax + 1e-6) {
    state.design.logo.size = state.logoMax;
    clampLogo();
    renderDesignPanel();
    await updatePreview();
    return;
  }
  syncLogoSizeLimit();
}

function setMode(mode) {
  if (mode === state.mode) return;
  if (mode === "sencillo") {
    state.fullDesign = cloneDesign(state.design);
    state.design = simpleDesign();
    state.presetId = null;
  } else {
    const carry = {
      logo: { ...state.design.logo },
      quietZone: state.design.quietZone,
      background: { ...state.design.background },
    };
    state.design = state.fullDesign ? normalizeDesign(state.fullDesign) : normalizeDesign(DEFAULT_DESIGN);
    state.design.logo = carry.logo;
    state.design.quietZone = carry.quietZone;
    state.design.background = carry.background;
  }
  state.mode = mode;
  try { localStorage.setItem("qr-mode", mode); } catch (_error) { /* sin almacenamiento */ }
  renderDesignPanel();
  syncInspector();
  updatePreview();
  toast(mode === "sencillo" ? "Modo sencillo: QR negro con logo opcional" : "Modo completo activado");
}

function applyColor(color) {
  if (!HEX_RE.test(color)) return;
  ["modules", "eyeFrame", "eyeBall"].forEach((key) => {
    state.design[key].fill.type = "solid";
    state.design[key].fill.color = color;
  });
  syncColorInputs();
  schedulePreview();
}

function syncColorInputs() {
  syncFillEditors();
  const custom = $("#paletteCustom");
  if (custom) custom.value = state.design.modules.fill.color;
  const current = state.design.modules.fill.color.toLowerCase();
  $$("[data-color]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.color.toLowerCase() === current);
  });
}

function applyPayloadVisibility() {
  const box = $("#previewPayload");
  if (!box) return;
  box.classList.toggle("hidden", !state.showPayload);
  const button = $("#togglePayload");
  if (!button) return;
  const label = button.querySelector("span");
  if (label) label.textContent = state.showPayload ? "Ocultar contenido" : "Ver contenido";
  const use = button.querySelector("use");
  if (use) use.setAttribute("href", state.showPayload ? "#i-x" : "#i-eye");
}

function syncInspector() {
  const margin = $("#marginSelect");
  if (margin) margin.value = String(state.design.quietZone);
  const transparent = $("#transparentToggle");
  if (transparent) transparent.checked = state.design.background.transparent;
  $$('#designPanel [data-path="background.transparent"]').forEach((node) => {
    node.checked = state.design.background.transparent;
  });
  $("[data-bg]")?.classList.toggle("hidden", state.design.background.transparent);
  applyPayloadVisibility();
}

function syncQuietZone() {
  const slider = $('#designPanel [data-path="quietZone"]');
  if (slider) {
    slider.value = state.design.quietZone;
    const label = slider.parentElement.querySelector(".range-value");
    if (label) label.textContent = state.design.quietZone;
  }
  const margin = $("#marginSelect");
  if (margin) margin.value = String(state.design.quietZone);
}

function getPath(object, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((acc, key) => (acc[key] = acc[key] || {}), object);
  target[last] = value;
}

function bindDesignEvents() {
  const panel = $("#designPanel");

  panel.addEventListener("input", (event) => {
    const target = event.target;
    if (target.id === "logoInput") return;
    if (target.dataset.paletteCustom !== undefined) {
      applyColor(target.value);
      return;
    }
    const path = target.dataset.path;
    if (!path) return;

    if (target.dataset.colorText !== undefined) {
      if (!HEX_RE.test(target.value)) return;
    }

    let value;
    if (target.type === "checkbox") value = target.checked;
    else if (target.type === "range") value = Number(target.value) * (Number(target.dataset.scale) || 1);
    else value = target.value;

    setPath(state.design, path, value);
    if (target.type === "range") updateRangeLabel(target);
    if (path.startsWith("logo.")) {
      state.fitFor = "";
      clampLogo();
    } else if (state.design.logo.src && state.design.errorCorrection !== "H") {
      state.design.errorCorrection = "H";
      const levelSelect = $("#ecLevel");
      if (levelSelect) levelSelect.value = "H";
    }
    if (path.startsWith("modules") || path.startsWith("eyeFrame") || path.startsWith("eyeBall")) {
      syncFillEditors();
    }
    if (path === "background.transparent" || path === "background.color") {
      $("[data-bg]")?.classList.toggle("hidden", state.design.background.transparent);
      const exportToggle = $("#transparentToggle");
      if (exportToggle) exportToggle.checked = state.design.background.transparent;
    }
    if (path === "quietZone") syncQuietZone();
    schedulePreview();
  });

  panel.addEventListener("change", (event) => {
    const target = event.target;
    if (target.dataset.colorText !== undefined && !HEX_RE.test(target.value)) {
      target.value = getPath(state.design, target.dataset.path);
    }
    if (target.id === "logoInput" && target.files?.[0]) {
      applyLogo(target.files[0]);
    }
  });

  panel.addEventListener("click", (event) => {
    if (event.target.closest("[data-save-template]")) {
      saveAsTemplate();
      return;
    }
    const swatch = event.target.closest("[data-color]");
    if (swatch) {
      applyColor(swatch.dataset.color);
      return;
    }
    const preset = event.target.closest("[data-preset]");
    if (preset) {
      applyPreset(preset.dataset.preset);
      return;
    }
    const fillButton = event.target.closest("[data-filltype] [data-value]");
    if (fillButton) {
      const prefix = fillButton.closest("[data-filltype]").dataset.filltype;
      state.design[prefix].fill.type = fillButton.dataset.value;
      syncFillEditors();
      schedulePreview();
      return;
    }
    const shapeButton = event.target.closest("[data-shapes-for]");
    if (shapeButton) {
      const prefix = shapeButton.dataset.shapesFor;
      state.design[prefix].shape = shapeButton.dataset.shape;
      $$(`[data-shapes-for="${prefix}"]`).forEach((node) => {
        node.classList.toggle("is-active", node === shapeButton);
      });
      schedulePreview();
      return;
    }
    if (event.target.closest("#removeLogo")) {
      state.design.logo.src = "";
      state.logoQr = "";
      state.logoLimitFor = "";
      renderDesignPanel();
      updatePreview();
    }
  });
}

function syncFillEditors() {
  $$("[data-filltype]").forEach((group) => {
    const prefix = group.dataset.filltype;
    const type = state.design[prefix].fill.type;
    group.querySelectorAll("[data-value]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.value === type);
    });
    const solid = $(`[data-solid="${prefix}"]`);
    const gradient = $$(`[data-gradient="${prefix}"]`);
    solid?.classList.toggle("hidden", type !== "solid");
    gradient.forEach((node) => node.classList.toggle("hidden", type === "solid"));
    const colorInput = solid?.querySelector('[data-path$=".fill.color"]');
    if (colorInput) colorInput.value = state.design[prefix].fill.color;
    const textInput = solid?.querySelector("[data-color-text]");
    if (textInput) textInput.value = state.design[prefix].fill.color;
    gradient.forEach((node) => {
      node.querySelectorAll("[data-path]").forEach((input) => {
        const path = input.dataset.path;
        if (input.type === "range") input.value = getPath(state.design, path);
        else input.value = getPath(state.design, path);
      });
    });
  });
}

function applyPreset(presetId) {
  const preset = state.presets.find((item) => item.id === presetId);
  if (!preset) return;
  state.presetId = presetId;
  state.design = normalizeDesign(preset.design);
  renderDesignPanel();
  updatePreview();
  toast(`Plantilla «${preset.name}» aplicada`);
}

async function saveAsTemplate() {
  const name = await promptDialog({
    title: "Guardar como plantilla",
    label: "Nombre de la plantilla",
    placeholder: "Mi diseño de marca",
    confirmText: "Guardar plantilla",
  });
  if (!name) return;
  const custom = readStore(CUSTOM_PRESETS_KEY, []);
  const preset = {
    id: `custom-${Date.now().toString(36)}`,
    name,
    description: "Plantilla personalizada guardada en este navegador.",
    tags: ["personalizada"],
    design: cloneDesign(state.design),
  };
  custom.push(preset);
  writeStore(CUSTOM_PRESETS_KEY, custom);
  state.presets = [...state.presets, preset];
  state.presetId = preset.id;
  renderDesignPanel();
  toast(`Plantilla «${name}» guardada`);
}

async function applyLogo(file) {
  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    toast("Usa una imagen PNG, JPG o WebP (no SVG ni GIF)", "bad");
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    toast("La imagen supera 4 MB; usa una versión más ligera", "bad");
    return;
  }
  try {
    const dataUrl = await optimizeImage(file);
    state.design.logo.src = dataUrl;
    state.fitFor = "";
    state.logoQr = await detectLogoQr(dataUrl);
    state.logoMax = LOGO_SIZE_MAX;
    state.logoLimitFor = "";
    // Un logotipo oscuro sobre los módulos negros se ve como una mancha:
    // en ese caso se coloca fuera del código por defecto.
    const dark = await isDarkLogo(dataUrl);
    state.design.logo.position = dark ? "bottom" : "center";
    clampLogo();
    renderDesignPanel();
    updatePreview();
    toast(dark
      ? "Logotipo oscuro: se colocó debajo del código para que se vea nítido"
      : "Logotipo añadido: proporción, tamaño y margen ajustados");
  } catch (error) {
    toast("No se pudo procesar la imagen", "bad");
  }
}

/** Si el propio logotipo es un QR, se avisa: al escanear puede leerse ese otro contenido. */
function detectLogoQr(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve("");
    image.onload = () => {
      if (typeof jsQR !== "function") {
        resolve("");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 512, 512);
      ctx.drawImage(image, 0, 0, 512, 512);
      const pixels = ctx.getImageData(0, 0, 512, 512);
      const found = jsQR(pixels.data, 512, 512, { inversionAttempts: "attemptBoth" });
      resolve(found ? found.data : "");
    };
    image.src = src;
  });
}

/**
 * Detecta logotipos cuyo contenido es oscuro (se verían como una mancha sobre
 * los módulos negros). Usa la mediana de la luminancia para ignorar halos y
 * sombras, y separa el fondo de la imagen cuando no tiene transparencia.
 */
function isDarkLogo(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onerror = () => resolve(false);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image, 0, 0, 96, 96);
      const data = ctx.getImageData(0, 0, 96, 96).data;
      const bg = [data[0], data[1], data[2]];
      const opaque = [];
      const content = [];
      let transparent = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 60) {
          transparent += 1;
          continue;
        }
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        opaque.push(lum);
        const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1])
          + Math.abs(data[i + 2] - bg[2]);
        if (diff > 65) content.push(lum);
      }
      const total = data.length / 4;
      const sample = (transparent / total > 0.2 || content.length < 24) ? opaque : content;
      if (!sample.length) {
        resolve(false);
        return;
      }
      sample.sort((a, b) => a - b);
      resolve(sample[Math.floor((sample.length - 1) / 2)] < 110);
    };
    image.src = src;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("lectura"));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("imagen"));
    image.onload = () => resolve(image);
    image.src = src;
  });
}

async function optimizeImage(file, maxSide = 512) {
  const original = await readFileAsDataUrl(file);
  const image = await loadImageElement(original);

  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  // PNG/WebP conservan transparencia; JPG se reencode como JPEG (más ligero).
  const keepAlpha = file.type !== "image/jpeg";
  let output = keepAlpha
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", 0.92);

  // Si el resultado es muy pesado, se aplana sobre blanco y se comprime.
  if (output.length > 700000) {
    const flat = document.createElement("canvas");
    flat.width = canvas.width;
    flat.height = canvas.height;
    const flatCtx = flat.getContext("2d");
    flatCtx.fillStyle = "#ffffff";
    flatCtx.fillRect(0, 0, flat.width, flat.height);
    flatCtx.drawImage(canvas, 0, 0);
    output = flat.toDataURL("image/jpeg", 0.82);
  }
  return output;
}

/* ---------- Carpetas y guardado ---------- */

function payloadData() {
  return {
    type: state.typeId,
    fields: state.values,
    design: state.design,
    preset_id: state.presetId,
    name: $("#codeName").value.trim(),
    folder_id: state.folderId || null,
    expires_at: state.expires || null,
    is_dynamic: $("#dynamicToggle").checked,
  };
}

async function save() {
  const button = $("#saveBtn");
  const type = currentType();
  const built = buildPayload(type, state.values);
  if (Object.keys(built.errors).length) {
    state.errors = built.errors;
    renderErrors();
    toast("Revisa los campos marcados en rojo", "bad");
    return;
  }
  setBusy(button, true, "Guardando…");
  try {
    if (state.editId) {
      await api(`/api/codigos/${state.editId}`, { method: "PUT", body: payloadData() });
      toast("Cambios guardados");
      setBusy(button, false);
    } else {
      const data = await api("/api/codigos", { method: "POST", body: payloadData() });
      toast("Código guardado en Mis códigos");
      setBusy(button, false);
      setTimeout(() => { window.location.href = "/mis-codigos"; }, 700);
      state.editId = data.code.id;
    }
  } catch (error) {
    setBusy(button, false);
    if (error.errors) {
      state.errors = error.errors;
      renderErrors();
      toast(error.firstMessage(), "bad");
    } else {
      toast("No se pudo guardar el código", "bad");
    }
  }
}

async function download() {
  const button = $("#downloadBtn");
  const type = currentType();
  const built = buildPayload(type, state.values);
  if (Object.keys(built.errors).length) {
    state.errors = built.errors;
    renderErrors();
    toast("Completa el formulario antes de descargar", "bad");
    return;
  }
  const format = $("#formatSelect").value;
  const size = Number($("#sizeSelect").value);
  const transparent = $("#transparentToggle").checked;
  setBusy(button, true, "Generando…");
  try {
    const blob = await exportBlob({
      content: built.content,
      design: state.design,
      name: $("#codeName").value.trim() || type.label,
      format, size, transparent,
    });
    const extension = format === "jpg" ? "jpg" : format;
    downloadBlob(blob, slugFilename($("#codeName").value.trim() || type.label, extension));
    toast(`Archivo ${extension.toUpperCase()} descargado`);
  } catch (error) {
    console.error(error);
    toast("No se pudo exportar el archivo", "bad");
  } finally {
    setBusy(button, false);
  }
}

/* ---------- Eventos de la página ---------- */

function bindPageEvents() {
  bindFormEvents();
  bindDesignEvents();

  $$('input[name="qrMode"]').forEach((radio) => {
    radio.addEventListener("change", (event) => {
      if (event.target.checked) setMode(event.target.value);
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".hint-btn");
    $$(".hint.is-open").forEach((node) => {
      if (!button || node !== button.parentElement) node.classList.remove("is-open");
    });
    if (button) button.parentElement.classList.toggle("is-open");
  });

  $("#dynamicToggle").addEventListener("change", (event) => {
    state.dynamic = event.target.checked;
    updatePreview();
  });

  $("#togglePayload").addEventListener("click", () => {
    state.showPayload = !state.showPayload;
    try {
      localStorage.setItem("qr-show-payload", state.showPayload ? "1" : "0");
    } catch (_error) { /* sin almacenamiento */ }
    applyPayloadVisibility();
  });

  $("#marginSelect").addEventListener("change", (event) => {
    state.design.quietZone = Number(event.target.value) || 0;
    syncQuietZone();
    schedulePreview();
  });

  $("#transparentToggle").addEventListener("change", (event) => {
    state.design.background.transparent = event.target.checked;
    syncInspector();
    schedulePreview();
  });

  $("#previewSizes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-size]");
    if (!button) return;
    state.previewSize = Number(button.dataset.size);
    $$("#previewSizes button").forEach((node) => node.classList.toggle("is-active", node === button));
    const canvas = $("#previewCanvas");
    if (!canvas.classList.contains("hidden")) canvas.style.width = `${state.previewSize}px`;
  });

  $("#saveBtn").addEventListener("click", save);
  $("#downloadBtn").addEventListener("click", download);
  $("#resetBtn").addEventListener("click", () => {
    state.design = normalizeDesign(DEFAULT_DESIGN);
    state.presetId = null;
    renderDesignPanel();
    updatePreview();
    toast("Diseño restablecido");
  });

  $("#formatSelect").addEventListener("change", (event) => {
    const pdf = event.target.value === "pdf";
    $("#sizeSelect").disabled = pdf;
  });
}

boot();
