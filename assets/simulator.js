import { initIndices } from "./indices.js";
import { PORTFOLIOS, SRI_NOTE, matchingPortfolio } from "../content/portfolios.js";
import { initInteractions, addHelp, setTip, loadingChart, finishLoading } from "./interactions.js";
import { initContext } from "./context.js";
import { SCENARIOS, ASSETS, INPUTS, DEFAULT_PARAMETERS } from "../content/scenarios.js";
import { DEFAULT_STATE, cleanState, evaluate, historicalMoves, commonObservations } from "./engine.js";
import { num, signed, dateLabel, lines, bars, histogram, emptyChart } from "./charts.js";

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const monthLabel = d => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`));
const STORE = "omar-markets-scenario-v1";
const snapshotElement = document.getElementById("market-preview-data");
let snapshot = null;
if (snapshotElement) { try { snapshot = JSON.parse(snapshotElement.textContent); } catch (_) {} }
const data = { curve: {}, sovereigns: {}, sources: [], quotes: {} };
function freshState() {
  const value = structuredClone(DEFAULT_STATE);
  value.inputs = { ...SCENARIOS[0].values }; value.name = SCENARIOS[0].title;
  value.weights = { ...PORTFOLIOS.find(p => p.id === "modere").weights };
  return value;
}
let state = freshState(), pinned = null, history = { moves: [], p95: null };
let modelReady = false, monthlyReady = false, quotesReady = false;
let journey = { portfolioChosen: true, portfolioConfirmed: true, scenarioChosen: true, analysisRequested: true };
let savedSimulation = null, startingWeights = { ...state.weights }, activeStage = "portefeuille";
try {
  const shared = new URLSearchParams(location.hash.slice(1)).get("s");
  const saved = localStorage.getItem(STORE);
  if (saved && saved.length < 14000) savedSimulation = JSON.parse(saved);
  if (shared && shared.length < 12000) {
    state = cleanState(JSON.parse(shared)); startingWeights = { ...state.weights };
    journey = { portfolioChosen: true, portfolioConfirmed: true, scenarioChosen: true, analysisRequested: true };
  }
} catch (_) { /* Une sauvegarde invalide ne remplace pas le parcours initial. */ }
function persist() { try { localStorage.setItem(STORE, JSON.stringify({ ...state, flow: journey })); } catch (_) {} }
function text(id, value) { $(id).textContent = value; finishLoading($(id)); }
function element(tag, className, content) {
  const el = document.createElement(tag); if (className) el.className = className;
  if (content !== undefined) el.textContent = content; return el;
}
function custom() {
  journey.scenarioChosen = true; state.name = "Scénario personnalisé";
  $("preset").value = "custom";
  text("preset-description", "Vos hypothèses sont modifiées librement. Gardez une version dans l’analyse pour comparer leurs effets.");
}
function chosenScenario(id) {
  const preset = SCENARIOS.find(s => s.id === id);
  if (!preset) return;
  journey.scenarioChosen = true;
  state.inputs = { ...preset.values }; state.name = preset.title;
  syncForm(); text("preset-description", preset.text); persist(); render();
}
function goToStage(id) {
  const target = $(id); if (!target || target.hidden) return;
  activeStage = id; updateNavigation();
  document.dispatchEvent(new CustomEvent("journey-panel-opened", { detail: { stage: id } }));
  requestAnimationFrame(() => target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" }));
}
function updateNavigation() {
  const methodLink = document.querySelector('.method-nav-link');
  methodLink.classList.toggle('is-current', activeStage === 'methode');
  if (activeStage === 'methode') methodLink.setAttribute('aria-current', 'location'); else methodLink.removeAttribute('aria-current');
  const profile = matchingPortfolio(state.weights);
  document.querySelectorAll('[data-step]').forEach(link => {
    const id = link.dataset.step;
    link.classList.remove('is-locked', 'is-complete'); link.removeAttribute('aria-disabled');
    link.classList.toggle('is-current', activeStage === id);
    if (activeStage === id) link.setAttribute('aria-current', 'step'); else link.removeAttribute('aria-current');
    link.querySelector('.step-state').textContent = id === 'portefeuille' ? `${profile?.name || 'Personnalisé'} · ajustable`
      : id === 'simulation' ? (journey.scenarioChosen ? 'Hypothèses définies' : 'Choisir une hypothèse')
      : id === 'analyse' ? (journey.analysisRequested ? 'Résultats en direct' : 'En attente d’une hypothèse') : 'Toujours accessibles';
  });
}
function renderJourney() {
  journey.portfolioChosen = journey.portfolioConfirmed = true;
  journey.analysisRequested = journey.scenarioChosen;
  ['portfolio-editing', 'simulation', 'scenario-editing', 'analyse'].forEach(id => { $(id).hidden = false; });
  $('analysis-empty').hidden = journey.analysisRequested;
  $('analysis-live').hidden = !journey.analysisRequested;
  $('analysis-toolbar').hidden = !journey.analysisRequested;
  $('restore-saved').hidden = !savedSimulation;
  text('scenario-brief', journey.analysisRequested ? 'Chaque ajustement actualise les résultats de votre portefeuille dans « Votre analyse », juste en dessous.' : 'Choisissez une carte ci-dessus ou ajustez directement ces paramètres. Leur effet sur votre portefeuille apparaîtra automatiquement dans « Votre analyse ».');
  const invalid = compositionError();
  $('allocation-status').setAttribute('role', invalid ? 'alert' : 'status');
  text('allocation-status', invalid || `Allocation : 100 % · ${money(state.amount)}`);
  const profile = matchingPortfolio(state.weights);
  text('analysis-empty-description', `Votre portefeuille ${profile ? profile.name : 'personnalisé'} est prêt. Choisissez une hypothèse dans « Votre scénario », ou ajustez ses paramètres : les résultats apparaîtront ici automatiquement.`);
  updateNavigation();
}
function initJourney() {
  $('custom-portfolio').addEventListener('click', () => {
    journey.portfolioChosen = true;
    state.weights = Object.fromEntries(ASSETS.map(a => [a.id, a.id === 'cash' ? 100 : 0]));
    startingWeights = { ...state.weights }; syncForm(); persist(); render();
    text('portfolio-feedback', 'Votre composition démarre avec 100 % de trésorerie. Répartissez ce capital entre les actifs de votre choix.');
  });
  $('restore-saved').addEventListener('click', () => {
    if (!savedSimulation) return;
    state = cleanState(savedSimulation); startingWeights = { ...state.weights };
    journey = { portfolioChosen: true, portfolioConfirmed: true, scenarioChosen: true, analysisRequested: true };
    savedSimulation = null; syncForm(); render();
    text('portfolio-feedback', 'Composition restaurée. Vos ajustements sont pris en compte automatiquement.');
    if (journey.analysisRequested) { text('action-status', 'Simulation restaurée : les résultats sont recalculés avec les données disponibles à cette ouverture.'); goToStage('analyse'); }
    else if (journey.portfolioConfirmed) goToStage('simulation');
  });
  document.querySelectorAll('[data-step], [data-return]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); const id = link.dataset.step || link.dataset.return;
    goToStage(id);
  }));
  $('trajectory-details').addEventListener('toggle', () => { if ($('trajectory-details').open) requestAnimationFrame(render); });
  let scheduled = false;
  window.addEventListener('scroll', () => {
    if (scheduled) return; scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const visible = ['portefeuille', 'simulation', 'analyse', 'methode'].filter(id => !$(id).hidden);
      activeStage = visible.filter(id => $(id).getBoundingClientRect().top <= 175).at(-1) || 'portefeuille';
      updateNavigation();
    });
  }, { passive: true });
}
const notes = {
  weeks: "Une durée plus longue accroît le choc social, avec saturation.",
  intensity: "De perturbations limitées à un blocage économique marqué.",
  contagion: "Part du choc français transmise aux pays et actions européens.",
  fiscal: "Choc de prime française présumé, indépendant des taux communs.",
  rates: "Déplacement parallèle de la composante commune des taux européens.",
  energy: "Variation présumée de l’énergie ; transmission simplifiée aux actions et à l’or.",
  credit: "Choc IG ; transmission ×2 au HY. Niveaux de départ synthétiques, spreads modifiables ci-dessous.",
  horizon: "Temps de matérialisation conventionnel du choc, sans portage.",
  fx: "Ajout manuel au choc EUR/USD issu du modèle.",
};
const parameterNames = {
  socialMax: ["Plafond de prime sociale", "pb à intensité maximale", 250, 5],
  equityBeta: ["Sensibilité actions France", "% par +100 pb de prime France", 15, .25],
  bankBeta: ["Sensibilité banques", "% par +100 pb de prime France", 15, .25],
  europeBeta: ["Sensibilité actions Europe", "% par +100 pb, modulée par la contagion", 15, .25],
  fxBeta: ["Sensibilité EUR/USD", "% par +100 pb, modulée par la contagion", 15, .25],
  igSpread: ["Spread initial crédit IG", "pb au-dessus du taux d’emprunt à 5 ans · hypothèse", 1500, 10],
  hySpread: ["Spread initial crédit HY", "pb au-dessus du taux d’emprunt à 5 ans · hypothèse", 1500, 10],
};

const assetColors = ['#b8e986', '#74b9a1', '#9eb8ae', '#d59172', '#e7c8a3', '#9cbfdd', '#b7a5d3', '#e3a69f', '#d9bd60', '#8b9a8b'];
const assetNotes = {
  oat: "Obligation française synthétique au pair. Le rendement initial vient du taux d’emprunt français à l’échéance sélectionnée (2, 5, 10 ou 30 ans) ; tous les flux sont revalorisés après le choc de taux.",
  bund: "Obligation allemande synthétique à 10 ans. Le taux initial est une moyenne mensuelle de convergence. Une hausse de la recherche de sécurité peut réduire son rendement dans le scénario.",
  ig: "Crédit de qualité, représenté par une obligation synthétique à 5 ans. Spread initial hypothétique ajouté au taux d’emprunt à 5 ans, ajustable dans les paramètres avancés.",
  hy: "Crédit à haut rendement, représenté par une obligation synthétique à 4 ans. Le modèle double le choc de spread IG ; le spread initial est une hypothèse ajustable.",
  cac: "Exposition aux actions françaises. Rendement conditionnel calculé avec les sensibilités du modèle ; aucun cours manquant n’est reconstitué.",
  banks: "Exposition aux banques européennes. Sensibilité spécifique au risque français et aux taux ; ne représente pas la cotation observée d’un indice bancaire.",
  europe: "Exposition aux actions européennes, sensible à la contagion. Les rendements restent des variations de scénario, distinctes des cotations historiques.",
  us: "Exposition aux actions américaines en dollars. Sans couverture, le rendement en euros tient compte de l’évolution EUR/USD du scénario.",
  gold: "Exposition à l’or en dollars. Les sensibilités or et change sont des hypothèses de scénario ; le modèle ne suppose pas un cours observé de l’or.",
  cash: "Trésorerie en euros. Valorisation constante dans ce modèle : aucun rendement de dépôt, frais ou effet de taux n’est appliqué.",
};
function distribute(ids, budget) {
  const total = ids.reduce((sum, id) => sum + state.weights[id], 0);
  if (!total) {
    ids.forEach(id => { state.weights[id] = 0; });
    if (budget && ids.length) state.weights[ids.includes('cash') ? 'cash' : ids[0]] = budget;
    return;
  }
  const units = Math.round(budget * 100);
  const parts = ids.map(id => { const exact = state.weights[id] / total * units; return { id, value: Math.floor(exact), rest: exact % 1 }; });
  let remainder = units - parts.reduce((sum, p) => sum + p.value, 0);
  [...parts].sort((a, b) => b.rest - a.rest).forEach(p => { if (remainder > 0) { p.value++; remainder--; } });
  parts.forEach(p => { state.weights[p.id] = p.value / 100; });
}
function setWeight(id, value) {
  state.weights[id] = value;
  distribute(ASSETS.filter(a => a.id !== id).map(a => a.id), 100 - value);
}
function renderComposition() {
  const bar = $('composition-bar'), legend = $('composition-legend'); bar.replaceChildren(); legend.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', '0 0 180 180'); svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', 'Répartition du portefeuille, total 100 %');
  let offset = 0;
  ASSETS.forEach((asset, index) => {
    const weight = state.weights[asset.id], color = assetColors[index];
    const input = $(`weight-${asset.id}`); input.value = weight; input.style.setProperty('--weight', `${weight}%`); input.setAttribute('aria-valuetext', `${weight} % du portefeuille`);
    const numeric = $(`weight-number-${asset.id}`); if (document.activeElement !== numeric) numeric.value = weight;
    if (!weight) return;
    const hint = `${asset.label} : ${weight} % du portefeuille, soit ${money(state.amount * weight / 100)}. ${assetNotes[asset.id]}`;
    const segment = element('span', 'composition-segment'); segment.style.width = `${weight}%`; segment.style.background = color; setTip(segment, hint); segment.setAttribute('aria-label', `${asset.label} ${weight} %`); bar.append(segment);
    const key = element('span', 'composition-key', `${asset.short} ${weight} %`); key.style.setProperty('--asset-color', color); setTip(key, hint); legend.append(key);
    const circle = document.createElementNS(ns, 'circle');
    Object.entries({ cx: 90, cy: 90, r: 70, fill: 'none', stroke: color, 'stroke-width': 17, pathLength: 100, 'stroke-dasharray': `${Math.max(0, weight - .6)} ${100 - Math.max(0, weight - .6)}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 90 90)' }).forEach(([k, v]) => circle.setAttribute(k, v));
    circle.dataset.tip = hint; circle.setAttribute('tabindex', '0'); circle.setAttribute('aria-label', `${asset.label} ${weight} %`); svg.append(circle); offset += weight;
  });
  const center = document.createElementNS(ns, 'text'); center.setAttribute('x', 90); center.setAttribute('y', 90); center.setAttribute('text-anchor', 'middle'); center.setAttribute('class', 'ring-total'); center.textContent = '100 %'; svg.append(center);
  const caption = document.createElementNS(ns, 'text'); caption.setAttribute('x', 90); caption.setAttribute('y', 111); caption.setAttribute('text-anchor', 'middle'); caption.setAttribute('class', 'ring-caption'); caption.textContent = 'du capital'; svg.append(caption);
  $('composition-ring').replaceChildren(svg);
}

