import { WORLD_INDICES } from '../content/indices.js';
// Le flux reste isolé du portefeuille dans une iframe d’une autre origine.
// Les cours et l’attribution du fournisseur ne sont ni extraits ni recouverts.
export function initIndices() {
  const host = document.getElementById('indices-feed'), status = document.getElementById('indices-status');
  const retry = document.getElementById('indices-retry');
  let generation = 0, timer, lastStarted = 0;
  function unavailable() {
    clearTimeout(timer); status.textContent = 'Le flux de cotations tarde à répondre.';
    host.classList.remove('indices-loading'); host.setAttribute('aria-busy', 'false'); retry.hidden = false;
  }
  function start() {
    const current = ++generation; lastStarted = Date.now(); clearTimeout(timer);
    host.replaceChildren(); host.classList.add('indices-loading'); host.setAttribute('aria-busy', 'true');
    status.textContent = 'Connexion aux cotations…'; retry.hidden = true;
    const iframe = document.createElement('iframe');
    iframe.title = 'Cotations des marchés mondiaux · TradingView · données potentiellement différées';
    iframe.width = '100%'; iframe.height = '46'; iframe.style.border = '0'; iframe.style.display = 'block';
    iframe.referrerPolicy = 'strict-origin';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    const config = {
      symbols: WORLD_INDICES, locale: 'fr', displayMode: 'regular', showSymbolLogo: false,
      colorTheme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      isTransparent: false, width: '100%', height: 46,
      utm_source: location.hostname || 'apercu-local', utm_medium: 'widget_new', utm_campaign: 'ticker-tape',
      ...(/^https?:$/.test(location.protocol) ? { 'page-uri': `${location.origin}${location.pathname}` } : {}),
    };
    iframe.src = `https://www.tradingview-widget.com/embed-widget/ticker-tape/?locale=fr#${encodeURIComponent(JSON.stringify(config))}`;
    iframe.addEventListener('load', () => {
      if (generation !== current) return;
      clearTimeout(timer); host.classList.remove('indices-loading'); host.setAttribute('aria-busy', 'false');
      status.textContent = 'Cotations TradingView chargées. Les délais varient selon les places.'; retry.hidden = true;
    }, { once: true });
    iframe.addEventListener('error', () => { if (generation === current) unavailable(); }, { once: true });
    const credit = document.createElement('div'); credit.className = 'ribbon-credit';
    const link = document.createElement('a'); link.href = 'https://fr.tradingview.com/markets/indices/'; link.target = '_blank'; link.rel = 'noopener nofollow'; link.textContent = 'Indices par TradingView';
    credit.append(link); host.append(iframe, credit);
    timer = setTimeout(unavailable, 18000);
  }
  retry.addEventListener('click', start);
  new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastStarted > 300000) start(); });
  start();
}
