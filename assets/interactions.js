const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const tracked = new WeakSet(), firstDrawing = new WeakSet();
const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting || reduced()) continue;
    const chart = entry.target;
    chart.querySelectorAll('polyline').forEach((line, i) => {
      line.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 850, delay: i * 100, easing: 'cubic-bezier(.2,.7,.3,1)' });
    });
    chart.querySelectorAll('.market-fill,.distribution-bin').forEach((bar, i) => {
      bar.animate([{ transform: 'scaleY(.05)', opacity: .25 }, { transform: 'scaleY(1)', opacity: 1 }], { duration: 550, delay: Math.min(i * 30, 250), easing: 'cubic-bezier(.2,.7,.3,1)' });
    });
    chart.animate([{ opacity: .45, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 650, easing: 'ease-out' });
  }
}, { threshold: .22 }) : null;
export function observeChart(container) {
  if (observer && !tracked.has(container)) { observer.observe(container); tracked.add(container); }
  if (!firstDrawing.has(container) && container.querySelector('svg,.market-fill')) {
    firstDrawing.add(container);
    if (!reduced()) requestAnimationFrame(() => {
      const r = container.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) container.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 650, easing: 'ease-out' });
    });
  }
}
export function loadingChart(container, message = 'Chargement des observations…') {
  if (container.dataset.loading === 'true') return;
  container.replaceChildren(); container.dataset.loading = 'true'; container.setAttribute('aria-busy', 'true');
  const loader = document.createElement('div'); loader.className = 'chart-loading'; loader.setAttribute('role', 'status');
  const graphic = document.createElement('div'); graphic.className = 'loading-bars'; graphic.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) { const bar = document.createElement('i'); bar.style.setProperty('--i', i); bar.style.height = `${24 + ((i * 37) % 70)}%`; graphic.append(bar); }
  const label = document.createElement('span'); label.textContent = message; loader.append(graphic, label); container.append(loader);
}
export function finishLoading(container) { container.dataset.loading = 'false'; container.setAttribute('aria-busy', 'false'); }
export function helpButton(text, label = 'Comprendre cet indicateur') {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'info-trigger'; button.textContent = 'i'; button.dataset.tip = text; button.setAttribute('aria-label', label); return button;
}
export function addHelp(target, text) {
  const button = helpButton(text), control = target.tagName === 'LABEL' ? target.querySelector('input,select') : null;
  if (control) target.insertBefore(button, control); else target.append(button);
}
export function setTip(target, text) {
  target.dataset.tip = text;
  if (!['BUTTON', 'INPUT', 'SELECT', 'A'].includes(target.tagName)) target.tabIndex = 0;
}
export function initInteractions() {
  const tip = document.createElement('div'); tip.id = 'simulation-tooltip'; tip.className = 'simulation-tooltip'; tip.role = 'tooltip'; tip.hidden = true; document.body.append(tip);
  let active;
  const hide = () => { active?.removeAttribute('aria-describedby'); active = null; tip.hidden = true; };
  const position = () => {
    if (!active || !active.isConnected) return hide();
    const r = active.getBoundingClientRect(), t = tip.getBoundingClientRect();
    const left = Math.max(12, Math.min(innerWidth - t.width - 12, r.left + r.width / 2 - t.width / 2));
    const top = r.bottom + 12 + t.height < innerHeight ? r.bottom + 12 : Math.max(12, r.top - t.height - 12);
    tip.style.left = `${left}px`; tip.style.top = `${top}px`;
  };
  const show = target => {
    if (!target?.dataset.tip) return;
    active?.removeAttribute('aria-describedby'); active = target; tip.textContent = target.dataset.tip; tip.hidden = false; target.setAttribute('aria-describedby', tip.id); position();
  };
  document.addEventListener('pointerover', e => { const target = e.target.closest('[data-tip]'); if (target && target !== active) show(target); });
  document.addEventListener('pointerout', e => { if (active && !active.contains(e.relatedTarget) && !tip.contains(e.relatedTarget)) hide(); });
  document.addEventListener('focusin', e => { const target = e.target.closest('[data-tip]'); if (target) show(target); });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', e => { const target = e.target.closest('.info-trigger'); if (target) show(target); else if (!e.target.closest('[data-tip]')) hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, { passive: true }); window.addEventListener('resize', hide);
  document.querySelectorAll('[data-help]').forEach(target => addHelp(target, target.dataset.help));
  document.querySelectorAll('.chart,#market-bars,#attribution-chart,#composition-bar').forEach(observeChart);
}
