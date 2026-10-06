import './app.css';
import './inbox.css';
import './inbox-actions.css';
import './chat-wallpaper.css';
import './profile-theme.css';
import './profile-photo.css';
import './explore-theme.css';
import './deep-wine-theme.css';
import './inbox-linkedin.css';
import './explore-polish.css';
import './member-polish.css';
import './card-reference.css';
import './chat-reference.css';
import './chat-sidebar-fix.css';
import './app-navigation.css';
import './discovery-filters.css';
import './mobile-app.css';
import { supabase, rowToProfile, saveProfile, onboardingStatus, sendSignal, fetchSignalQuota, isRateLimited, isStorageImageUrl, withoutCredentials, uploadMessageAttachment, removeMessageAttachment, uploadCommunityPostImage, removeCommunityPostImage, ImageProcessingError, compressAttachmentFiles, attachmentKind, reportMember, setSensitiveConsent, fetchSensitiveConsentAt } from './supabase.js';
import { deleteAccount, clearBriviaKeys, DELETE_BUCKETS } from './account-deletion.js';
import { openPrivacyAccount } from './privacy-account.js';
import { openReportDialog, bindCardOverflow, cardOverflowOpen, reportSuccessCopy } from './report-dialog.js';
import { defaultCoverUrl, normalizeCoverUrl } from './cover-assets.js';
import { quotaLabel, quotaErrorText, quotaBlocked, quotaNotice } from './signal-quota.js';
import { pitchLine, deckChips, deckEmptyState, deckFields } from './deck-view.js';
import { chatEmojiCategories } from './chat-emoji-data.js';
import { chatGifCatalog } from './chat-gif-data.js';
import './chat-attachments.css';
import './mobile-final-fixes.css';
import './community-feed.css';
import './chat-empty-state.css';
import './deck.css';
import './report-dialog.css';
import './privacy-account.css';

document.body.classList.add('app-auth-pending');
let appBackGuardActive = false;
 

// Never render cached profile data as the current user. The authenticated
// Supabase session and completed profile are the source of truth.
let memberProfile = {};
// my_onboarding_status().place_label: the member's own area name (never another member's).
let memberPlaceLabel = '';

let people = [];
let remoteMatchIds = [];
let remoteConnectionIds = [];
let notifications = [];
// Incoming pending connection requests (shown in the notifications panel).
let pendingRequests = [];
const respondingRequestIds = new Set();

let currentIndex = 0;
let currentPerson = people[0];
let activeFilter = 'all';
const exploreFilters = { query: '', skills: new Set(), lookingFor: new Set() };
const filterDrafts = { skills: '', lookingFor: '' };
let activeChatFilter = 'all';
let chatSearchQuery = '';
let selectedChat = null;
let chatShouldOpenAtLatest = false;
let suppressChatAutoOpen = false;
let pitchPerson = null;
// Ruling P13: a like opens the pitch sheet and defers its single request until the sheet resolves.
let pendingPitch = null; // { person, resolved }
// The sheet covers the deck as soon as it opens, so the second click of a double-click can land on its
// backdrop: backdrop clicks during the opening window are ignored (Task 3b).
const PITCH_OPENING_MS = 400;
let pitchOpenedAt = 0;
const pitchSheetVisible = () => !document.querySelector('#pitch-modal')?.hidden;
const chatMessages = {};
const readChatIds = new Set();
let messageSyncTimer = null;
let connectionSyncTick = 0;
const overlayIds = ['pitch-modal'];
const hiddenChatsStorageKey = () => `brivia-hidden-chats:${memberProfile.id || 'anonymous'}`;
const readHiddenChatIds = () => {
  try {
    const ids = JSON.parse(window.localStorage.getItem(hiddenChatsStorageKey()) || '[]');
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch { return new Set(); }
};
const saveHiddenChatIds = (ids) => {
  try {
    window.localStorage.setItem(hiddenChatsStorageKey(), JSON.stringify([...ids]));
    return true;
  } catch { return false; }
};
const blockedUsersStorageKey = () => `brivia-blocked-users:${memberProfile.id || 'anonymous'}`;
const readBlockedUserIds = () => {
  try {
    const ids = JSON.parse(window.localStorage.getItem(blockedUsersStorageKey()) || '[]');
    return new Set(Array.isArray(ids) ? ids.map(String) : []);
  } catch { return new Set(); }
};
const saveBlockedUserIds = (ids) => {
  try {
    window.localStorage.setItem(blockedUsersStorageKey(), JSON.stringify([...ids]));
    return true;
  } catch { return false; }
};
const syncBlockedUserIds = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await supabase
    .from('brivia_blocks')
    .select('blocked_id')
    .eq('blocker_id', memberProfile.id);
  if (error) {
    if (!/relation|table|schema cache|brivia_blocks/i.test(error.message || '')) console.warn('Blocked users could not load:', error.message);
    return;
  }
  const blockedIds = readBlockedUserIds();
  (data || []).forEach((row) => blockedIds.add(String(row.blocked_id)));
  saveBlockedUserIds(blockedIds);
};
const saveRemoteBlock = async (personId, blocked) => {
  if (!supabase || !memberProfile.id) return { error: new Error('Block service is unavailable.') };
  if (blocked) {
    // Insert, never upsert: there is no update policy on brivia_blocks, so an upsert of an existing block fails.
    // A duplicate (23505) means the block already exists, which is the outcome we wanted.
    const result = await supabase.from('brivia_blocks').insert({ blocker_id: memberProfile.id, blocked_id: personId });
    return result.error?.code === '23505' ? { ...result, error: null } : result;
  }
  return supabase.from('brivia_blocks').delete().eq('blocker_id', memberProfile.id).eq('blocked_id', personId);
};
const blockedDatabaseMessage = (error) => /brivia_blocks|relation|schema cache|row-level security|policy/i.test(error?.message || '')
  ? 'Block setup is not enabled yet. Run the SQL files in supabase/migrations/ (in order) in the Supabase SQL Editor.'
  : (error?.message || 'Could not update block status. Please try again.');
const restoreChatForMe = (personId) => {
  const hiddenIds = readHiddenChatIds();
  if (hiddenIds.delete(String(personId))) saveHiddenChatIds(hiddenIds);
};
const restoreConversation = (personId) => {
  restoreChatForMe(personId);
  if (!remoteMatchIds.some((id) => String(id) === String(personId))) remoteMatchIds.push(personId);
};

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
// Member photo / cover URLs come from other members' rows and auto-load for every viewer. Allow only this
// project's Storage public URLs (VITE_SUPABASE_URL origin), same-site assets (preset covers) or an inline image
// preview; anything else (any other https host, a tracking pixel) falls back to initials / the default cover.
// Always escaped, so a crafted photo_url can never break out of the src attribute (stored XSS).
const safeImageUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw || /["'<>`\\]/.test(raw)) return '';
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) return raw;
  if (isStorageImageUrl(raw)) return new URL(raw).href;
  try {
    const url = new URL(raw, window.location.href);
    if (url.origin === window.location.origin) return url.href;
  } catch { /* not a URL */ }
  return '';
};
// Chat attachment URLs come from message rows: only https or same-origin URLs become links or media (no
// javascript:, data: or plain http), and they are always escaped where they are interpolated.
const safeAttachmentUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'https:' || url.origin === window.location.origin) return url.href;
  } catch { /* not a URL */ }
  return '';
};
// External GIF links auto-load only from the hosts of the built-in GIF picker (Ruling I9); any other https
// URL becomes a click-to-open link, so a crafted row cannot make every viewer's browser fetch a tracker.
const GIF_AUTOLOAD_HOSTS = new Set(chatGifCatalog.map((gif) => { try { return new URL(gif.url).hostname; } catch { return ''; } }).filter(Boolean));
const attachmentFromRow = (message) => (message.attachment_path || message.attachment_url ? {
  // New rows carry only attachment_path (private bucket, rendered through a signed URL). attachment_url is
  // kept for external GIF links and for legacy rows, which have no path and show as unavailable.
  url: message.attachment_url || '',
  path: message.attachment_path || '',
  name: message.attachment_name || 'Attachment',
  mime: message.attachment_mime || '',
  kind: message.message_type || ((message.attachment_mime || '').startsWith('video/') ? 'video' : 'document'),
  size: Number(message.attachment_size) || 0,
} : null);
// Signed URLs for private chat media: one per path per session, refreshed before they expire.
const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_REFRESH_MS = 5 * 60 * 1000;
const signedAttachmentUrls = new Map(); // path -> { url, expiresAt } | { failedAt }
const signedAttachmentInflight = new Set();
const signedAttachmentUrl = (path) => {
  const entry = signedAttachmentUrls.get(path);
  const now = Date.now();
  const failed = entry && entry.failedAt && now - entry.failedAt < 30000;
  const usable = entry && entry.url && entry.expiresAt > now;
  const needsRefresh = !entry || (entry.url ? entry.expiresAt - now < SIGNED_URL_REFRESH_MS : !failed);
  if (needsRefresh && supabase && !signedAttachmentInflight.has(path)) {
    signedAttachmentInflight.add(path);
    supabase.storage.from('message-attachments').createSignedUrl(path, SIGNED_URL_TTL_SECONDS).then(({ data, error }) => {
      if (error || !data?.signedUrl) { if (!usable) signedAttachmentUrls.set(path, { failedAt: Date.now() }); } else signedAttachmentUrls.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
    }).catch(() => { if (!usable) signedAttachmentUrls.set(path, { failedAt: Date.now() }); }).finally(() => {
      signedAttachmentInflight.delete(path);
      if (typeof renderMessages === 'function') renderMessages();
    });
  }
  if (usable) return { url: entry.url };
  return { pending: !failed };
};
const avatarImage = (image, name) => {
  const src = safeImageUrl(image);
  return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(name)}" />` : '';
};
const initials = (name = 'New Member') => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const headerInitials = (name = 'New Member') => String(name).trim().replace(/\s+/g, '').slice(0, 2).toUpperCase() || 'NM';
const showToast = (message) => {
  const toast = document.querySelector('#app-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2600);
};

const notificationsStorageKey = () => `brivia-notifications:${memberProfile.id || 'anonymous'}`;
const notificationsEnabledStorageKey = () => `brivia-notifications-enabled:${memberProfile.id || 'anonymous'}`;
const areNotificationsEnabled = () => {
  try { return window.localStorage.getItem(notificationsEnabledStorageKey()) !== 'false'; } catch { return true; }
};
const setNotificationsEnabled = (enabled) => {
  try { window.localStorage.setItem(notificationsEnabledStorageKey(), enabled ? 'true' : 'false'); } catch { /* Continue in memory if storage is unavailable. */ }
  renderNotifications();
};
const readNotifications = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(notificationsStorageKey()) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item?.id).slice(0, 80) : [];
  } catch { return []; }
};
const saveNotifications = () => {
  try { window.localStorage.setItem(notificationsStorageKey(), JSON.stringify(notifications.slice(0, 80))); } catch { /* Continue in memory if storage is unavailable. */ }
};
const findPersonById = (personId) => people.find((person) => String(person.id) === String(personId));
const notificationPreview = (message) => message?.body || ((message?.attachment_url || message?.attachment_path) ? 'Sent an attachment.' : 'Sent you a message.');
const addMessageNotification = (message) => {
  if (!areNotificationsEnabled() || !message?.id || !memberProfile.id || String(message.sender_id) === String(memberProfile.id)) return false;
  const id = String(message.id);
  if (notifications.some((item) => String(item.id) === id)) return false;
  notifications.unshift({ id, type: 'message', personId: String(message.sender_id), body: notificationPreview(message), createdAt: message.created_at || new Date().toISOString(), read: false });
  notifications = notifications.slice(0, 80);
  saveNotifications();
  return true;
};
const markNotificationsReadForPerson = (personId) => {
  let changed = false;
  notifications = notifications.map((notification) => {
    if (String(notification.personId) !== String(personId) || notification.read) return notification;
    changed = true;
    return { ...notification, read: true };
  });
  if (changed) saveNotifications();
};
const formatNotificationTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const age = Date.now() - date.getTime();
  if (age < 60 * 1000) return 'now';
  if (age < 60 * 60 * 1000) return `${Math.floor(age / (60 * 1000))}m`;
  if (age < 24 * 60 * 60 * 1000) return `${Math.floor(age / (60 * 60 * 1000))}h`;
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const closeNotificationPanel = () => {
  const panel = document.querySelector('#app-notification-panel');
  const button = document.querySelector('#app-notification-button');
  panel?.setAttribute('hidden', '');
  button?.setAttribute('aria-expanded', 'false');
};
const renderNotifications = () => {
  const list = document.querySelector('#notification-list');
  const badge = document.querySelector('#notification-badge');
  const button = document.querySelector('#app-notification-button');
  if (!list || !badge || !button) return;
  const enabled = areNotificationsEnabled();
  const requestCount = pendingRequests.length;
  // Pending requests stay reachable even with message notifications switched off.
  const unreadCount = (enabled ? notifications.filter((notification) => !notification.read).length : 0) + requestCount;
  button.toggleAttribute('hidden', !enabled && !requestCount);
  if (!enabled && !requestCount) closeNotificationPanel();
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.toggleAttribute('hidden', unreadCount === 0);
  button.classList.toggle('has-unread', unreadCount > 0);
  button.setAttribute('aria-label', unreadCount ? `${unreadCount} unread notifications` : (enabled ? 'Notifications' : 'Notifications are off'));
  const grouped = new Map();
  notifications.filter((notification) => !notification.read).forEach((notification) => {
    const key = String(notification.personId);
    const group = grouped.get(key) || { personId: key, count: 0, latest: notification };
    group.count += 1;
    if (new Date(notification.createdAt || 0) > new Date(group.latest.createdAt || 0)) group.latest = notification;
    grouped.set(key, group);
  });
  const unreadGroups = [...grouped.values()].sort((a, b) => new Date(b.latest.createdAt || 0) - new Date(a.latest.createdAt || 0));
  const requestsHtml = requestCount ? `<section class="notification-requests" aria-label="Connection requests"><p class="notification-section-title">REQUESTS</p>${pendingRequests.map((request) => {
    const name = request.person?.name || 'A Brivia member';
    const busy = respondingRequestIds.has(request.fromId);
    const disabled = busy ? ' disabled aria-busy="true"' : '';
    return `<div class="notification-request" data-request-from="${escapeHtml(request.fromId)}">${renderAvatar(request.person, 'notification-avatar')}<div class="notification-copy"><strong>${escapeHtml(name)}</strong>${request.note ? `<span class="notification-request-note">${escapeHtml(request.note)}</span>` : '<span class="notification-request-note">Wants to connect with you.</span>'}</div><time>${escapeHtml(formatNotificationTime(request.createdAt))}</time><div class="notification-request-actions"><button type="button" class="notification-request-button" data-request-respond="accept" aria-label="Accept connection request from ${escapeHtml(name)}"${disabled}>ACCEPT</button><button type="button" class="notification-request-button" data-request-respond="decline" aria-label="Decline connection request from ${escapeHtml(name)}"${disabled}>DECLINE</button></div></div>`;
  }).join('')}</section>` : '';
  const messagesHtml = !enabled ? '<p class="notification-empty">Notifications are off in settings.</p>' : unreadGroups.length ? unreadGroups.map((group) => {
    const person = findPersonById(group.personId);
    const title = person?.name || 'a Brivia member';
    const messageLabel = `${group.count} message${group.count === 1 ? '' : 's'} from ${title}`;
    return `<button type="button" class="notification-item is-unread" data-notification-person="${escapeHtml(group.personId)}">${renderAvatar(person, 'notification-avatar')}<span class="notification-copy"><strong>${escapeHtml(messageLabel)}</strong></span><time>${escapeHtml(formatNotificationTime(group.latest.createdAt))}</time></button>`;
  }).join('') : (requestCount ? '' : '<p class="notification-empty">You are all caught up.</p>');
  list.innerHTML = requestsHtml + messagesHtml;
  list.querySelectorAll('[data-request-respond]').forEach((control) => control.addEventListener('click', (event) => {
    event.stopPropagation();
    const fromId = control.closest('[data-request-from]')?.dataset.requestFrom;
    if (fromId) respondToRequest(fromId, control.dataset.requestRespond === 'accept');
  }));
  list.querySelectorAll('[data-notification-person]').forEach((item) => item.addEventListener('click', () => {
    const personId = item.dataset.notificationPerson;
    markNotificationsReadForPerson(personId);
    renderNotifications();
    closeNotificationPanel();
    const person = findPersonById(personId);
    if (person) { setView('chat'); openChat(person); }
  }));
};
const syncIncomingNotifications = async (rows = []) => {
  if (!notifications.length) notifications = readNotifications();
  let changed = false;
  rows.filter((message) => String(message.recipient_id) === String(memberProfile.id)).forEach((message) => { if (addMessageNotification(message)) changed = true; });
  if (changed) renderNotifications();
};
const ensureNotificationControls = () => {
  notifications = readNotifications();
  renderNotifications();
  const button = document.querySelector('#app-notification-button');
  const panel = document.querySelector('#app-notification-panel');
  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = panel?.hasAttribute('hidden');
    closeNotificationPanel();
    if (shouldOpen) { panel?.removeAttribute('hidden'); button.setAttribute('aria-expanded', 'true'); renderNotifications(); loadConnectionRequests(); }
  });
  document.querySelector('#notification-mark-all')?.addEventListener('click', () => {
    notifications = notifications.map((notification) => ({ ...notification, read: true }));
    saveNotifications();
    renderNotifications();
  });
  document.addEventListener('click', (event) => { if (!panel?.contains(event.target) && event.target !== button) closeNotificationPanel(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotificationPanel(); });
};

