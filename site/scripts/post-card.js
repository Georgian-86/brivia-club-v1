// Explore post card (polish wave C2): pure markup, no DOM, no storage.
//
// A card is a wine header bar (avatar, the author's name as a profile trigger, date), a 4:5 media block, a two-line
// caption and a wine action bar of four buttons (like, comment, share, save). Every value is escaped by the caller's
// escapeHtml. The view wires the buttons by data-post-action (post-reactions.js persists like and save).

const ICONS = {
  like: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>',
  comment: '<path d="M4.5 5.5h15v10h-8l-4.5 3.5v-3.5h-2.5z"/>',
  share: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 12.5v7h14v-7"/>',
  save: '<path d="M6.5 4.5h11v15L12 15.8l-5.5 3.7z"/>',
};

const icon = (kind) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[kind]}</svg>`;

const actionButton = (kind, label, pressed) => `<button type="button" class="post-card-action" data-post-action="${kind}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${icon(kind)}<span>${label}</span></button>`;

export const postCardMarkup = (post, author, { liked = false, saved = false, imageSrc = '', dateLabel = '' } = {}, { escapeHtml, renderAvatar }) => {
  const authorId = author?.id || post.author_id || '';
  const name = author?.name || 'Brivia member';
  const media = imageSrc
    ? `<img src="${escapeHtml(imageSrc)}" alt="Post by ${escapeHtml(name)}" loading="lazy" />`
    : '<span class="community-post-image-missing" role="img" aria-label="Image unavailable"></span>';
  return `<article class="post-card" data-post-id="${escapeHtml(post.id)}">`
    + `<header class="post-card-head">${renderAvatar({ name, image: author?.image || '' }, 'post-card-avatar')}`
    + `<button type="button" class="post-card-author" data-public-profile-id="${escapeHtml(authorId)}" aria-label="Open ${escapeHtml(name)} profile">${escapeHtml(name)}</button>`
    + `<time class="post-card-date">${escapeHtml(dateLabel)}</time></header>`
    + `<div class="post-card-media">${media}</div>`
    + `<p class="post-card-caption">${escapeHtml(post.caption || '')}</p>`
    + `<div class="post-card-actions">${actionButton('like', liked ? 'Liked' : 'Like', Boolean(liked))}${actionButton('comment', 'Comment')}${actionButton('share', 'Share')}${actionButton('save', saved ? 'Saved' : 'Save', Boolean(saved))}</div>`
    + '</article>';
};

// What the share sheet or clipboard gets: a neutral title and a link. No caption and no name.
export const shareData = (post, origin) => ({ title: 'A post on Brivia Club', url: `${origin}/explore.html?post=${post.id}` });
