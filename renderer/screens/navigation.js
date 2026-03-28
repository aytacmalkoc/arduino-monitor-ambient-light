import { viewPanels, navLinks } from '../dom.js';

export function updateNavActive(view) {
  navLinks.forEach((link) => {
    const v = link.getAttribute('data-view');
    const active = v === view;
    link.setAttribute('aria-current', active ? 'page' : 'false');
    link.classList.toggle('nav-active-pill', active);
    link.classList.toggle('bg-surface-container-lowest/80', active);
    link.classList.toggle('text-on-surface', active);
    link.classList.toggle('text-on-surface-variant', !active);
    link.classList.toggle('opacity-80', !active);
    link.classList.toggle('hover:bg-surface-container-highest', !active);
  });
}

export function showView(view) {
  const key = view in viewPanels ? view : 'controls';
  Object.entries(viewPanels).forEach(([k, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', k !== key);
  });
  updateNavActive(key);
  if (!window.location.hash || window.location.hash === '#') {
    window.history.replaceState(null, '', `#/${key}`);
  }
}

export function parseHash() {
  const h = (window.location.hash || '#/controls').replace(/^#\/?/, '');
  const name = h.split('/')[0] || 'controls';
  if (['controls', 'presets', 'automation', 'advanced', 'settings'].includes(name)) {
    showView(name);
  } else {
    showView('controls');
  }
}
