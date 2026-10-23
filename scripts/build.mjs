import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { metadata, readSettings, buildSupportPages } from '../lib/simulator-build.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// Liste explicite des seuls fichiers publics : ni configuration locale, ni clés.
for (const name of ['index.html', 'assets', 'content', '_redirects']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
console.log('Simulateur prêt dans dist/. Les fonctions restent dans netlify/functions/.');
const settings=await readSettings(root);
const html=await readFile(path.join(output,'index.html'),'utf8');
await writeFile(path.join(output,'index.html'),metadata(html.replace('</footer>','<a class="footer-privacy" href="/confidentialite/">Confidentialité</a></footer>'),settings,{path:settings.simulatorPath,title:settings.simulatorTitle,description:settings.simulatorDescription,simulator:true}));
await buildSupportPages(output,settings);