// The honest signal quota (UX_SPEC §B "Signal counter", D-026, D-032). The server quota is the only signal limit:
// it is read from my_signal_quota() at boot and after every send_signal, kept in memory only (never in storage), and
// passes never touch it. At a cap the client sends nothing, and the card is not consumed.
let signalQuota = null;
let signalQuotaTimer;
const renderSignalQuota = () => {
  const label = quotaLabel(signalQuota);
  const inline = document.querySelector('#swipe-left-count');
  if (inline) inline.textContent = label;
  document.querySelector('.swipe-left-copy')?.toggleAttribute('hidden', !label);
  const live = document.querySelector('#swipe-daily-count');
  if (live && live.textContent !== label) live.textContent = label;
  const limitState = document.querySelector('#swipe-limit-state');
  const copy = quotaNotice(signalQuota);
  const limitCopy = document.querySelector('#swipe-limit-copy');
  if (limitCopy) limitCopy.textContent = copy;
  limitState?.toggleAttribute('hidden', !copy || !currentPerson);
  // At a cap, Pitch says so to assistive tech and looks muted, but stays focusable: a tap explains why (F2).
  const like = document.querySelector('[data-action="like"]');
  if (like) {
    like.classList.toggle('is-capped', Boolean(copy));
    if (copy) { like.setAttribute('aria-disabled', 'true'); like.setAttribute('aria-describedby', 'swipe-limit-copy'); }
    else { like.removeAttribute('aria-disabled'); like.removeAttribute('aria-describedby'); }
  }
};
const refreshSignalQuota = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await fetchSignalQuota();
  if (error) console.warn('Signal quota could not load:', error.message);
  else if (data) signalQuota = data;
  renderSignalQuota();
  // At 0, read the quota again just after the server's reset time (it is already rounded up to the hour).
  window.clearTimeout(signalQuotaTimer);
  const resetsAt = Date.parse(signalQuota?.resets_at || '');
  if (quotaBlocked(signalQuota) === 'daily' && Number.isFinite(resetsAt)) {
    signalQuotaTimer = window.setTimeout(refreshSignalQuota, Math.min(Math.max(resetsAt - Date.now() + 1000, 1000), 24 * 60 * 60 * 1000));
  }
};

// A cap may clear in another tab or after the reset: read the quota again whenever this tab is shown (F4).
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshSignalQuota(); });

const setView = (view) => {
  const renderedView = view === 'explore' ? 'home' : view;
  document.body.dataset.appView = view;
  document.body.classList.toggle('app-subview', view !== 'home');
  document.querySelectorAll('[data-view]').forEach((section) => {
    const isActive = section.dataset.view === renderedView;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
  });
  document.querySelectorAll('[data-nav]').forEach((button) => button.classList.toggle('is-active', button.dataset.nav === view));
  if (view === 'explore') renderExplore();
  if (view === 'posts') {
    loadCommunityPosts();
    window.setTimeout(() => {
      if (document.body.dataset.appView === 'posts' && memberProfile.id && !communityPostsLoaded && !communityPostsLoading) loadCommunityPosts();
    }, 450);
  }
  if (view === 'chat') renderChats();
  if (view === 'profile') renderProfile();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const validViews = ['home', 'explore', 'posts', 'chat', 'profile'];
const routeFromUrl = () => {
  const view = new URLSearchParams(window.location.search).get('view') || window.location.hash.slice(1) || 'explore';
  setView(validViews.includes(view) ? view : 'explore');
};

const renderAvatar = (person, className = 'mini-avatar') => `<div class="${className}">${avatarImage(person?.image, person?.name) || escapeHtml(initials(person?.name))}</div>`;

const splitProfileValues = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
const normalizedValue = (value) => String(value || '').trim().toLowerCase();
const explorePersonMatches = (person) => {
  const skills = splitProfileValues(person.skills);
  const lookingFor = splitProfileValues(person.lookingFor);
  const query = normalizedValue(exploreFilters.query);
  const skillQuery = normalizedValue(filterDrafts.skills);
  const lookingQuery = normalizedValue(filterDrafts.lookingFor);
  const hasSkill = !exploreFilters.skills.size || [...exploreFilters.skills].some((selected) => skills.some((skill) => normalizedValue(skill) === selected));
  const hasLookingFor = !exploreFilters.lookingFor.size || [...exploreFilters.lookingFor].some((selected) => lookingFor.some((item) => normalizedValue(item) === selected));
  const hasSkillSearch = !skillQuery || skills.some((skill) => normalizedValue(skill).includes(skillQuery));
  const hasLookingSearch = !lookingQuery || lookingFor.some((item) => normalizedValue(item).includes(lookingQuery));
  const hasName = !query || normalizedValue(person.name).includes(query);
  return hasName && hasSkill && hasLookingFor && hasSkillSearch && hasLookingSearch;
};
const filtersActive = () => Boolean(exploreFilters.query || exploreFilters.skills.size || exploreFilters.lookingFor.size || filterDrafts.skills || filterDrafts.lookingFor);

// The deck (UX_SPEC §B, Iteration 3 Task 10). deck_candidates returns the next cards in the server's order (k-safe
// display ring, then shared interests); the client keeps that order. A card is consumed when it is passed or liked:
// it leaves the queue and joins `deck.seen`, so a later load never brings it back in this session. There is no
// wrap-around: when the queue runs out the deck loads once more, and if nothing new comes back deck_status() says why.
// `people` stays the registry of every member card known to this page (deck, search, chats, request senders).
const DECK_PAGE_SIZE = 12;
const deck = { ready: false, ids: [], seen: new Set(), loading: null, end: null };
const deckPeople = () => deck.ids.map((id) => findPersonById(id)).filter(Boolean);
const getExplorePeople = () => deckPeople().filter(explorePersonMatches);
// The current card is always the first card of the (filtered) queue, so clearing a filter returns to the server order.
const syncExploreQueue = () => {
  const queue = getExplorePeople();
  currentIndex = 0;
  currentPerson = queue[0] || null;
  return queue;
};

// Why the deck is empty: the filters (when the loaded deck has cards they hide), else the server's deck_status().
const deckEmptyCause = () => (filtersActive() && deckPeople().length ? 'filters' : deck.end);
const renderDeckEmpty = (emptyState) => {
  const cause = deckEmptyCause();
  if (!cause) { emptyState.hidden = true; return; }
  const view = deckEmptyState(cause);
  emptyState.dataset.cause = cause;
  emptyState.querySelector('#deck-empty-title').textContent = view.title;
  emptyState.querySelector('#deck-empty-copy').textContent = view.copy;
  const action = emptyState.querySelector('#deck-empty-action');
  action.textContent = view.action;
  action.dataset.deckAction = view.kind;
  const wasHidden = emptyState.hidden;
  emptyState.hidden = false;
  // When the deck empties, focus moves to the reason (F8). Not while the member types a filter; while the pitch sheet
  // is open over the deck (the last card was liked), it moves when the sheet closes.
  if (wasHidden && cause !== 'filters') {
    if (pitchSheetVisible()) focusEmptyOnSheetClose = true;
    else focusDeckEmpty();
  }
};
let focusEmptyOnSheetClose = false;
const focusDeckEmpty = () => {
  focusEmptyOnSheetClose = false;
  const emptyState = document.querySelector('#home-empty-state');
  // A field inside a just-hidden sheet can stay activeElement for a moment; only a visible field counts as typing.
  const typing = document.activeElement?.closest?.('input, textarea, select, #discovery-filter-drawer');
  const typingVisible = Boolean(typing && typing.getClientRects().length);
  if (!emptyState || emptyState.hidden || typingVisible || !['home', 'explore'].includes(document.body.dataset.appView)) return;
  emptyState.querySelector('#deck-empty-title')?.focus({ preventScroll: true });
};
const renderCardChips = (container, person) => {
  container.replaceChildren(...deckChips(person).map((chip) => {
    const element = document.createElement('span');
    if (chip.kind === 'shared') element.className = 'chip-shared';
    element.textContent = chip.label;
    return element;
  }));
};

const renderHome = (queue = getExplorePeople()) => {
  const card = document.querySelector('#swipe-card');
  const actions = document.querySelector('.swipe-actions');
  const hint = document.querySelector('.swipe-hint');
  const limitState = document.querySelector('#swipe-limit-state');
  const emptyState = document.querySelector('#home-empty-state');
  if (!currentPerson) {
    card?.setAttribute('hidden', '');
    actions?.setAttribute('hidden', '');
    hint?.setAttribute('hidden', '');
    limitState?.setAttribute('hidden', '');
    if (emptyState) renderDeckEmpty(emptyState);
    const count = document.querySelector('#queue-count'); if (count) count.textContent = '00 / 00';
    return;
  }
  card?.removeAttribute('hidden');
  actions?.removeAttribute('hidden');
  hint?.removeAttribute('hidden');
  emptyState?.setAttribute('hidden', '');
  renderSignalQuota();
  const image = document.querySelector('#swipe-image');
  if (image) { image.src = safeImageUrl(currentPerson.coverUrl) || safeImageUrl(currentPerson.image); image.alt = `${currentPerson.name} cover image`; }
  if (card) card.style.setProperty('--card-avatar-image', `url("${safeImageUrl(currentPerson.image).replace(/["\\\n]/g, encodeURIComponent)}")`);
  const name = document.querySelector('#swipe-name'); if (name) name.textContent = currentPerson.name;
  document.querySelector('#card-more')?.setAttribute('aria-label', `More options for ${currentPerson.name}`);
  const cardLabel = document.querySelector('#swipe-card-label');
  if (cardLabel) {
    const profileText = `${currentPerson.role || ''} ${currentPerson.lookingFor || ''} ${(currentPerson.tags || []).join(' ')}`.toLowerCase();
    cardLabel.textContent = /engineer|developer|ai|tech|system|build/.test(profileText) ? 'BUILDING' : /marketing|content|brand|impact|startup/.test(profileText) ? 'IDEAS TO IMPACT' : 'CREATIVE SOUL';
  }
  const role = document.querySelector('#swipe-role'); if (role) role.textContent = currentPerson.role;
  // The server's distance band only ("~3 km", a place, a region, "Abroad"): never a City/State, cell or km.
  const location = document.querySelector('#swipe-location');
  if (location) {
    location.textContent = currentPerson.distanceBand || '';
    location.hidden = !currentPerson.distanceBand;
    if (currentPerson.distanceBand) location.setAttribute('aria-label', `Distance: ${currentPerson.distanceBand}`);
    else location.removeAttribute('aria-label');
  }
  const tags = document.querySelector('#swipe-tags'); if (tags) renderCardChips(tags, currentPerson);
  const count = document.querySelector('#queue-count');
  if (count) count.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}`;
  card?.classList.remove('is-passing', 'is-liking');
};

// Mutual consent (docs/VISION.md, CLAUDE.md): the client never writes `matches`. A like or a pitch sends one signal
// (send_signal); the server creates the match when the other member has already asked, or accepts
// (respond_connection_request). Chat opens only once a match exists.
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));

// Other members are read only through the candidate RPCs (0003, 0004): deck_candidates (the deck), get_candidates
// (cards for known ids, at most 50 per call) and search_members. The server hides blocked pairs, incomplete profiles
// and the other test world; the client never selects public_profiles or another member's profiles row.
const CANDIDATE_ID_CAP = 50;
// Another member's card. Location is only the deck's distance band: a City/State on any row is dropped here, so no
// surface (card, info sheet, public profile, chat header, lists) can show it.
const toMemberPerson = (row) => {
  const { city, state, email, phone, phone_country_code: phoneCountryCode, phone_number: phoneNumber, ...safeRow } = row || {};
  const profile = rowToProfile(safeRow);
  const skills = profile.skills.split(',').map((item) => item.trim()).filter(Boolean);
  const looking = profile.lookingFor.split(',').map((item) => item.trim()).filter(Boolean);
  const tags = [...skills, ...looking];
  const filters = ['all', ...tags.map((item) => item.toLowerCase()), profile.experience?.toLowerCase() || ''];
  return { ...profile, ...deckFields(safeRow), city: '', state: '', email: '', phone: '', phoneCountryCode: '', phoneNumber: '', age: '', role: profile.experience || 'Brivia member', distance: '', bio: `${profile.name} is open to meaningful connections.`, tags, image: profile.photoUrl || '', filters: filters.filter(Boolean) };
};
// Adds cards not already known to the registry (a known card gains a band or chips it lacked); returns their ids.
const mergePeople = (rows) => {
  const added = [];
  (rows || []).forEach((row) => {
    const id = String(row?.id || '');
    if (!id || id === String(memberProfile.id)) return;
    const known = findPersonById(id);
    const person = toMemberPerson(row);
    if (!known) { people.push(person); added.push(id); return; }
    if (person.distanceBand && !known.distanceBand) known.distanceBand = person.distanceBand;
    if (person.shared.length && !known.shared?.length) known.shared = person.shared;
    added.push(id);
  });
  return added;
};
// Puts new ids at the end of the deck queue, in order; skips cards already queued or consumed this session.
const enqueueDeckIds = (ids) => {
  const queued = new Set(deck.ids);
  const fresh = ids.filter((id) => !queued.has(id) && !deck.seen.has(id));
  deck.ids.push(...fresh);
  return fresh.length;
};
const fetchCandidates = async (ids) => {
  const unique = [...new Set((ids || []).map(String).filter((id) => isUuid(id) && id !== String(memberProfile.id)))];
  const rows = [];
  for (let start = 0; start < unique.length; start += CANDIDATE_ID_CAP) {
    const { data, error } = await supabase.rpc('get_candidates', { p_ids: unique.slice(start, start + CANDIDATE_ID_CAP) });
    if (error) return { data: rows, error };
    rows.push(...(data || []));
  }
  return { data: rows, error: null };
};
// The next deck cards (one request in flight at a time). Resolves to { added, error }: how many unseen cards joined.
const loadDeck = () => {
  if (!supabase) return Promise.resolve({ added: 0, error: null });
  if (deck.loading) return deck.loading;
  deck.loading = supabase.rpc('deck_candidates', { p_limit: DECK_PAGE_SIZE }).then(({ data, error }) => {
    if (error) return { added: 0, error };
    const added = enqueueDeckIds(mergePeople(data));
    if (added) deck.end = null;
    return { added, error: null };
  }).finally(() => { deck.loading = null; });
  return deck.loading;
};
// A pass is recorded before the next load, so the server hides the card (7 days) and never serves it again.
// Passes still being stored; refillDeck waits for all of them (F9).
const pendingPasses = new Set();
const recordPass = (personId) => {
  if (!supabase || !memberProfile.id || !isUuid(personId)) return Promise.resolve();
  const stored = (async () => {
    const { error } = await supabase.from('interaction').insert({ viewer_id: memberProfile.id, target_id: personId, event: 'pass' });
    if (error) console.warn('Pass could not be recorded:', error.message);
  })();
  pendingPasses.add(stored);
  stored.finally(() => pendingPasses.delete(stored));
  return stored;
};
// When the queue runs out: load once more; if nothing new comes back, ask deck_status() why (never a count).
const refillDeck = async () => {
  if (!deck.ready || deckPeople().length) return;
  await Promise.allSettled([...pendingPasses]);
  const { added, error } = await loadDeck();
  if (error) { console.warn('The deck could not load:', error.message); deck.end = 'error'; }
  else if (!added) {
    const { data: status, error: statusError } = await supabase.rpc('deck_status');
    let cause = statusError ? 'error' : (typeof status === 'string' && status) || 'caught_up';
    // complete_profile is never a dead end (F6): ask onboarding again. Completed after all -> a retryable error;
    // not completed -> straight to onboarding; unreadable -> the "Finish profile" state.
    if (cause === 'complete_profile') {
      const { data: onboarding, error: onboardingError } = await onboardingStatus();
      if (!onboardingError && onboarding?.completed === true) cause = 'error';
      else if (!onboardingError && onboarding?.completed === false) { window.location.replace('/auth.html?complete-profile=1'); return; }
    }
    deck.end = cause;
  }
  renderExplore();
};
// Name search reaches members anywhere: their cards join the end of the deck (search reaches everyone, VISION).
// The server answers only queries with at least 2 non-space characters (D-038 R4), so shorter ones are not sent.
const MEMBER_SEARCH_MIN_CHARS = 2;
let memberSearchTimer;
let memberSearchSeq = 0;
const scheduleMemberSearch = (query) => {
  window.clearTimeout(memberSearchTimer);
  const term = String(query || '').trim();
  if (!supabase || !deck.ready || term.replace(/\s/g, '').length < MEMBER_SEARCH_MIN_CHARS) return;
  const seq = ++memberSearchSeq;
  memberSearchTimer = window.setTimeout(async () => {
    const { data, error } = await supabase.rpc('search_members', { p_query: term, p_limit: 20 });
    if (seq !== memberSearchSeq) return;
    if (error) { console.warn('Member search failed:', error.message); return; }
    // Members I am already matched with are in chat, not the deck; consumed cards stay out (enqueueDeckIds).
    const matched = new Set([...remoteConnectionIds, ...remoteMatchIds].map(String));
    if (enqueueDeckIds(mergePeople(data).filter((id) => !matched.has(id)))) renderExplore();
  }, 250);
};
const addConnection = (personId) => {
  if (!remoteConnectionIds.some((id) => String(id) === String(personId))) remoteConnectionIds.push(personId);
  if (!remoteMatchIds.some((id) => String(id) === String(personId))) remoteMatchIds.push(personId);
  restoreChatForMe(personId);
};
// Legacy match rows may be stored in either order, so check both orientations.
const hasMatchWith = async (personId) => {
  if (!supabase || !memberProfile.id || !isUuid(personId) || !isUuid(memberProfile.id)) return false;
  const me = memberProfile.id;
  const { data, error } = await supabase.from('matches').select('user1_id,user2_id')
    .or(`and(user1_id.eq.${me},user2_id.eq.${personId}),and(user1_id.eq.${personId},user2_id.eq.${me})`)
    .limit(1);
  if (error) { console.warn('Match status could not load:', error.message); return false; }
  return Boolean(data?.length);
};
// One signal = one send_signal call (D-032). The response is the same for every recipient state ('sent'), except
// 'matched' when a match exists afterwards (the mutual toast; the full match moment, UX_SPEC §D, comes later). Only
// the sender's own caps fail visibly: PT429 / HTTP 429 with 'signal_quota_exhausted' or 'signal_live_cap' (not
// charged); the result then carries quotaText for the toast.
const sendConnectionSignal = async (person, note = null) => {
  if (!supabase || !memberProfile.id || !person?.id) return { matched: false, error: new Error('Connection service is unavailable.') };
  const { data, error, status } = await sendSignal(person.id, note);
  if (error) {
    if (quotaErrorText(error, signalQuota, status)) {
      await refreshSignalQuota();
      return { matched: false, error, quotaText: quotaErrorText(error, signalQuota, status) };
    }
    // A 429 without a known cap message (a gateway limit, say): read the quota again; it may now be at a cap.
    if (isRateLimited(error, status)) {
      await refreshSignalQuota();
      return { matched: false, error, quotaText: quotaBlocked(signalQuota) ? quotaBlockedToast() : null };
    }
    console.warn('Signal could not be sent:', error.message);
    return { matched: false, error };
  }
  if (data) {
    signalQuota = { ...(signalQuota || {}), remaining: data.remaining, resets_at: data.resets_at };
    renderSignalQuota();
  }
  refreshSignalQuota();
  const matched = data?.status === 'matched';
  if (matched) { addConnection(person.id); renderChats(); }
  return { matched, status: data?.status || null };
};
const mutualToast = (person) => `It's mutual. Say hi to ${person?.name || 'your new connection'}.`;
// A failed signal never loses the person: their card goes back to the front (F1).
const signalErrorToast = "Your signal could not be sent. They're back at the front so you can try again.";
// "Signal sent" only for status 'sent', "It's mutual" only for 'matched', the honest cap text for a 429.
const signalResultToast = (person, result) => {
  if (result.error) return result.quotaText || signalErrorToast;
  if (result.matched) return mutualToast(person);
  return result.status === 'sent' ? 'Signal sent' : signalErrorToast;
};

const loadConnectionRequests = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await supabase.from('connection_requests').select('from_id,note,created_at')
    .eq('to_id', memberProfile.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(50);
  if (error) { console.warn('Connection requests could not load:', error.message); return; }
  const rows = data || [];
  const unknownIds = [...new Set(rows.map((row) => String(row.from_id)).filter((id) => !findPersonById(id) && isUuid(id)))];
  const extraPeople = new Map();
  if (unknownIds.length) {
    const { data: profileRows, error: profileError } = await fetchCandidates(unknownIds);
    if (profileError) console.warn('Request senders could not load:', profileError.message);
    (profileRows || []).forEach((row) => { const person = toMemberPerson(row); extraPeople.set(String(person.id), person); });
  }
  pendingRequests = rows.map((row) => ({
    fromId: String(row.from_id),
    note: row.note || '',
    createdAt: row.created_at,
    person: findPersonById(row.from_id) || extraPeople.get(String(row.from_id)) || null,
  }));
  renderNotifications();
};
const refreshConnections = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await supabase.from('matches').select('user1_id,user2_id').or(`user1_id.eq.${memberProfile.id},user2_id.eq.${memberProfile.id}`);
  if (error) { console.warn('Connections could not refresh:', error.message); return; }
  const before = remoteConnectionIds.length;
  // Only newly matched people are added, so chats hidden on this device stay hidden.
  (data || []).map((match) => String(match.user1_id) === String(memberProfile.id) ? match.user2_id : match.user1_id)
    .filter((id) => !remoteConnectionIds.some((known) => String(known) === String(id)))
    .forEach(addConnection);
  return remoteConnectionIds.length !== before;
};
const respondToRequest = async (fromId, accept) => {
  if (!supabase || respondingRequestIds.has(fromId)) return;
  const request = pendingRequests.find((item) => item.fromId === fromId);
  respondingRequestIds.add(fromId);
  renderNotifications();
  const { error } = await supabase.rpc('respond_connection_request', { p_from: fromId, p_accept: accept });
  respondingRequestIds.delete(fromId);
  if (error) {
    renderNotifications();
    showToast('That request could not be updated. Please try again.');
    loadConnectionRequests();
    return;
  }
  pendingRequests = pendingRequests.filter((item) => item.fromId !== fromId);
  renderNotifications();
  if (!accept) { showToast('Request declined.'); return; }
  // Accepting a blocked pair silently records a decline (Ruling P12): only a real match opens chat.
  if (!(await hasMatchWith(fromId))) { showToast('Request answered.'); return; }
  addConnection(fromId);
  await refreshConnections();
  renderChats();
  showToast(mutualToast(request?.person));
};

