// Gráficas ligeras en SVG/canvas sin dependencias externas.

import { escapeHtml } from "./ui.js";

export function lineChart(host, series, { height = 190, color = "#2563eb", formatLabel = null } = {}) {
  if (!host) return;
  if (!series || !series.length) {
    host.innerHTML = '<p class="muted small">Sin datos todavía.</p>';
    return;
  }
  const width = 760;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...series.map((item) => item.total));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;

  const points = series.map((item, index) => {
    const x = padL + index * stepX;
    const y = padT + innerH - (item.total / max) * innerH;
    return { x, y, total: item.total, day: item.day };
  });

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${padT + innerH} L${points[0].x.toFixed(1)},${padT + innerH} Z`;

  const gridLines = [0, 0.5, 1].map((ratio) => {
    const y = padT + innerH - ratio * innerH;
    return `<line x1="${padL}" y1="${y}" x2="${width - padR}" y2="${y}" stroke="var(--border)" stroke-width="1" stroke-dasharray="${ratio === 0 ? "0" : "3 4"}"/>`
      + `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${Math.round(max * ratio)}</text>`;
  }).join("");

  const labelEvery = Math.max(1, Math.ceil(points.length / 6));
  const xLabels = points.map((point, index) => {
    if (index % labelEvery !== 0 && index !== points.length - 1) return "";
    const [, month, day] = point.day.split("-");
    const text = formatLabel ? formatLabel(point.day) : `${day}/${month}`;
    return `<text x="${point.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--muted)">${text}</text>`;
  }).join("");

  const dots = points.map((point) => point.total > 0
    ? `<circle cx="${point.x}" cy="${point.y}" r="2.6" fill="${color}"/>`
    : "").join("");

  host.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Escaneos por día">
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".28"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      <path d="${area}" fill="url(#chartFill)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
    </svg>`;

  host.querySelectorAll("circle").forEach((circle, index) => {
    const point = points.filter((item) => item.total > 0)[index];
    if (!point) return;
    circle.innerHTML = `<title>${point.day}: ${point.total}</title>`;
  });
}

export function aggregate(series, mode = "day") {
  if (mode === "day" || !series?.length) return series;
  const buckets = new Map();
  series.forEach((item) => {
    let key = item.day;
    if (mode === "week") {
      const date = new Date(`${item.day}T00:00:00`);
      const weekday = (date.getDay() + 6) % 7; // lunes = 0
      date.setDate(date.getDate() - weekday);
      key = date.toISOString().slice(0, 10);
    } else if (mode === "month") {
      key = `${item.day.slice(0, 7)}-01`;
    }
    buckets.set(key, (buckets.get(key) || 0) + item.total);
  });
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, total]) => ({ day, total }));
}

export function barList(host, data, { color = "var(--primary)" } = {}) {
  if (!host) return;
  const entries = Object.entries(data || {});
  if (!entries.length) {
    host.innerHTML = '<p class="muted small">Sin datos en este período.</p>';
    return;
  }
  const total = entries.reduce((sum, [, value]) => sum + value, 0) || 1;
  const max = Math.max(...entries.map(([, value]) => value));
  host.innerHTML = entries.slice(0, 6).map(([label, value]) => `
    <div class="bar-row">
      <span title="${escapeHtml(label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round((value / max) * 100)}%;background:${color}"></span></span>
      <span class="bar-value">${Math.round((value / total) * 100)}%</span>
    </div>`).join("");
}
