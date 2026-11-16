// Estadísticas: gráficas, desgloses y listado de códigos.

import { $, $$, api, escapeHtml, formatDate, formatNumber, toast } from "../core/ui.js";
import { aggregate, barList, lineChart } from "../core/chart.js";

const pathParts = window.location.pathname.split("/").filter(Boolean);
const initialCode = Number(pathParts[pathParts.length - 1]) || "";
let days = 30;
let group = "day";
let codes = [];

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

async function loadCodes() {
  try {
    const data = await api("/api/codigos");
    codes = data.codes;
  } catch (_error) {
    codes = [];
  }
  const select = $("#codeSelect");
  select.innerHTML = '<option value="">Todos los códigos</option>' + codes.map((code) => `
    <option value="${code.id}" ${String(code.id) === String(initialCode) ? "selected" : ""}>
      ${escapeHtml(code.name)}
    </option>`).join("");
}

async function loadStats() {
  const codeId = $("#codeSelect").value;
  const query = new URLSearchParams({ dias: String(days) });
  if (codeId) query.set("codigo", codeId);

  let data;
  try {
    data = await api(`/api/estadisticas?${query.toString()}`);
  } catch (_error) {
    toast("No se pudieron cargar las estadísticas", "bad");
    return;
  }
  const stats = data.stats;

  $("#statsRange").textContent = `${formatDate(stats.since)} → hoy`;
  $("#statsCards").innerHTML = [
    statCard("chart", "Escaneos en el período", formatNumber(stats.period_total),
      `${formatNumber(stats.total)} en total`),
    statCard("panel", "Promedio diario", stats.daily_average,
      `${stats.active_days} días con actividad`),
    statCard("star", "Mejor día", formatNumber(stats.peak.total),
      stats.peak.day ? formatDate(stats.peak.day) : "—"),
    statCard("clock", "Último escaneo", stats.last_scan ? formatDate(stats.last_scan, true) : "—",
      data.code ? data.code.name : "Todos los códigos"),
  ].join("");

  const series = aggregate(stats.series, group);
  const labelFor = group === "month"
    ? (day) => `${day.slice(5, 7)}/${day.slice(0, 4)}`
    : (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  lineChart($("#statsChart"), series, { formatLabel: labelFor });
  barList($("#deviceBars"), stats.device);
  barList($("#osBars"), stats.os, { color: "#7c3aed" });
  barList($("#browserBars"), stats.browser, { color: "#0891b2" });
  barList($("#countryBars"), stats.country, { color: "#059669" });

  renderCodeTable(data.code ? [data.code] : codes);
}

function renderCodeTable(list) {
  const host = $("#codeStatsTable");
  if (!list.length) {
    host.innerHTML = '<p class="muted small">Todavía no hay códigos guardados.</p>';
    return;
  }
  host.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Nombre</th><th>Tipo</th><th>Modo</th><th>Creado</th><th></th></tr>
      </thead>
      <tbody>
        ${list.slice(0, 20).map((code) => `
          <tr>
            <td>${escapeHtml(code.name)}</td>
            <td>${escapeHtml(code.type_label || code.qr_type)}</td>
            <td>${code.is_dynamic
              ? '<span class="badge badge-success">Dinámico</span>'
              : '<span class="badge">Estático</span>'}</td>
            <td class="nowrap">${formatDate(code.created_at)}</td>
            <td class="nowrap"><a href="/estadisticas/${code.id}">Ver estadísticas</a></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

async function init() {
  await loadCodes();
  $("#codeSelect").addEventListener("change", loadStats);
  $("#rangeSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-days]");
    if (!button) return;
    days = Number(button.dataset.days);
    $$("#rangeSwitch button").forEach((node) => node.classList.toggle("is-active", node === button));
    loadStats();
  });
  $("#groupSwitch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-group]");
    if (!button) return;
    group = button.dataset.group;
    $$("#groupSwitch button").forEach((node) => node.classList.toggle("is-active", node === button));
    loadStats();
  });
  await loadStats();
}

init();
