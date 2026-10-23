# Intégrer Portfolio Stress Test à un site existant

Ce dépôt contient exclusivement le simulateur, ses fonctions de données, sa construction et sa documentation. Le site de l’auteur est géré séparément.

## Installer ou actualiser la rubrique

Depuis le dépôt du simulateur :

```bash
npm run integrate-site -- /chemin/vers/le-site-existant
```

Le dossier cible doit déjà contenir `index.html` et `netlify.toml`. Le script copie :

- l’interface, `assets/` et `content/` dans la rubrique définie par `simulatorPath` dans `config/site.json` ;
- les fonctions Webstat, BCE et DBnomics dans `netlify/functions/` ;
- le catalogue des séries autorisées dans `netlify/lib/`.

Les liens vers le site de l’auteur sont adaptés à une navigation relative. Le script ne copie pas l’accueil, les autres rubriques, la configuration globale, les statistiques ou les scripts de construction du site cible. Une intégration ne réimporte jamais les sources du site cible dans ce dépôt.

Le site cible conserve sa propre construction, ses métadonnées et ses variables d’environnement Netlify. Les modifications du simulateur doivent être faites dans ce dépôt, puis intégrées à nouveau.

## Preview Netlify

Depuis le dossier du site cible déjà lié à Netlify :

```bash
npm run build
npx netlify-cli deploy --build --context deploy-preview
```

Le résultat est un aperçu du site avec le simulateur actualisé. La clé `WEBSTAT_API_KEY` doit être disponible côté serveur dans le contexte utilisé. Aucune publication de production ne fait partie de cette procédure.

Pour une installation autonome, utiliser directement `npm run dev` ou `npm run preview` depuis le dépôt du simulateur.