const removedConnectionsStorageKey = () => `brivia-removed-connections:${memberProfile.id || 'anonymous'}`;
const readRemovedConnections = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(removedConnectionsStorageKey()) || '[]');
    return Array.isArray(saved) ? saved.filter((item) => item?.id).slice(0, 80) : [];
  } catch { return []; }
};
const saveRemovedConnections = (records) => {
  try { window.localStorage.setItem(removedConnectionsStorageKey(), JSON.stringify(records.slice(0, 80))); return true; } catch { return false; }
};
const rememberRemovedConnection = (person) => {
  if (!person?.id) return false;
  const records = readRemovedConnections().filter((record) => String(record.id) !== String(person.id));
  records.unshift({ id: String(person.id), name: person.name || 'Brivia member', image: person.image || '', removedAt: new Date().toISOString() });
  return saveRemovedConnections(records);
};
const removeRemoteConnection = async (person) => {
  if (!supabase || !memberProfile.id || !person?.id) return { error: new Error('Connection service is unavailable.') };
  const ownToOther = await supabase.from('matches').delete().eq('user1_id', memberProfile.id).eq('user2_id', person.id);
  const otherToOwn = await supabase.from('matches').delete().eq('user1_id', person.id).eq('user2_id', memberProfile.id);
  return { error: ownToOther.error || otherToOwn.error };
};
const removeConnectionFromState = (person) => {
  remoteMatchIds = remoteMatchIds.filter((id) => String(id) !== String(person.id));
  remoteConnectionIds = remoteConnectionIds.filter((id) => String(id) !== String(person.id));
  if (selectedChat?.id && String(selectedChat.id) === String(person.id)) closeSelectedChat();
  else renderChats();
};

const openOverlay = (id) => document.querySelector(`#${id}`)?.removeAttribute('hidden');
const closeOverlays = () => {
  const pitchWasOpen = !document.querySelector('#pitch-modal')?.hidden;
  overlayIds.forEach((id) => document.querySelector(`#${id}`)?.setAttribute('hidden', ''));
  if (pitchWasOpen) dismissPendingPitch();
  if (pitchWasOpen && focusEmptyOnSheetClose) focusDeckEmpty();
};

const resolvePublicPerson = (person = {}) => {
  const knownPerson = person.id ? findPersonById(person.id) : null;
  if (knownPerson) return knownPerson;
  if (person.id && String(memberProfile.id) === String(person.id)) {
    const skills = splitProfileValues(memberProfile.skills);
    const lookingFor = splitProfileValues(memberProfile.lookingFor);
    return { ...memberProfile, image: memberProfile.photoUrl || memberProfile.image || '', role: memberProfile.experience || 'Brivia member', tags: [...skills, ...lookingFor], bio: memberProfile.bio || `${memberProfile.name || 'This member'} is open to meaningful connections.` };
  }
  const skills = splitProfileValues(person.skills);
  const lookingFor = splitProfileValues(person.lookingFor);
  return { ...person, image: person.image || person.photoUrl || '', role: person.role || person.experience || 'Brivia member', tags: person.tags?.length ? person.tags : [...skills, ...lookingFor], bio: person.bio || `${person.name || 'This member'} is open to meaningful connections.` };
};

const openPublicProfile = (person, options = {}) => {
  const profile = resolvePublicPerson(person);
  document.querySelector('#public-profile-modal')?.remove();
  if (!profile?.id) return;
  if (String(profile.id) === String(memberProfile.id) && !options.forcePublic) {
    setView('profile');
    return;
  }
  const image = profile.image || profile.photoUrl || '';
  const coverUrl = normalizeCoverUrl(profile.coverUrl || profile.cover_url || profile.cover_image_url) || defaultCoverUrl;
  const skills = splitProfileValues(profile.skills);
  const lookingFor = splitProfileValues(profile.lookingFor);
  const tags = profile.tags?.length ? profile.tags : [...skills, ...lookingFor];
  // Location is the deck's distance band when known, and otherwise no line at all (never a City/State).
  const location = profile.distanceBand || '';
  const modal = document.createElement('div');
  modal.id = 'public-profile-modal';
  modal.className = 'public-profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `${profile.name || 'Member'} public profile`);
  modal.innerHTML = `<button class="public-profile-backdrop" type="button" data-public-profile-close aria-label="Close profile"></button><section class="public-profile-dialog"><button class="public-profile-close" type="button" data-public-profile-close aria-label="Close profile">×</button><div class="public-profile-cover"><div class="public-profile-avatar">${avatarImage(image, profile.name) || escapeHtml(initials(profile.name))}</div></div><div class="public-profile-body"><p class="public-profile-kicker">BRIVIA MEMBER / PUBLIC PROFILE</p><h2>${escapeHtml(profile.name || 'Brivia member')}</h2><p class="public-profile-role">${escapeHtml(profile.role || 'Brivia member')}</p>${location ? `<p class="public-profile-location">${escapeHtml(location)}</p>` : ''}<p class="public-profile-bio">${escapeHtml(profile.bio || 'Open to meaningful connections inside the club.')}</p><div class="public-profile-facts"><div><span>LOOKING FOR</span><strong>${escapeHtml(lookingFor.join(', ') || 'Meaningful connections')}</strong></div><div><span>SKILLS &amp; INTERESTS</span><strong>${escapeHtml(skills.join(', ') || tags.join(', ') || 'Open to connect')}</strong></div></div><div class="public-profile-pills">${tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') : '<span>Open to connect</span>'}</div></div></section>`;
  document.body.append(modal);
  const safeCover = safeImageUrl(coverUrl) || safeImageUrl(defaultCoverUrl);
  modal.querySelector('.public-profile-cover').style.backgroundImage = `url("${safeCover.replace(/["\\\n]/g, encodeURIComponent)}")`;
  const close = () => modal.remove();
  modal.addEventListener('click', (event) => { if (event.target.closest('[data-public-profile-close]')) close(); });
  modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  modal.tabIndex = -1;
  window.setTimeout(() => modal.focus(), 0);
};

// Notes typed into a pitch whose send failed, kept in memory (never storage) until the member tries again.
const unsentNotes = new Map();
// Claims the pending like exactly once; every later caller gets null, so one like = one insert.
const claimPendingPitch = () => {
  const pending = pendingPitch;
  if (!pending || pending.resolved) return null;
  pending.resolved = true;
  pendingPitch = null;
  return pending;
};
// Close, Escape, backdrop or moving on: send the like's request without a note.
const dismissPendingPitch = () => {
  const pending = claimPendingPitch();
  if (!pending) return;
  pitchPerson = null;
  sendConnectionSignal(pending.person).then((result) => {
    if (result.error) requeuePerson(pending.person);
    showToast(signalResultToast(pending.person, result));
  });
};
const openPitch = (person) => {
  dismissPendingPitch();
  pendingPitch = { person, resolved: false };
  pitchOpenedAt = performance.now();
  pitchPerson = person;
  const pitchName = document.querySelector('#pitch-name'); if (pitchName) pitchName.textContent = person.name || 'them';
  // A note from a failed send comes back when the member tries again.
  const savedNote = unsentNotes.get(String(person.id));
  unsentNotes.delete(String(person.id));
  const pitchMessage = document.querySelector('#pitch-message'); if (pitchMessage) pitchMessage.value = savedNote || pitchLine(person);
  openOverlay('pitch-modal');
  window.setTimeout(() => pitchMessage?.focus(), 80);
};

// Per-card requeue generations: a card advance scheduled before its card was put back must not consume it (F5).
const requeueGeneration = new Map();
// A failed signal (any error, F1) puts its card back at the front of the queue.
const requeuePerson = (person) => {
  if (!person?.id) return;
  const id = String(person.id);
  requeueGeneration.set(id, (requeueGeneration.get(id) || 0) + 1);
  if (!findPersonById(id)) people.push(person);
  deck.seen.delete(id);
  deck.ids = [id, ...deck.ids.filter((item) => item !== id)];
  deck.end = null;
  currentPerson = findPersonById(id);
  renderExplore();
};
const quotaBlockedToast = () => quotaErrorText({ code: 'PT429', message: quotaBlocked(signalQuota) === 'live' ? 'signal_live_cap' : 'signal_quota_exhausted' }, signalQuota);
// A swiped card leaves the queue for this session (passed or liked): the deck never wraps around.
const consumeCard = (person) => {
  const id = String(person.id);
  deck.ids = deck.ids.filter((item) => item !== id);
  deck.seen.add(id);
};
// From the start of a swipe until the next card renders, further swipes are ignored (a double tap, Pass then Like).
let deckAdvancing = false;
let capCheckInFlight = false;

const swipe = (type) => {
  if (!currentPerson || deckAdvancing || capCheckInFlight) return;
  // A Like while the pitch sheet is opening or open is ignored: a repeated click/keypress must not resolve
  // the pending like as a plain like and drop the note (Task 3b).
  if (type === 'like' && pendingPitch && pitchSheetVisible()) return;
  // At a cached cap, read the quota again first: the cap may have cleared (F4). Still capped: a Like sends nothing,
  // opens no pitch and keeps the card (D-026). Passing is always free.
  if (type === 'like' && quotaBlocked(signalQuota)) {
    capCheckInFlight = true;
    refreshSignalQuota().finally(() => {
      capCheckInFlight = false;
      if (quotaBlocked(signalQuota)) { renderSignalQuota(); showToast(quotaBlockedToast()); return; }
      swipe('like');
    });
    return;
  }
  deckAdvancing = true;
  // Moving to the next card resolves an open pitch sheet as a plain like.
  if (pendingPitch) { document.querySelector('#pitch-modal')?.setAttribute('hidden', ''); dismissPendingPitch(); }
  const person = currentPerson;
  const id = String(person.id);
  const generation = requeueGeneration.get(id) || 0;
  const card = document.querySelector('#swipe-card');
  card?.classList.add(type === 'like' ? 'is-liking' : 'is-passing');
  // The request is sent when the pitch sheet resolves (submit with a note, or dismiss without one).
  if (type === 'like') openPitch(person);
  if (type === 'pass') recordPass(person.id);
  window.setTimeout(async () => {
    deckAdvancing = false;
    if ((requeueGeneration.get(id) || 0) !== generation) { renderExplore(); return; }
    consumeCard(person);
    currentPerson = null;
    renderExplore();
    // Every pass is stored before the next deck_candidates call (refillDeck waits for them).
    if (!deckPeople().length) await refillDeck();
  }, 280);
};

// Report or block from the card (R4). The server already blocked the member (report) or the block flow just did, so the
// card leaves like a Pass visually but sends no pass interaction.
const dismissCardLikePass = (person) => {
  if (deckAdvancing) return;
  deckAdvancing = true;
  document.querySelector('#swipe-card')?.classList.add('is-passing');
  window.setTimeout(async () => {
    deckAdvancing = false;
    consumeCard(person);
    if (currentPerson && String(currentPerson.id) === String(person.id)) currentPerson = null;
    renderExplore();
    if (!deckPeople().length) await refillDeck();
  }, 280);
};
bindCardOverflow(async (action, trigger) => {
  const person = currentPerson;
  if (!person || deckAdvancing || pitchSheetVisible()) return;
  if (action === 'report') {
    const reported = await openReportDialog({ name: person.name, trigger, send: (reason, note) => reportMember(person.id, reason, note) });
    if (!reported) return;
    hideReportedMember(person);
    showToast(reportSuccessCopy(person.name));
    dismissCardLikePass(person);
    return;
  }
  if (!window.confirm(`Block ${person.name}? You won't see them in your deck again.`)) return;
  if (!await blockMember(person)) return;
  showToast(`${person.name} is blocked.`);
  dismissCardLikePass(person);
});

const exploreCoverImages = [
  './assets/chat-reference-room.png',
  './assets/macbook-roses-cream.png',
  './assets/macbook-roses-back.png',
  './assets/guitar-premium.png',
  './assets/badminton-premium-no-shuttle.png',
  './assets/sites.jpg',
];

