import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const json = value => JSON.stringify(value).replaceAll('<','\\u003c');

export async function readSettings(root) {
  const settings = JSON.parse(await readFile(path.join(root,'config/site.json'),'utf8'));
  settings.url = new URL(process.env.SITE_URL || settings.url).origin;
  settings.simulatorPath = process.env.SIMULATOR_PATH || settings.simulatorPath;
  if (!/^\/(?:[a-z0-9-]+\/)*$/.test(settings.simulatorPath)) throw new Error('SIMULATOR_PATH doit être / ou un chemin comme /simulateur/.');
  settings.production = process.env.CONTEXT === 'production';
  settings.analytics = JSON.parse(await readFile(path.join(root,'config/analytics.json'),'utf8'));
  settings.analytics.enabled = Boolean(settings.production && settings.analytics.enabled && /^[a-f0-9-]{36}$/i.test(settings.analytics.websiteId) && /^https:\/\//.test(settings.analytics.scriptUrl));
  return settings;
}

export function metadata(html, settings, page) {
  const canonical = `${settings.url}${page.path}`;
  const image = `${settings.url}${settings.simulatorPath}assets/social/simulateur.png`;
  const graph = [
    {'@type':'Person','@id':`${settings.url}/#author`,name:settings.author,url:settings.linkedin},
    {'@type':'WebPage',url:canonical,name:page.title,description:page.description,inLanguage:settings.language},
  ];
  if (page.simulator) graph.push({'@type':'SoftwareApplication',name:settings.simulatorName,url:canonical,applicationCategory:'FinanceApplication',operatingSystem:'Navigateur Web',isAccessibleForFree:true,license:`${settings.github}/blob/main/LICENSE`,codeRepository:settings.github,author:{'@id':`${settings.url}/#author`}});
  const analytics = {...settings.analytics,hostname:new URL(settings.url).hostname};
  html = html.replace(/<title>[\s\S]*?<\/title>/i,`<title>${esc(page.title)}</title>`)
    .replace(/\s*<meta name="(?:description|robots)"[^>]*>/gi,'')
    .replace(/\s*<link rel="canonical"[^>]*>/gi,'');
  return html.replace('</head>',`
    <link rel="stylesheet" href="/assets/analytics.css">
    <script type="application/json" id="audience-config">${json(analytics)}</script><script defer src="/assets/analytics.js"></script>
    ${settings.analytics.searchConsoleVerification ? `<meta name="google-site-verification" content="${esc(settings.analytics.searchConsoleVerification)}">` : ''}
    <meta name="description" content="${esc(page.description)}">
    <meta name="robots" content="${settings.production?'index, follow, max-image-preview:large':'noindex, nofollow'}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:locale" content="fr_FR"><meta property="og:type" content="website">
    <meta property="og:site_name" content="${esc(settings.simulatorName)}"><meta property="og:title" content="${esc(page.title)}">
    <meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Portfolio Stress Test">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}"><meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${esc(image)}">
    <script type="application/ld+json">${json({'@context':'https://schema.org','@graph':graph})}</script>
  </head>`);
}

export async function buildSupportPages(output, settings) {
  const privacy = `<!doctype html><html lang="fr" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Confidentialité | Portfolio Stress Test</title><link rel="icon" href="/assets/favicon.svg"><link rel="stylesheet" href="/assets/simulator.css"></head><body><main class="privacy-content"><p class="eyebrow">Portfolio Stress Test</p><h1>Confidentialité &amp; mesure d’audience</h1><p>Le simulateur est accessible sans compte. Les montants, allocations et hypothèses saisis ne sont pas transmis à un service d’audience.</p><h2>Statistiques de visite</h2><p>${settings.analytics.enabled?'Après votre accord, Umami peut mesurer les pages consultées, la provenance, des paliers de temps actif et la progression dans la page. Les paramètres et fragments des adresses ne sont pas transmis.':'La mesure d’audience est désactivée sur cette installation. Aucun événement de visite ou de lecture n’est envoyé à Umami.'}</p><p>Lorsqu’un suivi est configuré, il commence après votre accord. Votre choix est conservé six mois dans le navigateur ; Do Not Track et Global Privacy Control sont respectés.</p>${settings.analytics.enabled?'<button class="button" type="button" data-audience-preferences>Modifier mon choix d’audience</button>':''}<h2>Données et services externes</h2><p>Les données du modèle sont demandées aux fonctions serveur du projet. La clé Webstat reste côté serveur. Le bandeau de cotations charge un widget TradingView, soumis aux conditions de son fournisseur. Le thème et les simulations conservées utilisent le stockage local du navigateur.</p><h2>Contact</h2><p><a href="${esc(settings.linkedin)}" rel="noopener noreferrer" target="_blank">Contacter ${esc(settings.author)} sur LinkedIn</a></p><p><a href="/">Retour au simulateur</a></p></main></body></html>`;
  await mkdir(path.join(output,'confidentialite'),{recursive:true});
  await writeFile(path.join(output,'confidentialite/index.html'),metadata(privacy,settings,{path:'/confidentialite/',title:'Confidentialité | Portfolio Stress Test',description:'Confidentialité, stockage local et préférences de mesure d’audience du simulateur Portfolio Stress Test.'}));
  await writeFile(path.join(output,'404.html'),`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page introuvable | Portfolio Stress Test</title><link rel="stylesheet" href="/assets/simulator.css"></head><body><main><h1>Cette page n’existe pas.</h1><a href="/">Retour à Portfolio Stress Test</a></main></body></html>`);
  await writeFile(path.join(output,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(settings.url+settings.simulatorPath)}</loc></url><url><loc>${esc(settings.url+'/confidentialite/')}</loc></url></urlset>\n`);
  await writeFile(path.join(output,'robots.txt'),settings.production?`User-agent: *\nAllow: /\nSitemap: ${settings.url}/sitemap.xml\n`:'User-agent: *\nDisallow: /\n');
  await writeFile(path.join(output,'_headers'),`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n${settings.production?'':'  X-Robots-Tag: noindex, nofollow\n'}`);
}
