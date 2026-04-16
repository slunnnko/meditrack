// ── UI — toast, modal, nav helpers ──

import { state, notify } from './state.js';
import { t } from './i18n.js';

// ── Toast ──
let toastTimer = null;

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

// ── Navigation ──
export function showSection(name) {
  const sections = document.querySelectorAll('.section');
  for (const s of sections) s.classList.remove('active');
  const navBtns = document.querySelectorAll('.nav-btn');
  for (const b of navBtns) b.classList.remove('active');

  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-sec="${name}"]`);
  if (navBtn) navBtn.classList.add('active');

  state.ui.activeSection = name;
  notify({ type: 'section-change', section: name });
}

// ── Modal ──
export function showModal(title, bodyHtml, actions) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modal').classList.add('show');
}

export function closeModal() {
  document.getElementById('modal').classList.remove('show');
  state.ui.modalDate = null;
}

export function bindModalClose() {
  const overlay = document.getElementById('modal');
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  const closeBtn = document.getElementById('btnModalClose');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
}

// ── Status Bar ──
export function updateStatus(msg, ok) {
  const bar = document.getElementById('statusBar');
  if (!bar) return;
  const g = state.settings.gist;
  if (msg) {
    bar.textContent = msg;
    bar.className = 'status-bar ' + (ok ? 'ok' : 'err');
  } else if (g.token && g.id) {
    bar.textContent = t('status.gistConfigured');
    bar.className = 'status-bar ok';
  } else if (g.token) {
    bar.textContent = t('status.tokenOnly');
    bar.className = 'status-bar';
  } else {
    bar.textContent = t('status.offline');
    bar.className = 'status-bar';
  }
}

// ── Helpers ──
export function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

export function fmtDate(s) {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

export function fmtDateLong(s) {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtDateShort(s) {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function pillClass(v) {
  return v >= 4 ? 'pill-good' : v === 3 ? 'pill-mid' : 'pill-bad';
}

export function scaleColor(v) {
  const colors = ['', '#e05555', '#f0a030', '#8888a0', '#6c8cff', '#4ecb71'];
  return colors[v] || '';
}
