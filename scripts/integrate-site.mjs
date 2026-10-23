import { cp, readFile, realpath, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await realpath(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const destination = process.argv[2];
if (!destination) throw new Error('Indiquez le dossier existant du site : npm run integrate-site -- /chemin/vers/le-site');
const site = await realpath(path.resolve(destination));
if (site === root || site.startsWith(`${root}${path.sep}`) || root.startsWith(`${site}${path.sep}`)) {
  throw new Error('Le site cible doit être distinct du dépôt du simulateur.');
}
for (const name of ['index.html', 'netlify.toml']) {
  if (!(await stat(path.join(site, name))).isFile()) throw new Error(`Site cible incomplet : ${name}`);
}

// Copier uniquement le simulateur et ses fonctions dans un site existant.
const settings=JSON.parse(await readFile(path.join(root,'config/site.json'),'utf8'));
const market = path.resolve(site, `.${settings.simulatorPath}`);
if (!market.startsWith(`${site}${path.sep}`) || market === site) throw new Error('La rubrique doit être un sous-dossier du site cible.');
await mkdir(market, { recursive: true });
const html = (await readFile(path.join(root, 'index.html'), 'utf8'))
  .replaceAll('https://omareladlouni.com/', '../');
await writeFile(path.join(market, 'index.html'), html);
for (const directory of ['assets', 'content']) {
  await cp(path.join(root, directory), path.join(market, directory), { recursive: true });
}
for (const name of ['webstat.mjs', 'ecb.mjs', 'dbnomics.mjs']) {
  await cp(path.join(root, 'netlify/functions', name), path.join(site, 'netlify/functions', name));
}
await mkdir(path.join(site, 'netlify/lib'), { recursive: true });
await cp(path.join(root, 'netlify/lib/market-series.mjs'), path.join(site, 'netlify/lib/market-series.mjs'));
console.log('Portfolio Stress Test et ses fonctions de données ont été intégrés au site cible.');
