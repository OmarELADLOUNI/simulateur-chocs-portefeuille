# Données et API

## Architecture

```text
Navigateur → fonctions du même projet Netlify → Webstat / BCE / DBnomics
           ↘ iframe TradingView : affichage indépendant des calculs
```

La variable `WEBSTAT_API_KEY` est lue uniquement par la fonction serveur `webstat.mjs`. La clé n’apparaît ni dans le HTML, ni dans JavaScript côté navigateur, ni dans les liens partagés ou exports. La passerelle `market-data.mjs` protège les deux fournisseurs sur le chemin `/api/market-data/:provider`. La fonction limite les séries et périodes autorisées et ne constitue pas un relais vers une URL arbitraire.

## Références utilisées

| Données | Fréquence | Usage |
|---|---|---|
| Taux d’emprunt français à 2, 5, 10 et 30 ans | Quotidienne | Courbe et obligations synthétiques françaises |
| EUR/USD | Quotidienne | Conversion des expositions en dollars |
| Taux longs de convergence France, Allemagne et Italie | Mensuelle | Comparaison souveraine et référence allemande |
| CISS zone euro et États-Unis | Quotidienne selon publication | Contexte du stress financier |
| Taux zéro coupon AAA à 2 et 10 ans | Jours de publication BCE | Contexte des taux et pente à date commune |
| EUR/GBP et EUR/JPY | Quotidienne selon publication | Contexte des changes |
| Instruments du bandeau TradingView | Selon le fournisseur | Affichage, sans extraction pour le modèle |

La BCE est prioritaire pour le contexte. Si son accès direct échoue, la fonction tente la même série via DBnomics et indique ce relais. Les taux souverains mensuels passent par Webstat, avec un secours BCE si les observations sont vides.

Les identifiants techniques `tec2`, `tec5`, `tec10` et `tec30` restent ceux des appels existants ; leurs libellés affichent les échéances en français. Les références complètes des fournisseurs sont conservées pour permettre la traçabilité.

Les alias actions `cac40`, `stoxx600` et `sp500` cherchent une série quotidienne identifiable sans ambiguïté dans le catalogue Webstat. Si elle manque, l’interface le signale et présente les rendements conditionnels en base 100. Le bandeau TradingView ne remplace pas cette recherche et les CFD américains sont identifiés comme tels.

## Routes du serveur

```text
/api/market-data/webstat?series=tec10&range=1y
/api/market-data/ecb?series=aaa10&range=5y
```

Webstat autorise `1m`, `3m`, `1y` et `5y`. Le contexte BCE autorise `1y` et `5y`. Les routes servent uniquement les séries explicitement définies dans le code. DBnomics est un relais serveur de la BCE, sans point d’entrée supplémentaire contournant la limite de débit. Les anciens chemins natifs ne sont plus déployés.

Les réponses contiennent la source, l’identifiant de série, la date de récupération, les observations et la dernière observation reçue. Les dernières valeurs disponibles peuvent être décalées par rapport à la date du jour.

Le registre « Observations effectivement reçues » de la page principale présente les références réellement chargées et leurs liens sources. L’ancien explorateur Webstat séparé est remplacé par ce registre.

## Actualisation et indisponibilités

- Webstat : cache de quatre heures dans la fonction et sur le CDN.
- BCE directe : cache d’une heure ; secours DBnomics : cinq minutes.
- Les valeurs absentes, non numériques, prévisionnelles ou signalées non fiables sont exclues lors de la normalisation.
- Un message distingue chargement, configuration manquante, quota et indisponibilité.
- Les indicateurs de chargement ne constituent pas des valeurs de marché provisoires.

## Configuration locale

Copier `.env.example` vers `.env` et renseigner sa propre clé. Netlify Dev lit ce fichier local. Pour un déploiement, configurer la variable dans Netlify, pour les Functions et le contexte utilisé ; un fichier `.env` ignoré par Git ne sera pas transmis par le dépôt.

Les variables d’environnement de l’auteur ne sont pas fournies avec le projet. Chaque nouvelle installation utilise sa propre clé et ses propres quotas.

## Documentation des fournisseurs

- [Webstat · migration et API](https://webstat.banque-france.fr/pages/guide-migration-api/)
- [BCE · API](https://data.ecb.europa.eu/help/api/overview)
- [BCE · taux longs de convergence](https://data.ecb.europa.eu/methodology/long-term-interest-rate-statistics)
- [DBnomics · API](https://docs.db.nomics.world/web-api/)
- [DBnomics · conditions](https://docs.db.nomics.world/legal-terms/)
- [TradingView · widgets](https://www.tradingview.com/widget-docs/)

La licence MIT du code ne modifie pas les conditions des données et composants externes. Les séries ne sont pas embarquées comme une archive redistribuée dans ce dépôt ; elles sont interrogées auprès des fournisseurs.