const uniqueFilterValues = (values) => {
  const unique = new Map();
  values.map((value) => String(value || '').trim()).filter(Boolean).forEach((value) => {
    const key = normalizedValue(value);
    if (key && !unique.has(key)) unique.set(key, value);
  });
  return [...unique.values()].sort((a, b) => a.localeCompare(b));
};
// Filter suggestions come from member cards only; there is no place filter (cards carry no City/State, UX_SPEC §B).
const getFilterValues = () => ({
  names: uniqueFilterValues(people.map((person) => person.name)),
  skills: uniqueFilterValues(people.flatMap((person) => splitProfileValues(person.skills))),
  lookingFor: uniqueFilterValues(people.flatMap((person) => splitProfileValues(person.lookingFor))),
});
const profileEditSkillOptions = [
  'Python', 'SQL', 'Data Structures & Algorithms', 'Git', 'GitHub', 'REST APIs', 'JavaScript', 'React', 'Linux', 'AWS',
  'Generative AI', 'Prompt Engineering', 'LLMs', 'RAG', 'AI Agents', 'AI Automation', 'n8n', 'Docker', 'Data Analysis',
  'Power BI', 'Tableau', 'Excel', 'Problem Solving', 'Critical Thinking', 'English Communication', 'Public Speaking',
  'Presentation Skills', 'Professional Email Writing', 'Resume Building', 'Interview Skills', 'LinkedIn Networking',
  'Personal Branding', 'Project Management', 'Business Communication', 'Sales', 'Negotiation', 'Time Management',
  'Personal Finance', 'Budgeting', 'Digital Security', 'Password Management', 'Photography', 'Cooking', 'Adaptability', 'Other',
];
const profileEditLookingOptions = [
  'Hackathon Buddy', 'SIH Buddy', 'Travelling Buddy', 'Study Partner', 'Project Partner', 'Coding Partner', 'Startup Partner',
  'Co-founder', 'Teammate', 'Mentor', 'Mentee', 'Freelancer', 'Intern', 'Research Partner', 'Open Source Contributor',
  'Developer', 'Designer', 'AI Enthusiast', 'ML Enthusiast', 'Entrepreneur', 'Photographer', 'Content Creator', 'Video Editor',
  'UI/UX Designer', 'Data Analyst', 'Business Analyst', 'Marketer', 'Public Speaker', 'Writer', 'Volunteer', 'Event Participant',
  'Networking Contact', 'Career Mentor', 'Job Referral', 'Internship Referral', 'Accountability Partner', 'Language Exchange Partner',
  'Travel Companion', 'Trekking Partner', 'Sports Partner', 'Gaming Partner', 'Photography Partner', 'Event Companion',
  'Conference Companion', 'Workshop Partner', 'Competition Teammate', 'Roommate', 'Local Guide', 'Community Member', 'Collaborator', 'Other',
];
const profileEditDatalist = (kind) => {
  const dbValues = getFilterValues()[kind === 'skills' ? 'skills' : 'lookingFor'];
  const standardValues = kind === 'skills' ? profileEditSkillOptions : profileEditLookingOptions;
  return [...new Map([...standardValues, ...dbValues].map((value) => [normalizedValue(value), value])).values()]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => `<option value="${escapeHtml(value)}"></option>`)
    .join('');
};
const matchingFilterValues = (values, query, selected = new Set()) => {
  const normalizedQuery = normalizedValue(query);
  return values.filter((value) => (!normalizedQuery || normalizedValue(value).includes(normalizedQuery)) && !selected.has(normalizedValue(value))).slice(0, 8);
};
const renderSuggestionList = (container, values, query, kind, selected = new Set(), showAll = false) => {
  if (!container) return;
  const normalizedQuery = normalizedValue(query);
  if (!normalizedQuery && !showAll) {
    container.innerHTML = '';
    return;
  }
  const matches = matchingFilterValues(values, query, selected);
  container.innerHTML = matches.length
    ? matches.map((value) => `<button class="discovery-filter-suggestion" type="button" role="option" data-filter-kind="${kind}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('')
    : '<p class="discovery-filter-empty">No matching member data.</p>';
};
const renderSelectedFilters = (container, values, selected, kind) => {
  if (!container) return;
  const selectedLabels = values.filter((value) => selected.has(normalizedValue(value)));
  container.innerHTML = selectedLabels.map((value) => `<button class="discovery-filter-selected-chip" type="button" data-remove-filter="${kind}" data-filter-value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span><b aria-hidden="true">Ã—</b><span class="sr-only">Remove ${escapeHtml(value)}</span></button>`).join('');
};
const renderFilterOptions = () => {
  const search = document.querySelector('#drawer-filter-search');
  const skillsInput = document.querySelector('#filter-skills-input');
  const lookingInput = document.querySelector('#filter-looking-for-input');
  if (!search || !skillsInput || !lookingInput) return;
  const { names, skills, lookingFor } = getFilterValues();
  if (document.activeElement !== search && search.value !== exploreFilters.query) search.value = exploreFilters.query;
  if (document.activeElement !== skillsInput && skillsInput.value !== filterDrafts.skills) skillsInput.value = filterDrafts.skills;
  if (document.activeElement !== lookingInput && lookingInput.value !== filterDrafts.lookingFor) lookingInput.value = filterDrafts.lookingFor;
  renderSuggestionList(document.querySelector('#filter-name-suggestions'), names, exploreFilters.query, 'name', new Set(), false);
  renderSelectedFilters(document.querySelector('#filter-skills-selected'), skills, exploreFilters.skills, 'skills');
  renderSuggestionList(document.querySelector('#filter-skills-suggestions'), skills, filterDrafts.skills, 'skills', exploreFilters.skills, document.activeElement === skillsInput);
  renderSelectedFilters(document.querySelector('#filter-looking-for-selected'), lookingFor, exploreFilters.lookingFor, 'looking-for');
  renderSuggestionList(document.querySelector('#filter-looking-for-suggestions'), lookingFor, filterDrafts.lookingFor, 'looking-for', exploreFilters.lookingFor, document.activeElement === lookingInput);
};
const updateDiscoveryFilterResult = (count) => {
  const result = document.querySelector('#discovery-filter-result');
  if (!result) return;
  const activeCount = exploreFilters.skills.size + exploreFilters.lookingFor.size + (exploreFilters.query ? 1 : 0) + (filterDrafts.skills ? 1 : 0) + (filterDrafts.lookingFor ? 1 : 0);
  result.textContent = activeCount ? (count + ' ' + (count === 1 ? 'person' : 'people') + ' match') : 'All people';
  const resetButton = document.querySelector('#clear-discovery-filters');
  if (resetButton) {
    resetButton.textContent = 'RESET FILTERS';
    resetButton.disabled = !activeCount;
    resetButton.setAttribute('aria-label', activeCount ? 'Reset all filters' : 'No filters selected');
  }
};
const renderExplore = () => {
  const queue = syncExploreQueue();
  renderFilterOptions();
  updateDiscoveryFilterResult(queue.length);
  renderHome(queue);
  // The queue ran out (not just filtered away): load once more, then deck_status() decides the empty state.
  if (!queue.length && deck.ready && !deckPeople().length && !deck.end && !deck.loading) refillDeck();
};

const ensureInboxControls = () => {
  const chatView = document.querySelector('[data-view="chat"]');
  const layout = chatView?.querySelector('.chat-layout');
  if (!chatView || !layout || chatView.querySelector('#inbox-toolbar')) return;
  const heading = chatView.querySelector('.view-heading h1');
  const headingCopy = chatView.querySelector('.view-heading>p:last-child');
  if (heading) heading.textContent = 'Inbox';
  if (headingCopy) headingCopy.textContent = 'Keep every introduction in one place.';
  const toolbar = document.createElement('div');
  toolbar.className = 'inbox-toolbar';
  toolbar.id = 'inbox-toolbar';
  toolbar.innerHTML = '<label class="inbox-search"><span>⌕</span><input id="chat-search" type="search" placeholder="Search conversations..." autocomplete="off" /></label><div class="inbox-tabs" role="tablist" aria-label="Inbox filters"><button class="inbox-tab is-active" type="button" data-chat-filter="all">ALL</button><button class="inbox-tab" type="button" data-chat-filter="unread">UNREAD</button></div>';
  const list = layout.querySelector('#chat-list');
  if (list) list.prepend(toolbar);
  else layout.before(toolbar);
  toolbar.querySelector('#chat-search')?.addEventListener('input', (event) => { chatSearchQuery = event.target.value; renderChats(); });
  toolbar.querySelectorAll('[data-chat-filter]').forEach((button) => button.addEventListener('click', () => { activeChatFilter = button.dataset.chatFilter; toolbar.querySelectorAll('[data-chat-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); renderChats(); }));
};

const ensureChatWallpaper = () => {
  const chatWindow = document.querySelector('#chat-window');
  if (!chatWindow || chatWindow.querySelector('.chat-wallpaper-layer')) return;
  const wallpaper = document.createElement('div');
  wallpaper.className = 'chat-wallpaper-layer';
  wallpaper.setAttribute('aria-hidden', 'true');
  chatWindow.prepend(wallpaper);
};

const formatChatTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const renderChats = () => {
  ensureInboxControls();
  ensureChatMoreMenu();
  const hiddenChatIds = readHiddenChatIds();
  const conversations = people.filter((person) => remoteMatchIds.includes(person.id) && !hiddenChatIds.has(String(person.id)));
  const query = chatSearchQuery.trim().toLowerCase();
  const matches = conversations.filter((person) => {
    const last = chatMessages[person.id]?.at(-1);
    const unread = last?.from === 'them' && !readChatIds.has(person.id);
    const haystack = `${person.name} ${person.city} ${person.state || ''} ${person.role} ${person.experience || ''} ${person.skills || ''} ${person.lookingFor || ''} ${last?.text || ''} ${last?.attachment?.name || ''}`.toLowerCase();
    return (!query || haystack.includes(query)) && (activeChatFilter !== 'unread' || unread);
  });
  const list = document.querySelector('#chat-list');
  const inboxToolbar = list?.querySelector('#inbox-toolbar');
  const referenceRows = '';
  const inboxMarkup = `<div class="inbox-panel-head"><div><strong>YOUR THREADS</strong><span>Private conversations</span></div><b>${conversations.length}</b></div>${referenceRows}${matches.length ? matches.map((person) => {
    const last = chatMessages[person.id]?.at(-1);
    const unread = last?.from === 'them' && !readChatIds.has(person.id);
    const lastPreview = last?.attachment ? `📎 ${last.attachment.name || 'Attachment'}` : (last?.text || 'Start a conversation');
    return `<div class="chat-row${unread ? ' is-unread' : ''}${selectedChat?.id === person.id ? ' is-selected' : ''}"><button class="chat-row-open" type="button" data-chat-id="${escapeHtml(person.id)}"><span class="member-profile-trigger" data-public-profile-id="${escapeHtml(person.id)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(person.name)} profile">${renderAvatar(person)}</span><span class="chat-row-copy"><strong data-public-profile-id="${escapeHtml(person.id)}">${escapeHtml(person.name)}</strong><span>${escapeHtml(lastPreview)}</span></span><span class="chat-row-meta"><time>${escapeHtml(formatChatTime(last?.createdAt))}</time>${unread ? '<b>1</b>' : ''}</span></button><button class="chat-delete" type="button" data-delete-chat-id="${escapeHtml(person.id)}" aria-label="Delete chat with ${escapeHtml(person.name)}" title="Delete chat"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6h11M8 3.5h4M6.5 6l.6 10h5.8l-.6-10M8.5 8.5v5M11.5 8.5v5"/></svg></button></div>`;
  }).join('') : '<div class="inbox-empty"><strong>No threads found</strong><span>Chats open once a connection is mutual. Send a signal from Explore to start one.</span><button type="button" class="inbox-empty-action" data-nav="explore">EXPLORE PEOPLE ↗</button></div>'}`;
  const inboxScroll = list?.querySelector('.chat-inbox-scroll');
  if (list && inboxScroll) {
    inboxScroll.innerHTML = inboxMarkup;
  } else if (list) {
    list.innerHTML = `<div class="chat-sidebar-brand"><strong>BRIVIA SOCIETY</strong><span></span><small><i>PEOPLE</i><i>IDEAS</i><i>POSSIBILITIES</i></small></div><div class="chat-inbox-scroll">${inboxMarkup}</div>`;
    if (inboxToolbar) list.prepend(inboxToolbar);
  }
  document.querySelector('#chat-count').textContent = `${String(conversations.length).padStart(2, '0')} CONVERSATIONS`;
  document.querySelector('#chat-badge').textContent = conversations.length;
  list?.querySelectorAll('[data-chat-id]').forEach((button) => button.addEventListener('click', (event) => {
    const profileTrigger = event.target.closest('[data-public-profile-id]');
    const person = matches.find((item) => item.id === button.dataset.chatId);
    if (profileTrigger && person) {
      event.preventDefault();
      event.stopPropagation();
      openPublicProfile(person);
      return;
    }
    openChat(person);
  }));
  list?.querySelectorAll('[data-delete-chat-id]').forEach((button) => button.addEventListener('click', () => {
    const person = conversations.find((item) => item.id === button.dataset.deleteChatId);
    if (!person || !window.confirm(`Remove your chat with ${person.name} from your inbox on this device? Saved messages and the other person's chat will remain unchanged.`)) return;
    const hiddenIds = readHiddenChatIds();
    hiddenIds.add(String(person.id));
    if (!saveHiddenChatIds(hiddenIds)) { showToast('Could not remove this chat. Please try again.'); return; }
    readChatIds.delete(person.id);
    if (selectedChat?.id === person.id) {
      selectedChat = null;
      document.querySelector('#chat-window')?.setAttribute('hidden', '');
      document.querySelector('#chat-list')?.removeAttribute('hidden');
    }
    renderChats();
    showToast('Chat removed from your inbox on this device.');
  }));
};

const loadChatMessages = async (person) => {
  if (!supabase || !memberProfile.id || !person?.id) return;
  // Fetch the member's complete inbox first, then narrow it locally. This is
  // more reliable than the compound PostgREST OR/AND filter for older rows.
  let { data, error } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body,created_at,message_type,attachment_url,attachment_path,attachment_name,attachment_mime,attachment_size').or(`sender_id.eq.${memberProfile.id},recipient_id.eq.${memberProfile.id}`);
  if (error) {
    ({ data, error } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body,created_at').or(`sender_id.eq.${memberProfile.id},recipient_id.eq.${memberProfile.id}`));
  }
  if (!error) {
    const memberId = String(memberProfile.id);
    const personId = String(person.id);
    const nextMessages = (data || []).filter((message) => {
      const senderId = String(message.sender_id);
      const recipientId = String(message.recipient_id);
      return (senderId === memberId && recipientId === personId) || (senderId === personId && recipientId === memberId);
    }).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).map((message) => ({
      id: message.id,
      createdAt: message.created_at,
      from: String(message.sender_id) === memberId ? 'me' : 'them',
      text: message.body ?? message.text ?? message.message ?? message.content ?? '',
      attachment: attachmentFromRow(message),
    }));
    const previousMessages = chatMessages[person.id] || [];
    const messagesById = new Map(previousMessages.map((message) => [String(message.id), message]));
    nextMessages.forEach((message) => {
      const previous = messagesById.get(String(message.id));
      messagesById.set(String(message.id), {
        ...previous,
        ...message,
        text: message.text || previous?.text || '',
        createdAt: message.createdAt || previous?.createdAt || '',
        attachment: message.attachment || previous?.attachment || null,
      });
    });
    const mergedMessages = [...messagesById.values()].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    const messagesChanged = previousMessages.length !== mergedMessages.length || mergedMessages.some((message, index) => {
      const previous = previousMessages[index];
      return !previous || previous.id !== message.id || previous.text !== message.text || previous.createdAt !== message.createdAt || previous.attachment?.url !== message.attachment?.url || previous.attachment?.path !== message.attachment?.path;
    });
    chatMessages[person.id] = mergedMessages;
    if (messagesChanged) renderMessages();
  } else console.warn('Messages could not load:', error.message);
};

const appendRemoteMessage = (message) => {
  if (!message?.id || !memberProfile.id) return;
  const memberId = String(memberProfile.id);
  const senderId = String(message.sender_id);
  const recipientId = String(message.recipient_id);
  if (senderId !== memberId && recipientId !== memberId) return;
  const otherId = senderId === memberId ? message.recipient_id : message.sender_id;
  if (readBlockedUserIds().has(String(otherId))) return;
  const messages = (chatMessages[otherId] ||= []);
  if (messages.some((item) => item.id === message.id)) return;
  restoreChatForMe(otherId);
  const isIncoming = senderId !== memberId;
  if (isIncoming) {
    addMessageNotification(message);
    if (selectedChat?.id === otherId) markNotificationsReadForPerson(otherId);
    renderNotifications();
  }
  messages.push({
    id: message.id,
    createdAt: message.created_at,
    from: senderId === memberId ? 'me' : 'them',
    text: message.body ?? message.text ?? message.message ?? message.content ?? '',
    attachment: attachmentFromRow(message),
  });
  if (senderId !== memberId) readChatIds.delete(otherId);
  renderChats();
  if (selectedChat?.id === otherId) renderMessages();
};

