# Méthodologie du modèle

Le fichier de référence pour les calculs est [`assets/engine.js`](../assets/engine.js). Les coefficients initiaux et scénarios sont dans [`content/scenarios.js`](../content/scenarios.js). Ce document décrit le modèle présent dans le dépôt, sans prétendre à une calibration économétrique.

## 1. Observations et hypothèses

Les taux français à 2, 5, 10 et 30 ans sont alignés sur une date commune. Le taux euro–dollar conserve sa date propre. Les comparaisons souveraines utilisent des taux longs mensuels à date commune : ils ne sont pas confondus avec les références françaises quotidiennes.

Les dates et sources sont affichées dans l’interface. Une observation absente reste absente. Les rendements actions et or reposent sur les sensibilités du scénario ; une cotation TradingView n’est pas utilisée comme entrée cachée du modèle.

## 2. Prime française et taux souverains

En points de base, la prime sociale est calculée ainsi :

```text
prime sociale = plafond × (1 − exp(−semaines / 8)) × intensité / 100
prime France = prime sociale + prime budgétaire
```

La saturation évite une relation linéaire sans limite entre durée des tensions et taux. Les coefficients sont des hypothèses modifiables.

Le mouvement commun des taux s’ajoute aux primes propres aux pays. La France reçoit l’ensemble de sa prime ; l’Allemagne peut bénéficier d’un effet de refuge ; l’Italie reçoit une fraction de la prime française, modulée par la propagation européenne. Les paramètres exacts sont visibles dans les équations de la page et dans le moteur.

La prime France est modulée selon l’échéance française : 2 ans × 0,35 ; 5 ans × 0,65 ; 10 ans × 1 ; 30 ans × 1,3. Le choc commun est parallèle.

## 3. Revalorisation obligataire

Chaque exposition obligataire représente une obligation synthétique au pair, de nominal 100, avec coupon annuel égal au rendement de départ. Le calcul actualise tous les coupons et le remboursement au rendement stressé, sans passage du temps.

```text
prix stressé = somme des flux actualisés au rendement stressé
rendement de scénario = prix stressé / prix initial − 1
```

Pour le crédit IG et HY, les spreads initiaux sont des hypothèses ajoutées au taux français à 5 ans. Le choc de spread, sa transmission et les échéances synthétiques sont explicites dans le moteur. Ces positions ne constituent pas des indices obligataires observés.

## 4. Actions, or et change

Les rendements conditionnels combinent prime France, propagation, taux communs et énergie avec des sensibilités explicites. Certaines sensibilités peuvent être modifiées dans les paramètres avancés.

Les variations actions, or et change sont bornées entre −80 % et +80 % dans le moteur. Pour une exposition en dollars non couverte :

```text
rendement EUR = (1 + rendement USD) / (1 + variation EUR/USD) − 1
```

La couverture complète neutralise ce facteur de change, sans modéliser son coût. La trésorerie en euros conserve une valeur constante, sans rendement de dépôt.

## 5. Portefeuille et comparaison

La contribution d’une position au rendement total est son poids multiplié par son rendement. Le résultat monétaire est proportionnel au capital. L’interface rééquilibre les autres poids au prorata et conserve un total de 100 %.

Une valorisation de portefeuille n’est affichée que si les références nécessaires aux positions détenues sont disponibles. Les comparaisons conservées sont recalculées sur les mêmes observations de départ, avec leurs montants, allocations et hypothèses respectifs.

Le CSV inclut résultats, composition, hypothèses, équations et provenance des données. Un lien partagé inclut le capital, l’allocation et les paramètres du scénario dans l’adresse : son destinataire peut les lire. Il ne contient ni clé ni cours figés.

## 6. Historique et trajectoire conventionnelle

L’histogramme utilise les variations du taux français à 10 ans sur **20 observations glissantes**, dans la dernière année disponible. Les fenêtres se chevauchent. Les barres représentent leur fréquence dans l’échantillon ; les classes dépendent de l’historique et restent stables quand le scénario change.

Le repère à 95 % porte sur l’amplitude absolue de ces variations. Ce percentile n’est pas une probabilité future et son horizon peut différer de celui du scénario.

La trajectoire de mise en place utilise une progression lissée, conventionnelle, du choc. Elle illustre un mécanisme ; elle ne prévoit pas le calendrier des cours.

## 7. Portée et limites

Le modèle ne représente ni un carnet d’ordres, ni la liquidité, ni une prévision des résultats électoraux. Il ne calcule pas le portage, les dividendes, les coûts de couverture, les frais ou la fiscalité. Les sensibilités ne sont pas estimées statistiquement à partir des manifestations ou des élections.

Les résultats sont des simulations conditionnelles, pas des recommandations d’achat ou de vente. Les allocations ne disposent pas d’un SRI officiel : un ratio actions/obligations ne suffit pas à attribuer celui d’un produit réglementé.