function renderPortfolioChoice() {
  const profile = journey.portfolioChosen ? matchingPortfolio(state.weights) : null;
  document.querySelectorAll('[data-portfolio]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.portfolio === profile?.id)));
  $('custom-portfolio').setAttribute('aria-pressed', String(journey.portfolioChosen && !profile));
  text('portfolio-profile-status', !journey.portfolioChosen ? 'Sélectionnez une allocation pour commencer.' : profile ? `${profile.name} · ${profile.equity} % actions / ${profile.bonds} % obligations. ${profile.description}` : 'Composition personnalisée · répartissez librement votre capital.');
}
function renderExposure() {
  text('composition-capital', compositionError() ? 'Saisie à corriger' : money(state.amount));
  const groups = {
    equity: ASSETS.filter(a => a.kind === 'equity'), bond: ASSETS.filter(a => a.kind === 'bond'),
    gold: ASSETS.filter(a => a.id === 'gold'), cash: ASSETS.filter(a => a.id === 'cash'),
  };
  for (const [key, assets] of Object.entries(groups)) {
    const weight = assets.reduce((sum, a) => sum + state.weights[a.id], 0);
    text(`exposure-${key}`, `${num(weight, 2)} %`); text(`exposure-${key}-amount`, money(state.amount * weight / 100));
  }
  const usd = state.weights.us + state.weights.gold;
  text('composition-explanation', `${num(usd, 2)} % du capital est investi dans des expositions en dollars (${money(state.amount * usd / 100)}). ${state.hedge ? 'Le risque de change est couvert dans votre simulation, sans coût de couverture.' : 'Leur valeur en euros dépendra aussi du change EUR/USD.'} ${state.weights.oat ? `Les obligations françaises sont représentées à ${state.tenor} ans.` : ''}`);
}
function buildForm() {
  for (const profile of PORTFOLIOS) {
    const button = element('button', 'portfolio-profile'); button.type = 'button'; button.dataset.portfolio = profile.id; button.setAttribute('aria-pressed', 'false');
    const header = element('span', 'profile-title', profile.name);
    const mix = element('span', 'profile-ratio', `${profile.equity} / ${profile.bonds}`);
    const allocation = element('span', 'profile-allocation', `${profile.equity} % actions · ${profile.bonds} % obligations`);
    const bar = element('span', 'profile-mix'); bar.setAttribute('aria-hidden', 'true'); const equity = element('span'); equity.style.width = `${profile.equity}%`; bar.append(equity);
    button.append(header, mix, allocation, bar);
    setTip(button, `${profile.description} Répartition adaptée au périmètre du simulateur, pas aux positions réelles d’un fonds. ${SRI_NOTE}`);
    button.addEventListener('click', () => {
      journey.portfolioChosen = true; state.weights = { ...profile.weights }; startingWeights = { ...state.weights };
      syncForm(); persist(); render();
      text('portfolio-feedback', `Allocation ${profile.name} appliquée. Vos ajustements sont pris en compte automatiquement.`);
    });
    $('portfolio-profiles').append(button);
  }
  distribute(ASSETS.map(a => a.id), 100);
  const placeholder = element('option', '', 'Choisissez un scénario'); placeholder.value = ''; placeholder.disabled = true; $('preset').append(placeholder);
  for (const preset of SCENARIOS) {
    const option = element('option', '', `${preset.title} · ${preset.tag}`); option.value = preset.id; $('preset').append(option);
    const button = element('button', 'scenario-choice'); button.type = 'button'; button.dataset.scenario = preset.id; button.setAttribute('aria-pressed', 'false');
    button.append(element('span', 'scenario-tag', preset.tag), element('h3', '', preset.title), element('p', '', preset.text));
    button.addEventListener('click', () => chosenScenario(preset.id)); $('scenario-options').append(button);
  }
  const customOption = element("option", "", "Scénario personnalisé"); customOption.value = "custom"; customOption.disabled = true; $("preset").append(customOption);
  for (const [key, def] of Object.entries(INPUTS)) {
    const wrap = element("div", "control"), head = element("div", "control-head");
    const label = element("label", "", def.label); label.htmlFor = `input-${key}`;
    const output = element("output"); output.id = `value-${key}`; output.htmlFor = `input-${key}`;
    const input = element("input"); Object.assign(input, { type: "range", id: `input-${key}`, min: def.min, max: def.max, step: def.step });
    addHelp(label, `${notes[key]} ${key === "rates" || key === "fiscal" || key === "credit" ? "100 pb correspondent à 1 point de pourcentage." : ""}`);
    head.append(label, output); wrap.append(head, input, element("p", "control-note", notes[key]));
    $(key === "fx" ? "advanced-controls" : "scenario-controls").append(wrap);
    input.addEventListener("input", () => { state.inputs[key] = Number(input.value); custom(); persist(); render(); });
  }
  for (const [key, [name, unit, max, step]] of Object.entries(parameterNames)) {
    const wrap = element("div", "control"), head = element("div", "control-head");
    const label = element("label", "", name); label.htmlFor = `parameter-${key}`;
    const output = element("output"); output.id = `parameter-value-${key}`; output.htmlFor = `parameter-${key}`;
    const input = element("input"); Object.assign(input, { type: "range", id: `parameter-${key}`, min: 0, max, step });
    addHelp(label, `${name} : ${unit}. Ce coefficient est une hypothèse de transmission modifiable, indépendante de la donnée observée.`);
    head.append(label, output); wrap.append(head, input, element("p", "control-note", unit)); $("parameter-controls").append(wrap);
    input.addEventListener("input", () => { state.parameters[key] = Number(input.value); custom(); persist(); render(); });
  }
  for (const [index, asset] of ASSETS.entries()) {
    const row = element('div', 'allocation'), head = element('div', 'allocation-head');
    row.style.setProperty('--asset-color', assetColors[index]);
    const label = element('label', '', asset.label); label.htmlFor = `weight-${asset.id}`; addHelp(label, assetNotes[asset.id]);
    const numericWrap = element('span', 'allocation-amount');
    const numeric = element('input'); Object.assign(numeric, { id: `weight-number-${asset.id}`, type: 'number', min: 0, max: 100, step: .01, required: true });
    numeric.setAttribute('aria-label', `${asset.label} · pourcentage à saisir`);
    numericWrap.append(numeric, element('span', 'muted', '%'));
    const input = element('input'); Object.assign(input, { id: `weight-${asset.id}`, type: 'range', min: 0, max: 100, step: .01 }); input.setAttribute('aria-label', `${asset.label} · curseur d’allocation`);
    head.append(label, numericWrap); row.append(head, input); $('allocation-fields').append(row);
    input.addEventListener('input', () => { setWeight(asset.id, Number(input.value)); numeric.value = state.weights[asset.id]; numeric.removeAttribute('aria-invalid'); persist(); render(); });
    numeric.addEventListener('input', () => {
      if (numeric.value === '' || !numeric.validity.valid || !Number.isFinite(numeric.valueAsNumber)) {
        numeric.setAttribute('aria-invalid', 'true'); render(); return;
      }
      numeric.removeAttribute('aria-invalid'); setWeight(asset.id, numeric.valueAsNumber); persist(); render();
    });
    numeric.addEventListener('blur', () => {
      const invalid = !numeric.validity.valid || numeric.value === '';
      numeric.value = state.weights[asset.id]; numeric.removeAttribute('aria-invalid'); render();
      if (invalid) text('portfolio-feedback', 'Saisissez un pourcentage de 0 à 100. La dernière valeur valide a été conservée.');
    });
  }
  $("preset").addEventListener("change", () => chosenScenario($("preset").value));
  document.querySelectorAll("[data-fiscal]").forEach(button => button.addEventListener("click", () => { state.inputs.fiscal = Number(button.dataset.fiscal); custom(); syncForm(); persist(); render(); }));
  $("amount").addEventListener("input", () => {
    const value = Number($("amount").value);
    if (!Number.isFinite(value) || value < 1000 || value > 1000000000) { render(); return; }
    state.amount = value; persist(); render();
  });
  $("tenor").addEventListener("change", () => { state.tenor = Number($("tenor").value); persist(); render(); });
  $("hedge").addEventListener("change", () => { state.hedge = $("hedge").checked; persist(); render(); });
  $("normalize").addEventListener("click", () => {
    state.weights = { ...startingWeights };
    syncForm(); persist(); render(); text("portfolio-feedback", "Le point de départ choisi est rétabli. Votre scénario est conservé.");
  });
  $("reset").addEventListener("click", () => {
    state.inputs = { ...SCENARIOS[0].values }; state.parameters = { ...DEFAULT_PARAMETERS }; state.name = SCENARIOS[0].title;
    journey.scenarioChosen = journey.analysisRequested = true; pinned = null;
    const address = new URL(location.href);
    if (new URLSearchParams(address.hash.slice(1)).has('s')) { address.hash = ''; window.history.replaceState(null, '', address); }
    syncForm(); persist(); render(); text('scenario-feedback', 'Point de départ · Aucun choc rétabli. Votre portefeuille est conservé.'); goToStage('simulation');
  });
  $("pin").addEventListener("click", () => { pinned = structuredClone(state); text("action-status", "Comparaison conservée. Modifiez maintenant vos hypothèses ou votre allocation."); render(); });
  $("share").addEventListener("click", share);
  $("export").addEventListener("click", exportAnalysis);
  syncForm();
}

function syncForm() {
  for (const key of Object.keys(INPUTS)) $(`input-${key}`).value = state.inputs[key];
  for (const key of Object.keys(DEFAULT_PARAMETERS)) $(`parameter-${key}`).value = state.parameters[key];
  for (const asset of ASSETS) { $(`weight-${asset.id}`).value = state.weights[asset.id]; $(`weight-number-${asset.id}`).value = state.weights[asset.id]; $(`weight-number-${asset.id}`).removeAttribute("aria-invalid"); }
  $("amount").value = state.amount; $("tenor").value = state.tenor; $("hedge").checked = state.hedge;
  const preset = SCENARIOS.find(s => s.title === state.name && Object.keys(INPUTS).every(k => s.values[k] === state.inputs[k]));
  $("preset").value = journey.scenarioChosen ? preset?.id || "custom" : "";
  text("preset-description", preset?.text || "Votre scénario est personnalisable. Ses effets se mettent à jour dès que vous modifiez une hypothèse.");
}

async function load(id, range = "1y") {
  if (snapshot) {
    const payload = snapshot.series[id];
    if (!payload?.observations?.length) throw new Error("Série absente de cet instantané de données.");
    if (payload.tenor) payload.label = `France · Taux d’emprunt à ${payload.tenor} ans`;
    data.sources.push(payload); return payload;
  }
  const response = await fetch(`/api/market-data/webstat?${new URLSearchParams({ series: id, range })}`, { signal: AbortSignal.timeout(20000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.observations?.length) throw new Error(payload?.error || "Les données ne sont pas disponibles dans cet environnement.");
  if (payload.tenor) payload.label = `France · Taux d’emprunt à ${payload.tenor} ans`;
  data.sources.push(payload); return payload;
}
async function loadData() {
  const criticalIds = ["tec2", "tec5", "tec10", "tec30", "eurusd"];
  const critical = await Promise.allSettled(criticalIds.map(id => load(id)));
  ["live-oat", "live-fx"].forEach(id => finishLoading($(id)));
  const curve = critical.slice(0, 4).filter(r => r.status === "fulfilled").map(r => r.value);
  const common = commonObservations(curve);
  if (common) curve.forEach((s, j) => { data.curve[s.tenor] = { ...common.values[j], source: s.key }; });
  const oat = critical[2].status === "fulfilled" ? critical[2].value : null;
  if (oat) {
    data.oatHistory = oat.observations; history = historicalMoves(oat.observations);
    text("live-oat", `${num(oat.latest.value)} %`); text("live-oat-date", `${dateLabel(oat.latest.date)} · quotidien`);
  } else text("live-oat-date", "Série indisponible");
  if (critical[4].status === "fulfilled") {
    data.eurusd = critical[4].value.latest;
    text("live-fx", num(data.eurusd.value, 4)); text("live-fx-date", `${dateLabel(data.eurusd.date)} · quotidien`);
  } else text("live-fx-date", "Série indisponible");
  modelReady = true;
  const count = critical.filter(r => r.status === "fulfilled").length;
  const stale = oat ? (Date.now() - Date.parse(oat.latest.date)) / 86400000 > 7 : false;
  text("data-status", count ? `${snapshot ? "Instantané exporté · " : ""}Les taux français à 2, 5, 10 et 30 ans construisent la courbe du simulateur${common ? ` au ${dateLabel(common.date)}` : " (date commune indisponible)"}. Le change euro–dollar est chargé séparément ; l’écart France–Allemagne repose sur des moyennes mensuelles.${count < criticalIds.length ? ` ${criticalIds.length - count} référence(s) quotidienne(s) indisponible(s).` : ""}${stale ? " Le dernier taux français reçu a plus de 7 jours ; consultez sa date." : ""}` : `Connexion indisponible : ${critical[0].reason?.message || "réessayez ultérieurement"}. Les variations de scénario en base 100 restent explorables.`);
  render();
  const monthlyIds = ["fr10m", "de10m", "it10m"];
  const monthly = await Promise.allSettled(monthlyIds.map(id => load(id, "3m")));
  const received = monthly.map((r, j) => r.status === "fulfilled" ? { ...r.value, country: ["france", "germany", "italy"][j] } : null).filter(Boolean);
  const aligned = commonObservations(received);
  if (aligned) received.forEach((s, j) => { data.sovereigns[s.country] = { ...aligned.values[j], source: s.key }; });
  if (data.sovereigns.france && data.sovereigns.germany) {
    text("live-spread", `${signed((data.sovereigns.france.value - data.sovereigns.germany.value) * 100, 0)} pb`);
    text("live-spread-date", `${monthLabel(aligned.date)} · moyennes mensuelles`);
  } else text("live-spread-date", "Comparaison mensuelle non disponible");
  monthlyReady = true; finishLoading($("live-spread")); render();
  const quoteIds = ["cac40", "stoxx600", "sp500"];
  const quotes = await Promise.allSettled(quoteIds.map(id => load(id, "1m")));
  quotes.forEach((r, j) => { if (r.status === "fulfilled") data.quotes[quoteIds[j]] = r.value; });
  quotesReady = true; finishLoading($("quote-status"));
  render();
}

function compositionError() {
  const amount = $('amount');
  const invalidAmount=amount.value === '' || !amount.validity.valid || !Number.isFinite(amount.valueAsNumber);
  if(invalidAmount)amount.setAttribute('aria-invalid','true');else amount.removeAttribute('aria-invalid');
  if (invalidAmount) return 'Saisissez un capital compris entre 1 000 € et 1 milliard d’euros.';
  if (ASSETS.some(a => { const input = $(`weight-number-${a.id}`); return input.value === '' || !input.validity.valid || !Number.isFinite(input.valueAsNumber); })) return 'Vérifiez les allocations : chaque pourcentage doit être compris entre 0 et 100.';
  const total = ASSETS.reduce((sum, a) => sum + state.weights[a.id], 0);
  if (Math.abs(total - 100) >= .01) return `Allocation : ${num(total, 2)} %. Le total doit être égal à 100 %.`;
  return null;
}
function portfolioError(result) {
  const inputError = compositionError(); if (inputError) return inputError;
  if (result.missing.length) {
    const pending = !modelReady || !monthlyReady && result.missing.includes('bund');
    return pending ? 'Chargement des références nécessaires à la valorisation…' : `Observation manquante pour : ${result.missing.map(id => ASSETS.find(a => a.id === id).label).join(', ')}. Ajustez ces expositions ou réessayez plus tard.`;
  }
  return null;
}
function showAnalysisError(message) {
  const pending = !modelReady || !monthlyReady && state.weights.bund > 0;
  $('analysis-status').setAttribute('role', pending ? 'status' : 'alert'); text('analysis-status', message);
  text('portfolio-pnl', '—'); text('portfolio-pct', 'Calcul en attente des éléments nécessaires.'); text('portfolio-value', '—');
  $('export').disabled = true; $('pin').disabled = true;
  if (pending && !compositionError()) {
    ['portfolio-pnl', 'portfolio-value'].forEach(id => { $(id).dataset.loading = 'true'; $(id).setAttribute('aria-busy', 'true'); });
    loadingChart($('portfolio-chart'), 'Valorisation du portefeuille en cours…'); loadingChart($('attribution-chart'), 'Chargement des références de marché…');
  } else {
    emptyChart($('portfolio-chart'), message); emptyChart($('attribution-chart'), message);
  }
}
function renderStartingCurve() {
  $('starting-curve-values').replaceChildren(...[2, 5, 10, 30].map(tenor => {
    const observation = data.curve[tenor], tile = element('article');
    tile.append(element('span', '', `France · ${tenor} ans`), element('strong', '', observation ? `${num(observation.value)} %` : '—'), element('small', '', observation ? dateLabel(observation.date) : modelReady ? 'Indisponible' : 'Chargement…'));
    if (!modelReady) { tile.querySelector('strong').dataset.loading = 'true'; tile.querySelector('strong').setAttribute('aria-busy', 'true'); }
    return tile;
  }));
}
function render() {
  renderStartingCurve(); renderComposition(); renderPortfolioChoice(); renderExposure(); renderJourney();
  text("portfolio-scenario", `Scénario : ${state.name}`);
  const result = evaluate(state, data);
  $("comparison-legend").hidden = !pinned;
  for (const [key, def] of Object.entries(INPUTS)) text(`value-${key}`, `${num(state.inputs[key], key === "fx" ? 1 : 0)} ${key === "weeks" && state.inputs.weeks === 1 ? "semaine" : def.unit}`);
  for (const key of Object.keys(DEFAULT_PARAMETERS)) text(`parameter-value-${key}`, num(state.parameters[key], key === "socialMax" ? 0 : 2));
  document.querySelectorAll("[data-fiscal]").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.fiscal) === state.inputs.fiscal)));
  const selectedPreset = SCENARIOS.find(s => s.title === state.name && Object.keys(INPUTS).every(k => s.values[k] === state.inputs[k]));
  document.querySelectorAll('[data-scenario]').forEach(button => button.setAttribute('aria-pressed', String(journey.scenarioChosen && button.dataset.scenario === selectedPreset?.id)));
  text('hypothesis-name', journey.scenarioChosen ? state.name : 'Vos paramètres de départ');
  text('hypothesis-description', !journey.scenarioChosen ? 'Les paramètres sont neutres au départ. Choisissez un scénario ou ajustez-les pour explorer une hypothèse.' : selectedPreset?.text || 'Vos réglages définissent une combinaison personnalisée de chocs.');
  text('hypothesis-premium', `${signed(result.local, 0)} pb`); text('hypothesis-rates', `${signed(state.inputs.rates, 0)} pb`);
  text('hypothesis-contagion', `${num(state.inputs.contagion, 0)} %`); text('hypothesis-horizon', `${state.inputs.horizon} mois`);
  const profile = matchingPortfolio(state.weights);
  text('analysis-portfolio', `${profile?.name || 'Composition personnalisée'} · ${money(state.amount)} · ${state.hedge ? 'change USD couvert' : 'change USD non couvert'}`);
  text('decomposition', journey.scenarioChosen ? `Prime sociale ${signed(result.social, 1)} pb + prime budgétaire ${signed(state.inputs.fiscal, 0)} pb = prime France ${signed(result.local, 1)} pb. Taux communs ${signed(result.common, 0)} pb.` : 'La décomposition de votre choc sera précisée après le choix du scénario.');
  renderEquations(); renderSources();
  if (!journey.analysisRequested) return;
  text("scenario-name", state.name); text("scenario-premium", `${signed(result.local, 0)} pb`);
  text("scenario-summary", `${state.inputs.weeks} semaine${state.inputs.weeks === 1 ? "" : "s"} de tensions, intensité ${num(state.inputs.intensity, 0)} %, propagation ${num(state.inputs.contagion, 0)} %. Choc de taux communs ${signed(state.inputs.rates, 0)} pb. Horizon conventionnel : ${state.inputs.horizon} mois.`);
  const target = result.curve.find(p => p.tenor === 10);
  text("target-oat", target.target === null ? "Sans observation" : `${num(target.target)} %`);
  text("target-oat-delta", `${signed(target.shock, 0)} pb · taux de départ ${target.base === null ? "indisponible" : `${num(target.base)} %`}`);
  text("target-fx", result.eurusd === null ? "Base 100" : num(result.eurusd, 4));
  text("target-fx-delta", `${signed(result.fxPct)} % face au dollar`);
  text("local-risk", `${signed(result.local, 0)} pb`); text("contagion-level", `${state.inputs.contagion} %`);
  const error = portfolioError(result);
  if (error) showAnalysisError(error);
  else {
    $('analysis-status').setAttribute('role', 'status');
    text('analysis-status', 'Revalorisation conditionnelle à partir des observations sourcées. Sans portage, dividendes, frais ni fiscalité.');
    text('portfolio-value', money(state.amount + result.pnl)); $('pin').disabled = false;
    text("portfolio-pnl", `${result.pnl > 0 ? '+' : ''}${money(result.pnl)}`);
    $("portfolio-pnl").className = `portfolio-headline ${result.pnl < 0 ? "loss" : "gain"}`;
    text("portfolio-pct", `${signed(result.totalReturn * 100)} % du capital initial`);
    $("export").disabled = false;
    bars($("attribution-chart"), result.attribution.filter(a => a.weight > 0).map(a => ({ label: a.short, value: a.contribution * 100, detail: `${num(a.weight, 0)} % · ${money(a.pnl)}`, tip: `Rendement de la position : ${signed(a.return * 100)} %. Contribution = poids × rendement. Impact sur le capital : ${money(a.pnl)}.` })), { unit: "pt" });
    const path = Array.from({ length: 37 }, (_, j) => {
      const t = j / 36, progress = t * t * (3 - 2 * t);
      return { x: t * state.inputs.horizon, y: (1 + evaluate(state, data, progress).totalReturn) * 100 };
    });
    const chartSeries = [{ label: "Scénario actuel", points: path, className: "line-scenario" }];
    if (pinned) {
      const old = evaluate(pinned, data);
      if (old.valid) chartSeries.push({ label: "Comparaison", className: "line-reference", points: Array.from({ length: 37 }, (_, j) => {
        const t = j / 36, elapsedMonths = t * state.inputs.horizon;
        const normalized = Math.min(1, elapsedMonths / pinned.inputs.horizon);
        return { x: elapsedMonths, y: (1 + evaluate(pinned, data, normalized * normalized * (3 - 2 * normalized)).totalReturn) * 100 };
      }) });
    }
    lines($("portfolio-chart"), chartSeries, { title: "Valorisation conditionnelle du portefeuille et comparaison", unit: "Base 100", xTitle: "Horizon · mois", xFormat: n => num(n, 0) });
  }
  if (pinned) {
    $("comparison-note").hidden = false; const old = evaluate(pinned, data);
    $("comparison-note").replaceChildren(element("span", "", `Comparaison : ${pinned.name} · ${money(pinned.amount)} · résultat ${old.valid ? `${money(old.pnl)} (${signed(old.totalReturn * 100)} %)` : "données/allocation à compléter"}.`));
    const clear = element("button", "button", "Effacer"); clear.addEventListener("click", () => { pinned = null; render(); }); $("comparison-note").append(clear);
  } else $("comparison-note").hidden = true;
  if (result.curve.some(p => p.base !== null)) {
    const series = [
      { label: "Observé", className: "line-observed", points: result.curve.filter(p => p.base !== null).map(p => ({ x: p.tenor, y: p.base })) },
      { label: "Scénario", className: "line-scenario", points: result.curve.filter(p => p.target !== null).map(p => ({ x: p.tenor, y: p.target })) },
    ];
    if (pinned) series.push({ label: "Comparaison", className: "line-reference", points: evaluate(pinned, data).curve.filter(p => p.target !== null).map(p => ({ x: p.tenor, y: p.target })) });
    lines($("yield-chart"), series, { title: "Courbe française observée et stressée", unit: "% par an", xTitle: "Échéance constante · années", xFormat: n => `${num(n, 0)} ans`, xTicks: $("yield-chart").clientWidth < 430 ? [2, 10, 30] : [2, 5, 10, 30] });
    const p = result.curve.find(p => p.date);
    text("curve-caption", `Observation commune : ${dateLabel(p.date)}. Choc commun parallèle et prime française modulée selon l’échéance (2 ans ×0,35 ; 5 ans ×0,65 ; 10 ans ×1 ; 30 ans ×1,3).`);
  } else { if (!modelReady) loadingChart($("yield-chart"), "Chargement de la courbe française…"); else emptyChart($("yield-chart"), "Courbe non disponible actuellement."); text("curve-caption", "Les observations manquantes restent signalées."); }
  renderCountries(result);
  const marketRows = ["cac", "banks", "europe", "us", "gold"].map(id => ({ label: ASSETS.find(a => a.id === id).short, value: result.returns[id] * 100, detail: `Base 100 → ${num(100 * (1 + result.returns[id]))}` }));
  marketRows.push({ label: "Crédit IG", value: result.returns.ig === null ? null : result.returns.ig * 100, detail: "Obligation synthétique · 5 ans" }, { label: "Crédit HY", value: result.returns.hy === null ? null : result.returns.hy * 100, detail: "Obligation synthétique · 4 ans" }, { label: "EUR/USD", value: result.fxPct, detail: "Valeur de l’euro" }, { label: "Énergie", value: state.inputs.energy, detail: "Choc saisi directement" });
  bars($("market-bars"), marketRows);
  renderQuotes(result);
  if (history.moves.length) {
    histogram($("history-chart"), history.moves, target.shock);
    text("history-caption", `${history.moves.length} fenêtres glissantes de 20 observations, qui se chevauchent. Source : taux d’emprunt à 10 ans Webstat sur la dernière année disponible.`);
    text("history-percentile", `${num(history.p95, 0)} pb`);
    text("history-insight", `95e percentile des amplitudes historiques sur 20 observations. Votre choc France 10 ans est de ${signed(target.shock, 0)} pb, soit ${history.p95 > 0 ? `${num(Math.abs(target.shock) / history.p95, 1)} fois` : "une comparaison indéfinie avec"} ce repère. L’horizon du scénario (${state.inputs.horizon} mois) peut être différent.`);
  } else { if (!modelReady) loadingChart($("history-chart"), "Récupération des variations historiques…"); else emptyChart($("history-chart"), "Historique taux d’emprunt à 10 ans indisponible."); text("history-percentile", "—"); }
  text("decomposition", `Prime sociale ${signed(result.social, 1)} pb + prime budgétaire ${signed(state.inputs.fiscal, 0)} pb = prime France ${signed(result.local, 1)} pb. Taux communs ${signed(result.common, 0)} pb.`);
  renderEquations(); renderSources();
  if (!modelReady) ['target-oat', 'target-fx', 'history-percentile'].forEach(id => { $(id).dataset.loading = 'true'; $(id).setAttribute('aria-busy', 'true'); });
}

