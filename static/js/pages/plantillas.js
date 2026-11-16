// Plantillas: biblioteca de diseños, favoritos y plantillas personalizadas.

import { $, $$, api, confirmDialog, escapeHtml, readStore, toast, writeStore } from "../core/ui.js";
import { normalizeDesign } from "../core/design.js";
import { drawThumbnail } from "../core/renderer.js";

const FAVORITES_KEY = "qr-favorite-presets";
const CUSTOM_KEY = "qr-custom-presets";
const HANDOFF_KEY = "qr-preset-handoff";
const SAMPLE = "https://plataforma-qr.local/ejemplo";

let presets = [];
let favorites = new Set(readStore(FAVORITES_KEY, []));
let filter = "all";

async function loadPresets() {
  const response = await api("/api/plantillas");
  const custom = readStore(CUSTOM_KEY, []).map((item) => ({ ...item, custom: true }));
  presets = [...response.presets, ...custom];
}

function visiblePresets() {
  if (filter === "favorites") return presets.filter((preset) => favorites.has(preset.id));
  if (filter === "custom") return presets.filter((preset) => preset.custom);
  return presets;
}

function presetCard(preset) {
  const favorite = favorites.has(preset.id);
  return `
    <article class="preset-card" data-preset="${preset.id}">
      <div class="preset-visual" data-preview="${preset.id}"><canvas></canvas></div>
      <div>
        <div class="row-between">
          <h3>${escapeHtml(preset.name)}</h3>
          <button class="icon-btn" type="button" data-favorite="${preset.id}"
                  title="${favorite ? "Quitar de favoritas" : "Añadir a favoritas"}"
                  aria-label="Favorito" style="color:${favorite ? "var(--warning)" : "var(--muted)"}">
            <svg class="icon icon-sm"><use href="#i-star"/></svg>
          </button>
        </div>
        <p class="small muted">${escapeHtml(preset.description || "")}</p>
        <div class="code-tags" style="margin-top:8px">
          ${(preset.tags || []).map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}
          ${preset.custom ? '<span class="badge badge-soft">Personalizada</span>' : ""}
        </div>
      </div>
      <div class="row">
        <button class="btn btn-primary btn-sm" type="button" data-use="${preset.id}">Usar plantilla</button>
        ${preset.custom ? `<button class="btn btn-sm btn-danger" type="button" data-delete="${preset.id}">Eliminar</button>` : ""}
      </div>
    </article>`;
}

async function render() {
  const host = $("#presetGrid");
  const items = visiblePresets();
  if (!items.length) {
    host.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <svg class="icon"><use href="#i-palette"/></svg>
        <h3>No hay plantillas en esta vista</h3>
        <p>${filter === "favorites" ? "Marca plantillas con la estrella para verlas aquí." : "Crea un diseño en el editor y guárdalo como plantilla."}</p>
        <a class="btn btn-primary" href="/crear">Ir al editor</a>
      </div>`;
    return;
  }

  host.innerHTML = items.map(presetCard).join("");
  for (const preset of items) {
    const canvas = host.querySelector(`[data-preview="${preset.id}"] canvas`);
    if (!canvas) continue;
    try {
      await drawThumbnail(canvas, SAMPLE, normalizeDesign(preset.design), 240);
    } catch (_error) { /* sin vista previa */ }
  }
}

function usePreset(id) {
  const preset = presets.find((item) => item.id === id);
  if (!preset) return;
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ id: preset.id, design: preset.design }));
  window.location.href = "/crear";
}

async function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  writeStore(FAVORITES_KEY, [...favorites]);
  await render();
}

async function removeCustom(id) {
  const preset = presets.find((item) => item.id === id);
  const confirmed = await confirmDialog({
    title: "Eliminar plantilla",
    message: `Se eliminará «${preset?.name || "plantilla"}» de este navegador.`,
    confirmText: "Eliminar",
    danger: true,
  });
  if (!confirmed) return;
  const custom = readStore(CUSTOM_KEY, []).filter((item) => item.id !== id);
  writeStore(CUSTOM_KEY, custom);
  presets = presets.filter((item) => item.id !== id);
  toast("Plantilla eliminada");
  await render();
}

async function init() {
  try {
    await loadPresets();
  } catch (_error) {
    toast("No se pudieron cargar las plantillas", "bad");
    return;
  }
  await render();

  $("#presetFilter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.dataset.filter;
    $$("#presetFilter button").forEach((node) => node.classList.toggle("is-active", node === button));
    render();
  });

  $("#presetGrid").addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) {
      toggleFavorite(favorite.dataset.favorite);
      return;
    }
    const use = event.target.closest("[data-use]");
    if (use) {
      usePreset(use.dataset.use);
      return;
    }
    const remove = event.target.closest("[data-delete]");
    if (remove) {
      removeCustom(remove.dataset.delete);
      return;
    }
    const card = event.target.closest("[data-preset]");
    if (card) usePreset(card.dataset.preset);
  });
}

init();
