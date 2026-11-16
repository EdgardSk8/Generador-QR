// Panel: métricas generales, actividad reciente y códigos recientes.

import { $, api, escapeHtml, formatDate, formatNumber, toast } from "../core/ui.js";
import { lineChart } from "../core/chart.js";
import { codeCardHtml, paintThumbnails } from "../core/codecard.js";

function statCard(icon, label, value, hint) {
  return `
    <div class="stat">
      <div class="stat-top">
        <span class="stat-badge"><svg class="icon icon-sm"><use href="#i-${icon}"/></svg></span>
        <span>${escapeHtml(label)}</span>
      </div>
      <div class="stat-value">${escapeHtml(String(value))}</div>
      <div class="stat-hint">${escapeHtml(hint)}</div>
    </div>`;
}

async function boot() {
  let data;
  try {
    data = await api("/api/resumen");
  } catch (_error) {
    toast("No se pudo cargar el resumen", "bad");
    return;
  }

  const { counts, scans, recent_codes: recentCodes, recent_scans: recentScans } = data;

  $("#statCards").innerHTML = [
    statCard("qr", "Códigos creados", formatNumber(counts.total),
      counts.total ? "Todos tus códigos guardados" : "Crea tu primer código"),
    statCard("link", "Dinámicos", formatNumber(counts.dynamic),
      "URL corta editable"),
    statCard("grid", "Estáticos", formatNumber(counts.static),
      "Contenido dentro del QR"),
    statCard("chart", "Escaneos totales", formatNumber(scans.total),
      `${formatNumber(scans.period_total)} en los últimos 14 días`),
  ].join("");

  lineChart($("#activityChart"), scans.series);
  $("#scansTotal").textContent = `${formatNumber(scans.total)} escaneos`;

  const host = $("#recentCodes");
  if (!recentCodes.length) {
    host.innerHTML = `
      <div class="empty" style="grid-column:1/-1">
        <svg class="icon"><use href="#i-qr"/></svg>
        <h3>Aún no hay códigos</h3>
        <p>Crea un código QR para empezar a ver estadísticas y administrarlo.</p>
        <a class="btn btn-primary" href="/crear">Crear código QR</a>
      </div>`;
  } else {
    host.innerHTML = recentCodes.map(codeCardHtml).join("");
    paintThumbnails(host, recentCodes);
  }

  const scansHost = $("#recentScans");
  if (!recentScans.length) {
    scansHost.innerHTML = '<p class="muted small">Todavía no se han registrado escaneos. Comparte un QR dinámico para empezar.</p>';
  } else {
    scansHost.innerHTML = `
      <table class="table">
        <thead><tr><th>Código</th><th>Fecha</th><th>Dispositivo</th><th>Navegador</th><th>País</th></tr></thead>
        <tbody>
          ${recentScans.map((scan) => `
            <tr>
              <td><a href="/estadisticas/${scan.id}">${escapeHtml(scan.name)}</a></td>
              <td class="nowrap">${formatDate(scan.scanned_at, true)}</td>
              <td>${escapeHtml(scan.device || "—")}</td>
              <td>${escapeHtml(scan.browser || "—")}</td>
              <td>${escapeHtml(scan.country || "—")}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }
}

boot();