const subscribeToMessages = () => {
  if (!supabase || !memberProfile.id) return;
  supabase
    .channel(`brivia-messages-${memberProfile.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brivia_messages' }, ({ new: message }) => appendRemoteMessage(message))
    .subscribe((status) => { if (status === 'CHANNEL_ERROR') console.warn('Realtime messages channel could not connect.'); });
};

const startMessageSync = () => {
  if (messageSyncTimer) window.clearInterval(messageSyncTimer);
  const sync = () => {
    if (selectedChat) loadChatMessages(selectedChat);
    syncIncomingNotificationsFromServer().catch((error) => console.warn('Notification sync could not complete:', error.message));
    // Every ~30 s: pick up new requests, and matches completed by the other member accepting.
    if (++connectionSyncTick % 6 === 1) {
      loadConnectionRequests().catch((error) => console.warn('Request sync could not complete:', error.message));
      refreshConnections().then((changed) => { if (changed) renderChats(); }).catch((error) => console.warn('Connection sync could not complete:', error.message));
    }
  };
  sync();
  messageSyncTimer = window.setInterval(sync, 5000);
};

const syncIncomingNotificationsFromServer = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body,created_at,attachment_url,attachment_path').eq('recipient_id', memberProfile.id).order('created_at', { ascending: false }).limit(80);
  if (!error) await syncIncomingNotifications(data || []);
};

const openChat = (person, markAsRead = true) => {
  if (!person) return;
  markNotificationsReadForPerson(person.id);
  renderNotifications();
  ensureChatMoreMenu();
  ensureChatWallpaper();
  selectedChat = person;
  if (markAsRead) readChatIds.add(person.id);
  const list = document.querySelector('#chat-list'); const windowPanel = document.querySelector('#chat-window');
  const isSmallScreen = window.matchMedia('(max-width: 700px)').matches;
  if (list) list.hidden = isSmallScreen;
  windowPanel?.removeAttribute('hidden');
  const avatar = document.querySelector('#chat-avatar');
  if (avatar) {
    avatar.innerHTML = avatarImage(person.image, person.name) || escapeHtml(initials(person.name));
    avatar.dataset.publicProfileId = person.id;
    avatar.setAttribute('role', 'button');
    avatar.setAttribute('tabindex', '0');
    avatar.setAttribute('aria-label', `Open ${person.name} profile`);
    avatar.onclick = () => openPublicProfile(person);
    avatar.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPublicProfile(person); } };
  }
  const chatName = document.querySelector('#chat-name');
  if (chatName) {
    chatName.textContent = person.name;
    chatName.dataset.publicProfileId = person.id;
    chatName.setAttribute('role', 'button');
    chatName.setAttribute('tabindex', '0');
    chatName.setAttribute('aria-label', `Open ${person.name} profile`);
    chatName.onclick = () => openPublicProfile(person);
    chatName.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPublicProfile(person); } };
  }
  const chatRole = document.querySelector('#chat-role'); if (chatRole) chatRole.textContent = `${person.role || 'Brivia member'}${person.city ? ` · ${person.city}` : ''}`;
  const chatStatus = document.querySelector('#chat-status'); if (chatStatus) chatStatus.textContent = 'MEMBER / PRIVATE THREAD';
  renderChats();
  if (!chatMessages[person.id]) chatMessages[person.id] = [];
  chatShouldOpenAtLatest = true;
  renderMessages();
  loadChatMessages(person);
};

const renderMessages = () => {
  const messages = document.querySelector('#chat-messages'); if (!messages || !selectedChat) return;
  const openingAtLatest = chatShouldOpenAtLatest;
  const wasNearBottom = openingAtLatest || messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
  const previousScrollTop = messages.scrollTop;
  const thread = chatMessages[selectedChat.id] || [];
  const renderAttachment = (attachment) => {
    if (!attachment || (!attachment.url && !attachment.path)) return '';
    const name = escapeHtml(attachment.name || 'Attachment');
    const unavailable = (label = 'ATTACHMENT UNAVAILABLE') => `<span class="message-attachment message-attachment-document"><span class="message-document-icon">↗</span><span><strong>${name}</strong><small>${label}</small></span></span>`;
    let rawUrl = '';
    if (attachment.path) {
      const signed = signedAttachmentUrl(attachment.path);
      if (signed.pending) return unavailable('LOADING ATTACHMENT');
      rawUrl = signed.url || '';
    } else if (attachment.kind === 'gif') rawUrl = attachment.url; // external GIF link, not our bucket
    const safeUrl = safeAttachmentUrl(rawUrl);
    if (!safeUrl) return unavailable();
    const url = escapeHtml(safeUrl);
    if (!attachment.path && attachment.kind === 'gif') {
      let host = ''; try { host = new URL(safeUrl).hostname; } catch { /* ignore */ }
      if (!GIF_AUTOLOAD_HOSTS.has(host) || new URL(safeUrl).protocol !== 'https:') return `<a class="message-attachment message-attachment-document" href="${url}" target="_blank" rel="noopener noreferrer"><span class="message-document-icon">↗</span><span><strong>${name}</strong><small>OPEN LINK</small></span></a>`;
      return `<a class="message-attachment message-attachment-image-link" href="${url}" target="_blank" rel="noopener noreferrer"><img class="message-attachment-image" src="${url}" alt="${name}" loading="lazy" referrerpolicy="no-referrer" /></a>`;
    }
    if (attachment.kind === 'image' || attachment.kind === 'gif') return `<a class="message-attachment message-attachment-image-link" href="${url}" target="_blank" rel="noreferrer"><img class="message-attachment-image" src="${url}" alt="${name}" loading="lazy" /></a>`;
    if (attachment.kind === 'video') return `<video class="message-attachment-video" controls playsinline preload="metadata" src="${url}"></video>`;
    return `<a class="message-attachment message-attachment-document" href="${url}" target="_blank" rel="noreferrer"><span class="message-document-icon">↗</span><span><strong>${name}</strong><small>OPEN DOCUMENT</small></span></a>`;
  };
  messages.innerHTML = thread.length ? thread.map((message) => `<div class="message ${message.from === 'me' ? 'me' : 'them'}${message.attachment ? ' has-attachment' : ''}">${renderAttachment(message.attachment)}${message.text ? `<span class="message-copy">${escapeHtml(message.text)}</span>` : ''}<small>${escapeHtml(formatChatTime(message.createdAt))}</small></div>`).join('') : '<div class="chat-start-note"><strong>Start with context.</strong><span>A thoughtful first message makes a better introduction.</span></div>';
  const isBlocked = readBlockedUserIds().has(String(selectedChat.id));
  if (isBlocked) {
    messages.querySelector('.chat-start-note')?.remove();
    messages.insertAdjacentHTML('beforeend', '<div class="chat-blocked-state"><strong>This user is blocked</strong><span>New messages from this user are paused.</span><button type="button" data-chat-action="unblock">UNBLOCK</button></div>');
    messages.querySelector('[data-chat-action="unblock"]')?.addEventListener('click', () => completeChatAction('unblock'));
  }
  messages.classList.remove('is-short');
  requestAnimationFrame(() => {
    // With a long flex column, justify-content:flex-end can clip the start
    // of the scrollable overflow in Safari. Switch long threads to normal
    // top-to-bottom flow before restoring the user's position.
    const isOverflowing = messages.scrollHeight > messages.clientHeight + 1;
    messages.classList.toggle('is-short', !isOverflowing);
    const maxScrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight);
    messages.scrollTop = wasNearBottom ? maxScrollTop : Math.min(previousScrollTop, maxScrollTop);
    if (openingAtLatest) chatShouldOpenAtLatest = false;
  });
  if (wasNearBottom) {
    const keepLatest = () => {
      const userIsNearBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight < 120;
      if (userIsNearBottom) messages.scrollTop = messages.scrollHeight;
    };
    messages.querySelectorAll('img, video').forEach((media) => {
      media.addEventListener('load', keepLatest, { once: true });
      media.addEventListener('loadedmetadata', keepLatest, { once: true });
    });
  }
};

const closeSelectedChat = () => {
  selectedChat = null;
  document.querySelector('#chat-window')?.setAttribute('hidden', '');
  document.querySelector('#chat-list')?.removeAttribute('hidden');
  document.querySelector('#chat-more-menu')?.setAttribute('hidden', '');
  document.querySelector('#chat-more')?.setAttribute('aria-expanded', 'false');
  suppressChatAutoOpen = true;
  renderChats();
  suppressChatAutoOpen = false;
};
// The one block flow: the remote row, then the local blocked-ids store. Shared by the chat menu and the card overflow.
const blockMember = async (person) => {
  const remoteResult = await saveRemoteBlock(person.id, true);
  if (remoteResult.error) { showToast(blockedDatabaseMessage(remoteResult.error)); return false; }
  const blockedIds = readBlockedUserIds();
  blockedIds.add(String(person.id));
  if (!saveBlockedUserIds(blockedIds)) { showToast('Could not block this user. Please try again.'); return false; }
  return true;
};
// R4: report_member blocks on the server as well, so on success the member is hidden locally exactly like a block.
const hideReportedMember = (person) => {
  const blockedIds = readBlockedUserIds();
  blockedIds.add(String(person.id));
  saveBlockedUserIds(blockedIds);
  readChatIds.delete(person.id);
};
const completeChatAction = async (action) => {
  const person = selectedChat;
  if (!person) return;
  if (action === 'report') {
    const reported = await openReportDialog({ name: person.name, trigger: document.querySelector('#chat-more'), send: (reason, note) => reportMember(person.id, reason, note) });
    if (!reported) return;
    hideReportedMember(person);
    closeSelectedChat();
    showToast(reportSuccessCopy(person.name));
    return;
  }
  if (action === 'unblock') {
    const remoteResult = await saveRemoteBlock(person.id, false);
    if (remoteResult.error) { showToast(blockedDatabaseMessage(remoteResult.error)); return; }
    const blockedIds = readBlockedUserIds();
    blockedIds.delete(String(person.id));
    if (!saveBlockedUserIds(blockedIds)) { showToast('Could not unblock this user. Please try again.'); return; }
    restoreConversation(person.id);
    renderChats();
    renderMessages();
    showToast(`${person.name} is unblocked.`);
    return;
  }
  if (action === 'remove-connection') {
    if (!window.confirm(`Remove ${person.name} from your connections?`)) return;
    const remoteResult = await removeRemoteConnection(person);
    if (remoteResult.error) {
      showToast(/row-level security|policy|permission denied/i.test(remoteResult.error.message || '')
        ? 'Run the SQL files in supabase/migrations/ (in order) in the Supabase SQL Editor.'
        : `Connection could not be removed: ${remoteResult.error.message}`);
      return;
    }
    rememberRemovedConnection(person);
    readChatIds.delete(person.id);
    removeConnectionFromState(person);
    showToast(`Connection with ${person.name} removed.`);
    return;
  }
  const label = action === 'block' ? `Block ${person.name}? The conversation will stay here.` : `Delete your chat with ${person.name} from this device?`;
  if (!window.confirm(label)) return;
  if (action === 'block') {
    if (!await blockMember(person)) return;
    readChatIds.delete(person.id);
    renderChats();
    renderMessages();
    showToast(`${person.name} is blocked.`);
    return;
  }
  const hiddenIds = readHiddenChatIds();
  hiddenIds.add(String(person.id));
  if (!saveHiddenChatIds(hiddenIds)) { showToast('Could not update this chat. Please try again.'); return; }
  readChatIds.delete(person.id);
  closeSelectedChat();
  showToast('Chat deleted from your inbox.');
};
const ensureChatMoreMenu = () => {
  const header = document.querySelector('.chat-window-head');
  if (!header) return;
  if (!document.querySelector('#chat-more')) header.insertAdjacentHTML('beforeend', '<button class="chat-more" id="chat-more" type="button" aria-label="More chat options" aria-expanded="false">•••</button><div class="chat-more-menu" id="chat-more-menu" hidden><button type="button" data-chat-action="delete">Delete chat</button><button type="button" data-chat-action="remove-connection">Remove connection</button><button type="button" data-chat-action="block">Block user</button><button type="button" data-chat-action="report">Report and block</button></div>');
  const more = document.querySelector('#chat-more');
  const menu = document.querySelector('#chat-more-menu');
  const actionButton = menu?.querySelector('[data-chat-action="block"], [data-chat-action="unblock"]');
  if (actionButton) {
    const isBlocked = selectedChat && readBlockedUserIds().has(String(selectedChat.id));
    actionButton.dataset.chatAction = isBlocked ? 'unblock' : 'block';
    actionButton.textContent = isBlocked ? 'Unblock user' : 'Block user';
  }
  if (!more || more.dataset.menuBound === 'true') return;
  more.dataset.menuBound = 'true';
  const close = () => { menu?.setAttribute('hidden', ''); more?.setAttribute('aria-expanded', 'false'); };
  more?.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = menu?.hasAttribute('hidden');
    close();
    if (shouldOpen) { menu?.removeAttribute('hidden'); more.setAttribute('aria-expanded', 'true'); }
  });
  menu?.querySelectorAll('[data-chat-action]').forEach((button) => button.addEventListener('click', () => { close(); completeChatAction(button.dataset.chatAction); }));
  document.addEventListener('click', (event) => { if (!header.contains(event.target)) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
};

const ensureProfilePhotoEditor = () => {
  const hero = document.querySelector('.profile-hero');
  if (!hero) return;
  const actions = document.querySelector('.profile-hero-actions') || document.createElement('div');
  actions.className = 'profile-hero-actions';
  if (!actions.parentElement) hero.append(actions);
  if (!document.querySelector('#profile-photo-editor')) {
    const editor = document.createElement('button');
    editor.id = 'profile-photo-editor';
    editor.className = 'profile-photo-editor';
    editor.type = 'button';
    editor.innerHTML = '<span>EDIT PROFILE</span>';
    actions.append(editor);
    editor.addEventListener('click', openProfileEditor);
  }
  if (document.querySelector('#profile-settings-button')) return;
  const settings = document.createElement('button');
  settings.id = 'profile-settings-button';
  settings.className = 'profile-settings-button';
  settings.type = 'button';
  settings.setAttribute('aria-label', 'Profile settings');
  settings.setAttribute('aria-expanded', 'false');
  settings.innerHTML = '<span aria-hidden="true">⚙</span>';
  const menu = document.createElement('div');
  menu.id = 'profile-settings-menu';
  menu.className = 'profile-settings-menu';
  menu.hidden = true;
  menu.innerHTML = '<button type="button" data-profile-setting="notifications">NOTIFICATIONS</button><button type="button" data-profile-setting="block">BLOCKED USERS</button><button type="button" data-profile-setting="removed">REMOVED CONNECTIONS</button><button type="button" data-profile-setting="privacy">PRIVACY &amp; ACCOUNT</button><button type="button" data-profile-setting="logout">LOG OUT</button>';
  actions.prepend(settings);
  actions.append(menu);
  const close = () => { menu.hidden = true; settings.setAttribute('aria-expanded', 'false'); };
  settings.addEventListener('click', (event) => {
    event.stopPropagation();
    const shouldOpen = menu.hidden;
    close();
    if (shouldOpen) { menu.hidden = false; settings.setAttribute('aria-expanded', 'true'); }
  });
  menu.querySelector('[data-profile-setting="block"]')?.addEventListener('click', () => { close(); openBlockedUsersManager(); });
  menu.querySelector('[data-profile-setting="notifications"]')?.addEventListener('click', () => { close(); openNotificationSettings(); });
  menu.querySelector('[data-profile-setting="removed"]')?.addEventListener('click', () => { close(); openRemovedConnectionsManager(); });
  menu.querySelector('[data-profile-setting="privacy"]')?.addEventListener('click', () => { close(); openPrivacy(settings); });
  menu.querySelector('[data-profile-setting="logout"]')?.addEventListener('click', () => { close(); logoutMember(); });
  document.addEventListener('click', (event) => { if (!hero.contains(event.target)) close(); });
};

const openProfileEditor = () => {
  if (!memberProfile.id || document.querySelector('#profile-edit-modal')) return;
  const profile = memberProfile;
  const modal = document.createElement('div');
  modal.id = 'profile-edit-modal';
  modal.className = 'profile-edit-modal';
  modal.innerHTML = `<div class="profile-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-edit-title">
    <button type="button" class="profile-edit-close" data-profile-edit-close aria-label="Close">×</button>
    <p class="profile-edit-kicker">THE BRIVIA CLUB / PROFILE</p>
    <h2 id="profile-edit-title">Edit your <em>profile.</em></h2>
    <p class="profile-edit-note">Update your details, photo, and cover. Changes are saved to your member profile.</p>
    <form id="profile-edit-form">
      <div class="profile-edit-grid">
        <label><span>FULL NAME</span><input name="name" value="${escapeHtml(profile.name || '')}" required /></label>
        <label><span>EMAIL</span><input value="${escapeHtml(profile.email || '')}" readonly /></label>
        <label><span>PHONE</span><input name="phone" value="${escapeHtml(profile.phone || '')}" /></label>
        <label><span>EXPERIENCE / ROLE</span><input name="experience" value="${escapeHtml(profile.experience || '')}" /></label>
        <div class="profile-edit-wide profile-edit-readonly" data-profile-area><span>YOUR AREA</span><p>${escapeHtml(memberPlaceLabel || 'Not set yet')}</p><small class="profile-edit-helper">Change your area: coming soon. Other members only ever see a rough distance, never your area's name.</small></div>
        <div class="profile-edit-wide profile-edit-readonly"><span>SKILLS / INTERESTS</span><p>${escapeHtml(profile.skills || 'Pick interests in your profile setup')}</p><small class="profile-edit-helper">These come from your interests and passion points. Private interests are never shown.</small></div>
        <label class="profile-edit-wide"><span>LOOKING FOR</span><input name="lookingFor" list="profile-edit-looking-options" value="${escapeHtml(profile.lookingFor || '')}" placeholder="Search or type what you are looking for" /><datalist id="profile-edit-looking-options">${profileEditDatalist('lookingFor')}</datalist><small class="profile-edit-helper">Choose from suggestions or type your own.</small></label>
        <label><span>PROFILE PHOTO</span><input name="photoFile" type="file" accept="image/*" aria-describedby="profile-photo-error" /><small class="media-inline-error" id="profile-photo-error" role="alert" hidden></small></label>
        <label><span>COVER PHOTO</span><input name="coverFile" type="file" accept="image/*" aria-describedby="profile-cover-error" /><small class="media-inline-error" id="profile-cover-error" role="alert" hidden></small></label>
      </div>
      <p class="profile-edit-feedback" id="profile-edit-feedback" role="status"></p>
      <div class="profile-edit-actions"><button type="button" class="profile-edit-cancel" data-profile-edit-close>CANCEL</button><button type="submit" class="profile-edit-save">SAVE CHANGES <span>↗</span></button></div>
    </form>
  </div>`;
  document.body.append(modal);
  const close = () => modal.remove();
  modal.querySelectorAll('[data-profile-edit-close]').forEach((button) => button.addEventListener('click', close));
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  modal.querySelector('#profile-edit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const feedback = form.querySelector('#profile-edit-feedback');
    const submit = form.querySelector('[type="submit"]');
    const formData = new FormData(form);
    const nextProfile = {
      ...memberProfile,
      name: String(formData.get('name') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      experience: String(formData.get('experience') || '').trim(),
      lookingFor: String(formData.get('lookingFor') || '').trim(),
    };
    const photoFile = form.querySelector('[name="photoFile"]')?.files?.[0] || null;
    const coverFile = form.querySelector('[name="coverFile"]')?.files?.[0] || null;
    if (!nextProfile.name) { feedback.textContent = 'Please add your name.'; return; }
    const photoError = form.querySelector('#profile-photo-error');
    const coverError = form.querySelector('#profile-cover-error');
    [photoError, coverError].forEach((node) => { node.hidden = true; node.textContent = ''; });
    submit.disabled = true;
    feedback.textContent = 'Saving your profile...';
    const { data, error } = await saveProfile(memberProfile.id, nextProfile, photoFile, coverFile, { photoUrl: memberProfile.photoUrl, coverUrl: memberProfile.coverUrl });
    if (error) {
      submit.disabled = false;
      if (error instanceof ImageProcessingError) {
        // Inline beside the field that failed (nothing was uploaded); photo is processed first.
        const target = error.field === 'cover' ? coverError : photoError;
        target.textContent = error.message;
        target.hidden = false;
        feedback.textContent = '';
        form.querySelector(error.field === 'cover' ? '[name="coverFile"]' : '[name="photoFile"]')?.focus();
        return;
      }
      feedback.textContent = error.message || 'Profile could not be saved.';
      return;
    }
    const savedProfile = data ? rowToProfile(data) : {};
    memberProfile = { ...memberProfile, ...nextProfile, ...savedProfile, id: memberProfile.id };
    window.localStorage.setItem('brivia-member-profile', JSON.stringify(memberProfile));
    close();
    renderProfile();
    showToast('Profile updated and saved.');
  });
};

// PRIVACY & ACCOUNT (Iteration 4, Task 9; R2, R5). The dialogs live in privacy-account.js; this wires them to Supabase.
const REAUTH_DELETE_KEY = 'brivia-reauth-delete'; // sessionStorage marker: reopen the delete dialog after Google re-auth
const privacyDeps = (session) => ({
  user: session.user,
  fetchConsentAt: () => fetchSensitiveConsentAt(session.user.id),
  withdrawConsent: () => setSensitiveConsent(false),
  // The server deleted the private interests: re-read the own row so skills (server-owned) are not stale.
  onWithdrawn: async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (data) { memberProfile = { ...memberProfile, skills: rowToProfile(data).skills }; window.localStorage.setItem('brivia-member-profile', JSON.stringify(memberProfile)); renderProfile(); }
  },
  runDeletion: () => deleteAccount({
    storage: supabase.storage,
    rpc: (name, args) => supabase.rpc(name, args),
    signOut: (options) => supabase.auth.signOut(options),
    clearLocal: () => clearBriviaKeys(window.localStorage, window.sessionStorage), // also the sb-*-auth-token keys
    buckets: DELETE_BUCKETS,
    uid: session.user.id,
  }),
  signInWithPassword: (email, password) => supabase.auth.signInWithPassword({ email, password }),
  startGoogle: async () => {
    try { window.sessionStorage.setItem(REAUTH_DELETE_KEY, String(Date.now())); } catch { /* the member can reopen the dialog by hand */ }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth.html`, queryParams: { prompt: 'select_account' } } });
    if (error) { try { window.sessionStorage.removeItem(REAUTH_DELETE_KEY); } catch { /* ignore */ } throw error; }
  },
  onDeleted: () => window.location.assign('/privacy.html?deleted=1'),
});
const openPrivacy = async (trigger, { autoDelete = false } = {}) => {
  if (!supabase) return;
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return;
  openPrivacyAccount({ trigger, deps: privacyDeps(data.session), autoDelete });
};

