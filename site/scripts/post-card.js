// Explore post card (polish wave C2): pure markup, no DOM, no storage.
//
// A card is a wine header bar (avatar, the author's name as a profile trigger, date), a 5:4 media block, a two-line
// caption and a wine action bar of four buttons (like, comment, share, save). Every value is escaped by the caller's
// escapeHtml. The view wires the buttons by data-post-action (post-reactions.js persists like and save).

const ICONS = {
  like: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>',
  comment: '<path d="M20 11.6a8 8 0 0 1-11.7 7.1L4 20l1.3-4.1A8 8 0 1 1 20 11.6z"/>',
  share: '<path d="M20.5 3.5 3.5 10.4l7 3.1 3.1 7z"/><path d="m20.5 3.5-10 10"/>',
  save: '<path d="M6.5 4.5h11v15L12 15.8l-5.5 3.7z"/>',
};

const icon = (kind) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[kind]}</svg>`;

// count (D-101): likes, comments and shares that members see; 0 or undefined shows no number.
const actionButton = (kind, label, pressed, count) => `<button type="button" class="post-card-action" data-post-action="${kind}"${pressed === undefined ? '' : ` aria-pressed="${pressed}"`}>${icon(kind)}<span>${label}</span>${count > 0 ? `<b class="post-card-count" data-post-count="${kind}" aria-label="${count}">${count > 999 ? '999+' : count}</b>` : ''}</button>`;

// Only an https: URL or a same-origin path ("/media/...", never protocol-relative "//host") renders as an image;
// anything else (javascript:, data:, http:, blob:) gets the placeholder, whatever the caller passed.
export const isSafePostImageSrc = (src) => typeof src === 'string' && (src.startsWith('https:') || /^\/(?![/\\])/.test(src));

// activity (D-101, post-activity.js): { likeCount, commentCount, shareCount }; summary: "Liked by Asha and 3 others".
const activityLine = (activity, summary, escapeHtml) => {
  const comments = activity?.commentCount || 0;
  if (!summary && !comments) return '';
  return `<div class="post-card-activity">${summary ? `<p class="post-card-likes" data-post-likes>${escapeHtml(summary)}</p>` : ''}`
    + `${comments ? `<button type="button" class="post-card-comments-link" data-post-action="comment">View ${comments === 1 ? 'the comment' : `all ${comments} comments`}</button>` : ''}</div>`;
};

export const postCardMarkup = (post, author, { liked = false, saved = false, imageSrc = '', dateLabel = '', activity = null, summary = '' } = {}, { escapeHtml, renderAvatar }) => {
  const authorId = author?.id || post.author_id || '';
  const name = author?.name || 'Brivia member';
  const media = isSafePostImageSrc(imageSrc)
    ? `<img src="${escapeHtml(imageSrc)}" alt="Post by ${escapeHtml(name)}" loading="lazy" />`
    : '<span class="community-post-image-missing" role="img" aria-label="Image unavailable"></span>';
  return `<article class="post-card" data-post-id="${escapeHtml(post.id)}">`
    + `<header class="post-card-head">${renderAvatar({ name, image: author?.image || '' }, 'post-card-avatar')}`
    + `<button type="button" class="post-card-author" data-public-profile-id="${escapeHtml(authorId)}" aria-label="Open ${escapeHtml(name)} profile">${escapeHtml(name)}</button>`
    + `<time class="post-card-date">${escapeHtml(dateLabel)}</time></header>`
    + `<div class="post-card-media">${media}</div>`
    + `<p class="post-card-caption">${escapeHtml(post.caption || '')}</p>`
    + `<div class="post-card-actions">${actionButton('like', liked ? 'Liked' : 'Like', Boolean(liked), activity?.likeCount)}${actionButton('comment', 'Comment', undefined, activity?.commentCount)}${actionButton('share', 'Share', undefined, activity?.shareCount)}${actionButton('save', saved ? 'Saved' : 'Save', Boolean(saved))}</div>`
    + activityLine(activity, summary, escapeHtml)
    + '</article>';
};

// What the share sheet or clipboard gets: a neutral title and a link. No caption and no name.
export const shareData = (post, origin) => ({ title: 'A post on Brivia Club', url: `${origin}/explore.html?post=${encodeURIComponent(post.id)}` });
