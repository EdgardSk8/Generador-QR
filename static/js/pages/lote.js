// Generación masiva: CSV -> un QR por fila -> ZIP con todos los archivos.

import {
  $, api, downloadBlob, escapeHtml, formatNumber, setBusy, toast,
} from "../core/ui.js";
import { buildPayload, loadCatalog, typeById } from "../core/payload.js";
import { DEFAULT_DESIGN, normalizeDesign } from "../core/design.js";
import { exportBlob, zipSafeName } from "../core/renderer.js";

let catalog = null;
let presets = [];
let rows = [];
let lastValidation = [];

/* ---------- CSV ---------- */

function detectDelimiter(line) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char in counts) counts[char] += 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsv(text) {
  const source = text.replace(/^\uFEFF/, "");
  const firstLine = source.split(/\r?\n/)[0] || "";
  const delimiter = detectDelimiter(firstLine);
  const result = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      result.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    result.push(row);
  }
  return result.filter((item) => item.some((value) => String(value).trim() !== ""));
}

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function mapRows(table) {
  const type = typeById(catalog, $("#bulkType").value);
  if (!type || table.length < 2) return [];
  const header = table[0].map(normalizeKey);
  const aliases = new Map();
  type.fields.forEach((field) => {
    aliases.set(normalizeKey(field.name), field.name);
    aliases.set(normalizeKey(field.label), field.name);
  });
  aliases.set("nombre", "nombre");
  aliases.set("name", "nombre");
  aliases.set("titulo", "nombre");

  return table.slice(1, 501).map((cells) => {
    const record = { campos: {}, nombre: "" };
    header.forEach((key, index) => {
      const field = aliases.get(key);
      if (!field) return;
      const value = String(cells[index] ?? "").trim();
      if (field === "nombre") record.nombre = value;
      else record.campos[field] = value;
    });
    return record;
  });
}

/* ---------- Interfaz ---------- */

function fillTypeSelect() {
  const select = $("#bulkType");
  const usable = catalog.types.filter((type) => !type.hidden
    && !(type.fields || []).some((field) => field.type === "repeater"));
  select.innerHTML = usable.map((type) => `<option value="${type.id}">${escapeHtml(type.label)}</option>`).join("");
  select.value = "url";
}

function updateFieldsHelp() {
  const type = typeById(catalog, $("#bulkType").value);
  const columns = ["nombre", ...type.fields.map((field) => field.name)];
  $("#bulkFieldsHelp").textContent = `Columnas del CSV: ${columns.join(", ")}`;
  const hosted = Boolean(type.hosted);
  if (hosted) {
    $("#saveToggle").checked = true;
    $("#saveToggle").disabled = true;
  } else {
    $("#saveToggle").disabled = false;
  }
}

