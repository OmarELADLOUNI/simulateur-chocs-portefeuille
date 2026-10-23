// Modèles d’allocation, pas des positions observées ni des fonds commercialisés.
// Les ratios 20/80 à 80/20 sont documentés dans la gamme Vanguard LifeStrategy.
// Les poches sont adaptées au périmètre Europe/États-Unis du simulateur.
export const PORTFOLIO_REFERENCE = {
  name: 'Vanguard · ratios LifeStrategy',
  url: 'https://investor.vanguard.com/investment-products/mutual-funds/life-strategy-funds',
};
export const SRI_NOTE = 'Le SRI réglementaire, de 1 à 7, figure dans le DIC d’un produit identifié. Un ratio actions/obligations ne suffit pas à le déterminer. Ces allocations simulées n’ont pas de SRI officiel ; aucun score de fonds ne leur est transféré.';
export const PORTFOLIOS = [
  { id: 'prudent', name: 'Prudent', equity: 20, bonds: 80, description: 'Dominante obligataire et exposition actions limitée. Les obligations restent sensibles aux taux.', weights: { oat: 32, bund: 28, ig: 20, hy: 0, cac: 2, banks: 1, europe: 7, us: 10, gold: 0, cash: 0 } },
  { id: 'modere', name: 'Modéré', equity: 40, bonds: 60, description: 'Une majorité d’obligations, complétée par des actions européennes et américaines.', weights: { oat: 24, bund: 21, ig: 15, hy: 0, cac: 4, banks: 2, europe: 14, us: 20, gold: 0, cash: 0 } },
  { id: 'equilibre', name: 'Équilibré', equity: 60, bonds: 40, description: 'Le ratio classique 60/40 : une dominante actions et une poche obligataire de diversification.', weights: { oat: 16, bund: 14, ig: 10, hy: 0, cac: 6, banks: 3, europe: 21, us: 30, gold: 0, cash: 0 } },
  { id: 'dynamique', name: 'Dynamique', equity: 80, bonds: 20, description: 'Exposition actions majoritaire. Le résultat dépend fortement des mouvements des marchés actions.', weights: { oat: 8, bund: 7, ig: 5, hy: 0, cac: 8, banks: 4, europe: 28, us: 40, gold: 0, cash: 0 } },
];
export function matchingPortfolio(weights) {
  return PORTFOLIOS.find(p => Object.keys(p.weights).every(id => Math.abs((weights[id] || 0) - p.weights[id]) < .005));
}
