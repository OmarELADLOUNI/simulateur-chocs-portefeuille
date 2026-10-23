import { loadingChart, finishLoading, setTip } from "./interactions.js";
import { num, signed, dateLabel, lines, emptyChart } from './charts.js';
import { commonObservations } from './engine.js';
const IDS = ['stress_euro', 'stress_us', 'aaa2', 'aaa10', 'eurgbp', 'eurjpy'];
const NAMES = ['Stress · zone euro', 'Stress · États-Unis', 'Taux AAA · 2 ans', 'Taux AAA · 10 ans', 'EUR / GBP', 'EUR / JPY'];
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const series = new Map();
let selected = IDS[0], range = 1, compare = true, onSource, onShock;
let historicalShock = null, finished = false;
function dated(value) { return dateLabel(new Date(value).toISOString().slice(0, 10)); }
function recent(s) {
  const cutoff = new Date(); cutoff.setUTCFullYear(cutoff.getUTCFullYear() - range);
  return s.observations.filter(o => Date.parse(o.date) >= cutoff.getTime());
}
function render() {
  historicalShock = null; $('context-apply').hidden = true;
  const s = series.get(selected);
  document.querySelectorAll('[data-context-series]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.contextSeries === selected)));
  if (!s) { if (!finished) loadingChart($('context-chart'), 'Connexion aux séries de la BCE…'); else emptyChart($('context-chart'), 'Série indisponible. Sélectionnez un autre indicateur ou réessayez.'); $('context-insight').textContent = finished ? 'Les autres données et le simulateur restent utilisables.' : 'Récupération des observations officielles et de leur historique.'; return; }
  const obs = recent(s), points = obs.map(o => ({ x: Date.parse(o.date), y: o.value }));
  const curves = [{ label: s.label, className: 'line-scenario', points }];
  let interpretation = s.note;
  if (s.category === 'stress') {
    const other = series.get(selected === 'stress_euro' ? 'stress_us' : 'stress_euro');
    if (other && compare) curves.push({ label: other.label, className: 'line-reference', points: recent(other).map(o => ({ x: Date.parse(o.date), y: o.value })) });
    if (obs.length) {
      const percentile = obs.filter(o => o.value <= s.latest.value).length / obs.length * 100;
      interpretation += ` Le dernier niveau se situe au ${num(percentile, 0)}e percentile des ${obs.length} observations affichées : rang historique, pas probabilité future.`;
    }
  }
  if (s.category === 'rates') {
    const other = series.get(selected === 'aaa2' ? 'aaa10' : 'aaa2');
    if (other && compare) curves.push({ label: other.label, className: 'line-reference', points: recent(other).map(o => ({ x: Date.parse(o.date), y: o.value })) });
    const two = series.get('aaa2'), ten = series.get('aaa10');
    const common = two && ten ? commonObservations([two, ten]) : null;
    if (common) interpretation += ` Pente 10 ans − 2 ans : ${signed((common.values[1].value - common.values[0].value) * 100, 0)} pb au ${dateLabel(common.date)}.`;
  }
  if (s.category === 'fx' && obs.length > 1) interpretation += ` Variation entre le ${dateLabel(obs[0].date)} et le ${dateLabel(obs.at(-1).date)} : ${signed((obs.at(-1).value / obs[0].value - 1) * 100)} %.`;
  lines($('context-chart'), curves, { title: s.label, unit: s.unit, xTitle: 'Observations historiques · dates réelles', xFormat: dated, yFormat: v => num(v, s.digits), height: 300, yFloor: s.category === 'stress' ? 0 : -Infinity });
  $('context-chart-title').textContent = s.label;
  $('context-insight').textContent = interpretation;
  $('context-source').href = s.sourceUrl;
  $('context-source').textContent = `${s.source} · dernière observation : ${dateLabel(s.latest.date)}`;
  if (s.category === 'rates') {
    const ten = series.get('aaa10');
    if (ten?.observations.length > 20) {
      const last = ten.observations.at(-1), prior = ten.observations.at(-21);
      const shock = Math.round((last.value - prior.value) * 100);
      if (shock >= -100 && shock <= 150) {
        historicalShock = shock; $('context-apply').hidden = false;
        $('context-apply').textContent = `Rejouer ${signed(shock, 0)} pb sur les taux communs`;
        $('context-apply-note').textContent = `Variation AAA 10 ans entre le ${dateLabel(prior.date)} et le ${dateLabel(last.date)}, sur 20 observations. Ce bouton remplace seulement le choc de taux communs du scénario ; il ne calibre ni la prime France ni la contagion.`;
      } else $('context-apply-note').textContent = 'Le mouvement observé dépasse la plage des chocs du simulateur ; aucun écrêtage automatique n’est appliqué.';
    }
  } else $('context-apply-note').textContent = '';
  $('context-compare-wrap').hidden = s.category === 'fx';
  $('context-comparison-key').hidden = !(compare && curves.length > 1);
  $('context-current-key').textContent = s.label;
  $('context-comparison-key').textContent = curves[1]?.label || '';
}
export async function initContext(addSource, applyShock) {
  onSource = addSource; onShock = applyShock;
  $('context-apply').addEventListener('click', () => { if (historicalShock !== null) onShock(historicalShock); });
  IDS.forEach((id, i) => {
    const button = el('button', 'context-card'); button.type = 'button'; button.dataset.contextSeries = id; button.setAttribute('aria-pressed', String(id === selected));
    button.dataset.loading = 'true'; button.setAttribute('aria-busy', 'true');
    button.append(el('span', 'datum-label', NAMES[i]), el('strong', '', '—'), el('small', '', 'Chargement…'));
    button.addEventListener('click', () => { selected = id; render(); }); $('context-cards').append(button);
  });
  $('context-range').addEventListener('change', e => { range = Number(e.target.value); render(); });
  $('context-compare').addEventListener('change', e => { compare = e.target.checked; render(); });
  const contextDetails = $('market-context');
  const redrawOpenedContext = () => requestAnimationFrame(() => {
    // Une courbe préparée dans un volet masqué doit reprendre sa largeur visible.
    if (!contextDetails || contextDetails.open) render();
  });
  contextDetails?.addEventListener('toggle', () => { if (contextDetails.open) redrawOpenedContext(); });
  document.addEventListener('journey-panel-opened', event => {
    if (event.detail?.stage === 'simulation') redrawOpenedContext();
  });
  window.addEventListener('resize', () => { clearTimeout(window.contextResizeTimer); window.contextResizeTimer = setTimeout(render, 150); });
  let snapshot; try { snapshot = JSON.parse($('market-preview-data')?.textContent || 'null'); } catch (_) {}
  loadingChart($('context-chart'), 'Récupération des observations BCE…');
  const results = await Promise.allSettled(IDS.map(async id => {
    let payload;
    if (snapshot) payload = snapshot.series[id];
    else {
      const response = await fetch(`/.netlify/functions/ecb?series=${id}&range=5y`, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error('Unavailable'); payload = await response.json();
    }
    if (!payload?.observations?.length) throw new Error('No observations');
    series.set(id, payload); onSource(payload);
    const card = document.querySelector(`[data-context-series="${id}"]`);
    card.querySelector('strong').textContent = `${num(payload.latest.value, payload.digits)}${payload.unit === '%' ? ' %' : ''}`;
    const age = (Date.now() - Date.parse(payload.latest.date)) / 86400000;
    card.querySelector('small').textContent = `${dateLabel(payload.latest.date)} · ${age > 7 ? 'actualisation ancienne' : 'quotidien'}`;
    finishLoading(card); setTip(card, `${payload.label} · ${payload.unit}. ${payload.note} Source : ${payload.source}, observation du ${dateLabel(payload.latest.date)}.${payload.fallback ? " La source directe était indisponible ; le relais peut avoir un décalage de mise à jour." : ""}`);
    render();
  }));
  results.forEach((r, i) => { if (r.status === 'rejected') { const card = document.querySelector(`[data-context-series="${IDS[i]}"]`); finishLoading(card); card.querySelector('small').textContent = 'Donnée indisponible'; } });
  finished = true; finishLoading($("context-status"));
  const count = series.size, backupCount = [...series.values()].filter(s => s.fallback).length;
  if (!series.has(selected) && count) selected = series.keys().next().value;
  $('context-status').textContent = `${count}/${IDS.length} séries reçues · ${count - backupCount} en accès BCE direct${backupCount ? ` · ${backupCount} via le relais DBnomics` : ""}. Chaque carte indique la date réelle de sa dernière observation. Ces indicateurs éclairent les hypothèses ; ils ne recalibrent pas automatiquement les coefficients du simulateur.`;
  render();
}