function renderCountries(result) {
  const names = { france: "France", germany: "Allemagne", italy: "Italie" };
  $("country-grid").replaceChildren();
  for (const [id, name] of Object.entries(names)) {
    const country = result.sovereigns[id];
    const tile = element("article", `country ${country.shock > 0 ? 'positive-risk' : country.shock < 0 ? 'negative-risk' : ''}`);
    tile.append(element("span", "", name), element("strong", "", country.target === null ? "—" : `${num(country.target)} %`), element("small", "", `${signed(country.shock, 0)} pb de choc`));
    setTip(tile, `${name} : choc de ${signed(country.shock, 0)} pb. ${id === 'germany' ? 'Le modèle combine les taux communs et un effet de refuge.' : id === 'italy' ? 'Le modèle transmet 60 % de la prime française, modulés par la contagion.' : 'La prime France s’ajoute au choc de taux communs.'} Niveau de départ : moyenne mensuelle observée ; niveau final : scénario.`);
    if (!monthlyReady) { tile.dataset.loading = 'true'; tile.setAttribute('aria-busy', 'true'); }
    tile.append(element("small", "", country.date ? `${num(country.value)} % · ${monthLabel(country.date)}` : "Niveau observé non disponible")); $("country-grid").append(tile);
  }
}
function renderQuotes(result) {
  $("quote-status").replaceChildren();
  if (!quotesReady) { $("quote-status").dataset.loading = "true"; $("quote-status").textContent = "Recherche des cotations disponibles…"; return; }
  const labels = { cac40: ["CAC 40", "cac"], stoxx600: ["STOXX 600", "europe"], sp500: ["S&P 500", "us"] };
  for (const [id, [name, asset]] of Object.entries(labels)) {
    const quote = data.quotes[id];
    const rawReturn = asset === "us" && !state.hedge ? (1 + result.returns.us) * (1 + result.fxPct / 100) - 1 : result.returns[asset];
    const description = quote && quote.latest.value > 0
      ? `${name} : ${num(quote.latest.value)} points observés le ${dateLabel(quote.latest.date)} → ${num(quote.latest.value * (1 + rawReturn))} points dans le scénario (devise de l’indice).`
      : `${name} : cotation quotidienne non disponible dans les séries Webstat identifiées ; simulation en base 100.`;
    $("quote-status").append(element("p", "", description));
  }
}
function renderEquations() {
  const p = state.parameters;
  const descriptions = [
    `Prime sociale = ${num(p.socialMax, 0)} × (1 − exp(−semaines / 8)) × intensité / 100, en pb. Prime France = prime sociale + choc budgétaire.`,
    "Taux souverains : France = taux communs + prime France ; Allemagne = taux communs − 0,12 × max(prime France, 0) × contagion ; Italie : coefficient 0,60. Contagion exprimée entre 0 et 1.",
    `Actions France (%) = −${num(p.equityBeta)} × prime France / 100 − 0,012 × taux communs − 0,030 × énergie. Banques (%) = −${num(p.bankBeta)} × prime France / 100 − 0,006 × taux communs − 0,018 × énergie.`,
    `Actions Europe (%) = −${num(p.europeBeta)} × prime France / 100 × contagion − 0,010 × taux communs − 0,020 × énergie. Actions US (%) = −0,010 × prime France × contagion − 0,006 × taux communs − 0,015 × énergie.`,
    `EUR/USD (%) = −${num(p.fxBeta)} × prime France / 100 × (0,35 + 0,65 × contagion) + 0,005 × taux communs + choc change saisi. Or USD (%) = 0,012 × max(prime France, 0) × (0,3 + 0,7 × contagion) − 0,010 × taux communs + 0,020 × énergie.`,
    "Les variations actions, or et EUR/USD sont plafonnées entre −80 % et +80 % pour conserver des niveaux positifs. Exposition USD non couverte : rendement EUR = (1 + rendement USD) / (1 + variation EUR/USD) − 1. Une couverture complète neutralise ce facteur, sans modéliser son coût.",
    "Obligation synthétique : P = somme des coupons annuels actualisés + nominal actualisé, au rendement stressé. Coupon égal au rendement initial ; P initial = 100. Valorisation sans passage du temps. Le rendement stressé n’est pas un rendement total d’indice obligataire.",
    `Crédit synthétique : rendement initial IG = taux d’emprunt à 5 ans + ${num(p.igSpread, 0)} pb ; HY = taux d’emprunt à 5 ans + ${num(p.hySpread, 0)} pb (hypothèses, pas des spreads observés). Choc IG = taux communs + 0,3 × prime France × contagion + choc crédit ; choc HY = taux communs + 1,2 × prime France × contagion + 2 × choc crédit. IG : échéance 5 ans ; HY : 4 ans.`,
    "Les comparaisons conservées sont recalculées sur les mêmes données de départ, avec leurs hypothèses, montant, allocation et horizon respectifs. Elles ne représentent pas un historique de performances réalisées.",
  ];
  $("equations").replaceChildren(...descriptions.map(d => element("p", "", d)));
}
function renderSources() {
  $("source-table").replaceChildren();
  for (const source of data.sources) {
    const row = element("tr");
    const labelCell = element('td');
    if (source.sourceUrl && /^https:\/\//.test(source.sourceUrl)) {
      const link = element('a', '', source.label); link.href = source.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; labelCell.append(link);
    } else labelCell.textContent = source.label;
    row.append(labelCell);
    [`${source.frequency === "monthly" ? "Mensuelle" : "Quotidienne"} · ${source.source}`, source.frequency === "monthly" ? monthLabel(source.latest.date) : dateLabel(source.latest.date), source.key].forEach(value => row.append(element('td', '', value)));
    $("source-table").append(row);
  }
}

