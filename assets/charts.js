import { finishLoading, observeChart } from "./interactions.js";
const NS = "http://www.w3.org/2000/svg";
export const num = (v, digits = 2) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
export const signed = (v, digits = 2) => `${v < 0 ? '−' : v > 0 ? '+' : ''}${num(Math.abs(v), digits)}`;
export const dateLabel = d => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
export function element(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  if (text !== undefined) el.textContent = text;
  return el;
}
export function emptyChart(container, text) {
  finishLoading(container); container.replaceChildren(); const p = document.createElement("p"); p.className = "chart-empty"; p.textContent = text; container.append(p);
}
export function lines(container, series, { title, unit = "%", xTitle = "", xFormat = v => num(v, 0), yFormat = v => num(v, 2), height = 270, xTicks, yFloor = -Infinity } = {}) {
  const valid = series.map(s => ({ ...s, points: s.points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)) })).filter(s => s.points.length);
  if (!valid.length) return emptyChart(container, "Aucune observation exploitable pour ce graphique.");
  const width = Math.max(250, Math.floor(container.clientWidth || 600));
  const margin = { l: 62, r: 22, t: 25, b: 52 };
  const all = valid.flatMap(s => s.points);
  const x0 = Math.min(...all.map(p => p.x)), x1 = Math.max(...all.map(p => p.x));
  const y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
  const padding = Math.max((y1 - y0) * .14, Math.abs(y1) * .01, .0001);
  const yLow = Math.max(yFloor, y0 - padding), yHigh = y1 + padding;
  const x = v => margin.l + (v - x0) / (x1 - x0 || 1) * (width - margin.l - margin.r);
  const y = v => height - margin.b - (v - yLow) / (yHigh - yLow || 1) * (height - margin.t - margin.b);
  const svg = element("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": title });
  svg.append(element("title", {}, title));
  svg.append(element("desc", {}, valid.map(s => `${s.label}, de ${yFormat(s.points[0].y)} à ${yFormat(s.points.at(-1).y)} ${unit}`).join(". ")));
  for (let j = 0; j <= 4; j++) {
    const value = yLow + (yHigh - yLow) * j / 4;
    svg.append(element("line", { class: "grid", x1: margin.l, x2: width - margin.r, y1: y(value), y2: y(value) }));
    svg.append(element("text", { x: margin.l - 8, y: y(value) + 4, "text-anchor": "end" }, yFormat(value)));
  }
  const count = width < 430 ? 3 : 4;
  const ticks = xTicks || [...new Set(Array.from({ length: count }, (_, i) => x0 + (x1 - x0) * i / (count - 1)))];
  ticks.forEach((v, j) => svg.append(element("text", { x: x(v), y: height - 30, "text-anchor": j === 0 ? "start" : j === ticks.length - 1 ? "end" : "middle" }, xFormat(v))));
  svg.append(element("text", { x: margin.l, y: 14 }, unit));
  svg.append(element("text", { x: margin.l + (width - margin.l - margin.r) / 2, y: height - 7, "text-anchor": "middle" }, xTitle));
  valid.forEach(s => {
    svg.append(element("polyline", { points: s.points.map(p => `${x(p.x)},${y(p.y)}`).join(" "), class: s.className || "line-scenario" }));
    if (s.points.length <= 5) s.points.forEach(p => {
      const dot = element("circle", { cx: x(p.x), cy: y(p.y), r: 3.5, class: s.className === "line-observed" ? "" : "dot" });
      if (s.className === "line-observed") dot.setAttribute("fill", "var(--muted)");
      dot.append(element("title", {}, `${s.label} · ${xFormat(p.x)} : ${yFormat(p.y)} ${unit}`)); svg.append(dot);
    });
  });
  const hoverLine = element("line", { x1: 0, x2: 0, y1: margin.t, y2: height - margin.b, class: "grid", visibility: "hidden" });
  svg.append(hoverLine);
  const tooltip = document.createElement('div'); tooltip.className = 'chart-tooltip'; tooltip.hidden = true;
  const dots = valid.map(s => { const dot = element('circle', { r: 5, class: `hover-dot ${s.className || 'line-scenario'}`, visibility: 'hidden' }); svg.append(dot); return dot; });
  const overlay = element('rect', { x: margin.l, y: margin.t, width: width - margin.l - margin.r, height: height - margin.t - margin.b, class: 'hit', tabindex: 0, role: 'group', 'aria-label': `${title}. Utilisez les flèches gauche et droite pour parcourir les points.` });
  let selectedIndex = 0;
  function inspect(value) {
    const nearest = valid.map(s => ({ s, p: s.points.reduce((a, b) => Math.abs(a.x - value) <= Math.abs(b.x - value) ? a : b) }));
    const primary = nearest[0].p, px = x(primary.x);
    selectedIndex = valid[0].points.indexOf(primary);
    tooltip.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = xFormat(primary.x); tooltip.append(heading);
    nearest.forEach(({ s, p }, j) => {
      const row = document.createElement('div'); row.className = `tooltip-row ${s.className || 'line-scenario'}`;
      const label = document.createElement('span'); label.textContent = `${s.label}${p.x !== primary.x ? ` · ${xFormat(p.x)}` : ''}`;
      const amount = document.createElement('b'); amount.textContent = `${yFormat(p.y)} ${unit}`; row.append(label, amount); tooltip.append(row);
      dots[j].setAttribute('cx', x(p.x)); dots[j].setAttribute('cy', y(p.y)); dots[j].setAttribute('visibility', 'visible');
    });
    if (valid.length > 1 && nearest.every(n => n.p.x === primary.x)) {
      const delta = document.createElement('small'); delta.textContent = `Écart ${nearest[1].s.label} − ${nearest[0].s.label} : ${signed(nearest[1].p.y - primary.y)} ${unit}`; tooltip.append(delta);
    }
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(0, Math.min(width - Math.min(320, width), px + 14))}px`; tooltip.style.top = `${margin.t}px`;
    hoverLine.setAttribute('x1', px); hoverLine.setAttribute('x2', px); hoverLine.setAttribute('visibility', 'visible');
    overlay.setAttribute('aria-label', `${title}, ${tooltip.textContent}. Flèches pour parcourir.`);
  }
  function pointer(e) {
    const bounds = svg.getBoundingClientRect();
    const px = Math.max(margin.l, Math.min(width - margin.r, (e.clientX - bounds.left) * width / bounds.width));
    inspect(x0 + (px - margin.l) / (width - margin.l - margin.r) * (x1 - x0));
  }
  function hide() { tooltip.hidden = true; hoverLine.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); }
  overlay.addEventListener('pointermove', pointer); overlay.addEventListener('pointerdown', pointer); overlay.addEventListener('pointerleave', hide);
  overlay.addEventListener('focus', () => inspect(valid[0].points[selectedIndex].x)); overlay.addEventListener('blur', hide);
  overlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') return hide();
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const points = valid[0].points;
    selectedIndex = e.key === 'Home' ? 0 : e.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, selectedIndex + (e.key === 'ArrowRight' ? 1 : -1)));
    inspect(points[selectedIndex].x);
  });
  svg.append(overlay); finishLoading(container); container.replaceChildren(svg, tooltip); observeChart(container);
}

export function bars(container, rows, { unit = "%", digits = 2 } = {}) {
  finishLoading(container); container.replaceChildren();
  const max = Math.max(.01, ...rows.map(r => Math.abs(r.value ?? 0)));
  for (const row of rows) {
    const wrapper = document.createElement("div"); wrapper.className = "market-row";
    const name = document.createElement("span"); name.textContent = row.label;
    if (row.detail) { const small = document.createElement("small"); small.textContent = row.detail; name.append(small); }
    const track = document.createElement("div"); track.className = "market-track";
    const zero = document.createElement("span"); zero.className = "market-zero"; track.append(zero);
    const value = document.createElement("span"); value.className = "market-number";
    if (Number.isFinite(row.value)) {
      const fill = document.createElement("span"); fill.className = `market-fill ${row.value < 0 ? 'loss' : 'gain'}`;
      const size = Math.abs(row.value) / max * 50;
      fill.style.width = `${size}%`; fill.style.left = `${row.value < 0 ? 50 - size : 50}%`; track.append(fill);
      value.textContent = `${signed(row.value, digits)} ${unit}`;
    } else value.textContent = "Indisponible";
    wrapper.tabIndex = 0;
    wrapper.dataset.tip = `${row.label} : ${Number.isFinite(row.value) ? `${signed(row.value, digits)} ${unit}` : 'observation manquante'}. ${row.detail || ''}. ${row.tip || 'Variation conditionnelle sous les hypothèses du scénario. La largeur de la barre est proportionnelle à son amplitude, sur une échelle commune.'}`;
    wrapper.append(name, track, value); container.append(wrapper);
  }
  observeChart(container);
}

export function histogram(container, moves, marker) {
  const values = moves.map(move => move.bps).filter(Number.isFinite);
  if (!values.length || !Number.isFinite(marker)) return emptyChart(container, 'Historique insuffisant pour calculer les variations sur 20 observations.');
  const width = Math.max(250, Math.floor(container.clientWidth || 600)), height = 300;
  const m = { l: 48, r: 20, t: 48, b: 65 }, baseY = height - m.b;
  const niceStep = value => {
    const order = 10 ** Math.floor(Math.log10(Math.max(value, .01))), ratio = value / order;
    return (ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10) * order;
  };
  // Les classes dépendent de l’historique, et restent les mêmes quand le scénario change.
  const minimum = Math.min(...values), maximum = Math.max(...values);
  const step = niceStep(Math.max(maximum - minimum, 10) / 18);
  const historyLo = Math.floor(minimum / step) * step, historyHi = Math.floor(maximum / step) * step + step;
  const bins = Array.from({ length: Math.round((historyHi - historyLo) / step) }, () => 0);
  values.forEach(value => { bins[Math.min(bins.length - 1, Math.max(0, Math.floor((value - historyLo) / step)))]++; });
  const padding = Math.max(step, (historyHi - historyLo) * .04);
  const lo = Math.min(historyLo, marker - padding, -padding), hi = Math.max(historyHi, marker + padding, padding);
  const yMax = Math.max(5, Math.ceil(Math.max(...bins) / values.length * 100 / 5) * 5);
  const x = value => m.l + (value - lo) / (hi - lo) * (width - m.l - m.r);
  const y = value => baseY - value / yMax * (baseY - m.t);
  const svg = element('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', class: 'history-distribution-svg', 'aria-label': `Distribution des variations historiques du taux d’emprunt français à 10 ans sur 20 observations. Votre scénario : ${signed(marker, 0)} points de base.` });
  svg.append(element('title', {}, 'Mouvements observés et choc de votre scénario'));
  svg.append(element('desc', {}, `${values.length} fenêtres glissantes de 20 observations. La hauteur de chaque barre représente leur fréquence dans l’échantillon. Les fenêtres se chevauchent ; aucune probabilité future n’est calculée.`));
  for (let j = 0; j <= 4; j++) {
    const frequency = yMax * j / 4;
    svg.append(element('line', { x1: m.l, x2: width - m.r, y1: y(frequency), y2: y(frequency), class: 'history-gridline' }));
    svg.append(element('text', { x: m.l - 9, y: y(frequency) + 4, 'text-anchor': 'end', class: 'history-axis' }, `${num(frequency, Number.isInteger(frequency) ? 0 : 1)} %`));
  }
  svg.append(element('line', { x1: x(0), x2: x(0), y1: m.t, y2: baseY, class: 'history-zero' }));
  bins.forEach((count, index) => {
    if (!count) return;
    const lower = historyLo + index * step, upper = lower + step, frequency = count / values.length * 100;
    const hint = `Variation de ${signed(lower, 0)} à ${signed(upper, 0)} pb : ${count} fenêtres de 20 observations, soit ${num(frequency, 1)} % de l’échantillon. Ces fenêtres se chevauchent et ne sont pas indépendantes.`;
    const rect = element('rect', { x: x(lower) + 2, y: y(frequency), width: Math.max(1, x(upper) - x(lower) - 4), height: baseY - y(frequency), rx: 1, class: 'distribution-bin', tabindex: 0, 'aria-label': hint, 'data-tip': hint });
    rect.append(element('title', {}, hint)); svg.append(rect);
  });
  const tickStep = niceStep((hi - lo) / (width < 450 ? 3 : 5));
  for (let value = Math.ceil(lo / tickStep) * tickStep; value <= hi + tickStep * .001; value += tickStep) {
    const tick = Math.abs(value) < tickStep * .001 ? 0 : value;
    svg.append(element('text', { x: x(tick), y: baseY + 23, 'text-anchor': 'middle', class: 'history-axis' }, signed(tick, tickStep < 1 ? 1 : 0)));
  }
  const markerX = x(marker);
  const labelAnchor = markerX > width - 170 ? 'end' : 'start';
  const labelX = labelAnchor === 'end' ? markerX - 7 : markerX + 7;
  svg.append(element('line', { x1: markerX, x2: markerX, y1: 37, y2: baseY, class: 'history-marker' }));
  svg.append(element('text', { x: labelX, y: 31, 'text-anchor': labelAnchor, class: 'history-marker-label' }, `Scénario : ${signed(marker, 0)} pb`));
  svg.append(element('text', { x: m.l, y: 13, class: 'history-axis-title' }, 'Fréquence dans l’échantillon'));
  svg.append(element('text', { x: (width + m.l - m.r) / 2, y: height - 20, 'text-anchor': 'middle', class: 'history-axis-title' }, 'Variation sur 20 observations · points de base'));
  finishLoading(container); container.replaceChildren(svg); observeChart(container);
}
