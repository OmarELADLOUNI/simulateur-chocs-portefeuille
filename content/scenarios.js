// Scénarios éditables. Les chocs sont des hypothèses de travail, jamais des probabilités électorales.
export const SCENARIOS = [
  { id: "reference", title: "Point de départ", tag: "Aucun choc", text: "Conserver les observations de marché et examiner les expositions du portefeuille.", values: { weeks: 0, intensity: 0, contagion: 0, fiscal: 0, rates: 0, energy: 0, fx: 0, horizon: 6 } },
  { id: "social", title: "Mobilisation prolongée", tag: "Tensions sociales", text: "Huit semaines de mobilisation perturbent l’activité. La prime de risque française augmente et les secteurs domestiques sont exposés.", values: { weeks: 8, intensity: 65, contagion: 20, fiscal: 15, rates: 0, energy: 0, fx: 0, horizon: 6 } },
  { id: "contagion", title: "Propagation européenne", tag: "Fragmentation", text: "Les tensions françaises s’étendent aux marchés voisins. Les écarts de taux souverains et la pression sur les banques s’amplifient.", values: { weeks: 12, intensity: 80, contagion: 85, fiscal: 35, rates: -15, energy: 5, fx: 0, horizon: 6 } },
  { id: "election", title: "Après la présidentielle", tag: "Blocage budgétaire", text: "Une issue électorale sans majorité budgétaire stable retarde les arbitrages. La hausse de prime de risque est une hypothèse réglable.", values: { weeks: 4, intensity: 35, contagion: 35, fiscal: 50, rates: 0, energy: 0, fx: 0, horizon: 12 } },
  { id: "recovery", title: "Accord et désescalade", tag: "Confiance", text: "Un accord social et une trajectoire budgétaire jugée crédible réduisent la prime française. Les taux communs européens baissent légèrement.", values: { weeks: 1, intensity: 10, contagion: 10, fiscal: -40, rates: -20, energy: -5, fx: 0, horizon: 6 } },
  { id: "inflation", title: "Énergie et taux élevés", tag: "Choc macro", text: "L’énergie renchérit les coûts et les taux européens remontent. Le choc commun se cumule avec la prime de risque française.", values: { weeks: 3, intensity: 20, contagion: 30, fiscal: 10, rates: 65, energy: 35, fx: 0, horizon: 6 } },
];

export const DEFAULT_PARAMETERS = {
  socialMax: 80, equityBeta: 3.5, bankBeta: 5.5, europeBeta: 2.5, fxBeta: 1.5, igSpread: 150, hySpread: 450,
};
export const ASSETS = [
  { id: "oat", label: "Obligations françaises", short: "France", kind: "bond", defaultWeight: 35 },
  { id: "bund", label: "Obligations allemandes", short: "Allemagne", kind: "bond", defaultWeight: 0 },
  { id: "ig", label: "Crédit de qualité · IG synthétique", short: "Crédit IG", kind: "bond", defaultWeight: 0 },
  { id: "hy", label: "Crédit haut rendement · HY synthétique", short: "Crédit HY", kind: "bond", defaultWeight: 0 },
  { id: "cac", label: "Actions françaises · CAC 40", short: "CAC 40", kind: "equity", defaultWeight: 25 },
  { id: "banks", label: "Banques européennes", short: "Banques", kind: "equity", defaultWeight: 10 },
  { id: "europe", label: "Actions européennes · STOXX 600", short: "STOXX 600", kind: "equity", defaultWeight: 10 },
  { id: "us", label: "Actions américaines · S&P 500", short: "S&P 500", kind: "equity", defaultWeight: 10 },
  { id: "gold", label: "Or · exposition en USD", short: "Or", kind: "commodity", defaultWeight: 0 },
  { id: "cash", label: "Trésorerie en euros", short: "Trésorerie", kind: "cash", defaultWeight: 10 },
];

export const INPUTS = {
  weeks: { min: 0, max: 26, step: 1, label: "Durée des tensions", unit: "semaines" },
  intensity: { min: 0, max: 100, step: 5, label: "Intensité des perturbations", unit: "%" },
  contagion: { min: 0, max: 100, step: 5, label: "Propagation européenne", unit: "%" },
  fiscal: { min: -100, max: 150, step: 5, label: "Prime budgétaire après l’élection", unit: "pb" },
  rates: { min: -100, max: 150, step: 1, label: "Mouvement commun des taux", unit: "pb" },
  energy: { min: -40, max: 80, step: 5, label: "Choc sur le prix de l’énergie", unit: "%" },
  credit: { min: -100, max: 400, step: 5, label: "Écart de crédit d’entreprise", unit: "pb" },
  fx: { min: -15, max: 15, step: .5, label: "Choc EUR/USD supplémentaire", unit: "%" },
  horizon: { min: 1, max: 12, step: 1, label: "Horizon de matérialisation", unit: "mois" },
};

// Choc de spread IG ; le modèle applique un multiplicateur de deux au HY.
SCENARIOS.forEach((s, index) => { s.values.credit = [0, 35, 90, 80, -30, 60][index]; });
