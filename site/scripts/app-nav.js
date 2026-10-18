// One member navigation (Phase C, Task 2): the same four items in the desktop header and the mobile tab bar.
// Pure (no DOM): app.js writes navMarkup() into [data-nav-host="header"] and [data-nav-host="tabbar"].
// Internal view names stay stable: the deck is view 'explore' (labelled Connect), the community feed is view 'posts'
// (labelled Explore). 'home' is an alias of the deck, so it marks Connect as current.

const svg = (body) => `<svg class="app-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;

export const NAV_ITEMS = Object.freeze([
  { view: 'explore', label: 'Connect', icon: svg('<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="9.5" ry="4.5"/><circle cx="20.5" cy="10.5" r="1"/>') },
  { view: 'posts', label: 'Explore', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.4 13.4 8.5 15.5l2.1-4.9 4.9-2.1Z"/>') },
  { view: 'chat', label: 'Chat', icon: svg('<path d="M5 6.5h14v9H10l-4 3v-3H5Z"/>') },
  { view: 'profile', label: 'Profile', icon: svg('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 19.5c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5"/>') },
].map(Object.freeze));

const VARIANTS = ['header', 'tabbar'];

// The nav item that is current for a view: the 'home' alias renders the deck, so Connect.
export const navViewFor = (view) => (view === 'home' ? 'explore' : view);

export const navMarkup = (variant, activeView) => {
  if (!VARIANTS.includes(variant)) throw new Error(`navMarkup: unknown variant "${variant}"`);
  const active = navViewFor(activeView);
  return NAV_ITEMS.map(({ view, label, icon }) => {
    const current = view === active ? ' aria-current="page"' : '';
    const badge = view === 'chat' ? '<i class="nav-badge" data-chat-badge hidden></i>' : '';
    return `<a class="app-nav-button app-nav-button--${variant}${view === active ? ' is-active' : ''}" href="/app.html?view=${view}" data-nav="${view}"${current}>${icon}<span class="app-nav-label">${label}</span>${badge}</a>`;
  }).join('');
};

// Marks the current item in every nav host (aria-current="page" plus the legacy is-active class).
export const markCurrentNav = (root, view) => {
  const active = navViewFor(view);
  root.querySelectorAll('[data-nav-host] [data-nav]').forEach((item) => {
    const isCurrent = item.dataset.nav === active;
    item.classList.toggle('is-active', isCurrent);
    if (isCurrent) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
};

// Writes the conversation count into every chat badge; a count of 0 hides the badge.
export const setChatBadges = (root, count) => {
  const n = Number(count) || 0;
  root.querySelectorAll('[data-chat-badge]').forEach((badge) => {
    badge.textContent = n > 0 ? String(n) : '';
    badge.hidden = n <= 0;
  });
};
