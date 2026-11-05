// D-203: a full-screen photo viewer (an event's gallery). A modal <dialog>, so the browser traps focus, closes it on
// Escape and gives focus back to the photo that opened it. Arrows or swipe move between photos; it wraps around.
// openPhotoViewer(srcs, start, { label }) -> close()

export const wrapIndex = (i, n) => (n > 0 ? ((i % n) + n) % n : 0);

const ICON = {
  close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>',
};

export const openPhotoViewer = (srcs = [], start = 0, { label = 'Photos' } = {}) => {
  const photos = srcs.filter(Boolean);
  if (!photos.length || typeof document === 'undefined') return () => {};
  let index = wrapIndex(start, photos.length);
  const many = photos.length > 1;
  const dialog = document.createElement('dialog');
  dialog.className = 'photo-viewer';
  dialog.setAttribute('aria-label', label);
  dialog.innerHTML = `<figure class="photo-viewer-stage"><img alt="" decoding="async" /></figure>
    <button type="button" class="photo-viewer-btn photo-viewer-close" data-photo-close aria-label="Close photo">${ICON.close}</button>
    ${many ? `<button type="button" class="photo-viewer-btn photo-viewer-prev" data-photo-prev aria-label="Previous photo">${ICON.prev}</button>
    <button type="button" class="photo-viewer-btn photo-viewer-next" data-photo-next aria-label="Next photo">${ICON.next}</button>` : ''}
    <p class="photo-viewer-count" aria-live="polite"></p>`;
  const img = dialog.querySelector('img');
  const count = dialog.querySelector('.photo-viewer-count');
  const show = (i) => {
    index = wrapIndex(i, photos.length);
    img.src = photos[index];
    img.alt = `Photo ${index + 1} of ${photos.length}`;
    count.textContent = many ? `${index + 1} / ${photos.length}` : '';
  };
  const close = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-photo-prev]')) show(index - 1);
    else if (t.closest('[data-photo-next]')) show(index + 1);
    else if (t.closest('[data-photo-close]') || t === dialog || t.classList.contains('photo-viewer-stage')) close();
  });
  dialog.addEventListener('keydown', (e) => {
    if (!many) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
  });
  // Swipe: a mostly sideways drag of 40 px or more.
  let downX = null; let downY = null;
  dialog.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  dialog.addEventListener('pointerup', (e) => {
    if (downX === null || !many) return;
    const dx = e.clientX - downX; const dy = e.clientY - downY;
    downX = null;
    if (Math.abs(dx) >= 40 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
  });
  show(index);
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('[data-photo-close]').focus();
  return close;
};