function validateRows() {
  const type = typeById(catalog, $("#bulkType").value);
  lastValidation = rows.map((row) => buildPayload(type, row.campos));
  const valid = lastValidation.filter((item) => !Object.keys(item.errors).length).length;

  $("#validCount").textContent = `${valid} de ${rows.length} filas válidas`;
  $("#generateBtn").disabled = valid === 0;

  const previewKeys = type.fields.slice(0, 2).map((field) => field.name);
  $("#bulkTable").innerHTML = `
    <table class="table">
      <thead>
        <tr><th>#</th><th>Nombre</th>${previewKeys.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}<th>Estado</th></tr>
      </thead>
      <tbody>
        ${rows.slice(0, 100).map((row, index) => {
          const result = lastValidation[index];
          const errors = Object.values(result.errors);
          return `<tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(row.nombre || "—")}</td>
            ${previewKeys.map((key) => `<td>${escapeHtml(String(row.campos[key] || "").slice(0, 60))}</td>`).join("")}
            <td>${errors.length
              ? `<span class="badge badge-danger">${escapeHtml(errors[0])}</span>`
              : '<span class="badge badge-success">Listo</span>'}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    ${rows.length > 100 ? `<p class="small muted" style="margin-top:8px">Mostrando las primeras 100 filas de ${formatNumber(rows.length)}.</p>` : ""}`;
}

async function handleFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast("El archivo supera 2 MB", "bad");
    return;
  }
  const text = await file.text();
  const table = parseCsv(text);
  if (table.length < 2) {
    toast("El CSV necesita una cabecera y al menos una fila", "bad");
    return;
  }
  rows = mapRows(table);
  $("#csvSummary").classList.remove("hidden");
  $("#csvName").textContent = file.name;
  $("#csvRows").textContent = `${formatNumber(rows.length)} filas`;
  validateRows();
  toast(`${formatNumber(rows.length)} filas cargadas`);
}

/* ---------- Generación ---------- */

function selectedDesign() {
  const preset = presets.find((item) => item.id === $("#templateSelect").value);
  return preset ? normalizeDesign(preset.design) : normalizeDesign(DEFAULT_DESIGN);
}

async function generate() {
  const type = typeById(catalog, $("#bulkType").value);
  const save = $("#saveToggle").checked || Boolean(type.hosted);
  const format = $("#bulkFormat").value;
  const design = selectedDesign();
  const button = $("#generateBtn");
  const progressWrap = $("#progressWrap");
  const progressBar = $("#progressBar");
  const label = $("#progressLabel");

  const validRows = rows.filter((row, index) => {
    const errors = lastValidation[index]?.errors;
    return !errors || !Object.keys(errors).length;
  });
  if (!validRows.length) {
    toast("No hay filas válidas para generar", "bad");
    return;
  }

  setBusy(button, true, "Generando…");
  progressWrap.classList.remove("hidden");
  $("#bulkErrors").innerHTML = "";

  try {
    let items = [];
    if (save) {
      const response = await api("/api/lote/crear", {
        method: "POST",
        body: {
          tipo: type.id,
          filas: validRows.map((row) => ({ nombre: row.nombre, ...row.campos })),
          guardar: true,
          design,
          preset_id: $("#templateSelect").value || null,
        },
      });
      items = response.creados;
      if (response.errores.length) {
        $("#bulkErrors").innerHTML = response.errores.map((error) => `
          <div class="check-item bad">
            <svg class="icon icon-sm"><use href="#i-alert"/></svg>
            <span>Fila ${error.fila}: ${escapeHtml(Object.values(error.errores).join(" · "))}</span>
          </div>`).join("");
      }
    } else {
      items = validRows.map((row) => {
        const built = buildPayload(type, row.campos);
        return { name: row.nombre || type.label, content: built.content };
      });
    }

    if (!items.length) {
      toast("No se generó ningún código", "bad");
      return;
    }

    const zip = new JSZip();
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const blob = await exportBlob({
        content: item.content,
        design,
        name: item.name,
        format,
        size: 1024,
      });
      zip.file(zipSafeName(item.name, index, format), blob);
      const percent = Math.round(((index + 1) / items.length) * 90);
      progressBar.style.width = `${percent}%`;
      label.textContent = `Generando ${index + 1} de ${items.length}…`;
      if (index % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    label.textContent = "Comprimiendo ZIP…";
    const zipBlob = await zip.generateAsync({ type: "blob" }, (meta) => {
      progressBar.style.width = `${90 + Math.round(meta.percent / 10)}%`;
    });
    downloadBlob(zipBlob, `codigos-qr-${new Date().toISOString().slice(0, 10)}.zip`);
    progressBar.style.width = "100%";
    label.textContent = `Listo: ${items.length} códigos en el ZIP`;
    toast(`ZIP generado con ${items.length} códigos`);
    if (save) {
      setTimeout(() => { window.location.href = "/mis-codigos"; }, 1200);
    }
  } catch (error) {
    console.error(error);
    toast(error.errors ? Object.values(error.errors)[0] : "No se pudo generar el lote", "bad");
    label.textContent = "Error al generar el lote";
  } finally {
    setBusy(button, false);
  }
}

function sampleCsv() {
  const type = typeById(catalog, $("#bulkType").value);
  const columns = ["nombre", ...type.fields.map((field) => field.name)];
  const example = ["Ejemplo 1", ...type.fields.map((field) => field.placeholder || "Valor")];
  const csv = `${columns.join(",")}\n${example.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")}\n`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `ejemplo-${type.id}.csv`);
}

/* ---------- Arranque ---------- */

async function init() {
  try {
    catalog = await loadCatalog();
    presets = (await api("/api/plantillas")).presets;
  } catch (_error) {
    toast("No se pudo cargar la configuración", "bad");
    return;
  }

  fillTypeSelect();
  updateFieldsHelp();

  $("#templateSelect").innerHTML = '<option value="">Diseño predeterminado</option>'
    + presets.map((preset) => `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`).join("");

  $("#bulkType").addEventListener("change", () => {
    updateFieldsHelp();
    if (rows.length) validateRows();
  });

  const dropzone = $("#dropzone");
  const input = $("#csvInput");
  dropzone.addEventListener("click", () => input.click());
  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") input.click();
  });
  ["dragenter", "dragover"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.remove("is-over");
    });
  });
  dropzone.addEventListener("drop", (event) => {
    handleFile(event.dataTransfer?.files?.[0]);
  });
  input.addEventListener("change", () => handleFile(input.files?.[0]));

  $("#generateBtn").addEventListener("click", generate);
  $("#sampleBtn").addEventListener("click", sampleCsv);
}

init();
