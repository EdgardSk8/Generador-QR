// Mis códigos: listado con búsqueda, filtros, carpetas y acciones.

import {
  $, api, debounce, escapeHtml, promptDialog, toast,
} from "../core/ui.js";
import { loadCatalog } from "../core/payload.js";
import { bindCardActions, codeCardHtml, paintThumbnails } from "../core/codecard.js";

let codes = [];
let catalog = null;

async function reload() {
  const params = new URLSearchParams({
    q: $("#searchInput").value.trim(),
    tipo: $("#typeFilter").value,
    modo: $("#modeFilter").value,
    carpeta: $("#folderFilter").value,
  });
  try {
    const data = await api(`/api/codigos?${params.toString()}`);
    codes = data.codes;
    renderCodes();
    renderFolders(data.folders, data.counts);
  } catch (_error) {
    toast("No se pudieron cargar los códigos", "bad");
  }
}

function renderCodes() {
  const grid = $("#codesGrid");
  const empty = $("#codesEmpty");
  $("#resultCount").textContent = `${codes.length} ${codes.length === 1 ? "código" : "códigos"}`;

  if (!codes.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  grid.innerHTML = codes.map(codeCardHtml).join("");
  paintThumbnails(grid, codes);
}

function renderFolders(folders, counts) {
  const select = $("#folderFilter");
  const current = select.value;
  select.innerHTML = '<option value="">Todas las carpetas</option>' + folders.map((folder) => `
    <option value="${folder.id}">${escapeHtml(folder.name)} (${folder.total})</option>`).join("");
  select.value = current;

  const badge = $("#resultCount");
  if (counts) badge.title = `${counts.dynamic} dinámicos · ${counts.static} estáticos`;
}

function fillTypeFilter() {
  const select = $("#typeFilter");
  const options = catalog.categories.map((category) => {
    const types = catalog.types.filter((type) => type.category === category.id && !type.hidden);
    if (!types.length) return "";
    return `<optgroup label="${escapeHtml(category.label)}">
      ${types.map((type) => `<option value="${type.id}">${escapeHtml(type.label)}</option>`).join("")}
    </optgroup>`;
  }).join("");
  select.innerHTML = '<option value="">Todos los tipos</option>' + options;
}

async function createFolder() {
  const name = await promptDialog({
    title: "Nueva carpeta",
    label: "Nombre de la carpeta",
    placeholder: "Campaña de verano",
    confirmText: "Crear carpeta",
  });
  if (!name) return;
  try {
    await api("/api/carpetas", { method: "POST", body: { name } });
    toast("Carpeta creada");
    reload();
  } catch (error) {
    toast(error.errors?.name || "No se pudo crear la carpeta", "bad");
  }
}

async function init() {
  try {
    catalog = await loadCatalog();
    fillTypeFilter();
  } catch (_error) {
    toast("No se pudo cargar el catálogo de tipos", "bad");
  }

  $("#searchInput").addEventListener("input", debounce(reload, 250));
  ["#typeFilter", "#modeFilter", "#folderFilter"].forEach((selector) => {
    $(selector).addEventListener("change", reload);
  });
  $("#newFolderBtn").addEventListener("click", createFolder);
  bindCardActions($("#codesGrid"), codes, reload);

  await reload();
}

init();
