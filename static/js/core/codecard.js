// Tarjeta reutilizable de código QR para los listados.

import { api, confirmDialog, downloadBlob, escapeHtml, formatDate, slugFilename, toast } from "./ui.js";
import { normalizeDesign } from "./design.js";
import { drawThumbnail, exportBlob } from "./renderer.js";

export function codeCardHtml(code) {
  const badges = [];
  if (code.is_dynamic) badges.push('<span class="badge badge-success">Dinámico</span>');
  else badges.push('<span class="badge">Estático</span>');
  if (code.landing) badges.push('<span class="badge badge-soft">Página alojada</span>');
  if (code.status === "paused") badges.push('<span class="badge badge-warning">Pausado</span>');
  if (code.expired) badges.push('<span class="badge badge-danger">Expirado</span>');

  return `
    <article class="code-card" data-code="${code.id}">
      <div class="code-thumb" data-thumb="${code.id}"><canvas></canvas></div>
      <div class="code-body">
        <div class="code-title">${escapeHtml(code.name)}</div>
        <div class="code-sub">${escapeHtml(code.type_label || code.qr_type)} · ${formatDate(code.created_at)}</div>
        <div class="code-tags">${badges.join("")}</div>
        <div class="code-sub mono" style="word-break:break-all;max-height:34px;overflow:hidden">${escapeHtml(code.content)}</div>
      </div>
      <div class="code-actions">
        <a class="icon-btn" href="/crear?code=${code.id}" title="Editar" aria-label="Editar">
          <svg class="icon icon-sm"><use href="#i-edit"/></svg>
        </a>
        <a class="icon-btn" href="/estadisticas/${code.id}" title="Estadísticas" aria-label="Estadísticas">
          <svg class="icon icon-sm"><use href="#i-chart"/></svg>
        </a>
        <button class="icon-btn" type="button" data-action="duplicate" title="Duplicar" aria-label="Duplicar">
          <svg class="icon icon-sm"><use href="#i-copy"/></svg>
        </button>
        <button class="icon-btn" type="button" data-action="download" title="Descargar PNG" aria-label="Descargar">
          <svg class="icon icon-sm"><use href="#i-download"/></svg>
        </button>
        <span class="spacer"></span>
        <button class="icon-btn" type="button" data-action="delete" title="Eliminar" aria-label="Eliminar">
          <svg class="icon icon-sm"><use href="#i-trash"/></svg>
        </button>
      </div>
    </article>`;
}

export async function paintThumbnails(root, codes) {
  for (const code of codes) {
    const canvas = root.querySelector(`[data-thumb="${code.id}"] canvas`);
    if (!canvas) continue;
    try {
      await drawThumbnail(canvas, code.content, normalizeDesign(code.design), 260);
    } catch (_error) {
      canvas.closest(".code-thumb")?.classList.add("is-broken");
    }
  }
}

export async function bindCardActions(root, codes, onChanged) {
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const card = button.closest("[data-code]");
    if (!card) return;
    const id = Number(card.dataset.code);
    const code = codes.find((item) => item.id === id);
    if (!code) return;

    if (button.dataset.action === "download") {
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner"></span>';
      try {
        const design = normalizeDesign(code.design);
        const blob = await exportBlob({
          content: code.content, design, name: code.name, format: "png", size: 2048,
        });
        downloadBlob(blob, slugFilename(code.name, "png"));
        toast("PNG descargado");
      } catch (_error) {
        toast("No se pudo descargar la imagen", "bad");
      } finally {
        button.disabled = false;
        button.innerHTML = original;
      }
      return;
    }

    if (button.dataset.action === "duplicate") {
      button.disabled = true;
      try {
        await api(`/api/codigos/${id}/duplicar`, { method: "POST", body: {} });
        toast("Código duplicado");
        onChanged?.();
      } catch (_error) {
        toast("No se pudo duplicar", "bad");
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (button.dataset.action === "delete") {
      const confirmed = await confirmDialog({
        title: "Eliminar código",
        message: `Se eliminará «${code.name}» y sus estadísticas. Esta acción no se puede deshacer.`,
        confirmText: "Eliminar",
        danger: true,
      });
      if (!confirmed) return;
      try {
        await api(`/api/codigos/${id}`, { method: "DELETE" });
        toast("Código eliminado");
        onChanged?.();
      } catch (_error) {
        toast("No se pudo eliminar", "bad");
      }
    }
  });
}
