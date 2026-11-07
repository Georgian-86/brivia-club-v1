// The landing page's footer on the other public pages (about, privacy, careers), and its nav (menu button, START
// SWIPING, the side menu) on about and privacy, so the public pages share one footer and one header (D-223; careers
// keeps its own hero header). The markup is in each page's HTML
// (crawlers and no-JS readers see the footer links); this file brings the landing styles they need and wires the menu.
import '../styles/tokens.css';
import '../styles/fonts.css';
import '../styles/style.css';
import '../styles/deep-wine-theme.css';
import '../styles/mobile-site.css';
import '../styles/mobile-final-fixes.css';
import '../styles/aura-theme.css';
import '../styles/site-chrome.css';
import { supabase } from './supabase.js';

const overlay = document.querySelector('.menu-overlay');
const trigger = document.querySelector('.menu-trigger');
const setMenuOpen = (isOpen) => {
  if (!overlay) return;
  overlay.classList.toggle('open', isOpen);
  overlay.setAttribute('aria-hidden', String(!isOpen));
  overlay.inert = !isOpen;
  trigger?.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('menu-open', isOpen);
  if (isOpen) overlay.querySelector('.menu-close')?.focus();
  else trigger?.focus({ preventScroll: true });
};
trigger?.addEventListener('click', () => setMenuOpen(true));
overlay?.querySelector('.menu-close')?.addEventListener('click', () => setMenuOpen(false));
overlay?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));
overlay?.addEventListener('click', (event) => { if (event.target === overlay) setMenuOpen(false); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay?.classList.contains('open')) setMenuOpen(false); });

document.querySelectorAll('[data-menu-auth]').forEach((button) => button.addEventListener('click', () => {
  window.location.href = `/auth.html#${button.dataset.menuAuth}`;
}));

const membership = document.querySelector('.menu-drawer-bottom');
const logout = document.querySelector('[data-menu-logout]');
const updateSession = async () => {
  if (!supabase || !membership) return;
  const { data } = await supabase.auth.getSession();
  const isLoggedIn = Boolean(data?.session?.user);
  membership.classList.toggle('is-authenticated', isLoggedIn);
  if (logout) logout.hidden = !isLoggedIn;
};
updateSession();
supabase?.auth.onAuthStateChange(() => updateSession());
logout?.addEventListener('click', async () => {
  logout.disabled = true;
  try {
    await supabase?.auth.signOut();
    window.localStorage.removeItem('brivia-member-profile');
    window.localStorage.removeItem('brivia-pending-profile');
  } finally {
    window.location.href = '/';
  }
});

// The nav sits over cream pages; over the dark footer the menu icon turns white, as on the landing.
const nav = document.querySelector('.hero-nav');
const footer = document.querySelector('.site-footer');
if (nav && footer && 'IntersectionObserver' in window) {
  const navMid = () => nav.getBoundingClientRect().top + nav.offsetHeight / 2;
  const update = () => {
    const box = footer.getBoundingClientRect();
    const y = navMid();
    nav.classList.toggle('is-over-dark', box.top <= y && box.bottom >= y);
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}
