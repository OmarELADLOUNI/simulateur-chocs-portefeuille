(() => {
  const configElement = document.querySelector('#audience-config');
  if (!configElement) return;
  const config = JSON.parse(configElement.textContent);
  const key = 'omar-audience-choice';
  const ttl = 180 * 24 * 60 * 60 * 1000;
  const configured = config.enabled && [config.hostname,`www.${config.hostname}`].includes(location.hostname) && /^[a-f0-9-]{36}$/i.test(config.websiteId) && config.scriptUrl?.startsWith('https://');
  let allowed = false;
  let banner;
  let tracker;
  let loaded = false;
  let pageviewSent = false;
  let seconds = 0;
  let lastAction = Date.now();
  const thresholds = new Set();
  const progress = new Set();
  function choice() {
    try { const saved = JSON.parse(localStorage.getItem(key)); return saved && Date.now()-saved.at<ttl ? saved.value : null; }
    catch { return null; }
  }
  function track(name) { if (allowed && loaded && window.umami) window.umami.track(props => ({...props,url:location.pathname,referrer:safeReferrer(),name,data:{}})); }
  function safeReferrer() {
    try { const url = new URL(document.referrer); return url.origin === location.origin ? url.pathname : url.origin; }
    catch { return ''; }
  }
  function start() {
    if (!configured || navigator.doNotTrack==='1' || navigator.globalPrivacyControl) return;
    allowed = true;
    if (tracker) return;
    tracker = document.createElement('script');
    tracker.defer = true;
    tracker.src = config.scriptUrl;
    tracker.dataset.websiteId = config.websiteId;
    tracker.dataset.autoPageview = 'false';
    tracker.onload = () => {
      loaded = true;
      if (allowed && !pageviewSent) { window.umami?.track(props => ({...props,url:location.pathname,referrer:safeReferrer()})); pageviewSent = true; }
    };
    document.head.append(tracker);
  }
  function setChoice(value) {
    try { localStorage.setItem(key,JSON.stringify({value,at:Date.now()})); } catch { /* Choix pour cette page si le stockage est bloqué. */ }
    allowed = value === 'yes';
    if (allowed) start();
    banner?.remove(); banner = null;
  }
  function preferences() {
    if (!configured || banner) return;
    banner = document.createElement('section');
    banner.className = 'audience-banner';
    banner.setAttribute('aria-label','Vos préférences de mesure d’audience');
    banner.innerHTML = '<p>Avec votre accord, Umami mesure les visites et la lecture pour améliorer le site. Aucun contenu saisi dans le simulateur n’est transmis. <a href="/confidentialite/">En savoir plus</a></p><div><button type="button" data-choice="no">Refuser</button><button type="button" data-choice="yes">Autoriser</button></div>';
    banner.addEventListener('click',event => { const button = event.target.closest('[data-choice]'); if (button) setChoice(button.dataset.choice); });
    document.body.append(banner);
  }
  document.querySelectorAll('[data-audience-preferences]').forEach(button => button.addEventListener('click',preferences));
  addEventListener('storage',event=>{
    if(event.key!==key&&event.key!==null)return;
    allowed=false;
    if(choice()==='yes')start();
    else if(choice()===null)preferences();
  });
  if (!configured) return;
  if (choice()==='yes') start(); else if (choice()===null && !navigator.globalPrivacyControl && navigator.doNotTrack!=='1') preferences();
  ['pointerdown','keydown','scroll','touchstart'].forEach(name => addEventListener(name,()=>{ lastAction=Date.now(); },{passive:true}));
  setInterval(() => {
    if (!allowed || !loaded || document.visibilityState!=='visible' || !document.hasFocus() || Date.now()-lastAction>60000) return;
    seconds += 5;
    [30,60,180,300].forEach(limit => { if (seconds>=limit && !thresholds.has(limit)) { thresholds.add(limit); track(`lecture_active_${limit}s`); } });
    const article = document.querySelector('#article') || document.querySelector('main');
    if (!article || seconds<5) return;
    const rect = article.getBoundingClientRect();
    const percentage = Math.min(100, Math.max(0,(innerHeight-rect.top)/rect.height*100));
    [25,50,75,100].forEach(limit => { if (percentage>=limit && !progress.has(limit)) { progress.add(limit); track(`progression_${limit}`); } });
  },5000);
  document.addEventListener('click',event => {
    const target = event.target.closest('a,button');
    if (!target) return;
    if (target.id==='export' && !target.disabled) track('exporter_analyse');
    else if (target.matches('a')) {
      const url = new URL(target.href);
      if (url.hostname==='github.com') track('ouvrir_github');
      else if (url.hostname.endsWith('linkedin.com')) track('contact_linkedin');
      else if (url.origin===location.origin && url.pathname.startsWith('/simulateur-chocs-portefeuille/')) track('ouvrir_simulateur');
    }
  });
})();