async function share() {
  const url = new URL(location.href); url.hash = new URLSearchParams({ s: JSON.stringify(cleanState(state)) }).toString();
  window.history.replaceState(null, "", url);
  text("action-status", "Préparation du lien de scénario…");
  let timer;
  try {
    await Promise.race([
      navigator.clipboard.writeText(url.href),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Clipboard unavailable")), 1200); }),
    ]);
    text("action-status", "Lien copié : scénario, sensibilités et portefeuille sont inclus. Les données seront actualisées à l’ouverture.");
  } catch (_) { text("action-status", "Le scénario est enregistré dans l’adresse de cette page. Copiez cette adresse pour le partager."); }
  finally { clearTimeout(timer); }
}
function csvCell(value) {
  if (typeof value === "number") return String(value);
  let string = String(value ?? ""); if (/^[=+@\-\t\r]/.test(string)) string = `'${string}`;
  return `"${string.replaceAll('"', '""')}"`;
}
function exportAnalysis() {
  const result = evaluate(state, data); if (!result.valid || $("export").disabled) return;
  const rows = [
    ["Analyse conditionnelle · Omar EL ADLOUNI"], ["Scénario", state.name], ["Date de l’export", new Date().toISOString()],
    ["Valeur du portefeuille EUR", state.amount], ["Échéance OAT", state.tenor], ["Change USD couvert", state.hedge ? "Oui (coût non modélisé)" : "Non"],
    ["Allocation type", matchingPortfolio(state.weights)?.name || "Personnalisée"], ["SRI réglementaire", "Non attribué : allocation simulée sans DIC de produit"],
    ["Impact EUR", result.pnl], ["Rendement %", result.totalReturn * 100], [], ["Hypothèse", "Valeur"],
    ...Object.entries(state.inputs).map(([k, v]) => [INPUTS[k].label, v]),
    ...Object.entries(state.parameters).map(([k, v]) => [parameterNames[k][0], v]),
    [], ["Actif", "Allocation %", "Variation %", "Contribution points %", "P&L EUR"],
    ...result.attribution.map(a => [a.label, a.weight, a.return === null ? "Indisponible" : a.return * 100, a.contribution === null ? "Indisponible" : a.contribution * 100, a.pnl]),
    [], ["Source", "Code", "Date", "Valeur observée", "Unité"],
    ...data.sources.map(s => [`${s.label} · ${s.source}`, s.key, s.latest.date, s.latest.value, s.unit]),
    [], ["Hypothèses", "Sensibilités de scénario paramétrables ; pas de probabilités électorales. Actions en base 100 si aucune cotation reçue. Sans coupons encaissés, frais, dividendes, fiscalité ou passage du temps."],
    ...Array.from($("equations").children).map(el => ["Équation", el.textContent]),
  ];
  const blob = new Blob(["\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = element("a"); const objectUrl = URL.createObjectURL(blob); link.href = objectUrl; link.download = "analyse-scenario-marches.csv";
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  text("action-status", "Analyse exportée : résultats, allocation, hypothèses, équations et provenance des données.");
}

buildForm(); initJourney(); initInteractions(); initIndices(); render();
if (new URLSearchParams(location.hash.slice(1)).has('s')) text('action-status', 'Analyse restaurée depuis un lien partagé. Les résultats utilisent les données disponibles à cette ouverture.');
setTip($('portfolio-pnl'), 'Écart de valorisation du portefeuille sous le scénario choisi. Calcul en euros, à allocation constante, sans dividendes, portage, frais ni fiscalité.');
setTip($('target-oat'), 'Rendement France 10 ans dans le scénario : taux d’emprunt observé à 10 ans + choc commun + prime France. Ce rendement n’est pas la performance de l’obligation.');
setTip($('target-fx'), 'Taux EUR/USD conditionnel : référence observée multipliée par le choc de change du modèle.');
setTip($('history-percentile'), '95e percentile des amplitudes de variation sur 20 observations : 95 % des mouvements de l’échantillon avaient une amplitude inférieure ou égale. Il ne mesure pas une probabilité future.');
loadData().catch(() => {
  modelReady = monthlyReady = quotesReady = true;
  ['live-oat', 'live-fx', 'live-spread', 'quote-status'].forEach(id => finishLoading($(id)));
  text("data-status", "La connexion a été interrompue. Actualisez la page pour réessayer."); render();
});
let measuredWidth = 0;
if (window.ResizeObserver) new ResizeObserver(entries => {
  const width = Math.floor(entries[0].contentRect.width);
  if (width !== measuredWidth) { measuredWidth = width; requestAnimationFrame(render); }
}).observe(document.querySelector("main"));

initContext(source => { data.sources.push(source); renderSources(); }, shock => {
  state.inputs.rates = shock; custom(); syncForm(); persist(); render();
  text("scenario-feedback", `Variation historique AAA 10 ans appliquée aux taux communs : ${signed(shock, 0)} pb. Les autres hypothèses sont conservées ; ce rejeu ne constitue pas une prévision.`);
  goToStage("simulation");
}).catch(() => text("context-status", "La BCE et son relais sont momentanément indisponibles. Les données Webstat et les scénarios restent accessibles."));
