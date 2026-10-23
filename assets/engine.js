import { ASSETS, DEFAULT_PARAMETERS, INPUTS, SCENARIOS } from "../content/scenarios.js";

export const DEFAULT_STATE = {
  version: 1, name: SCENARIOS[1].title, inputs: { ...SCENARIOS[1].values },
  parameters: { ...DEFAULT_PARAMETERS }, amount: 1000000, tenor: 10, hedge: false,
  weights: Object.fromEntries(ASSETS.map(a => [a.id, a.defaultWeight])),
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function cleanState(raw = {}) {
  const state = structuredClone(DEFAULT_STATE);
  state.name = typeof raw.name === "string" ? raw.name.slice(0, 80) : state.name;
  for (const [key, def] of Object.entries(INPUTS)) {
    const value = raw.inputs?.[key];
    if (typeof value === "number" && Number.isFinite(value)) state.inputs[key] = clamp(value, def.min, def.max);
  }
  for (const key of Object.keys(DEFAULT_PARAMETERS)) {
    const value = raw.parameters?.[key];
    if (typeof value === "number" && Number.isFinite(value)) state.parameters[key] = clamp(value, 0, key.endsWith("Spread") ? 1500 : key === "socialMax" ? 250 : 15);
  }
  if (Number.isFinite(raw.amount)) state.amount = clamp(raw.amount, 1000, 1000000000);
  if ([2, 5, 10, 30].includes(raw.tenor)) state.tenor = raw.tenor;
  state.hedge = raw.hedge === true;
  for (const a of ASSETS) {
    const value = raw.weights?.[a.id];
    if (typeof value === "number" && Number.isFinite(value)) state.weights[a.id] = clamp(value, 0, 100);
  }
  return state;
}

// Full repricing of a synthetic annual-coupon bond bought at par; no passage of time.
export function bondPrice(yieldPercent, couponPercent, years) {
  if (![yieldPercent, couponPercent, years].every(Number.isFinite) || yieldPercent <= -100 || years < 1) return null;
  const y = yieldPercent / 100;
  let value = 0;
  for (let t = 1; t <= years; t++) value += (couponPercent + (t === years ? 100 : 0)) / (1 + y) ** t;
  return value;
}
export function bondReturn(base, shockBps, years) {
  if (!Number.isFinite(base)) return null;
  const initial = bondPrice(base, base, years);
  const stressed = bondPrice(base + shockBps / 100, base, years);
  return initial && stressed !== null ? stressed / initial - 1 : null;
}

export function evaluate(rawState, data = {}, progress = 1) {
  const state = cleanState(rawState);
  const p = state.parameters;
  const i = state.inputs;
  const f = clamp(progress, 0, 1);
  // Saturation avoids assuming an unlimited linear relation between protest duration and yields.
  const social = p.socialMax * (1 - Math.exp(-i.weeks / 8)) * i.intensity / 100;
  const local = (social + i.fiscal) * f;
  const contagion = i.contagion / 100;
  const common = i.rates * f;
  const energy = i.energy * f;
  const shifts = {
    france: common + local,
    germany: common - Math.max(local, 0) * .12 * contagion,
    italy: common + local * .60 * contagion,
  };
  const tenorMultiplier = { 2: .35, 5: .65, 10: 1, 30: 1.3 };
  const curve = [2, 5, 10, 30].map(tenor => {
    const base = data.curve?.[tenor]?.value;
    const shock = common + local * tenorMultiplier[tenor];
    return { tenor, base: Number.isFinite(base) ? base : null, shock, target: Number.isFinite(base) ? base + shock / 100 : null, date: data.curve?.[tenor]?.date };
  });
  const fxPct = clamp(-p.fxBeta * local / 100 * (.35 + .65 * contagion) + .005 * common + i.fx * f, -80, 80);
  const raw = {
    cac: -p.equityBeta * local / 100 - .012 * common - .030 * energy,
    banks: -p.bankBeta * local / 100 - .006 * common - .018 * energy,
    europe: -p.europeBeta * local / 100 * contagion - .010 * common - .020 * energy,
    us: -.010 * local * contagion - .006 * common - .015 * energy,
    gold: .012 * Math.max(local, 0) * (.3 + .7 * contagion) - .010 * common + .020 * energy,
  };
  const returns = Object.fromEntries(Object.entries(raw).map(([k, percent]) => [k, clamp(percent, -80, 80) / 100 || 0]));
  for (const id of ["us", "gold"]) if (!state.hedge) returns[id] = (1 + returns[id]) / (1 + fxPct / 100) - 1;
  returns.oat = bondReturn(data.curve?.[state.tenor]?.value, curve.find(c => c.tenor === state.tenor).shock, state.tenor);
  returns.bund = bondReturn(data.sovereigns?.germany?.value, shifts.germany, 10);
  const creditBase = data.curve?.[5]?.value;
  returns.ig = bondReturn(Number.isFinite(creditBase) ? creditBase + p.igSpread / 100 : null, common + .3 * local * contagion + i.credit * f, 5);
  returns.hy = bondReturn(Number.isFinite(creditBase) ? creditBase + p.hySpread / 100 : null, common + 1.2 * local * contagion + 2 * i.credit * f, 4);
  returns.cash = 0;
  const weightTotal = Object.values(state.weights).reduce((sum, n) => sum + n, 0);
  const missing = ASSETS.filter(a => state.weights[a.id] > 0 && returns[a.id] === null).map(a => a.id);
  const valid = Math.abs(weightTotal - 100) < .01 && missing.length === 0;
  const attribution = ASSETS.map(a => ({ ...a, weight: state.weights[a.id], return: returns[a.id],
    contribution: returns[a.id] === null ? null : returns[a.id] * state.weights[a.id] / 100,
    pnl: returns[a.id] === null ? null : returns[a.id] * state.weights[a.id] / 100 * state.amount,
  }));
  const totalReturn = valid ? attribution.reduce((sum, a) => sum + (a.contribution || 0), 0) : null;
  const sovereigns = Object.fromEntries(["france", "germany", "italy"].map(country => {
    const base = data.sovereigns?.[country];
    return [country, { ...base, shock: shifts[country], target: Number.isFinite(base?.value) ? base.value + shifts[country] / 100 : null }];
  }));
  return { social: social * f, fiscal: i.fiscal * f, local, common, shifts, fxPct, curve, sovereigns, returns, attribution,
    weightTotal, missing, valid, totalReturn, pnl: totalReturn === null ? null : totalReturn * state.amount,
    eurusd: Number.isFinite(data.eurusd?.value) ? data.eurusd.value * (1 + fxPct / 100) : null,
  };
}

export function historicalMoves(observations, window = 20) {
  const values = observations.filter(o => Number.isFinite(o.value));
  const moves = values.slice(window).map((o, index) => ({ from: values[index].date, date: o.date, bps: (o.value - values[index].value) * 100 }));
  const magnitudes = moves.map(m => Math.abs(m.bps)).sort((a, b) => a - b);
  if (!magnitudes.length) return { moves, p95: null };
  const position = .95 * (magnitudes.length - 1);
  const left = Math.floor(position);
  return { moves, p95: magnitudes[left] + (magnitudes[Math.ceil(position)] - magnitudes[left]) * (position - left) };
}

export function commonObservations(series) {
  if (!series.length) return null;
  const maps = series.map(s => new Map(s.observations.map(o => [o.date, o])));
  const dates = [...maps[0].keys()].filter(d => maps.every(m => m.has(d))).sort();
  const date = dates.at(-1);
  return date ? { date, values: maps.map(m => m.get(date)) } : null;
}
