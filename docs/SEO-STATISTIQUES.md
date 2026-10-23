# Référencement et statistiques de Portfolio Stress Test

## Référencement

La construction du simulateur génère un titre, une description, un canonical, les balises Open Graph et Twitter, une carte de partage, des données structurées pour l’application, un sitemap, `robots.txt`, une page de confidentialité et une page 404.

Les paramètres sont dans `config/site.json`. Pour une installation autonome sur son propre domaine, définir `SITE_URL` et `SIMULATOR_PATH=/`, ou adapter ces valeurs dans la configuration. L’URL de référence par défaut correspond à l’installation de l’auteur.

Seul le contexte Netlify `production` autorise l’indexation. Les previews ont `noindex, nofollow`, un en-tête `X-Robots-Tag` et un fichier `robots.txt` bloquant l’exploration. La publication de production reste une action distincte.

Une intégration au sein d’un autre site utilise la construction et le référencement propres à ce site.

## Suivi optionnel

Aucun suivi n’est actif par défaut. `config/analytics.json` ne contient pas d’identifiant personnel :

```json
{
  "enabled": false,
  "websiteId": "",
  "scriptUrl": "",
  "searchConsoleVerification": ""
}
```

Pour utiliser Umami, renseigner son propre identifiant public et l’URL HTTPS de son script, puis activer `enabled`. La collecte nécessite le contexte de production, le domaine configuré et l’accord du visiteur. Les previews restent exclues. Pour Search Console, renseigner la valeur publique `content` de la balise de validation ; ne jamais placer de clé d’administration dans ce fichier.

Les événements optionnels portent uniquement sur les visites, le domaine de provenance externe ou le chemin interne, des paliers de temps actif (30 s, 60 s, 3 min, 5 min), la progression (25 %, 50 %, 75 %, 100 %), l’export, l’accès au code et le contact. Les montants, allocations, hypothèses, paramètres d’URL et fragments ne sont pas transmis.

Le temps actif ne progresse que lorsque la page est visible, la fenêtre active et une interaction récente a eu lieu. Il mesure une activité approximative, sans prouver une lecture. Aucun profil utilisateur n’est créé avec `identify()`.

Le choix du visiteur est mémorisé six mois et modifiable depuis la page Confidentialité. Les signaux Do Not Track et Global Privacy Control sont respectés. Le widget TradingView garde ses propres conditions ; le thème et les simulations enregistrées utilisent le stockage local du navigateur.