const logoutMember = async () => {
  if (supabase) await supabase.auth.signOut();
  window.localStorage.removeItem('brivia-member-profile');
  window.location.href = '/auth.html';
};

const openNotificationSettings = () => {
  if (document.querySelector('#profile-notification-settings-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'profile-notification-settings-modal';
  modal.className = 'profile-settings-modal';
  modal.innerHTML = `<div class="profile-settings-dialog notification-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="notification-settings-title">
    <button type="button" class="profile-settings-close" aria-label="Close">×</button>
    <p class="profile-edit-kicker">THE BRIVIA CLUB / SETTINGS</p>
    <h2 id="notification-settings-title">Your <em>signals.</em></h2>
    <p class="profile-settings-note">Choose how the club keeps you updated. Chat messages will still be available in your inbox when alerts are off.</p>
    <label class="settings-toggle-row"><span><strong>MESSAGE NOTIFICATIONS</strong><small>Get an alert when someone sends you a message.</small></span><input id="profile-notifications-toggle" type="checkbox" /><i aria-hidden="true"></i></label>
    <p class="profile-settings-feedback" id="notification-settings-feedback" role="status"></p>
  </div>`;
  document.body.append(modal);
  const toggle = modal.querySelector('#profile-notifications-toggle');
  const feedback = modal.querySelector('#notification-settings-feedback');
  const close = () => modal.remove();
  toggle.checked = areNotificationsEnabled();
  modal.querySelector('.profile-settings-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  toggle.addEventListener('change', () => {
    setNotificationsEnabled(toggle.checked);
    feedback.textContent = toggle.checked ? 'Notifications turned on.' : 'Notifications turned off.';
  });
};

const openBlockedUsersManager = () => {
  if (document.querySelector('#profile-blocked-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'profile-blocked-modal';
  modal.className = 'profile-settings-modal';
  modal.innerHTML = `<div class="profile-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
    <button type="button" class="profile-settings-close" aria-label="Close">×</button>
    <p class="profile-edit-kicker">THE BRIVIA CLUB / SETTINGS</p>
    <h2 id="profile-settings-title">Blocked <em>users.</em></h2>
    <p class="profile-settings-note">Manage members you have blocked from starting new conversations.</p>
    <p class="profile-settings-note">Unblocking doesn't cancel a report you've made.</p>
    <div class="profile-block-user-list"></div>
    <p class="profile-settings-feedback" role="status"></p>
  </div>`;
  document.body.append(modal);
  const list = modal.querySelector('.profile-block-user-list');
  const feedback = modal.querySelector('.profile-settings-feedback');
  const close = () => modal.remove();
  modal.querySelector('.profile-settings-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  const renderList = () => {
    const blockedIds = readBlockedUserIds();
    // The candidate RPCs hide blocked members, so a blocked id may have no loaded card: list it anyway.
    const members = [...blockedIds].map((id) => findPersonById(id) || { id, name: 'Blocked member', city: '' });
    list.innerHTML = members.length ? members.map((person) => {
      return `<div class="profile-block-user-row"><div><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.city || 'Brivia member')}</span></div><button type="button" data-block-user-id="${escapeHtml(person.id)}">UNBLOCK</button></div>`;
    }).join('') : '<p class="profile-settings-empty">No blocked users.</p>';
    list.querySelectorAll('[data-block-user-id]').forEach((button) => button.addEventListener('click', async () => {
      const personId = button.dataset.blockUserId;
      button.disabled = true;
      feedback.textContent = 'Unblocking member...';
      const remoteResult = await saveRemoteBlock(personId, false);
      if (remoteResult.error) {
        feedback.textContent = blockedDatabaseMessage(remoteResult.error);
        button.disabled = false;
        return;
      }
      const nextIds = readBlockedUserIds();
      nextIds.delete(String(personId));
      saveBlockedUserIds(nextIds);
      restoreConversation(personId);
      feedback.textContent = 'Member unblocked.';
      renderList();
      renderChats();
    }));
  };
  renderList();
};

const openConnectionsManager = () => {
  if (document.querySelector('#profile-connections-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'profile-connections-modal';
  modal.className = 'profile-settings-modal';
  modal.innerHTML = `<div class="profile-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-connections-title">
    <button type="button" class="profile-settings-close" aria-label="Close">×</button>
    <p class="profile-edit-kicker">THE BRIVIA CLUB / SETTINGS</p>
    <h2 id="profile-connections-title">Your <em>connections.</em></h2>
    <p class="profile-settings-note">Remove a member from your connections. This also removes the conversation from your active threads.</p>
    <div class="profile-connection-list"></div>
    <p class="profile-settings-feedback" role="status"></p>
  </div>`;
  document.body.append(modal);
  const list = modal.querySelector('.profile-connection-list');
  const feedback = modal.querySelector('.profile-settings-feedback');
  const close = () => modal.remove();
  modal.querySelector('.profile-settings-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });

  const renderList = () => {
    const members = people.filter((person) => remoteConnectionIds.some((id) => String(id) === String(person.id)));
    list.innerHTML = members.length ? members.map((person) => {
      return `<div class="profile-connection-row"><div class="profile-connection-member">${renderAvatar(person, 'profile-connection-avatar')}<div class="profile-connection-copy"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.role || person.city || 'Brivia member')}</span></div></div><button type="button" class="profile-connection-remove" data-remove-connection-id="${escapeHtml(person.id)}">REMOVE</button></div>`;
    }).join('') : '<p class="profile-settings-empty">No active connections.</p>';

    list.querySelectorAll('[data-remove-connection-id]').forEach((button) => button.addEventListener('click', async () => {
      const person = members.find((item) => String(item.id) === String(button.dataset.removeConnectionId));
      if (!person || !window.confirm(`Remove ${person.name} from your connections?`)) return;
      button.disabled = true;
      feedback.textContent = 'Removing connection...';
      const remoteResult = await removeRemoteConnection(person);
      if (remoteResult.error) {
        feedback.textContent = /row-level security|policy|permission denied/i.test(remoteResult.error.message || '')
          ? 'Removal is not enabled yet. Run the SQL files in supabase/migrations/ (in order) in the Supabase SQL Editor.'
          : `Connection could not be removed: ${remoteResult.error.message}`;
        button.disabled = false;
        return;
      }
      rememberRemovedConnection(person);
      removeConnectionFromState(person);
      feedback.textContent = 'Connection removed.';
      renderList();
      showToast(`Connection with ${person.name} removed.`);
    }));
  };
  renderList();
};

const openRemovedConnectionsManager = () => {
  if (document.querySelector('#profile-removed-connections-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'profile-removed-connections-modal';
  modal.className = 'profile-settings-modal';
  modal.innerHTML = `<div class="profile-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-removed-connections-title">
    <button type="button" class="profile-settings-close" aria-label="Close">×</button>
    <p class="profile-edit-kicker">THE BRIVIA CLUB / SETTINGS</p>
    <h2 class="profile-removed-connections-title" id="profile-removed-connections-title">Removed <em>connections.</em></h2>
    <p class="profile-settings-note">Members you have removed from your connections are listed here.</p>
    <div class="profile-connection-list"></div>
  </div>`;
  document.body.append(modal);
  const list = modal.querySelector('.profile-connection-list');
  const close = () => modal.remove();
  modal.querySelector('.profile-settings-close')?.addEventListener('click', close);
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
  const renderList = () => {
    const records = readRemovedConnections();
    list.innerHTML = records.length ? records.map((record) => {
      const person = findPersonById(record.id) || { id: record.id, name: record.name, image: record.image };
      const removedDate = new Date(record.removedAt);
      const dateLabel = Number.isNaN(removedDate.getTime()) ? '' : removedDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
      return `<div class="profile-connection-row profile-removed-connection-row"><div class="profile-connection-member">${renderAvatar(person, 'profile-connection-avatar')}<div class="profile-connection-copy"><strong>${escapeHtml(record.name || person.name)}</strong><span>Removed${dateLabel ? ` · ${escapeHtml(dateLabel)}` : ''}</span></div></div></div>`;
    }).join('') : '<p class="profile-settings-empty">No removed connections yet.</p>';
  };
  renderList();
};

const renderProfile = () => {
  const profile = memberProfile;
  const headerAvatar = document.querySelector('#app-avatar-button');
  if (headerAvatar) {
    headerAvatar.textContent = headerInitials(profile.name);
    headerAvatar.setAttribute('aria-label', `Open ${profile.name || 'member'} profile`);
  }
  const coverUrl = normalizeCoverUrl(profile.coverUrl || profile.cover_url || profile.cover_image_url) || defaultCoverUrl;
  ensureProfilePhotoEditor();
  document.querySelector('#profile-name').textContent = profile.name || 'New Member';
  // My area as the server names it (my_onboarding_status().place_label), read-only here (D-036). The legacy free-text
  // City/State are neither shown nor editable: no other member can read them, and the area is the server's cell.
  document.querySelector('#profile-location').textContent = memberPlaceLabel || 'Your area';
  const profileCover = document.querySelector('#profile-cover-image');
  const safeOwnCover = safeImageUrl(coverUrl) || safeImageUrl(defaultCoverUrl);
  if (profileCover) profileCover.style.backgroundImage = `url("${safeOwnCover}")`;
  const profileSidebarCover = document.querySelector('#profile-sidebar-cover');
  if (profileSidebarCover) profileSidebarCover.style.backgroundImage = `url("${safeOwnCover}")`;
  const avatar = document.querySelector('#profile-avatar');
  if (avatar) avatar.innerHTML = avatarImage(profile.photoUrl, profile.name) || escapeHtml(initials(profile.name));
  if (avatar && profile.photoName) avatar.title = profile.photoName;
  document.querySelector('#profile-email').textContent = profile.email || '—';
  document.querySelector('#profile-login-email').textContent = profile.email || '—';
  document.querySelector('#profile-phone').textContent = profile.phone || '—';
  const skills = (profile.skills || '').split(',').map((skill) => skill.trim()).filter(Boolean);
  const lookingFor = (profile.lookingFor || '').split(',').map((item) => item.trim()).filter(Boolean);
  const statEmail = document.querySelector('#profile-stat-email');
  const statArea = document.querySelector('#profile-stat-area');
  if (statEmail) statEmail.textContent = profile.email || '—';
  if (statArea) statArea.textContent = memberPlaceLabel || '—';
  document.querySelector('#profile-skills').innerHTML = skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') : '<span>Pick interests in your profile setup</span>';
  document.querySelector('#profile-looking').innerHTML = lookingFor.length ? lookingFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Add your intentions to find better connections.</span>';
  const statLooking = document.querySelector('#profile-stat-looking');
  const statSkills = document.querySelector('#profile-stat-skills');
  if (statLooking) statLooking.innerHTML = lookingFor.length ? lookingFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Add your intentions</span>';
  if (statSkills) statSkills.innerHTML = skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') : '<span>Pick interests in your profile setup</span>';
  document.querySelector('#profile-skill-count').textContent = String(skills.length).padStart(2, '0');
  document.querySelector('#profile-looking-count').textContent = String(lookingFor.length).padStart(2, '0');
  document.querySelector('#profile-experience-short').textContent = profile.experience ? profile.experience.replace('Student / just starting', 'STARTING').replace(' years', 'Y') : '—';
  document.querySelector('#profile-summary').textContent = profile.experience ? `${profile.experience} and open to meaningful connections inside the club.` : 'Your profile is your first introduction inside the club.';
};

let communityPosts = [];
let communityPostAuthors = {};
let communityPostSort = 'newest';
let communityPostsLoaded = false;
let communityPostsLoading = false;
let communityPostPreviewUrl = '';

const formatCommunityPostDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'RECENTLY';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
};

const bindCommunityProfileTriggers = () => {
  document.querySelectorAll('#community-post-list [data-public-profile-id]').forEach((trigger) => {
    if (trigger.dataset.profileBound === 'true') return;
    const handleProfileOpen = (event) => {
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      openPublicProfile(communityPostAuthors[trigger.dataset.publicProfileId] || findPersonById(trigger.dataset.publicProfileId), { forcePublic: true });
    };
    trigger.addEventListener('click', handleProfileOpen);
    trigger.addEventListener('keydown', handleProfileOpen);
    trigger.dataset.profileBound = 'true';
  });
};

const renderCommunityPosts = () => {
  const list = document.querySelector('#community-post-list');
  const count = document.querySelector('#community-post-count');
  if (!list) return;
  const sorted = [...communityPosts].sort((first, second) => {
    const firstTime = new Date(first.created_at || 0).getTime();
    const secondTime = new Date(second.created_at || 0).getTime();
    return communityPostSort === 'oldest' ? firstTime - secondTime : secondTime - firstTime;
  });
  if (count) count.textContent = `${String(sorted.length).padStart(2, '0')} ${sorted.length === 1 ? 'POST' : 'POSTS'}`;
  if (!sorted.length) {
    list.innerHTML = '<div class="community-post-empty"><span>✦</span><h2>Start the<br /><em>conversation.</em></h2><p>Share a thought, image, or small win with the club.</p></div>';
    return;
  }
  list.innerHTML = sorted.map((post) => {
    const author = communityPostAuthors[post.author_id] || { id: post.author_id, name: 'Brivia member', image: '' };
    const authorId = author.id || post.author_id;
    // Only the author's own community-posts Storage file auto-loads; any other URL shows a placeholder.
    const postImage = isStorageImageUrl(post.image_url, 'community-posts', post.author_id) ? post.image_url : '';
    return `<article class="community-post-card"><div class="community-post-image-wrap community-post-profile-trigger" data-public-profile-id="${escapeHtml(authorId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(author.name)} profile"><span class="community-post-media-label">COMMUNITY</span>${postImage ? `<img src="${escapeHtml(postImage)}" alt="Post by ${escapeHtml(author.name)}" loading="lazy" />` : '<span class="community-post-image-missing" role="img" aria-label="Image unavailable"></span>'}</div><div class="community-post-card-body"><div class="community-post-card-top"><span class="community-post-pill">POST</span><span class="community-post-more" aria-hidden="true">•••</span></div><h3>${escapeHtml(post.caption)}</h3><div class="community-post-author" data-public-profile-id="${escapeHtml(authorId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(author.name)} profile">${renderAvatar({ name: author.name, image: author.image }, 'community-post-avatar')}<div><strong>POSTED BY ${escapeHtml(author.name).toUpperCase()}</strong><span>${formatCommunityPostDate(post.created_at)}</span></div></div></div></article>`;
  }).join('');
  bindCommunityProfileTriggers();
};

const loadCommunityPosts = async () => {
  if (!supabase || !memberProfile.id || communityPostsLoading) return;
  communityPostsLoading = true;
  const list = document.querySelector('#community-post-list');
  if (!communityPostsLoaded && list) list.innerHTML = '<div class="community-post-loading">LOADING COMMUNITY POSTS...</div>';
  const { data, error } = await supabase
    .from('community_posts')
    .select('id,author_id,image_url,image_path,caption,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    communityPostsLoading = false;
    communityPostsLoaded = true;
    if (list) list.innerHTML = /community_posts|relation|schema cache/i.test(error.message || '')
      ? '<div class="community-post-empty"><span>✦</span><h2>Community posts<br /><em>are almost here.</em></h2><p>Run the SQL files in <strong>supabase/migrations/</strong> to enable shared posts.</p></div>'
      : `<div class="community-post-empty"><span>!</span><h2>Could not load<br /><em>the feed.</em></h2><p>${escapeHtml(error.message || 'Please try again.')}</p></div>`;
    return;
  }
  communityPosts = data || [];
  communityPostAuthors = {};
  const authorIds = [...new Set(communityPosts.map((post) => post.author_id).filter(Boolean))];
  // My own posts use my profile; get_candidates never returns the caller.
  if (memberProfile.id && authorIds.some((id) => String(id) === String(memberProfile.id))) {
    communityPostAuthors[memberProfile.id] = { ...memberProfile, image: memberProfile.photoUrl || '', photoUrl: memberProfile.photoUrl || '' };
  }
  const otherAuthorIds = authorIds.filter((id) => String(id) !== String(memberProfile.id));
  if (otherAuthorIds.length) {
    const authors = await fetchCandidates(otherAuthorIds);
    if (authors.error) console.warn('Post authors could not load:', authors.error.message);
    (authors.data || []).forEach((author) => {
      const authorProfile = toMemberPerson(author);
      const knownPerson = findPersonById(author.id);
      const isOwnProfile = String(author.id) === String(memberProfile.id);
      communityPostAuthors[author.id] = {
        ...authorProfile,
        ...(knownPerson || (isOwnProfile ? memberProfile : {})),
        id: author.id,
        name: authorProfile.name || knownPerson?.name || (isOwnProfile ? memberProfile.name : '') || 'Brivia member',
        image: authorProfile.photoUrl || knownPerson?.image || (isOwnProfile ? memberProfile.photoUrl : '') || '',
        photoUrl: authorProfile.photoUrl || knownPerson?.photoUrl || (isOwnProfile ? memberProfile.photoUrl : '') || '',
      };
    });
  }
  communityPostsLoading = false;
  communityPostsLoaded = true;
  renderCommunityPosts();
};

const openCommunityPostComposer = () => {
  const form = document.querySelector('#community-post-form');
  form?.removeAttribute('hidden');
  form?.querySelector('textarea')?.focus();
};

const closeCommunityPostComposer = () => {
  const form = document.querySelector('#community-post-form');
  form?.setAttribute('hidden', '');
  form?.reset();
  const preview = document.querySelector('#community-post-preview');
  preview?.setAttribute('hidden', '');
  if (communityPostPreviewUrl) URL.revokeObjectURL(communityPostPreviewUrl);
  communityPostPreviewUrl = '';
  const feedback = document.querySelector('#community-post-feedback');
  if (feedback) feedback.textContent = '';
};

document.querySelector('#community-post-sort')?.addEventListener('change', (event) => {
  communityPostSort = event.target.value;
  renderCommunityPosts();
});
document.querySelector('#open-community-post')?.addEventListener('click', openCommunityPostComposer);
document.querySelector('#close-community-post')?.addEventListener('click', closeCommunityPostComposer);
document.querySelector('#community-post-image')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  const preview = document.querySelector('#community-post-preview');
  const image = document.querySelector('#community-post-preview-image');
  if (!file || !preview || !image) return;
  if (communityPostPreviewUrl) URL.revokeObjectURL(communityPostPreviewUrl);
  communityPostPreviewUrl = URL.createObjectURL(file);
  image.src = communityPostPreviewUrl;
  preview.removeAttribute('hidden');
});
document.querySelector('#community-post-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const file = form.querySelector('[name="image"]')?.files?.[0];
  const caption = form.querySelector('[name="caption"]')?.value.trim() || '';
  const feedback = form.querySelector('#community-post-feedback');
  const submit = form.querySelector('[type="submit"]');
  if (!file || !caption || !supabase || !memberProfile.id) return;
  if (!file.type.startsWith('image/')) { if (feedback) feedback.textContent = 'Please choose an image file.'; return; }
  if (file.size > 8 * 1024 * 1024) { if (feedback) feedback.textContent = 'Keep the image under 8MB.'; return; }
  submit.disabled = true;
  if (feedback) { feedback.textContent = 'Publishing your post...'; feedback.setAttribute('role', 'alert'); }
  let upload = null;
  try {
    upload = await uploadCommunityPostImage(memberProfile.id, file);
    const { error } = await supabase.from('community_posts').insert({
      author_id: memberProfile.id,
      image_url: upload.url,
      image_path: upload.path,
      caption,
    });
    if (error) throw error;
    closeCommunityPostComposer();
    await loadCommunityPosts();
    showToast('Your post is live in Explore.');
  } catch (error) {
    if (upload?.path) await removeCommunityPostImage(upload.path);
    if (error instanceof ImageProcessingError) { if (feedback) feedback.textContent = error.message; }
    else if (feedback) feedback.textContent = /community_posts|relation|schema cache/i.test(error.message || '')
      ? 'Run the SQL files in supabase/migrations/ (in order), then try again.'
      : (error.message || 'Your post could not be published.');
  } finally {
    submit.disabled = false;
  }
});

document.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', (event) => {
  if (!validViews.includes(button.dataset.nav)) return;
  if (button.tagName === 'A') {
    // The static route bridge handles anchor navigation before this module's
    // view handler. Reload the shared feed after that bridge has switched the
    // active view, so posts appear without a full page refresh.
    if (button.dataset.nav === 'posts') window.setTimeout(() => {
      if (document.body.dataset.appView === 'posts' && memberProfile.id) loadCommunityPosts();
    }, 0);
    return;
  }
  setView(button.dataset.nav);
}));
window.addEventListener('popstate', () => {
  const state = window.history.state || {};
  const hasView = new URLSearchParams(window.location.search).has('view') || Boolean(window.location.hash.slice(1));
  if (appBackGuardActive && !state.briviaAppBackGuard && !hasView) {
    window.location.replace('/');
    return;
  }
  routeFromUrl();
});
window.addEventListener('hashchange', routeFromUrl);
document.querySelector('[data-action="pass"]')?.addEventListener('click', () => swipe('pass'));
document.querySelector('[data-action="like"]')?.addEventListener('click', () => swipe('like'));
document.querySelector('[data-action="full-info"]')?.addEventListener('click', () => openPublicProfile(currentPerson));
const swipeCard = document.querySelector('#swipe-card');
let swipePointer = null;
const resetSwipeDrag = () => {
  if (!swipeCard) return;
  swipeCard.classList.remove('is-dragging');
  swipeCard.style.transform = '';
  swipeCard.style.opacity = '';
};
swipeCard?.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || event.target.closest('button, a, input, textarea, select, [data-no-swipe]')) return;
  if (!currentPerson || swipeCard.classList.contains('is-passing') || swipeCard.classList.contains('is-liking')) return;
  swipePointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY };
  swipeCard.classList.add('is-dragging');
  swipeCard.setPointerCapture(event.pointerId);
  event.preventDefault();
});
swipeCard?.addEventListener('pointermove', (event) => {
  if (!swipePointer || event.pointerId !== swipePointer.id) return;
  const offsetX = event.clientX - swipePointer.startX;
  const offsetY = event.clientY - swipePointer.startY;
  if (event.pointerType !== 'mouse' && Math.abs(offsetY) > 12 && Math.abs(offsetY) > Math.abs(offsetX)) {
    swipePointer = null;
    resetSwipeDrag();
    return;
  }
  const rotation = Math.max(-12, Math.min(12, offsetX / 18));
  swipeCard.style.transform = `translate(${offsetX}px, ${offsetY * 0.12}px) rotate(${rotation}deg)`;
  swipeCard.style.opacity = String(Math.max(.68, 1 - Math.abs(offsetX) / 500));
});
const finishSwipeDrag = (event, cancelled = false) => {
  if (!swipePointer || event.pointerId !== swipePointer.id) return;
  const offsetX = event.clientX - swipePointer.startX;
  swipePointer = null;
  resetSwipeDrag();
  if (cancelled) return;
  const swipeThreshold = Math.max(100, Math.min(150, swipeCard.clientWidth * .22));
  if (Math.abs(offsetX) >= swipeThreshold) swipe(offsetX > 0 ? 'like' : 'pass');
};
swipeCard?.addEventListener('pointerup', (event) => finishSwipeDrag(event));
swipeCard?.addEventListener('pointercancel', (event) => finishSwipeDrag(event, true));
document.querySelectorAll('[data-close-overlay]').forEach((button) => button.addEventListener('click', (event) => {
  const pitchBackdrop = event.currentTarget.classList.contains('app-overlay-backdrop') && event.currentTarget.closest('#pitch-modal');
  if (pitchBackdrop && performance.now() - pitchOpenedAt < PITCH_OPENING_MS) return;
  closeOverlays();
}));
const discoveryFilterDrawer = document.querySelector('#discovery-filter-drawer');
const discoveryFilterButton = document.querySelector('#open-discovery-filters');
const closeDiscoveryFilters = () => {
  discoveryFilterDrawer?.setAttribute('hidden', '');
  discoveryFilterButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('discovery-filters-open');
};
const openDiscoveryFilters = () => {
  renderFilterOptions();
  discoveryFilterDrawer?.removeAttribute('hidden');
  discoveryFilterButton?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('discovery-filters-open');
  window.setTimeout(() => document.querySelector('#drawer-filter-search')?.focus(), 80);
};
discoveryFilterButton?.addEventListener('click', openDiscoveryFilters);
discoveryFilterDrawer?.querySelectorAll('[data-close-discovery-filters]').forEach((button) => button.addEventListener('click', closeDiscoveryFilters));
discoveryFilterDrawer?.addEventListener('click', (event) => {
  const removeButton = event.target.closest('[data-remove-filter]');
  if (removeButton) {
    const targetSet = removeButton.dataset.removeFilter === 'skills' ? exploreFilters.skills : exploreFilters.lookingFor;
    targetSet.delete(normalizedValue(removeButton.dataset.filterValue));
    renderExplore();
    return;
  }
  const suggestion = event.target.closest('[data-filter-kind]');
  if (!suggestion) return;
  const kind = suggestion.dataset.filterKind;
  const value = suggestion.dataset.filterValue || '';
  if (kind === 'name') {
    exploreFilters.query = value;
    const input = document.querySelector('#drawer-filter-search');
    if (input) input.value = value;
  } else {
    const targetSet = kind === 'skills' ? exploreFilters.skills : exploreFilters.lookingFor;
    targetSet.add(normalizedValue(value));
    filterDrafts[kind === 'skills' ? 'skills' : 'lookingFor'] = '';
    const input = document.querySelector(kind === 'skills' ? '#filter-skills-input' : '#filter-looking-for-input');
    if (input) input.value = '';
  }
  renderExplore();
});
const filterInputBindings = [
  ['#drawer-filter-search', (value) => { exploreFilters.query = value; scheduleMemberSearch(value); }],
  ['#filter-skills-input', (value) => { filterDrafts.skills = value; }],
  ['#filter-looking-for-input', (value) => { filterDrafts.lookingFor = value; }],
];
filterInputBindings.forEach(([selector, update]) => {
  const input = document.querySelector(selector);
  input?.addEventListener('input', (event) => { update(event.target.value); renderExplore(); });
  input?.addEventListener('focus', () => renderExplore());
});
const clearDiscoveryFilters = () => {
  exploreFilters.query = '';
  exploreFilters.skills.clear();
  exploreFilters.lookingFor.clear();
  filterDrafts.skills = '';
  filterDrafts.lookingFor = '';
  renderExplore();
};
document.querySelector('#clear-discovery-filters')?.addEventListener('click', clearDiscoveryFilters);
// The empty deck's one next action (UX_SPEC §B): its kind comes from deckEmptyState().
document.querySelector('#deck-empty-action')?.addEventListener('click', async (event) => {
  const kind = event.currentTarget.dataset.deckAction;
  if (kind === 'clear-filters') clearDiscoveryFilters();
  else if (kind === 'search') openDiscoveryFilters();
  else if (kind === 'finish-profile') window.location.assign('/auth.html?complete-profile=1');
  else if (kind === 'retry') { deck.end = null; refillDeck(); }
  else if (kind === 'invite') {
    const link = window.location.origin;
    try { await navigator.clipboard.writeText(link); showToast('Link copied'); } catch { showToast(`Copy this link: ${link}`); }
  }
});
document.querySelector('#apply-discovery-filters')?.addEventListener('click', () => {
  closeDiscoveryFilters();
  const count = getExplorePeople().length;
  showToast(count ? (count + ' ' + (count === 1 ? 'person' : 'people') + ' found.') : 'No people match these filters.');
});
document.querySelectorAll('.filter-button').forEach((button) => button.addEventListener('click', () => { activeFilter = button.dataset.filter; document.querySelectorAll('.filter-button').forEach((item) => item.classList.toggle('is-active', item === button)); renderExplore(); }));
document.querySelector('#explore-search-input')?.addEventListener('input', renderExplore);
document.querySelector('#chat-back')?.addEventListener('click', closeSelectedChat);
const pendingChatFiles = [];
let pendingChatGif = null;
let chatCameraStream = null;
const chatFileLimits = { image: 12 * 1024 * 1024, gif: 8 * 1024 * 1024, video: 50 * 1024 * 1024, document: 12 * 1024 * 1024 };
const formatFileSize = (size) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
const getChatFileKind = attachmentKind;
const queueChatFiles = (files) => {
  [...(files || [])].forEach((file) => {
    const kind = getChatFileKind(file);
    const maxSize = chatFileLimits[kind];
    if (file.size > maxSize) { showToast(`${file.name} is too large. Max ${formatFileSize(maxSize)}.`); return; }
    const duplicate = pendingChatFiles.some((entry) => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified);
    if (!duplicate) pendingChatFiles.push({ file, kind, previewUrl: URL.createObjectURL(file) });
  });
  renderPendingChatFiles();
};
const queueChatGif = (gif) => {
  if (!gif?.url) return;
  pendingChatGif = gif;
  renderPendingChatFiles();
};
const setChatAttachmentError = (message) => {
  const node = document.querySelector('#chat-attachment-error');
  if (!node) return;
  node.textContent = message || '';
  node.hidden = !message;
};
const renderPendingChatFiles = () => {
  const preview = document.querySelector('#chat-attachment-preview');
  if (!preview) return;
  preview.hidden = !pendingChatFiles.length;
  preview.innerHTML = pendingChatFiles.map((entry, index) => {
    const media = entry.kind === 'image' || entry.kind === 'gif'
      ? `<img src="${escapeHtml(entry.previewUrl)}" alt="" />`
      : entry.kind === 'video'
        ? `<video src="${escapeHtml(entry.previewUrl)}" muted preload="metadata"></video>`
        : '<span class="chat-file-preview-icon">↗</span>';
    return `<div class="chat-attachment-chip"><span class="chat-attachment-thumb">${media}</span><span class="chat-attachment-chip-copy"><strong>${escapeHtml(entry.file.name)}</strong><small>${entry.kind.toUpperCase()} · ${formatFileSize(entry.file.size)}</small></span><button type="button" data-remove-chat-file="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button></div>`;
  }).join('');
  if (pendingChatGif) {
    preview.innerHTML += `<div class="chat-attachment-chip"><span class="chat-attachment-thumb"><img src="${escapeHtml(pendingChatGif.url)}" alt="${escapeHtml(pendingChatGif.label)} GIF" /></span><span class="chat-attachment-chip-copy"><strong>${escapeHtml(pendingChatGif.label)} GIF</strong><small>GIF · READY TO SEND</small></span><button type="button" data-remove-chat-gif aria-label="Remove GIF">×</button></div>`;
  }
  preview.hidden = !pendingChatFiles.length && !pendingChatGif;
  const videoWarning = document.querySelector('#chat-video-warning');
  if (videoWarning) videoWarning.hidden = !pendingChatFiles.some((entry) => entry.kind === 'video');
  setChatAttachmentError('');
  preview.querySelectorAll('[data-remove-chat-file]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.removeChatFile);
    const [removed] = pendingChatFiles.splice(index, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    renderPendingChatFiles();
  }));
  preview.querySelector('[data-remove-chat-gif]')?.addEventListener('click', () => {
    pendingChatGif = null;
    renderPendingChatFiles();
  });
};
const resetPendingChatFiles = () => {
  pendingChatFiles.splice(0).forEach((entry) => { if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl); });
  pendingChatGif = null;
  document.querySelectorAll('#chat-form input[type="file"]').forEach((input) => { input.value = ''; });
  renderPendingChatFiles();
};
const stopChatCamera = () => {
  if (chatCameraStream) chatCameraStream.getTracks().forEach((track) => track.stop());
  chatCameraStream = null;
  const video = document.querySelector('#chat-camera-video');
  if (video) video.srcObject = null;
  document.querySelector('#chat-camera-modal')?.setAttribute('hidden', '');
};
const ensureChatCamera = () => {
  if (document.querySelector('#chat-camera-modal')) return;
  document.body.insertAdjacentHTML('beforeend', '<div class="chat-camera-modal" id="chat-camera-modal" hidden><div class="chat-camera-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-camera-title"><div class="chat-camera-dialog-head"><strong id="chat-camera-title">Take a photo</strong><button type="button" id="chat-camera-close" aria-label="Close camera">Ã—</button></div><video id="chat-camera-video" class="chat-camera-video" autoplay muted playsinline></video><div class="chat-camera-actions"><button type="button" class="chat-camera-cancel" id="chat-camera-cancel">CANCEL</button><button type="button" class="chat-camera-capture" id="chat-camera-capture">CAPTURE</button></div></div></div>');
  document.querySelector('#chat-camera-close')?.addEventListener('click', stopChatCamera);
  document.querySelector('#chat-camera-cancel')?.addEventListener('click', stopChatCamera);
  document.querySelector('#chat-camera-modal')?.addEventListener('click', (event) => { if (event.target.id === 'chat-camera-modal') stopChatCamera(); });
  document.querySelector('#chat-camera-capture')?.addEventListener('click', () => {
    const video = document.querySelector('#chat-camera-video');
    if (!video?.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) queueChatFiles([new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
      stopChatCamera();
    }, 'image/jpeg', .9);
  });
};
const openChatCamera = async () => {
  ensureChatCamera();
  const modal = document.querySelector('#chat-camera-modal');
  const video = document.querySelector('#chat-camera-video');
  if (!modal || !video) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    document.querySelector('#chat-camera-input')?.click();
    return;
  }
  try {
    stopChatCamera();
    chatCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    video.srcObject = chatCameraStream;
    modal.removeAttribute('hidden');
    await video.play();
  } catch (error) {
    stopChatCamera();
    showToast('Camera permission was not granted. You can choose a photo instead.');
    document.querySelector('#chat-camera-input')?.click();
  }
};
const ensureChatComposer = () => {
  const form = document.querySelector('#chat-form');
  if (!form || form.dataset.attachmentsReady) return;
  form.dataset.attachmentsReady = 'true';
  const preview = document.createElement('div');
  preview.id = 'chat-attachment-preview';
  preview.className = 'chat-attachment-preview';
  preview.hidden = true;
  form.parentElement.insertBefore(preview, form);
  const note = document.createElement('div');
  note.className = 'chat-attachment-note';
  note.innerHTML = '<p class="chat-video-warning" id="chat-video-warning" hidden>Videos can include the place they were filmed. Send only if you\'re comfortable sharing that.</p><p class="chat-attachment-error" id="chat-attachment-error" role="alert" hidden></p>';
  form.parentElement.insertBefore(note, form);
  form.querySelector('#chat-input')?.setAttribute('aria-describedby', 'chat-video-warning chat-attachment-error');
  form.insertAdjacentHTML('afterbegin', '<div class="chat-compose-tools"><button class="chat-compose-icon" id="chat-emoji-toggle" type="button" aria-label="Open emoji picker" aria-expanded="false">☺</button><button class="chat-compose-icon" id="chat-attach-toggle" type="button" aria-label="Open attachment options" aria-expanded="false">+</button><div class="chat-emoji-picker" id="chat-emoji-picker" hidden><button type="button" data-chat-emoji="😀">😀</button><button type="button" data-chat-emoji="😂">😂</button><button type="button" data-chat-emoji="😍">😍</button><button type="button" data-chat-emoji="🔥">🔥</button><button type="button" data-chat-emoji="👏">👏</button><button type="button" data-chat-emoji="✨">✨</button><button type="button" data-chat-emoji="🤝">🤝</button><button type="button" data-chat-emoji="❤️">❤️</button></div><div class="chat-attachment-menu" id="chat-attachment-menu" hidden><button type="button" data-chat-picker="photo">PHOTO / VIDEO</button><button type="button" data-chat-picker="document">DOCUMENT</button><button type="button" data-chat-picker="gif">GIF</button><button type="button" data-chat-picker="camera">CAMERA</button></div></div>');
  form.querySelector('.chat-compose-tools')?.insertAdjacentHTML('beforeend', '<div class="chat-gif-picker" id="chat-gif-picker" hidden></div>');
  form.insertAdjacentHTML('beforeend', '<input id="chat-photo-input" type="file" accept="image/*,video/*" multiple hidden /><input id="chat-document-input" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" multiple hidden /><input id="chat-camera-input" type="file" accept="image/*" capture="environment" hidden />');
  const attachmentMenuMarkup = document.querySelector('#chat-attachment-menu');
  if (attachmentMenuMarkup) attachmentMenuMarkup.innerHTML = '<button type="button" data-chat-picker="document"><span class="chat-attachment-option-icon chat-attachment-option-document">▤</span><span>Document</span></button><button type="button" data-chat-picker="photo"><span class="chat-attachment-option-icon chat-attachment-option-photo">▣</span><span>Photos &amp; videos</span></button><button type="button" data-chat-picker="gif"><span class="chat-attachment-option-icon chat-attachment-option-gif">GIF</span><span>GIF</span></button><button type="button" data-chat-picker="camera"><span class="chat-attachment-option-icon chat-attachment-option-camera">●</span><span>Camera</span></button>';
  const emojiPickerMarkup = document.querySelector('#chat-emoji-picker');
  if (emojiPickerMarkup) emojiPickerMarkup.innerHTML = '<div class="chat-emoji-tabs"><button type="button" class="is-active" data-emoji-category="smileys">☺</button><button type="button" data-emoji-category="people">♙</button><button type="button" data-emoji-category="animals">♣</button><button type="button" data-emoji-category="food">◆</button><button type="button" data-emoji-category="activities">★</button><button type="button" data-emoji-category="symbols">♥</button></div><div class="chat-emoji-grid" id="chat-emoji-grid"></div>';
  form.querySelector('button[type="submit"]')?.classList.add('chat-send-button');
  const input = document.querySelector('#chat-input');
  const emojiToggle = document.querySelector('#chat-emoji-toggle');
  const attachToggle = document.querySelector('#chat-attach-toggle');
  const emojiPicker = document.querySelector('#chat-emoji-picker');
  const attachmentMenu = document.querySelector('#chat-attachment-menu');
  const gifPicker = document.querySelector('#chat-gif-picker');
  if (gifPicker) gifPicker.innerHTML = `<div class="chat-gif-picker-head"><strong>GIFs</strong><span>Choose a reaction</span></div><div class="chat-gif-grid">${chatGifCatalog.map((gif, index) => `<button type="button" data-chat-gif="${index}" aria-label="${escapeHtml(gif.label)} GIF"><img src="${escapeHtml(gif.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" /><span>${escapeHtml(gif.label)}</span></button>`).join('')}</div>`;
  const renderEmojiCategory = (category = 'smileys') => {
    const grid = emojiPicker?.querySelector('#chat-emoji-grid');
    if (!grid) return;
    const emojis = chatEmojiCategories[category] || chatEmojiCategories.smileys;
    grid.innerHTML = emojis.map((emoji) => `<button type="button" data-chat-emoji="${emoji}" aria-label="Emoji">${emoji}</button>`).join('');
    emojiPicker.querySelectorAll('[data-emoji-category]').forEach((button) => button.classList.toggle('is-active', button.dataset.emojiCategory === category));
    grid.querySelectorAll('[data-chat-emoji]').forEach((button) => button.addEventListener('click', () => {
      if (!input) return;
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? start;
      input.value = `${input.value.slice(0, start)}${button.dataset.chatEmoji}${input.value.slice(end)}`;
      input.focus();
      input.setSelectionRange(start + button.dataset.chatEmoji.length, start + button.dataset.chatEmoji.length);
    }));
  };
  emojiPicker?.querySelectorAll('[data-emoji-category]').forEach((button) => button.addEventListener('click', () => renderEmojiCategory(button.dataset.emojiCategory)));
  renderEmojiCategory();
  gifPicker?.querySelectorAll('[data-chat-gif]').forEach((button) => button.addEventListener('click', () => {
    queueChatGif(chatGifCatalog[Number(button.dataset.chatGif)]);
    closeMenus();
  }));
  gifPicker?.querySelectorAll('.chat-gif-grid img').forEach((image) => image.addEventListener('error', () => image.closest('[data-chat-gif]')?.remove(), { once: true }));
  const closeMenus = () => {
    emojiPicker?.setAttribute('hidden', '');
    attachmentMenu?.setAttribute('hidden', '');
    gifPicker?.setAttribute('hidden', '');
    emojiToggle?.setAttribute('aria-expanded', 'false');
    attachToggle?.setAttribute('aria-expanded', 'false');
  };
  emojiToggle?.addEventListener('click', () => {
    const open = emojiPicker?.hasAttribute('hidden');
    closeMenus();
    if (open) { emojiPicker?.removeAttribute('hidden'); emojiToggle.setAttribute('aria-expanded', 'true'); }
  });
  attachToggle?.addEventListener('click', () => {
    const open = attachmentMenu?.hasAttribute('hidden');
    closeMenus();
    if (open) { attachmentMenu?.removeAttribute('hidden'); attachToggle.setAttribute('aria-expanded', 'true'); }
  });
  const pickerInputs = { photo: '#chat-photo-input', document: '#chat-document-input', camera: '#chat-camera-input' };
  attachmentMenu?.querySelectorAll('[data-chat-picker]').forEach((button) => button.addEventListener('click', () => {
    closeMenus();
    if (button.dataset.chatPicker === 'gif') { gifPicker?.removeAttribute('hidden'); return; }
    if (button.dataset.chatPicker === 'camera') { openChatCamera(); return; }
    const picker = document.querySelector(pickerInputs[button.dataset.chatPicker]);
    if (picker) { picker.value = ''; picker.click(); }
  }));
  Object.values(pickerInputs).forEach((selector) => document.querySelector(selector)?.addEventListener('change', (event) => queueChatFiles(event.target.files)));
  document.addEventListener('click', (event) => { if (!form.contains(event.target)) closeMenus(); });
};
ensureChatComposer();
const insertChatMessage = async (body, attachment = null) => {
  if (selectedChat && readBlockedUserIds().has(String(selectedChat.id))) {
    throw new Error('This user is blocked. Unblock the user before sending a message.');
  }
  const payload = { sender_id: memberProfile.id, recipient_id: selectedChat.id, body: body || '' };
  if (attachment) Object.assign(payload, {
    message_type: attachment.kind,
    attachment_url: attachment.path ? null : attachment.url,
    attachment_path: attachment.path || null,
    attachment_name: attachment.name,
    attachment_mime: attachment.mime,
    attachment_size: attachment.size,
  });
  const { error } = await supabase.from('brivia_messages').insert(payload);
  if (error) {
    if (attachment) {
      if (attachment.path) await removeMessageAttachment(attachment.path);
      if (/column|schema cache|message_type|attachment_/i.test(error.message || '')) throw new Error('Run the SQL files in supabase/migrations/ (in order) to enable chat media.');
    }
    throw error;
  }
};
document.querySelector('#chat-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#chat-input');
  const sendButton = document.querySelector('.chat-send-button') || document.querySelector('#chat-form button[type="submit"]');
  const body = input?.value.trim() || '';
  if (!selectedChat || (!body && !pendingChatFiles.length && !pendingChatGif) || !supabase || !memberProfile.id) return;
  if (sendButton) sendButton.disabled = true;
  try {
    // Re-encode every image BEFORE anything is sent: one failure aborts the whole send (no text, no files) and the
    // composer keeps its state so the member can remove the bad file. Compressed files are not re-encoded on upload.
    const files = await compressAttachmentFiles(pendingChatFiles.map((entry) => entry.file));
    if (!files.length && !pendingChatGif) await insertChatMessage(body);
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const attachment = await uploadMessageAttachment(memberProfile.id, file);
      await insertChatMessage(index === 0 ? body : '', attachment);
    }
    if (pendingChatGif) await insertChatMessage(files.length ? '' : body, { kind: 'gif', url: pendingChatGif.url, path: '', name: `${pendingChatGif.label} GIF`, mime: 'image/gif', size: 0 });
    input.value = '';
    resetPendingChatFiles();
    await loadChatMessages(selectedChat);
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      // Refused before anything was uploaded or sent: shown inline in the composer, not as a toast.
      setChatAttachmentError(error.message);
      return;
    }
    showToast(/row-level security|policy|brivia_is_blocked_between|blocked/i.test(error?.message || '')
      ? 'This conversation is blocked. Unblock the user before sending a message.'
      : (error.message || 'Message could not be saved.'));
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
});
document.querySelector('#pitch-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#pitch-message');
  const body = input?.value.trim();
  if (!body || !supabase || !memberProfile.id) return;
  const submit = event.currentTarget.querySelector('.pitch-submit');
  const pending = claimPendingPitch();
  if (!pending) return; // already resolved (double submit) or no like in progress
  if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  try {
    // The pitch travels as the note of the like's single request; no message is sent until the pair is matched.
    const result = await sendConnectionSignal(pending.person, body);
    if (result.quotaText) {
      // Over a cap: nothing was sent or charged. The sheet closes, and the card comes back to the front.
      document.querySelector('#pitch-modal')?.setAttribute('hidden', '');
      if (!pendingPitch) pitchPerson = null;
      requeuePerson(pending.person);
      showToast(result.quotaText);
      return;
    }
    if (result.error) {
      // Nothing was stored. The sheet closes and the card goes back to the front with the note kept, so Pitch
      // retries with it (F1). A hidden like is never sent later on its own (Task 3b).
      unsentNotes.set(String(pending.person.id), body);
      document.querySelector('#pitch-modal')?.setAttribute('hidden', '');
      if (!pendingPitch) pitchPerson = null;
      requeuePerson(pending.person);
      showToast(signalErrorToast);
      return;
    }
    pitchPerson = null;
    closeOverlays();
    showToast(signalResultToast(pending.person, result));
  } finally {
    if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  }
});
document.querySelector('#logout-button')?.addEventListener('click', logoutMember);
document.querySelector('#app-logout-button')?.addEventListener('click', logoutMember);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeOverlays(); closeDiscoveryFilters(); }
  // A like now sends a connection request, so arrow keys must not fire it while typing or with a dialog open.
  const typing = event.target?.closest?.('input, textarea, select, [contenteditable="true"]');
  const dialogOpen = overlayIds.some((id) => !document.querySelector(`#${id}`)?.hidden) || document.querySelector('#public-profile-modal') || document.querySelector('dialog[open]') || cardOverflowOpen();
  if (typing || dialogOpen || !['home', 'explore'].includes(document.body.dataset.appView)) return;
  if (event.key === 'ArrowRight') swipe('like');
  if (event.key === 'ArrowLeft') swipe('pass');
});

const loadSupabaseCommunity = async () => {
  if (!supabase) {
    window.location.replace('/auth.html');
    return;
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData?.session;
  if (!session) {
    window.location.href = '/auth.html';
    return;
  }
  const { data: ownRow, error: ownError } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (ownError) {
    window.location.replace('/auth.html?profile-check=failed');
    return;
  }
  if (!ownRow) {
    window.location.replace('/auth.html?complete-profile=1');
    return;
  }
  // Onboarding gate (UX_SPEC flow A): a member without a home area or a complete Passion Budget finishes it first.
  // Only an explicit completed = false redirects; if the status cannot be read, the server still hides an incomplete
  // member from everyone (D-030).
  const { data: onboarding, error: onboardingError } = await onboardingStatus();
  if (!onboardingError && onboarding && onboarding.completed === false) {
    window.location.replace('/auth.html?complete-profile=1');
    return;
  }
  memberPlaceLabel = typeof onboarding?.place_label === 'string' ? onboarding.place_label : '';
  const cachedProfile = JSON.parse(window.localStorage.getItem('brivia-member-profile') || 'null') || {};
  const isSameUser = cachedProfile.id === session.user.id;
  const rowProfile = rowToProfile(ownRow);
  const metadata = session.user.user_metadata || {};
  const metadataProfile = {
    coverUrl: metadata.coverUrl || metadata.cover_url || metadata.cover_image_url || metadata.cover_image || '',
  };
  const cachedCoverUrl = cachedProfile.coverUrl || cachedProfile.cover_url || cachedProfile.cover_image_url || '';
  const resolvedCoverUrl = rowProfile.coverUrl || metadataProfile.coverUrl || cachedCoverUrl;
  memberProfile = isSameUser ? { ...rowProfile, ...metadataProfile, ...cachedProfile, id: session.user.id } : { ...rowProfile, ...metadataProfile, id: session.user.id };
  if (resolvedCoverUrl) memberProfile.coverUrl = resolvedCoverUrl;
  // Skills are server-owned (D-035): always the row's copy, never a stale cached or metadata value.
  memberProfile.skills = rowProfile.skills;
  memberProfile = withoutCredentials(memberProfile);  // never cache a password (Ruling I11)
  memberProfile.email = session.user.email || memberProfile.email || '';
  if (!memberProfile.name || memberProfile.name === 'New Member') memberProfile.name = session.user.user_metadata?.name || 'New Member';
  window.localStorage.setItem('brivia-member-profile', JSON.stringify(memberProfile));
  // Show the authenticated shell as soon as the profile is verified. Optional
  // inbox/notification queries must never leave the whole app invisible.
  document.body.classList.remove('app-auth-pending');
  await syncBlockedUserIds();
  const { data: matchRows, error: matchError } = await supabase.from('matches').select('user1_id,user2_id').or(`user1_id.eq.${session.user.id},user2_id.eq.${session.user.id}`);
  if (!matchError) {
    remoteConnectionIds = (matchRows || []).map((match) => match.user1_id === session.user.id ? match.user2_id : match.user1_id);
    remoteMatchIds = [...remoteConnectionIds];
  }
  // Sort in the browser so an older Supabase schema cache cannot block inbox loading.
  let { data: inboxRows, error: inboxError } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body,created_at,message_type,attachment_url,attachment_path,attachment_name,attachment_mime,attachment_size').or(`sender_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`);
  if (inboxError) {
    ({ data: inboxRows, error: inboxError } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body').or(`sender_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`));
  }
  if (!inboxError) {
    try { await syncIncomingNotifications(inboxRows || []); } catch (error) { console.warn('Notifications could not load:', error.message); }
    const inboxIds = new Set(remoteMatchIds);
    (inboxRows || []).sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()).forEach((message) => {
      const otherId = message.sender_id === session.user.id ? message.recipient_id : message.sender_id;
      inboxIds.add(otherId);
      (chatMessages[otherId] ||= []).push({
        id: message.id,
        createdAt: message.created_at,
        from: message.sender_id === session.user.id ? 'me' : 'them',
        text: message.body ?? message.text ?? message.message ?? message.content ?? '',
        attachment: attachmentFromRow(message),
      });
    });
    remoteMatchIds = [...inboxIds];
  } else console.warn('Inbox could not load:', inboxError.message);
  // The deck: the first deck_candidates cards (location-first, server order); more load when the queue runs out.
  const { error } = await loadDeck();
  if (error) { console.warn('The deck could not load:', error.message); deck.end = 'error'; }
  // Connections and conversations may be with members beyond the first page: load their cards by id.
  const missingChatIds = remoteMatchIds.filter((id) => !findPersonById(id));
  if (missingChatIds.length) {
    const { data: chatRows, error: chatError } = await fetchCandidates(missingChatIds);
    if (chatError) console.warn('Connections could not load:', chatError.message);
    mergePeople(chatRows);
  }
  currentPerson = deckPeople()[0] || null;
  deck.ready = true;
  renderHome();
  renderExplore();
  renderChats();
  renderProfile();
  try { ensureNotificationControls(); renderNotifications(); } catch (error) { console.warn('Notification controls could not load:', error.message); }
  refreshSignalQuota();
  subscribeToMessages();
  startMessageSync();
  if (!appBackGuardActive) {
    appBackGuardActive = true;
    window.history.pushState(
      { ...(window.history.state || {}), briviaAppBackGuard: true },
      '',
      window.location.href
    );
  }
  document.body.classList.remove('app-auth-pending');
  if (document.body.dataset.appView === 'posts') loadCommunityPosts();
  // Back from "Sign in with Google again" (R5 re-auth): reopen the delete dialog on the profile view.
  let reauthReturn = false;
  try { const stamp = Number(window.sessionStorage.getItem(REAUTH_DELETE_KEY)); window.sessionStorage.removeItem(REAUTH_DELETE_KEY); reauthReturn = stamp > 0 && Date.now() - stamp < 10 * 60 * 1000; } catch { /* storage unavailable */ }
  if (reauthReturn) {
    document.querySelector('[data-nav="profile"]')?.click();
    openPrivacy(document.querySelector('#profile-settings-button'), { autoDelete: true });
  }
};

renderHome();
renderExplore();
renderProfile();
routeFromUrl();
loadSupabaseCommunity().catch((error) => {
  console.warn('Supabase data could not load:', error.message);
  window.location.replace('/auth.html?profile-check=failed');
});

/* Keep the internal explore route/data names stable while presenting the
   member-facing navigation as CONNECT. */
const renameExploreToConnect = () => {
  document.querySelectorAll('[data-nav="explore"], .app-nav-button[href="/explore.html"]').forEach((node) => {
    const label = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (label) label.textContent = 'CONNECT';
  });
  document.querySelectorAll('.inbox-empty-action[data-nav="explore"]').forEach((node) => {
    const label = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    if (label) label.textContent = 'CONNECT PEOPLE ';
  });
  // Write only on change: an unconditional write is itself a mutation and re-triggers this observer forever.
  document.querySelectorAll('.inbox-empty span').forEach((node) => {
    const renamed = node.textContent.replace(/\bExplore\b/g, 'Connect');
    if (renamed !== node.textContent) node.textContent = renamed;
  });
};
renameExploreToConnect();
new MutationObserver(renameExploreToConnect).observe(document.body, { childList: true, subtree: true });
