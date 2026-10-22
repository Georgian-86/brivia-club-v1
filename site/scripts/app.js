import '../styles/tokens.css';
import '../styles/fonts.css';
import '../styles/fonts-app.css';
import '../styles/app.css';
import '../styles/inbox.css';
import '../styles/inbox-actions.css';
import '../styles/chat-wallpaper.css';
import '../styles/profile-theme.css';
import '../styles/profile-photo.css';
import '../styles/explore-theme.css';
import '../styles/deep-wine-theme.css';
import '../styles/inbox-linkedin.css';
import '../styles/explore-polish.css';
import '../styles/member-polish.css';
import '../styles/card-reference.css';
import '../styles/chat-reference.css';
import '../styles/chat-sidebar-fix.css';
import '../styles/app-navigation.css';
import '../styles/discovery-filters.css';
import '../styles/mobile-app.css';
import '../styles/skeleton.css';
import { supabase, rowToProfile, saveProfile, isPresetCoverUrl, onboardingStatus, sendSignal, fetchSignalQuota, isRateLimited, isStorageImageUrl, withoutCredentials, uploadMessageAttachment, removeMessageAttachment, uploadCommunityPostImage, removeCommunityPostImage, ImageProcessingError, compressAttachmentFiles, attachmentKind, reportMember, setSensitiveConsent, fetchSensitiveConsentAt, fetchMyInterests, fetchInterestNodes, uploadResume, removeResume, resumeSignedUrl, resumeInfo, clearResumePath } from './supabase.js';
import { areaShareBody, parseAreaBody, resumeShareAttachment, resumeMessageFields, RESUME_SHARE_BODY, NO_RESUME_HINT, RESUME_GONE_COPY, RESUME_SHARE_NOTE, AREA_SHARE_NOTE } from './quick-share.js';
import { validateResume, readResumeHead, resumeMetaLine, formatResumeSize, resumeUploadErrorMessage, isMissingResumeStore, RESUME_FILE_NAME, REMOVE_RESUME_CONFIRM, REMOVE_FAILED_COPY, REPLACED_NOT_SAVED_COPY, OPEN_FAILED_COPY, COMING_SOON_COPY } from './resume-file.js';
import { POPULAR_INTERESTS, INTEREST_CATALOG, LOOKING_FOR_CATALOG, taxonomyLabels, catalogValues, matchOptions } from './discovery-catalog.js';
import { deleteAccount, clearBriviaKeys, DELETE_BUCKETS, reauthMarker, reauthMarkerMatches } from './account-deletion.js';
import { openPrivacyAccount } from './privacy-account.js';
import { isUnderReview, UNDER_REVIEW_COPY } from './onboarding-guard.js';
import { openReportDialog, bindCardOverflow, cardOverflowOpen, reportSuccessCopy } from './report-dialog.js';
import { defaultCoverUrl, normalizeCoverUrl } from './cover-assets.js';
import { postImageSrc } from './post-image.js';
import { postCardMarkup, shareData, isSafePostImageSrc } from './post-card.js';
import { toastSide } from './toast-place.js';
import { loadReactions, setReaction, createReactionGuard } from './post-reactions.js';
import { profileChecklist } from './profile-checklist.js';
import { quotaLabel, quotaErrorText, quotaBlocked, quotaNotice } from './signal-quota.js';
import { pitchLine, deckChips, deckEmptyState, deckFields, bandNote, deckCoverSrc } from './deck-view.js';
import { createDeckSwipe, SWIPE } from './deck-swipe.js';
import { whyPanelMarkup, whyRow } from './why-panel.js';
import { chatEmojiCategories } from './chat-emoji-data.js';
import { chatGifCatalog } from './chat-gif-data.js';
import { typingTopic, createTypingSender, createTypingReceiver, TYPING_EVENT } from './chat-typing.js';
import '../styles/chat-attachments.css';
import '../styles/mobile-final-fixes.css';
import '../styles/community-feed.css';
import '../styles/chat-empty-state.css';
import '../styles/deck.css';
import '../styles/report-dialog.css';
import '../styles/privacy-account.css';
// One member navigation (Phase C, Task 2): the header and tab bar styles load last so they win over the older rules.
import '../styles/app-shell.css';
// The calm profile column (Phase C, Task 5): tokens only, loads after app-shell.css.
import '../styles/profile-view.css';
// The founder's design references (D-062): the Canva deck card and the "Brivia Society" chat. Loads last.
import '../styles/reference-design.css';
// Polish wave scaffolding: each file is owned by one later task.
import '../styles/chat-fit.css';
import '../styles/menus-fit.css';
import '../styles/explore-cards.css';
import '../styles/chat-extras.css';
import { navMarkup, markCurrentNav, setChatBadges } from './app-nav.js';
import { skeletonMarkup, setBusy } from './app-skeletons.js';

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
let typingSession = null; // the open thread's typing channel (D5): { otherId, channel, sender, receiver, joined }
let chatShouldOpenAtLatest = false;
let suppressChatAutoOpen = false;
let pitchPerson = null;
// Ruling P13: a like opens the pitch sheet and defers its single request until the sheet resolves.
let pendingPitch = null; // { person, resolved }
let deckSwipe = null; // deck-swipe.js controller, bound once the DOM handlers are wired
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
  } catch { return false; }
  // D5: a block drops typing at once; an unblock of the open thread joins it again. Typing never fails a block.
  try { syncTypingForSelectedChat(); } catch { /* typing is best-effort */ }
  return true;
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
// Header and board avatars use the same initials as the profile avatar ("Qa Tester" -> "QT", never "QA").
const headerInitials = (name = 'New Member') => initials(String(name || '').trim() || 'New Member') || 'NM';
// The control (or its action bar) the member just used: on phones the toast keeps clear of it (toast-place.js).
let lastUsedControl = null;
document.addEventListener('pointerdown', (event) => { lastUsedControl = event.target instanceof Element ? event.target.closest('button, a, [role="button"]') : null; }, true);
document.addEventListener('keydown', () => { lastUsedControl = null; }, true);
const showToast = (message) => {
  const toast = document.querySelector('#app-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('toast-top');
  if (window.matchMedia('(max-width: 780px)').matches) {
    const used = lastUsedControl?.isConnected ? lastUsedControl : document.activeElement;
    const anchor = used instanceof Element && used !== document.body ? (used.closest('.post-card-actions') || used) : null;
    if (toastSide(toast.getBoundingClientRect(), anchor?.getBoundingClientRect()) === 'top') toast.classList.add('toast-top');
  }
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
// Where popovers exist (every current browser) the notification panel opens in the top layer (popover="manual"), like the
// profile settings menu: above the chat list and every other view. Without them it is position:fixed above .chat-window.
const POPOVER = typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.showPopover === 'function';
const notificationPanelOpen = () => {
  const panel = document.querySelector('#app-notification-panel');
  return Boolean(panel) && !panel.hasAttribute('hidden');
};
// Fixed position under the bell: its right edge on the bell's right edge, always inside 8 px of the viewport, and no
// taller than the room left under it.
const placeNotificationPanel = () => {
  const panel = document.querySelector('#app-notification-panel');
  const button = document.querySelector('#app-notification-button');
  if (!panel || !button || panel.hasAttribute('hidden')) return;
  const bell = button.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const top = Math.round(bell.bottom + 8);
  panel.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
  const left = Math.max(8, Math.min(bell.right - panel.offsetWidth, width - panel.offsetWidth - 8));
  Object.assign(panel.style, { top: `${top}px`, left: `${Math.round(left)}px`, right: 'auto' });
  // Without popovers the panel stays inside the header, whose backdrop-filter makes it the containing block of a fixed
  // child; when .app-wrap has scrolled the header up (focus returning to the bell does that) the panel landed over the
  // bell. Correct by whatever offset the containing block adds, so it always starts under the bell.
  const placed = panel.getBoundingClientRect();
  const dy = placed.top - top;
  const dx = placed.left - left;
  if (Math.abs(dy) > 0.5 || Math.abs(dx) > 0.5) Object.assign(panel.style, { top: `${Math.round(top - dy)}px`, left: `${Math.round(left - dx)}px` });
};
const openNotificationPanel = () => {
  const panel = document.querySelector('#app-notification-panel');
  const button = document.querySelector('#app-notification-button');
  if (!panel || !button) return;
  // One top layer at a time: the account menu closes when the panel opens (and the panel when the menu opens).
  closeProfileSettingsMenu();
  panel.removeAttribute('hidden');
  document.documentElement.classList.add('notifications-open');
  if (POPOVER && !panel.matches(':popover-open')) panel.showPopover();
  button.setAttribute('aria-expanded', 'true');
  placeNotificationPanel();
};
const closeNotificationPanel = ({ returnFocus = false } = {}) => {
  const panel = document.querySelector('#app-notification-panel');
  const button = document.querySelector('#app-notification-button');
  if (POPOVER && panel?.matches(':popover-open')) panel.hidePopover();
  panel?.setAttribute('hidden', '');
  document.documentElement.classList.remove('notifications-open');
  button?.setAttribute('aria-expanded', 'false');
  if (returnFocus) button?.focus();
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
  // Every empty state offers a next step (Phase C Task 6): here, the notification settings.
  const settingsAction = '<button type="button" class="notification-empty-action" data-notification-settings>Notification settings</button>';
  const messagesHtml = !enabled ? `<div class="notification-empty"><p>Notifications are off in settings.</p>${settingsAction}</div>` : unreadGroups.length ? unreadGroups.map((group) => {
    const person = findPersonById(group.personId);
    const title = person?.name || 'a Brivia member';
    const messageLabel = `${group.count} message${group.count === 1 ? '' : 's'} from ${title}`;
    return `<button type="button" class="notification-item is-unread" data-notification-person="${escapeHtml(group.personId)}">${renderAvatar(person, 'notification-avatar')}<span class="notification-copy"><strong>${escapeHtml(messageLabel)}</strong></span><time>${escapeHtml(formatNotificationTime(group.latest.createdAt))}</time></button>`;
  }).join('') : (requestCount ? '' : `<div class="notification-empty"><p>You are all caught up.</p>${settingsAction}</div>`);
  list.innerHTML = requestsHtml + messagesHtml;
  list.querySelector('[data-notification-settings]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeNotificationPanel();
    openNotificationSettings();
  });
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
  if (POPOVER) panel?.setAttribute('popover', 'manual');
  button?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (notificationPanelOpen()) { closeNotificationPanel({ returnFocus: true }); return; }
    openNotificationPanel();
    renderNotifications();
    placeNotificationPanel();
    loadConnectionRequests();
  });
  document.querySelector('#notification-mark-all')?.addEventListener('click', () => {
    notifications = notifications.map((notification) => ({ ...notification, read: true }));
    saveNotifications();
    renderNotifications();
  });
  // Capture phase: controls that stopPropagation (chat rows, menus, dialogs) must still close the top-layer panel.
  document.addEventListener('click', (event) => {
    if (!notificationPanelOpen() || panel?.contains(event.target) || button?.contains(event.target)) return;
    const active = document.activeElement;
    // Focus goes back to the bell unless the click landed on something else that took it.
    closeNotificationPanel({ returnFocus: !active || active === document.body || panel?.contains(active) });
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && notificationPanelOpen()) { event.preventDefault(); closeNotificationPanel({ returnFocus: true }); }
  });
  // The panel is fixed: follow the bell as the page resizes (a rotated phone) or scrolls.
  window.addEventListener('resize', placeNotificationPanel);
  window.addEventListener('scroll', () => {
    if (!notificationPanelOpen()) return;
    const r = button.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) closeNotificationPanel();
    else placeNotificationPanel();
  }, { passive: true });
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

// One member navigation (Phase C, Task 2): the header and the mobile tab bar are filled from the same model before
// any [data-nav] click handler is bound and before routeFromUrl() marks the current item.
document.querySelectorAll('[data-nav-host]').forEach((host) => { host.innerHTML = navMarkup(host.dataset.navHost, document.body.dataset.appView || 'explore'); });

// The profile ⚙ menu (Phase C Task 4). One menu exists at a time (the current hero's); the document and window
// listeners below are bound once, here, so rebuilding the profile never stacks them.
let profileSettings = null;
const profileSettingsOpen = () => {
  const menu = profileSettings?.menu;
  if (!menu?.isConnected) return false;
  return POPOVER ? menu.matches(':popover-open') : !menu.hidden;
};
// At 600 px and under the menu is a bottom sheet (full width, flush with the bottom edge, set by menus-fit.css from
// data-layout); above that it is a popover anchored to ⚙. menuLayout is the one place the breakpoint lives.
const menuLayout = (viewportWidth) => (viewportWidth <= 600 ? 'sheet' : 'popover');
// Popover: never over ⚙. Below it when the box fits above the tab bar, else above it when it fits under the header,
// else on the roomier side with a max-height (the menu scrolls inside). The script owns every inset: a bottom or right
// that a stylesheet leaves (Safari's UA `[popover]{inset:0}`) would stretch the box from its top to the window's edge,
// so both are set to auto before the natural height is read. Without popover support the menu stays absolute in the
// hero and gets the same top, converted to its offset parent, so it never rises over the header.
const placeProfileSettingsMenu = () => {
  const { settings, menu } = profileSettings;
  menu.dataset.layout = menuLayout(window.innerWidth);
  if (menu.dataset.layout === 'sheet') {
    Object.assign(menu.style, { top: '', left: '', right: '', bottom: '', maxHeight: '' });
    return;
  }
  Object.assign(menu.style, { bottom: 'auto', maxHeight: 'none', ...(POPOVER ? { right: 'auto' } : {}) });
  const r = settings.getBoundingClientRect();
  const height = menu.offsetHeight;
  const headerBottom = document.querySelector('.app-topbar')?.getBoundingClientRect().bottom || 0;
  const tabbar = document.querySelector('.app-tabbar');
  const floor = (tabbar && tabbar.getClientRects().length ? tabbar.getBoundingClientRect().top : window.innerHeight) - 8;
  const ceiling = Math.max(0, headerBottom) + 8;
  const below = floor - (r.bottom + 10);
  const above = r.top - 10 - ceiling;
  let top;
  let room = height;
  if (height <= below) top = r.bottom + 10;
  else if (height <= above) top = r.top - 10 - height;
  else if (below >= above) { top = r.bottom + 10; room = below; }
  else { room = above; top = r.top - 10 - room; }
  if (top < ceiling) { room -= ceiling - top; top = ceiling; }
  menu.style.setProperty('--account-menu-header', `${Math.round(Math.max(0, headerBottom))}px`);
  menu.style.maxHeight = room < height ? `${Math.max(0, Math.floor(room))}px` : '';
  if (!POPOVER) {
    const parent = menu.offsetParent;
    const offset = parent ? parent.getBoundingClientRect().top + parent.clientTop : 0;
    menu.style.top = `${Math.round(top - offset)}px`;
    return;
  }
  const width = document.documentElement.clientWidth;
  const left = Math.max(8, Math.min(r.right - menu.offsetWidth, width - menu.offsetWidth - 8));
  Object.assign(menu.style, { top: `${Math.round(top)}px`, left: `${Math.round(left)}px` });
};
// The sheet's scrim: a real element between the page and the sheet (Chromium's UA makes a popover's ::backdrop
// pointer-events:none, so a tap on the dimmed page used to reach the button under it). In the top layer it is shown
// just before the menu, so it stacks right under it; without popovers it sits before the menu, one z-index below.
let accountScrim = null;
let sheetDrag = null;
const accountSheetScrim = () => {
  if (accountScrim?.isConnected) return accountScrim;
  accountScrim = document.createElement('div');
  accountScrim.className = 'account-sheet-scrim';
  accountScrim.setAttribute('aria-hidden', 'true');
  if (POPOVER) { accountScrim.setAttribute('popover', 'manual'); document.body.append(accountScrim); }
  else { accountScrim.hidden = true; profileSettings.menu.before(accountScrim); }
  return accountScrim;
};
const setAccountSheet = (open) => {
  document.documentElement.classList.toggle('account-sheet-open', open);
  if (!open && !accountScrim) return;
  const scrim = accountSheetScrim();
  if (!POPOVER) { scrim.hidden = !open; return; }
  if (open && !scrim.matches(':popover-open')) scrim.showPopover();
  if (!open && scrim.matches(':popover-open')) scrim.hidePopover();
};
const openProfileSettingsMenu = () => {
  if (!profileSettings?.menu.isConnected) return;
  const { settings, menu } = profileSettings;
  closeNotificationPanel();
  menu.dataset.layout = menuLayout(window.innerWidth);
  menu.style.transform = '';
  menu.style.transition = '';
  if (menu.dataset.layout === 'sheet') setAccountSheet(true);
  if (POPOVER) menu.showPopover(); else menu.hidden = false;
  placeProfileSettingsMenu();
  settings.setAttribute('aria-expanded', 'true');
};
const closeProfileSettingsMenu = ({ returnFocus = false } = {}) => {
  setAccountSheet(false);
  if (!profileSettingsOpen()) return;
  const { settings, menu } = profileSettings;
  if (POPOVER) menu.hidePopover(); else menu.hidden = true;
  menu.style.transform = '';
  sheetDrag = null;
  settings.setAttribute('aria-expanded', 'false');
  if (returnFocus) settings.focus();
};
const accountSheetOpen = () => profileSettingsOpen() && profileSettings.menu.dataset.layout === 'sheet';
document.addEventListener('click', (event) => {
  if (!profileSettings) return;
  const { settings, menu } = profileSettings;
  if (!settings.contains(event.target) && !menu.contains(event.target)) closeProfileSettingsMenu();
});
// While the sheet is open, a tap outside it only closes it: it never reaches the page (a link, EDIT PROFILE, the
// brand) even where the scrim cannot cover (no popover support). Only real input; a script's own click is left alone.
window.addEventListener('click', (event) => {
  if (!event.isTrusted || !accountSheetOpen() || profileSettings.menu.contains(event.target)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeProfileSettingsMenu();
}, true);
// Swipe down to close: drag the grabber or the "Signed in as" header. The sheet follows the finger (not under reduced
// motion); a release past 60 px or a fast flick closes it, anything shorter snaps back (sheetDrag is declared above).
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
document.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || !accountSheetOpen()) return;
  const handle = event.target.closest?.('.profile-settings-grabber, .profile-settings-account');
  if (!handle || !profileSettings.menu.contains(handle)) return;
  sheetDrag = { id: event.pointerId, y: event.clientY, dy: 0, samples: [[event.timeStamp, 0]] };
  try { handle.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
});
document.addEventListener('pointermove', (event) => {
  if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
  sheetDrag.dy = Math.max(0, event.clientY - sheetDrag.y);
  sheetDrag.samples.push([event.timeStamp, sheetDrag.dy]);
  if (sheetDrag.samples.length > 12) sheetDrag.samples.shift();
  if (reducedMotion()) return;
  const { menu } = profileSettings;
  menu.style.transition = 'none';
  menu.style.transform = `translateY(${Math.round(sheetDrag.dy)}px)`;
});
const endSheetDrag = (event) => {
  if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
  const drag = sheetDrag;
  sheetDrag = null;
  const dy = Math.max(drag.dy, event.type === 'pointercancel' ? 0 : event.clientY - drag.y);
  // A flick: the speed over the last 100 ms of the gesture (px per ms), not the average of a slow start.
  const [t0, dy0] = drag.samples.find(([t]) => event.timeStamp - t <= 100) || [event.timeStamp, dy];
  const speed = (dy - dy0) / Math.max(1, event.timeStamp - t0);
  if (event.type !== 'pointercancel' && (dy > 60 || (dy > 16 && speed > 0.3))) { closeProfileSettingsMenu(); return; }
  const { menu } = profileSettings;
  menu.style.transition = reducedMotion() ? '' : 'transform .18s ease-out';
  menu.style.transform = '';
};
document.addEventListener('pointerup', endSheetDrag);
document.addEventListener('pointercancel', endSheetDrag);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !event.defaultPrevented && profileSettingsOpen()) { event.preventDefault(); closeProfileSettingsMenu({ returnFocus: true }); }
});
window.addEventListener('resize', () => closeProfileSettingsMenu());
// A top-layer menu is fixed: follow ⚙ while the page scrolls, and close once ⚙ has scrolled out of view.
window.addEventListener('scroll', () => {
  if (!POPOVER || !profileSettingsOpen() || profileSettings.menu.dataset.layout === 'sheet') return;
  const r = profileSettings.settings.getBoundingClientRect();
  if (r.bottom < 0 || r.top > window.innerHeight) closeProfileSettingsMenu();
  else placeProfileSettingsMenu();
}, { passive: true });

const setView = (view) => {
  closeProfileSettingsMenu();
  const previousView = document.body.dataset.appView;
  const renderedView = view === 'explore' ? 'home' : view;
  document.body.dataset.appView = view;
  document.body.classList.toggle('app-subview', view !== 'home');
  document.querySelectorAll('[data-view]').forEach((section) => {
    const isActive = section.dataset.view === renderedView;
    section.hidden = !isActive;
    section.classList.toggle('is-active', isActive);
  });
  document.querySelectorAll('[data-nav]').forEach((button) => button.classList.toggle('is-active', button.dataset.nav === view));
  markCurrentNav(document, view);
  if (view === 'explore') renderExplore();
  if (view === 'posts') {
    showCommunityPostsLoading();
    loadCommunityPosts();
    window.setTimeout(() => {
      if (document.body.dataset.appView === 'posts' && memberProfile.id && !communityPostsLoaded && !communityPostsLoading) loadCommunityPosts();
    }, 450);
  }
  if (view === 'chat') renderChats();
  // Re-tapping Profile on the profile keeps the loaded (or loading) interests: no second read, no skeleton flash.
  if (view === 'profile') {
    renderProfile();
    if (previousView !== 'profile' || !['ready', 'loading'].includes(profileInterests.status)) loadProfileInterests();
  }
  // Reduced motion: jump, never glide ('instant' also beats html{scroll-behavior:smooth}).
  window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
};

const validViews = ['home', 'explore', 'posts', 'chat', 'profile'];
const routeFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  // ?post=<id> (a shared post link, via explore.html) opens that post's detail once the Explore feed has loaded; it is
  // read once per page load, so a later hashchange does not reopen it.
  const postParam = params.get('post');
  if (postParam && !pendingPostParamRead) { pendingPostParamRead = true; pendingPostId = postParam; }
  const view = params.get('view') || window.location.hash.slice(1) || (postParam ? 'posts' : 'explore');
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
const deck = { ready: false, ids: [], seen: new Set(), loading: null, end: null, refilling: false };
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

// While the deck loads (first load, a refill, Try again) the card keeps its place and shows one skeleton card, so the
// real card replaces it without a layout shift; the home view is aria-busy. A failure ends it: deck.end = 'error'.
const deckLoadingNow = () => !deckEmptyCause() && (!deck.ready || Boolean(deck.loading) || deck.refilling);
const setDeckLoading = (card, loading) => {
  const home = document.querySelector('[data-view="home"]');
  if (loading) home?.setAttribute('aria-busy', 'true');
  else home?.removeAttribute('aria-busy');
  if (!card) return;
  card.classList.toggle('is-loading', loading);
  const skeleton = card.querySelector(':scope > .skeleton-group');
  if (loading && !skeleton) card.insertAdjacentHTML('beforeend', skeletonMarkup('deck'));
  if (!loading) skeleton?.remove();
};
// "Why this person?" (Phase D, Task 3): testers only. rpc/deck_why (0008 section 5) answers a row only to a caller in
// the test world. "Not a tester" is cached (memory only, this page) only for an empty successful answer or a missing
// function (HTTP 404 / PGRST202, e.g. before 0008 is applied). Any other error leaves the state unknown: each card asks
// at most once (why.tried), and after 3 consecutive errors the client stops asking for the session. A tester's cards each
// ask once (cached by id); a card with no row shows no button. The panel shows the band label, the shared interests
// and the deck's order keys.
const WHY_MAX_ERRORS = 3;
const why = { tester: null, rows: new Map(), pending: new Set(), tried: new Set(), errors: 0 };
const setWhyOpen = (open) => {
  const toggle = document.querySelector('#why-toggle');
  const panel = document.querySelector('#why-panel');
  if (!toggle || !panel) return;
  toggle.setAttribute('aria-expanded', String(open));
  panel.hidden = !open;
};
const renderWhy = (person) => {
  const toggle = document.querySelector('#why-toggle');
  const panel = document.querySelector('#why-panel');
  if (!toggle || !panel) return;
  const id = person?.id ? String(person.id) : '';
  const row = id ? why.rows.get(id) : null;
  if (!row) {
    if (toggle === document.activeElement) toggle.blur();
    toggle.hidden = true;
    setWhyOpen(false);
    panel.replaceChildren();
    delete panel.dataset.for;
  } else if (panel.dataset.for !== id) {
    panel.innerHTML = `<p class="why-title">Why ${escapeHtml(person.name || 'this person')}?</p>${whyPanelMarkup(row)}`;
    panel.dataset.for = id;
    setWhyOpen(false);
    toggle.hidden = false;
  }
  if (!id || !supabase || why.tester === false || why.rows.has(id) || why.pending.has(id) || why.tried.has(id)) return;
  if (why.errors >= WHY_MAX_ERRORS) return;
  if (why.tester === null && why.pending.size) return;   // the first answer decides whether to ask at all
  why.pending.add(id);
  why.tried.add(id);
  supabase.rpc('deck_why', { p_target: id }).then(({ data, error, status }) => {
    if (error) {
      if (status === 404 || error.code === 'PGRST202') {   // the function does not exist: not a tester, never ask again
        why.errors = 0;
        if (why.tester === null) why.tester = false;
        why.rows.set(id, null);
      } else why.errors += 1;                              // unknown: the next card asks again
      return;
    }
    why.errors = 0;
    const found = whyRow(data);
    if (found) why.tester = true;
    else if (why.tester === null) why.tester = false;
    why.rows.set(id, found);
  }, () => {
    why.errors += 1;
  }).finally(() => {
    why.pending.delete(id);
    if (why.tester) renderWhy(currentPerson);
  });
};
document.querySelector('#why-toggle')?.addEventListener('click', (event) => {
  setWhyOpen(event.currentTarget.getAttribute('aria-expanded') !== 'true');
});
document.querySelector('#swipe-card')?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || document.querySelector('#why-panel')?.hidden !== false) return;
  if (!event.target.closest?.('#why-toggle, #why-panel')) return;
  setWhyOpen(false);
  document.querySelector('#why-toggle')?.focus();
});
// The card's cover (founder live test, 2026-10-14): no usable cover or photo, or one that fails to load, shows the
// branded placeholder instead of the img alt text. The listener is bound once per img.
const setCardImage = (image, src, alt) => {
  if (!image) return;
  const frame = image.parentElement;
  const showPlaceholder = () => { image.hidden = true; frame?.classList.add('is-placeholder'); };
  if (!image.dataset.fallbackBound) {
    image.addEventListener('error', () => { if (image.getAttribute('src')) showPlaceholder(); });
    image.dataset.fallbackBound = '1';
  }
  image.alt = alt;
  if (!src) { image.removeAttribute('src'); showPlaceholder(); return; }
  image.hidden = false;
  frame?.classList.remove('is-placeholder');
  if (image.getAttribute('src') !== src) image.src = src;
};
// The card underneath (the stack): the next member's cover and name, decorative (aria-hidden), shown only when there is one.
const renderNextCard = (queue) => {
  const next = document.querySelector('#swipe-card-next');
  if (!next) return;
  const index = queue.findIndex((person) => String(person.id) === String(currentPerson?.id));
  const person = index >= 0 ? queue[index + 1] : null;
  next.hidden = !person;
  if (!person) return;
  setCardImage(next.querySelector('#swipe-next-image'), deckCoverSrc(person, safeImageUrl), '');
  const name = next.querySelector('#swipe-next-name'); if (name) name.textContent = person.name || '';
};
const renderHome = (queue = getExplorePeople()) => {
  const card = document.querySelector('#swipe-card');
  const actions = document.querySelector('.swipe-actions');
  const hint = document.querySelector('.swipe-hint');
  const limitState = document.querySelector('#swipe-limit-state');
  const emptyState = document.querySelector('#home-empty-state');
  if (!currentPerson) document.querySelector('#swipe-card-next')?.setAttribute('hidden', '');
  if (!currentPerson && deckLoadingNow()) {
    renderWhy(null);
    card?.removeAttribute('hidden');
    setDeckLoading(card, true);
    actions?.setAttribute('hidden', '');
    hint?.setAttribute('hidden', '');
    limitState?.setAttribute('hidden', '');
    emptyState?.setAttribute('hidden', '');
    return;
  }
  setDeckLoading(card, false);
  if (!currentPerson) {
    renderWhy(null);
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
  // A new member on the card: drop any drag / park pose left from the previous one (no motion).
  if (card && card.dataset.personId !== String(currentPerson.id)) {
    if (card.dataset.personId !== undefined) deckSwipe?.reset();
    card.dataset.personId = String(currentPerson.id);
  }
  setCardImage(document.querySelector('#swipe-image'), deckCoverSrc(currentPerson, safeImageUrl), `${currentPerson.name} cover image`);
  renderNextCard(queue);
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
  const bandNoteEl = document.querySelector('#swipe-band-note');
  if (bandNoteEl) {
    const note = bandNote(currentPerson.distanceBand);
    bandNoteEl.textContent = note;
    bandNoteEl.hidden = !note;
  }
  const tags = document.querySelector('#swipe-tags'); if (tags) renderCardChips(tags, currentPerson);
  const count = document.querySelector('#queue-count');
  if (count) count.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(queue.length).padStart(2, '0')}`;
  renderWhy(currentPerson);
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
  return { ...profile, coverUrl: normalizeCoverUrl(profile.coverUrl), ...deckFields(safeRow), city: '', state: '', email: '', phone: '', phoneCountryCode: '', phoneNumber: '', age: '', role: profile.experience || 'Brivia member', distance: '', bio: `${profile.name} is open to meaningful connections.`, tags, image: profile.photoUrl || '', filters: filters.filter(Boolean) };
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
// UNDER REVIEW (final fix F2): completed = false while every client-visible step is done means an operator review flag
// is on the member. They see a neutral notice in the app (never why, never who), not onboarding again: each pass
// through step 3 would burn an interest rewrite. Any other incomplete member finishes onboarding as before.
const UNDER_REVIEW_CONTACT = 'thebrivia.club@gmail.com';
const showUnderReview = () => {
  if (document.querySelector('[data-under-review]')) return;
  document.body.classList.add('app-auth-pending'); // the app stays hidden behind the notice
  const lead = escapeHtml(UNDER_REVIEW_COPY.slice(0, UNDER_REVIEW_COPY.lastIndexOf(UNDER_REVIEW_CONTACT)));
  const section = document.createElement('section');
  section.className = 'under-review';
  section.dataset.underReview = '';
  section.setAttribute('aria-labelledby', 'under-review-title');
  section.innerHTML = `<div class="under-review-card"><p class="under-review-eyebrow">THE BRIVIA CLUB</p><h1 id="under-review-title" tabindex="-1">Profile under review</h1><p>${lead}<a href="mailto:${UNDER_REVIEW_CONTACT}">${UNDER_REVIEW_CONTACT}</a>.</p><div class="under-review-actions"><button type="button" class="under-review-signout" data-under-review-signout>Sign out</button></div></div>`;
  document.body.append(section);
  section.querySelector('[data-under-review-signout]').addEventListener('click', () => logoutMember());
  section.querySelector('h1').focus();
};
// completed = false: the notice for a member under review, else the completion flow. ownRow is the member's own
// profiles row (read here when the caller does not have it).
const routeIncompleteMember = async (onboarding, ownRow = null) => {
  let row = ownRow;
  if (!row && supabase && memberProfile.id) ({ data: row } = await supabase.from('profiles').select('*').eq('id', memberProfile.id).maybeSingle());
  if (isUnderReview(onboarding, row)) { showUnderReview(); return; }
  window.location.replace('/auth.html?complete-profile=1');
};
// When the queue runs out: load once more; if nothing new comes back, ask deck_status() why (never a count).
const refillDeck = async () => {
  if (!deck.ready || deckPeople().length || deck.refilling) return;
  deck.refilling = true;
  renderHome();
  let settled = false;
  try {
    settled = await refillDeckOnce();
  } catch (error) {
    // A refill that throws (e.g. a malformed answer) ends in the retry state, never an endless skeleton.
    console.warn('The deck could not refill:', error?.message || error);
    deck.end = 'error';
    settled = true;
  } finally {
    deck.refilling = false;
  }
  // Not settled: the member is being routed to onboarding or the review notice, so the deck must not load again.
  if (settled) renderExplore();
};
// One refill. Resolves true when the deck has cards or deck.end says why not.
const refillDeckOnce = async () => {
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
      else if (!onboardingError && onboarding?.completed === false) { await routeIncompleteMember(onboarding); return false; }
    }
    deck.end = cause;
  }
  return true;
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
// The pitched card stayed on screen while the sheet was open; it leaves to the right now that the like is sent
// (a failure brings it back to the front, as before).
const dismissPendingPitch = () => {
  const pending = claimPendingPitch();
  if (!pending) return;
  pitchPerson = null;
  sendConnectionSignal(pending.person).then((result) => {
    if (result.error) requeuePerson(pending.person);
    showToast(signalResultToast(pending.person, result));
  });
  advanceCard(pending.person, 'pitch');
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
  deckSwipe?.settle();
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

// The card leaves in the swipe direction (deck-swipe.js), then the next member takes its place. A card put back at the
// front meanwhile (a failed signal, F5) is not consumed.
const advanceCard = (person, direction, { vx = 0, duration } = {}) => {
  if (!person?.id) return;
  const id = String(person.id);
  const generation = requeueGeneration.get(id) || 0;
  deckAdvancing = true;
  const onCard = currentPerson && String(currentPerson.id) === id;
  const flight = onCard && deckSwipe ? deckSwipe.flyOut(direction, { vx, duration: vx ? undefined : (duration || SWIPE.buttonFly) }) : Promise.resolve();
  flight.then(async () => {
    deckAdvancing = false;
    if ((requeueGeneration.get(id) || 0) !== generation) { renderExplore(); deckSwipe?.settle(); return; }
    consumeCard(person);
    if (currentPerson && String(currentPerson.id) === id) currentPerson = null;
    renderExplore();
    if (onCard && currentPerson) deckSwipe?.enter();
    // Every pass is stored before the next deck_candidates call (refillDeck waits for them).
    if (!deckPeople().length) await refillDeck();
  });
};

// type: 'pass' | 'like'. Returns false when nothing happened (the dragged card springs back).
const swipe = (type, { vx = 0 } = {}) => {
  if (!currentPerson || deckAdvancing || capCheckInFlight) return false;
  // A Like while the pitch sheet is opening or open is ignored: a repeated click/keypress must not resolve
  // the pending like as a plain like and drop the note (Task 3b).
  if (type === 'like' && pendingPitch && pitchSheetVisible()) return false;
  // Moving on with the sheet open resolves it as a plain like (D-018): the pitched card leaves to the right and no
  // pass is recorded for it.
  if (pendingPitch) {
    document.querySelector('#pitch-modal')?.setAttribute('hidden', '');
    dismissPendingPitch();
    return true;
  }
  // At a cached cap, read the quota again first: the cap may have cleared (F4). Still capped: a Like sends nothing,
  // opens no pitch and keeps the card (D-026). Passing is always free.
  if (type === 'like' && quotaBlocked(signalQuota)) {
    capCheckInFlight = true;
    refreshSignalQuota().finally(() => {
      capCheckInFlight = false;
      if (quotaBlocked(signalQuota)) { renderSignalQuota(); showToast(quotaBlockedToast()); return; }
      swipe('like');
    });
    return false;
  }
  const person = currentPerson;
  // A pitch keeps its card on screen (parked right) until the sheet resolves: sent -> it leaves; a failed send ->
  // it springs back. The request is sent when the sheet resolves (submit with a note, or dismiss without one).
  if (type === 'like') {
    deckSwipe?.park();
    openPitch(person);
    return true;
  }
  recordPass(person.id);
  advanceCard(person, 'pass', { vx });
  return true;
};

// Report or block from the card (R4). The server already blocked the member (report) or the block flow just did, so the
// card leaves like a Pass visually but sends no pass interaction.
const dismissCardLikePass = (person) => {
  if (deckAdvancing) return;
  advanceCard(person, 'pass');
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
// D-062: the skills and looking-for boxes suggest the whole catalog (discovery-catalog.js) plus the live taxonomy's
// non-sensitive labels, read once when the drawer first opens; names still come from member cards only.
let filterTaxonomy = [];
let filterTaxonomyRequested = false;
const loadFilterTaxonomy = async () => {
  if (filterTaxonomyRequested) return;
  filterTaxonomyRequested = true;
  try {
    const { data, error } = await fetchInterestNodes();
    if (error) { filterTaxonomyRequested = false; return; }
    filterTaxonomy = taxonomyLabels(data);
    renderFilterOptions();
  } catch { filterTaxonomyRequested = false; }
};
const filterCatalog = () => {
  const { names, skills, lookingFor } = getFilterValues();
  return {
    names,
    skills: catalogValues({ members: skills, standard: INTEREST_CATALOG, taxonomy: filterTaxonomy }),
    lookingFor: catalogValues({ members: lookingFor, standard: LOOKING_FOR_CATALOG }),
  };
};
const renderSuggestionList = (container, values, query, kind, selected = new Set(), showAll = false) => {
  if (!container) return;
  const normalizedQuery = normalizedValue(query);
  if (!normalizedQuery && !showAll) {
    container.innerHTML = '';
    container.classList.remove('is-open');
    return;
  }
  // A typed query shows the best 12; a focused empty box lists everything (the list scrolls).
  const matches = matchOptions(values, query, selected, normalizedQuery ? 12 : Infinity);
  container.classList.toggle('is-open', matches.length > 0);
  container.innerHTML = matches.length
    ? matches.map((value) => `<button class="discovery-filter-suggestion" type="button" role="option" data-filter-kind="${kind}" data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`).join('')
    : `<p class="discovery-filter-empty">${kind === 'name' ? 'No member by that name in your deck yet.' : 'No match. Try a shorter word.'}</p>`;
};
// The quick-pick row above the skills box: one tap adds the filter; a picked one shows as selected.
const renderPopularFilters = (container, selected) => {
  if (!container) return;
  container.innerHTML = POPULAR_INTERESTS.map((value) => {
    const on = selected.has(normalizedValue(value));
    return `<button class="discovery-filter-pop${on ? ' is-on' : ''}" type="button" aria-pressed="${on}" ${on ? `data-remove-filter="skills"` : `data-filter-kind="skills"`} data-filter-value="${escapeHtml(value)}">${escapeHtml(value)}</button>`;
  }).join('');
};
const renderSelectedFilters = (container, values, selected, kind) => {
  if (!container) return;
  const selectedLabels = values.filter((value) => selected.has(normalizedValue(value)));
  container.innerHTML = selectedLabels.map((value) => `<button class="discovery-filter-selected-chip" type="button" data-remove-filter="${kind}" data-filter-value="${escapeHtml(value)}"><span>${escapeHtml(value)}</span><b aria-hidden="true">×</b><span class="sr-only">Remove ${escapeHtml(value)}</span></button>`).join('');
};
const renderFilterOptions = () => {
  const search = document.querySelector('#drawer-filter-search');
  const skillsInput = document.querySelector('#filter-skills-input');
  const lookingInput = document.querySelector('#filter-looking-for-input');
  if (!search || !skillsInput || !lookingInput) return;
  const { names, skills, lookingFor } = filterCatalog();
  renderPopularFilters(document.querySelector('#filter-popular'), exploreFilters.skills);
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
  // Until sign-in has loaded the inbox and the cards of the people in it, the list is a skeleton (Phase C Task 6).
  const inboxLoading = !deck.ready;
  if (inboxLoading) list?.setAttribute('aria-busy', 'true');
  else list?.removeAttribute('aria-busy');
  const inboxMarkup = `<div class="inbox-panel-head"><div><strong>YOUR THREADS</strong><span>Private conversations</span></div>${inboxLoading ? '' : `<b>${conversations.length}</b>`}</div>${referenceRows}${inboxLoading ? skeletonMarkup('list', 4) : matches.length ? matches.map((person) => {
    const last = chatMessages[person.id]?.at(-1);
    const unread = last?.from === 'them' && !readChatIds.has(person.id);
    const lastPreview = last?.attachment?.kind === 'resume' ? 'Resume · PDF' : last?.attachment ? `📎 ${last.attachment.name || 'Attachment'}` : (last?.text || 'Start a conversation');
    return `<div class="chat-row${unread ? ' is-unread' : ''}${selectedChat?.id === person.id ? ' is-selected' : ''}"><button class="chat-row-open" type="button" data-chat-id="${escapeHtml(person.id)}"><span class="member-profile-trigger" data-public-profile-id="${escapeHtml(person.id)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(person.name)} profile">${renderAvatar(person)}</span><span class="chat-row-copy"><strong data-public-profile-id="${escapeHtml(person.id)}">${escapeHtml(person.name)}</strong><span>${escapeHtml(lastPreview)}</span></span><span class="chat-row-meta"><time>${escapeHtml(formatChatTime(last?.createdAt))}</time>${unread ? '<b>1</b>' : ''}</span></button><button class="chat-delete" type="button" data-delete-chat-id="${escapeHtml(person.id)}" aria-label="Delete chat with ${escapeHtml(person.name)}" title="Delete chat"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 6h11M8 3.5h4M6.5 6l.6 10h5.8l-.6-10M8.5 8.5v5M11.5 8.5v5"/></svg></button></div>`;
  }).join('') : '<div class="inbox-empty"><strong>No threads found</strong><span>Chats open once a connection is mutual. Send a signal from Connect to start one.</span><button type="button" class="inbox-empty-action" data-nav="explore">CONNECT WITH PEOPLE ↗</button></div>'}`;
  const inboxScroll = list?.querySelector('.chat-inbox-scroll');
  if (list && inboxScroll) {
    inboxScroll.innerHTML = inboxMarkup;
  } else if (list) {
    list.innerHTML = `<div class="chat-inbox-scroll">${inboxMarkup}</div>`;
    if (inboxToolbar) list.prepend(inboxToolbar);
  }
  document.querySelector('#chat-count').textContent = `${String(conversations.length).padStart(2, '0')} CONVERSATIONS`;
  setChatBadges(document, conversations.length);
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
      leaveTyping();
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
  joinTyping(person);
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
  // Quick-share (D4): close any open menu, show "+" when there is something to share, and re-check the match.
  closeShareMenu();
  syncShareToggle();
  refreshShareMatch(person.id).then(() => {
    if (String(selectedChat?.id) === String(person.id) && !document.querySelector('#chat-share-menu')?.hidden) renderShareMenu();
  });
};
document.querySelector('#chat-messages')?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-resume-open]');
  if (button) openSharedResume(button);
});

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
  // Quick-share (D4). A resume message is a document card whose Open signs the sender's resume on demand; it never
  // goes through signedAttachmentUrl (message-attachments). An area message is a small place card.
  const renderSharedResume = (message) => {
    const ownerId = message.from === 'me' ? memberProfile.id : selectedChat.id;
    const valid = message.attachment.path === `${ownerId}/${RESUME_FILE_NAME}`;
    const id = escapeHtml(String(message.id));
    const gone = !valid || sharedResumeFailed.has(String(message.id));
    const goneLine = gone ? `<span class="message-resume-gone" id="resume-gone-${id}">${escapeHtml(RESUME_GONE_COPY)}</span>` : '';
    const open = valid ? `<button type="button" class="message-resume-open" data-resume-open="${escapeHtml(message.attachment.path)}" data-message-id="${id}" aria-label="Open resume"${gone ? ` aria-describedby="resume-gone-${id}"` : ''}>Open</button>` : '';
    return `<span class="message-resume"><span class="message-resume-icon">${RESUME_DOC_ICON}</span><span class="message-resume-copy"><span class="message-resume-title">Resume · PDF</span><span class="message-resume-sub">${message.from === 'me' ? 'Your latest version' : 'Their latest version'}</span>${goneLine}</span>${open}</span>`;
  };
  const renderSharedArea = (area) => `<span class="message-place"><span class="message-place-icon">${SHARE_PIN_ICON}</span><span class="message-place-copy"><span class="message-place-eyebrow">Shared area</span><span class="message-place-name">${escapeHtml(area.place)}</span><span class="message-place-scope">${escapeHtml(area.scope)}</span></span></span>`;
  const renderBubble = (message) => {
    const isResume = message.attachment?.kind === 'resume' && Boolean(message.attachment.path);
    const area = !message.attachment ? parseAreaBody(message.text) : null;
    const content = isResume ? renderSharedResume(message)
      : area ? renderSharedArea(area)
        : `${renderAttachment(message.attachment)}${message.text ? `<span class="message-copy">${escapeHtml(message.text)}</span>` : ''}`;
    const kind = isResume || area ? ' has-attachment has-share' : message.attachment ? ' has-attachment' : '';
    return `<div class="message ${message.from === 'me' ? 'me' : 'them'}${kind}">${content}<small>${escapeHtml(formatChatTime(message.createdAt))}</small></div>`;
  };
  messages.innerHTML = thread.length ? thread.map(renderBubble).join('') : '<div class="chat-start-note"><strong>Start with context.</strong><span>A thoughtful first message makes a better introduction.</span></div>';
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
  closeShareMenu();
  leaveTyping();
  selectedChat = null;
  document.querySelector('#chat-window')?.setAttribute('hidden', '');
  document.querySelector('#chat-list')?.removeAttribute('hidden');
  document.querySelector('#chat-more-menu')?.setAttribute('hidden', '');
  document.querySelector('#chat-more')?.setAttribute('aria-expanded', 'false');
  suppressChatAutoOpen = true;
  renderChats();
  suppressChatAutoOpen = false;
};
// Typing indicator (D5). A private Realtime broadcast channel per pair (topic typing:<lower id>:<higher id>, event
// 'typing', payload only { typing: boolean }). 0012 D2 lets only a matched pair in the same world join, and cuts off
// the member who blocked; the client never joins (and drops at once) when the other member is in the local blocked
// list. A refused join is quiet: nothing shows, nothing is logged, nothing is retried. A blocked member's client
// behaves exactly as before (their join succeeds; their signals simply reach nobody).
const typingLine = () => {
  const head = document.querySelector('.chat-window-head');
  if (!head) return null;
  if (!document.querySelector('#chat-typing')) {
    head.insertAdjacentHTML('afterbegin', '<div class="chat-typing" id="chat-typing" aria-hidden="true" hidden><i class="chat-typing-dots"><i></i><i></i><i></i></i><em class="chat-typing-text">typing…</em></div>');
    head.insertAdjacentHTML('afterend', '<p class="chat-typing-live sr-only" id="chat-typing-live" role="status" aria-live="polite"></p>');
  }
  return document.querySelector('#chat-typing');
};
const showTyping = (visible, person) => {
  const line = typingLine();
  if (line) line.hidden = !visible;
  const live = document.querySelector('#chat-typing-live');
  // One announcement per burst: set on show, cleared on hide.
  if (live) live.textContent = visible && person ? `${String(person.name || 'They').trim().split(/\s+/)[0]} is typing` : '';
};
const leaveTyping = () => {
  const session = typingSession;
  if (!session) return;
  session.sender.stop();
  typingSession = null;
  session.receiver.reset();
  showTyping(false);
  supabase?.removeChannel(session.channel)?.catch?.(() => {});
};
const joinTyping = (person) => {
  if (typingSession && typingSession.otherId === String(person?.id)) return;
  leaveTyping();
  typingLine(); // the (hidden) pill and live region exist before any signal, so the first one never moves anything
  if (!supabase || !memberProfile.id || !person?.id || readBlockedUserIds().has(String(person.id))) return;
  // A reopen right after a leave gets a fresh channel: Realtime drops a leaving channel locally at once.
  const channel = supabase.channel(typingTopic(memberProfile.id, person.id), { config: { private: true, broadcast: { self: false } } });
  const session = { otherId: String(person.id), channel, joined: false };
  session.sender = createTypingSender({
    send: (payload) => {
      // Only over a live, joined socket (never the REST broadcast fallback, which also warns): after pagehide or a
      // drop Realtime may have closed the socket while this session still thinks it is joined.
      if (session.joined && channel.state === 'joined' && supabase.realtime?.isConnected?.()) Promise.resolve(channel.send({ type: 'broadcast', event: TYPING_EVENT, payload })).catch(() => {});
    },
  });
  session.receiver = createTypingReceiver({ onChange: (visible) => { if (typingSession === session) showTyping(visible, person); } });
  typingSession = session;
  channel
    .on('broadcast', { event: TYPING_EVENT }, ({ payload } = {}) => {
      if (typingSession !== session) return;
      if (readBlockedUserIds().has(session.otherId)) { leaveTyping(); return; }
      session.receiver.onSignal({ typing: payload?.typing === true });
    })
    .subscribe((status) => {
      if (typingSession !== session) return;
      session.joined = status === 'SUBSCRIBED';
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Refused (no match, or blocked on the server) or the socket dropped: quietly drop typing for this thread. It
        // is never retried on its own; returning to the tab or coming back online allows one fresh join (below).
        session.receiver.reset();
        typingSession = null;
        setTimeout(() => { supabase.removeChannel(channel)?.catch?.(() => {}); }, 0);
      }
    });
};
function syncTypingForSelectedChat() {
  if (!selectedChat) { if (typingSession) leaveTyping(); return; }
  if (readBlockedUserIds().has(String(selectedChat.id))) leaveTyping();
  else joinTyping(selectedChat);
}
const noteTyping = () => {
  if (typingSession && selectedChat && typingSession.otherId === String(selectedChat.id)) typingSession.sender.onInput();
};
// Leaving the page: Realtime closes its socket on pagehide (which leaves every channel on the server); this drops the
// local session too. Hiding the tab first ends the burst while the socket is still open, so the other side clears at
// once instead of after the 4 s idle.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') typingSession?.sender.stop();
  else rejoinTypingOnce();
});
// One join attempt per user-side event (tab visible again, back online) when the open thread has no typing session:
// covers a dropped socket (screen lock, app switch) without ever looping on a refused join. Never for a blocked pair.
const rejoinTypingOnce = () => {
  if (!selectedChat || typingSession || readBlockedUserIds().has(String(selectedChat.id))) return;
  joinTyping(selectedChat);
};
window.addEventListener('online', () => rejoinTypingOnce());
window.addEventListener('pagehide', () => leaveTyping(), { capture: true });
window.addEventListener('pageshow', (event) => { if (event.persisted && selectedChat) syncTypingForSelectedChat(); });
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
    // F7: the chat (and its menu button) is gone: put focus on the chat list, or its heading when the list is empty.
    const chatFocus = document.querySelector('#chat-list .chat-row-open') || document.querySelector('[data-view="chat"] .view-heading h1');
    if (chatFocus && !chatFocus.matches('button, a, input')) chatFocus.setAttribute('tabindex', '-1');
    chatFocus?.focus();
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
  menu.setAttribute('aria-label', 'Account menu');
  // "Signed in as" (Phase C Task 5): the only place the member's own email is shown. A <p>, so Tab skips it.
  menu.innerHTML = '<p class="profile-settings-account">Signed in as <strong></strong></p><button type="button" data-profile-setting="notifications">NOTIFICATIONS</button><button type="button" data-profile-setting="block">BLOCKED USERS</button><button type="button" data-profile-setting="removed">REMOVED CONNECTIONS</button><button type="button" data-profile-setting="privacy">PRIVACY &amp; ACCOUNT</button><button type="button" data-profile-setting="logout">LOG OUT</button><span class="profile-settings-grabber" aria-hidden="true"></span>';
  // The menu follows ⚙ in the DOM, so Tab goes ⚙ -> the five items -> EDIT PROFILE. Where popovers exist it opens in
  // the top layer (popover="manual"): above the hero's overflow clip and the dashboard, without leaving its tab order.
  // Without them it toggles `hidden` in place, as before Phase C.
  if (POPOVER) menu.setAttribute('popover', 'manual'); else menu.hidden = true;
  actions.prepend(settings);
  settings.after(menu);
  settings.setAttribute('aria-controls', menu.id);
  profileSettings = { settings, menu };
  settings.addEventListener('click', (event) => {
    event.stopPropagation();
    if (profileSettingsOpen()) closeProfileSettingsMenu();
    else openProfileSettingsMenu();
  });
  // Tab past the last item (or Shift+Tab before ⚙) closes it. Focus going nowhere (relatedTarget null) is not a Tab out:
  // Safari and macOS Firefox do not focus a clicked button, and a click on the "Signed in as" line focuses nothing, so
  // closing then would swallow the click. Outside clicks close it through the document click listener instead.
  const leave = (event) => {
    if (!event.relatedTarget) return;
    if (!settings.contains(event.relatedTarget) && !menu.contains(event.relatedTarget)) closeProfileSettingsMenu();
  };
  settings.addEventListener('focusout', leave);
  menu.addEventListener('focusout', leave);
  menu.querySelector('[data-profile-setting="block"]')?.addEventListener('click', () => { closeProfileSettingsMenu(); openBlockedUsersManager(); });
  menu.querySelector('[data-profile-setting="notifications"]')?.addEventListener('click', () => { closeProfileSettingsMenu(); openNotificationSettings(); });
  menu.querySelector('[data-profile-setting="removed"]')?.addEventListener('click', () => { closeProfileSettingsMenu(); openRemovedConnectionsManager(); });
  menu.querySelector('[data-profile-setting="privacy"]')?.addEventListener('click', () => { closeProfileSettingsMenu(); openPrivacy(settings); });
  menu.querySelector('[data-profile-setting="logout"]')?.addEventListener('click', () => { closeProfileSettingsMenu(); logoutMember(); });
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
        <div class="profile-edit-wide profile-edit-readonly" data-profile-area><span>YOUR AREA</span><p>${escapeHtml(memberPlaceLabel || 'Not set yet')}</p><small class="profile-edit-helper">Change your area: coming soon. Other members only ever see a rough distance, never your area's name, unless you share it in a chat.</small></div>
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
    setBusy(submit, true);
    feedback.textContent = 'Saving your profile...';
    const { data, error } = await saveProfile(memberProfile.id, nextProfile, photoFile, coverFile, { photoUrl: memberProfile.photoUrl, coverUrl: memberProfile.coverUrl });
    if (error) {
      setBusy(submit, false);
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
    loadProfileInterests(); // the private ones are gone and their points moved
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
    try { window.sessionStorage.setItem(REAUTH_DELETE_KEY, reauthMarker(session.user.id)); } catch { /* the member can reopen the dialog by hand */ }
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

// The profile column (Phase C, Task 5): "Complete your profile", "Your interests", "Looking for", "Experience".
// my_interests() is read once per profile visit (setView), and once after sign-in when the page opens on the profile.
let profileInterests = { status: 'idle', rows: [] };
let profileInterestsTicket = 0;
const PASSION_BUDGET = 20;
const splitList = (value) => (Array.isArray(value) ? value : String(value || '').split(',')).map((item) => String(item).trim()).filter(Boolean);
// Interests the checklist counts: the loaded my_interests() rows, or the public display copy (profiles.skills) until then.
const checklistInterests = () => (profileInterests.status === 'ready' ? profileInterests.rows : splitList(memberProfile.skills));
const loadProfileInterests = async () => {
  if (!memberProfile.id) return; // signed-in data is not here yet: loadSupabaseCommunity() loads them
  const ticket = ++profileInterestsTicket;
  profileInterests = { status: 'loading', rows: profileInterests.rows };
  renderProfileInterests();
  const { data, error } = await fetchMyInterests();
  if (ticket !== profileInterestsTicket) return;
  profileInterests = error ? { status: 'error', rows: [] } : { status: 'ready', rows: Array.isArray(data) ? data : [] };
  renderProfileInterests();
  renderProfileChecklist();
};
// The loading state: the shared chip skeleton (Phase C Task 6); the section is aria-busy meanwhile.
const interestsPlaceholder = () => `<p class="profile-sr" role="status">Loading your interests</p>${skeletonMarkup('chips', 3)}`;
const renderProfileChecklist = () => {
  const box = document.querySelector('#profile-checklist');
  if (!box) return;
  const result = profileChecklist(memberProfile, checklistInterests(), defaultCoverUrl, normalizeCoverUrl);
  box.classList.toggle('is-complete', result.complete);
  if (result.complete) { box.innerHTML = '<p class="profile-checklist-done" id="profile-checklist-title">Profile complete</p>'; return; }
  const items = result.items.map((item) => `<li><button type="button" class="profile-checklist-item" data-checklist-item="${item.key}" data-done="${item.done}"><span class="profile-checklist-mark" aria-hidden="true"></span><span class="profile-checklist-label">${escapeHtml(item.label)}</span>${item.done ? '<span class="profile-sr">, done</span>' : ''}</button></li>`).join('');
  box.innerHTML = `<div class="profile-card-head"><h2 class="profile-card-title" id="profile-checklist-title">Complete your profile</h2><span class="profile-checklist-count">${result.done} of ${result.total}</span></div><div class="profile-progress" role="progressbar" aria-labelledby="profile-checklist-title" aria-valuemin="0" aria-valuemax="${result.total}" aria-valuenow="${result.done}" aria-valuetext="${result.done} of ${result.total} done"><i></i></div><ul class="profile-checklist-items">${items}</ul>`;
  box.querySelector('.profile-progress i').style.width = `${Math.round((result.done / result.total) * 100)}%`;
};
const renderProfileInterests = () => {
  const body = document.querySelector('#profile-interests-body');
  if (!body) return;
  const section = body.closest('section');
  section?.setAttribute('aria-busy', String(profileInterests.status === 'loading' || profileInterests.status === 'idle'));
  if (profileInterests.status === 'error') {
    body.innerHTML = '<p class="profile-card-empty" role="alert">Couldn\'t load your interests</p><button type="button" class="profile-card-action" data-interests-retry>Retry</button>';
    return;
  }
  if (profileInterests.status !== 'ready') { body.innerHTML = interestsPlaceholder(); return; }
  const rows = profileInterests.rows;
  if (!rows.length) {
    body.innerHTML = '<p class="profile-card-empty">No interests yet. Your interests and passion points drive who you meet.</p><button type="button" class="profile-card-action" data-profile-edit>Edit your interests</button>';
    return;
  }
  body.innerHTML = `<ul class="profile-interest-list">${rows.map((row) => {
    const points = Math.max(0, Number(row.points) || 0);
    return `<li class="profile-interest" data-interest-row><span class="profile-interest-label">${escapeHtml(row.label || row.interest_id || '')}</span>${row.mode === 'private' ? '<span class="profile-interest-private">Private</span>' : ''}<span class="profile-interest-points">${points} ${points === 1 ? 'point' : 'points'}</span><span class="profile-interest-bar" aria-hidden="true"><i></i></span></li>`;
  }).join('')}</ul>`;
  body.querySelectorAll('.profile-interest-bar i').forEach((bar, index) => {
    const share = Math.min(1, Math.max(0, Number(rows[index].points) || 0) / PASSION_BUDGET);
    bar.style.width = `${Math.round(share * 10000) / 100}%`;
  });
};
const renderProfileLookingFor = () => {
  const body = document.querySelector('#profile-looking-for-body');
  if (!body) return;
  const items = splitList(memberProfile.lookingFor);
  body.innerHTML = items.length
    ? `<ul class="profile-chips">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<p class="profile-card-empty">Tell members what you are open to.</p><button type="button" class="profile-card-action" data-profile-edit>Say what you\'re looking for</button>';
};
const renderProfileExperience = () => {
  const body = document.querySelector('#profile-experience-body');
  if (!body) return;
  const experience = String(memberProfile.experience || '').trim();
  body.innerHTML = experience
    ? `<p class="profile-experience-text">${escapeHtml(experience)}</p>`
    : '<p class="profile-card-empty">Your role, craft or what you are building.</p><button type="button" class="profile-card-action" data-profile-edit>Add your experience</button>';
};
// Resume (polish wave D3): one private PDF per member. `available` is false until 0012 adds profiles.resume_path (the
// card stays hidden); `missing` means the bucket answered "not found" (a calm "coming soon" line, never an error).
const resume = { available: false, missing: false, path: null, info: null, busy: '', pending: null, error: '', focus: '' };
const RESUME_DOC_ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/></svg>';
const RESUME_ALERT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>';
const initResume = (row) => {
  resume.available = Boolean(row) && Object.prototype.hasOwnProperty.call(row, 'resume_path');
  resume.path = resume.available && typeof row.resume_path === 'string' && row.resume_path ? row.resume_path : null;
  renderProfileResume();
  if (!resume.path || !memberProfile.id) return;
  resumeInfo(memberProfile.id).then(({ info, error }) => {
    if (isMissingResumeStore(error)) { resume.available = false; renderProfileResume(); return; }
    if (info) { resume.info = info; renderProfileResume(); return; }
    // The stored path names no file (removed elsewhere): show Upload, and clear the column (best effort).
    if (!error && !resume.busy) { resume.path = null; resume.info = null; renderProfileResume(); clearResumePath(memberProfile.id); }
  });
};
const renderProfileResume = () => {
  const section = document.querySelector('#profile-resume');
  const body = document.querySelector('#profile-resume-body');
  if (!section || !body) return;
  section.hidden = !resume.available;
  memberProfile.resumePath = resume.path || ''; // kept in step for the chat quick-share (D4)
  syncShareToggle(); // "+" hides when there is nothing to share (every call runs after module init)
  if (!resume.available) { body.innerHTML = ''; return; }
  // Keep focus where it was across a re-render (or move it where the last action asked).
  const focusAction = resume.focus || (body.contains(document.activeElement) ? document.activeElement?.dataset?.resumeAction : '');
  resume.focus = '';
  const busy = Boolean(resume.busy);
  if (busy) section.setAttribute('aria-busy', 'true'); else section.removeAttribute('aria-busy');
  if (resume.missing) { body.innerHTML = `<p class="profile-card-empty profile-resume-note">${escapeHtml(COMING_SOON_COPY)}</p>`; return; }
  const errorId = 'profile-resume-error';
  const describedBy = resume.error ? ` aria-describedby="${errorId}"` : '';
  // Busy actions stay focusable (aria-disabled, not disabled), so focus stays on the pressed button; the click
  // handler ignores them while resume.busy is set.
  const disabled = busy ? ' aria-disabled="true"' : '';
  const button = (action, label, tone = '') => `<button type="button" class="profile-resume-button${tone ? ` is-${tone}` : ''}" data-resume-action="${action}"${['upload', 'replace'].includes(action) ? describedBy : ''}${disabled}>${label}</button>`;
  const statusText = { upload: 'Uploading…', remove: 'Removing…', view: 'Opening…' }[resume.busy] || '';
  let file;
  if (resume.busy === 'upload' && resume.pending) {
    file = `<div class="profile-resume-file is-busy"><span class="profile-resume-icon">${RESUME_DOC_ICON}</span><div class="profile-resume-text"><p class="profile-resume-name">${escapeHtml(resume.pending.name || RESUME_FILE_NAME)}</p><p class="profile-resume-meta">${escapeHtml(formatResumeSize(resume.pending.size))}</p></div></div><div class="profile-resume-progress" aria-hidden="true"><i></i></div>`;
  } else if (resume.path) {
    file = `<div class="profile-resume-file"><span class="profile-resume-icon is-filled">${RESUME_DOC_ICON}</span><div class="profile-resume-text"><p class="profile-resume-name">${RESUME_FILE_NAME}</p><p class="profile-resume-meta">${(resumeMetaLine(resume.info || {}) || 'PDF on file').split(' · ').map((part) => `<span>${escapeHtml(part)}</span>`).join(' · ')}</p></div></div>`;
  } else {
    file = `<div class="profile-resume-file is-empty"><span class="profile-resume-icon">${RESUME_DOC_ICON}</span><p class="profile-resume-lead">Add your resume so a match can see your experience when you choose to share it.</p></div>`;
  }
  const actions = resume.path
    ? `${button('view', 'View', 'primary')}${button('replace', 'Replace')}${button('remove', 'Remove', 'quiet')}`
    : button('upload', 'Upload resume', 'primary');
  const status = `<p class="profile-resume-status" role="status">${statusText}</p>`;
  const error = resume.error ? `<p class="profile-resume-error" id="${errorId}" role="alert">${RESUME_ALERT_ICON}<span>${escapeHtml(resume.error)}</span></p>` : '';
  const privacy = resume.path && !busy ? '<p class="profile-resume-privacy">Private to you. A match can open it only after you share it with them.</p>' : '';
  body.innerHTML = `${file}${error}<div class="profile-resume-actions">${actions}</div>${status}${privacy}`;
  if (focusAction) (body.querySelector(`[data-resume-action="${focusAction}"]`) || body.querySelector('[data-resume-action]'))?.focus();
};
const handleResumeFile = async (file) => {
  if (!file || resume.busy || !memberProfile.id) return;
  resume.busy = 'upload'; // set before the first await, so a second pick or click is ignored meanwhile
  const check = validateResume(file, await readResumeHead(file));
  const origin = resume.path ? 'replace' : 'upload';
  if (!check.ok) { resume.busy = ''; resume.error = check.message; resume.focus = origin; renderProfileResume(); return; }
  resume.error = '';
  resume.pending = { name: file.name, size: file.size };
  resume.focus = origin;
  renderProfileResume();
  const { path, error, fileReplaced } = await uploadResume(memberProfile.id, file, { hadPath: Boolean(resume.path) });
  resume.pending = null;
  if (error && fileReplaced) {
    // The file was replaced but the profile write failed: say so honestly and show the file as it is now.
    const { info } = await resumeInfo(memberProfile.id);
    resume.busy = '';
    resume.info = info || { size: file.size, updatedAt: new Date().toISOString() };
    resume.error = REPLACED_NOT_SAVED_COPY;
    resume.focus = 'replace';
    renderProfileResume();
    return;
  }
  resume.busy = '';
  if (error) {
    if (isMissingResumeStore(error)) resume.missing = true;
    else { resume.error = resumeUploadErrorMessage(error); resume.focus = origin; }
    renderProfileResume();
    return;
  }
  resume.path = path;
  resume.info = { size: file.size, updatedAt: new Date().toISOString() };
  resume.focus = 'view';
  renderProfileResume();
  showToast('Your resume is saved.');
};
const openOwnResume = async () => {
  if (!resume.path || resume.busy) return;
  // Open the tab inside the click (Safari blocks a window.open after an await), then point it at the signed link.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  resume.error = '';
  resume.busy = 'view';
  resume.focus = 'view';
  renderProfileResume();
  const { url, error } = await resumeSignedUrl(resume.path);
  resume.busy = '';
  resume.focus = 'view';
  if (error || !url) {
    tab?.close();
    resume.error = OPEN_FAILED_COPY;
  } else if (tab) {
    tab.location.href = url;
  } else {
    const link = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener noreferrer' });
    document.body.append(link); link.click(); link.remove();
  }
  renderProfileResume();
};
const removeOwnResume = async () => {
  if (!resume.path || resume.busy || !memberProfile.id) return;
  if (!window.confirm(REMOVE_RESUME_CONFIRM)) return;
  resume.error = '';
  resume.busy = 'remove';
  resume.focus = 'remove';
  renderProfileResume();
  const { error } = await removeResume(memberProfile.id);
  resume.busy = '';
  if (error) { resume.error = REMOVE_FAILED_COPY; resume.focus = 'remove'; } else { resume.path = null; resume.info = null; resume.focus = 'upload'; }
  renderProfileResume();
};
document.querySelector('#profile-resume')?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-resume-action]')?.dataset.resumeAction;
  if (!action || resume.busy) return;
  if (action === 'upload' || action === 'replace') document.querySelector('#profile-resume-input')?.click();
  else if (action === 'view') openOwnResume();
  else if (action === 'remove') removeOwnResume();
});
document.querySelector('#profile-resume-input')?.addEventListener('change', (event) => {
  const input = event.target;
  const file = input.files?.[0];
  input.value = ''; // choosing the same file again still fires change
  handleResumeFile(file);
});
document.querySelector('[data-view="profile"]')?.addEventListener('click', (event) => {
  if (event.target.closest('[data-interests-retry]')) { loadProfileInterests(); return; }
  if (event.target.closest('[data-checklist-item], [data-profile-edit]')) openProfileEditor();
});

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
  const avatar = document.querySelector('#profile-avatar');
  if (avatar) avatar.innerHTML = avatarImage(profile.photoUrl, profile.name) || escapeHtml(initials(profile.name));
  if (avatar && profile.photoName) avatar.title = profile.photoName;
  const account = document.querySelector('#profile-settings-menu .profile-settings-account');
  if (account) { account.querySelector('strong').textContent = profile.email || ''; account.hidden = !profile.email; }
  renderProfileChecklist();
  renderProfileInterests();
  renderProfileLookingFor();
  renderProfileExperience();
  renderProfileResume();
};

let communityPosts = [];
let communityPostAuthors = {};
let communityPostSort = 'newest';
let communityPostsLoaded = false;
let communityPostsLoading = false;
let communityPostPreviewUrl = '';
// Likes and saves (polish wave C3; tables from 0012): the member's own sets, and whether the tables exist yet.
const communityReactions = { liked: new Set(), saved: new Set(), available: true };
const communityReactionGuard = createReactionGuard();
// A post id from ?post=<id>, opened once the feed has loaded (routeFromUrl).
let pendingPostId = null;
let pendingPostParamRead = false;
const REACTION_FAILED = "That didn't save. Please try again.";

const formatCommunityPostDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'RECENTLY';
  // This year's posts drop the year ("OCT 21"), so the card's header bar keeps room for the name.
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).toUpperCase();
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
    list.innerHTML = '<div class="community-post-empty"><span>✦</span><h2>Start the<br /><em>conversation.</em></h2><p>Share a thought, image, or small win with the club.</p><button type="button" class="community-post-empty-action" data-post-first>Write the first post</button></div>';
    return;
  }
  list.innerHTML = sorted.map((post) => {
    const author = communityPostAuthors[post.author_id] || { id: post.author_id, name: 'Brivia member', image: '' };
    // Only the author's own community-posts Storage file or a shipped preset illustration auto-loads (post-image.js);
    // any other URL shows a placeholder.
    const imageSrc = postImageSrc(post, { isStorageImageUrl, isPresetCoverUrl, normalizeCoverUrl });
    return postCardMarkup(post, author, {
      liked: communityReactions.liked.has(post.id),
      saved: communityReactions.saved.has(post.id),
      imageSrc,
      dateLabel: formatCommunityPostDate(post.created_at),
    }, { escapeHtml, renderAvatar });
  }).join('');
  syncReactionAvailability();
  bindCommunityProfileTriggers();
};

// Like and Save follow the member's own rows. Until 0012 is applied the tables do not exist: both buttons are hidden.
const syncReactionAvailability = () => {
  document.querySelectorAll('#community-post-list [data-post-action="like"], #community-post-list [data-post-action="save"]').forEach((button) => {
    button.hidden = !communityReactions.available;
  });
};
const REACTION_LABELS = { like: ['Like', 'Liked'], save: ['Save', 'Saved'] };
// { pop: true } (a member's own tap that turns Like on) marks the button data-just-liked for one beat, so the pop plays
// once for that tap and never on a render or a reload.
const markReaction = (postId, kind, on, { pop = false } = {}) => {
  const set = kind === 'like' ? communityReactions.liked : communityReactions.saved;
  if (on) set.add(postId); else set.delete(postId);
  document.querySelectorAll(`#community-post-list .post-card[data-post-id="${CSS.escape(String(postId))}"] [data-post-action="${kind}"]`).forEach((button) => {
    button.setAttribute('aria-pressed', String(on));
    const label = button.querySelector('span');
    if (label) label.textContent = REACTION_LABELS[kind][on ? 1 : 0];
    if (pop && on && kind === 'like') {
      button.dataset.justLiked = '';
      window.setTimeout(() => button.removeAttribute('data-just-liked'), 400);
    } else button.removeAttribute('data-just-liked');
  });
};
const missingTable = (error) => /does not exist|schema cache|42P01|PGRST205/i.test(`${error?.code || ''} ${error?.message || ''}`);
// The server truth for the loaded posts. A failure keeps what is on screen (the optimistic change is already undone).
// A post and kind with a request in flight keeps its on-screen state (the reload may predate that write); `own` is the
// caller's key, which is applied (the caller's write has failed and the reload is its server truth).
const refreshCommunityReactions = async ({ own = '' } = {}) => {
  if (!supabase || !memberProfile.id) return;
  const ids = communityPosts.map((post) => post.id);
  const result = await loadReactions(supabase, memberProfile.id, ids);
  if (result.error) {
    if (missingTable(result.error)) { communityReactions.available = false; syncReactionAvailability(); }
    else console.warn('Likes and saves could not load:', result.error.message);
    return;
  }
  communityReactions.available = true;
  ids.forEach((id) => {
    for (const [kind, set] of [['like', result.liked], ['save', result.saved]]) {
      const key = `${id}:${kind}`;
      if (key !== own && communityReactionGuard.busy(key)) continue;
      markReaction(id, kind, set.has(id));
    }
  });
  syncReactionAvailability();
};
// Optimistic like / save: the button flips at once; one request per post and kind is in flight (a double tap is one
// row). On an error the change is undone and the server truth reloaded. 42501 means RLS refused the write (the post is
// gone or no longer visible): reload only, no toast (post-reactions.js). Anything else also shows the toast.
const toggleCommunityReaction = async (postId, kind) => {
  if (!supabase || !memberProfile.id || !communityReactions.available) return;
  const key = `${postId}:${kind}`;
  if (!communityReactionGuard.begin(key)) return;
  try {
    const next = !(kind === 'like' ? communityReactions.liked : communityReactions.saved).has(postId);
    markReaction(postId, kind, next, { pop: true });
    const { error } = await setReaction(supabase, kind, postId, memberProfile.id, next);
    if (error) {
      markReaction(postId, kind, !next);
      if (error.code !== '42501') showToast(REACTION_FAILED);
      await refreshCommunityReactions({ own: key });
    }
  } catch (error) {
    console.warn('Reaction failed:', error?.message);
  } finally {
    communityReactionGuard.end(key);
  }
};
// Share: the system share sheet when there is one, else the link on the clipboard. Only a neutral title and the link
// leave the page (shareData): never the caption or the author's name.
const shareCommunityPost = async (postId) => {
  const post = communityPosts.find((item) => String(item.id) === String(postId));
  if (!post) return;
  const data = shareData(post, window.location.origin);
  if (typeof navigator.share === 'function') {
    try { await navigator.share(data); return; } catch (error) { if (error?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(data.url);
    showToast('Link copied.');
  } catch {
    showToast("Couldn't copy the link.");
  }
};

// The post detail sheet (Comment, or a ?post=<id> link): image, caption, author and date. Its one action is "Reply in
// chat" for a member I am matched with (mutual consent: no thread opens otherwise), else "View profile".
const closeCommunityPostDetail = () => {
  const dialog = document.querySelector('#post-detail');
  if (!dialog) return;
  const returnTo = dialog.__returnFocus;
  if (dialog.open) dialog.close();
  dialog.remove();
  if (returnTo?.isConnected) returnTo.focus();
};
const replyToCommunityPost = (post, author) => {
  closeCommunityPostDetail();
  let person = findPersonById(author.id);
  if (!person) { person = { ...author }; people.push(person); }
  setView('chat');
  openChat(person);
  const input = document.querySelector('#chat-input');
  if (!input) return;
  const quote = Array.from(String(post.caption || '').trim()).slice(0, 60).join('');
  input.value = `Re: “${quote}” `;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
};
const openCommunityPostDetail = async (postId, opener = document.activeElement) => {
  const post = communityPosts.find((item) => String(item.id) === String(postId));
  if (!post) return;
  document.querySelector('#post-detail')?.remove();
  const author = communityPostAuthors[post.author_id] || { id: post.author_id, name: 'Brivia member', image: '' };
  const name = author.name || 'Brivia member';
  const imageSrc = postImageSrc(post, { isStorageImageUrl, isPresetCoverUrl, normalizeCoverUrl });
  const media = isSafePostImageSrc(imageSrc)
    ? `<img src="${escapeHtml(imageSrc)}" alt="Post by ${escapeHtml(name)}" />`
    : '<span class="community-post-image-missing" role="img" aria-label="Image unavailable"></span>';
  const created = new Date(post.created_at);
  const datetime = Number.isNaN(created.getTime()) ? '' : ` datetime="${escapeHtml(created.toISOString())}"`;
  const dialog = document.createElement('dialog');
  dialog.id = 'post-detail';
  dialog.className = 'post-detail';
  dialog.setAttribute('aria-labelledby', 'post-detail-author');
  dialog.innerHTML = `<div class="post-detail-panel"><div class="post-detail-media">${media}</div>`
    + `<div class="post-detail-head">${renderAvatar({ name, image: author.image || '' }, 'post-card-avatar')}<div class="post-detail-byline"><h2 class="post-detail-author" id="post-detail-author">${escapeHtml(name)}</h2><time${datetime}>${escapeHtml(formatCommunityPostDate(post.created_at))}</time></div>`
    + '<button type="button" class="post-detail-close" data-post-detail-close aria-label="Close post"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>'
    + `<p class="post-detail-caption">${escapeHtml(post.caption || '')}</p>`
    + '<div class="post-detail-footer"><button type="button" class="post-detail-action" data-post-detail-action aria-busy="true" disabled>View profile</button></div></div>';
  dialog.__returnFocus = opener;
  document.body.append(dialog);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); closeCommunityPostDetail(); });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-post-detail-close]')) closeCommunityPostDetail();
  });
  dialog.showModal();
  dialog.querySelector('[data-post-detail-close]')?.focus();
  const action = dialog.querySelector('[data-post-detail-action]');
  const isOwn = String(author.id) === String(memberProfile.id);
  const matched = !isOwn && (remoteConnectionIds.some((id) => String(id) === String(author.id)) || await hasMatchWith(author.id));
  if (!action.isConnected) return;
  action.textContent = matched ? 'Reply in chat' : 'View profile';
  action.removeAttribute('aria-busy');
  action.disabled = false;
  action.addEventListener('click', () => {
    if (matched) { replyToCommunityPost(post, author); return; }
    dialog.__returnFocus = null;
    closeCommunityPostDetail();
    openPublicProfile(isOwn ? memberProfile : (communityPostAuthors[author.id] || findPersonById(author.id) || author), { forcePublic: !isOwn });
  });
};
// One delegated listener for every card's actions (the cards are re-rendered on sort and reload). A tap on the image
// opens the post too (pointer convenience; keyboard and screen-reader users have Comment).
const bindCommunityPostActions = () => {
  const list = document.querySelector('#community-post-list');
  if (!list || list.dataset.postActionsBound === 'true') return;
  list.dataset.postActionsBound = 'true';
  list.addEventListener('click', (event) => {
    const card = event.target.closest('.post-card');
    if (!card) return;
    const postId = card.dataset.postId;
    const action = event.target.closest('[data-post-action]')?.dataset.postAction;
    if (action === 'like' || action === 'save') toggleCommunityReaction(postId, action);
    // Safari does not focus a clicked button: pass it, so closing the detail returns focus to Comment.
    else if (action === 'comment') openCommunityPostDetail(postId, event.target.closest('[data-post-action]'));
    else if (action === 'share') shareCommunityPost(postId);
    else if (!action && event.target.closest('.post-card-media')) openCommunityPostDetail(postId, card.querySelector('[data-post-action="comment"]'));
  });
};
const openPendingCommunityPost = () => {
  if (!pendingPostId) return;
  const postId = pendingPostId;
  pendingPostId = null;
  if (communityPosts.some((post) => String(post.id) === String(postId))) openCommunityPostDetail(postId);
  else showToast('That post is no longer available.');
};

// The feed's first load shows post-shaped skeletons and marks the list aria-busy (Phase C Task 6); a reload after a new
// post keeps the posts on screen.
const showCommunityPostsLoading = () => {
  const list = document.querySelector('#community-post-list');
  if (!list || communityPostsLoaded) return;
  list.setAttribute('aria-busy', 'true');
  if (!list.querySelector('.skeleton-group')) list.innerHTML = skeletonMarkup('posts', 3);
};
const loadCommunityPosts = async () => {
  if (!supabase || !memberProfile.id || communityPostsLoading) return;
  communityPostsLoading = true;
  const list = document.querySelector('#community-post-list');
  showCommunityPostsLoading();
  const { data, error } = await supabase
    .from('community_posts')
    .select('id,author_id,image_url,image_path,caption,created_at')
    .order('created_at', { ascending: false });
  if (error) {
    communityPostsLoading = false;
    communityPostsLoaded = true;
    list?.removeAttribute('aria-busy');
    if (list) list.innerHTML = /community_posts|relation|schema cache/i.test(error.message || '')
      ? '<div class="community-post-empty"><span>✦</span><h2>Community posts<br /><em>are almost here.</em></h2><p>Run the SQL files in <strong>supabase/migrations/</strong> to enable shared posts.</p></div>'
      : `<div class="community-post-empty"><span>!</span><h2>Could not load<br /><em>the feed.</em></h2><p>${escapeHtml(error.message || 'Please try again.')}</p><button type="button" class="community-post-empty-action" data-posts-retry>Try again</button></div>`;
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
  // Likes and saves load beside the authors, so the cards render once, already in the member's state.
  const reactionsLoaded = refreshCommunityReactions().catch((reactionError) => console.warn('Likes and saves could not load:', reactionError?.message));
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
  await reactionsLoaded;
  communityPostsLoading = false;
  communityPostsLoaded = true;
  list?.removeAttribute('aria-busy');
  renderCommunityPosts();
  openPendingCommunityPost();
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
// The feed's empty and error states: "Write the first post" opens the composer, "Try again" reloads the feed.
document.querySelector('#community-post-list')?.addEventListener('click', (event) => {
  if (event.target.closest('[data-post-first]')) openCommunityPostComposer();
  else if (event.target.closest('[data-posts-retry]')) { communityPostsLoaded = false; loadCommunityPosts(); }
});
bindCommunityPostActions();
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
  setBusy(submit, true);
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
    setBusy(submit, false);
  }
});

// Every [data-nav] click (header, tab bar, avatar, empty-state actions, including ones rendered later) runs setView, so
// a nav click leaves the app exactly as setView(view) does. Capture phase on document: this runs before the inline route
// bridge in app.html, and preventDefault() tells the bridge (which only covers clicks before this module loads) to skip,
// so one click pushes at most one history entry.
document.addEventListener('click', (event) => {
  const item = event.target.closest?.('[data-nav]');
  if (!item || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const view = item.dataset.nav;
  if (!validViews.includes(view)) return;
  if (view === 'home' && item.tagName === 'A' && item.getAttribute('href') === '/') return;
  event.preventDefault();
  const nextUrl = new URL(window.location.href);
  if (view === 'home') nextUrl.searchParams.delete('view');
  else nextUrl.searchParams.set('view', view);
  if (validViews.includes(nextUrl.hash.slice(1))) nextUrl.hash = '';
  const next = nextUrl.pathname + nextUrl.search + nextUrl.hash;
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.pushState({ ...(window.history.state || {}), appView: view }, '', next);
  }
  setView(view);
}, true);
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
// The heavy swipe (deck-swipe.js): left = Pass, right = Pitch (opens the sheet; never sends on its own).
deckSwipe = createDeckSwipe({
  card: document.querySelector('#swipe-card'),
  stack: document.querySelector('#swipe-stack'),
  canDrag: () => Boolean(currentPerson) && !deckAdvancing && !capCheckInFlight && !pitchSheetVisible() && !cardOverflowOpen()
    && !document.querySelector('#swipe-card')?.classList.contains('is-loading'),
  onCommit: (direction, { vx }) => swipe(direction === 'pitch' ? 'like' : 'pass', { vx }),
});
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
  loadFilterTaxonomy();
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
// Chat "+" quick-share (polish wave D4): "Share my resume" and "Share my area", above the composer. The resume message
// carries no link: the recipient signs resumes/<sender>/resume.pdf for 60 s when they press Open, and Storage allows
// that only while the pair is matched and unblocked (0012 §D). The area is the member's own place_label text only,
// never coordinates or a cell id (docs/ORBIT_ENGINE.md §4.1). Pure shapes and copy: quick-share.js.
const CHAT_ATTACH_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20.5 11.2l-8.1 8.1a5 5 0 0 1-7.1-7.1l8.1-8.1a3.4 3.4 0 0 1 4.8 4.8l-8.1 8.1a1.8 1.8 0 0 1-2.5-2.5l7.4-7.4"/></svg>';
const CHAT_PLUS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const SHARE_PIN_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const shareMatches = new Map(); // person id -> matched (hasMatchWith), refreshed whenever their chat opens
const sharedResumeFailed = new Set(); // message ids whose Open was refused: the card says it is no longer shared
const sharedResumeOpening = new Set();
let shareBusy = false;
// null: no resume option at all (0012 not applied, or the bucket is missing); '': no resume yet; else the own path.
const shareResumeState = () => (!resume.available || resume.missing ? null : (resume.path || ''));
const refreshShareMatch = async (personId) => {
  const matched = await hasMatchWith(personId);
  shareMatches.set(String(personId), matched);
  return matched;
};
const syncShareToggle = () => {
  const toggle = document.querySelector('#chat-share-toggle');
  if (toggle) toggle.hidden = !selectedChat || (!areaShareBody(memberPlaceLabel) && shareResumeState() === null);
};
const shareItem = (share, icon, title, hint, extra = '') => `<button type="button" class="chat-share-item" data-share="${share}"${extra}><span class="chat-share-icon">${icon}</span><span class="chat-share-copy"><span class="chat-share-title">${title}</span><span class="chat-share-hint">${escapeHtml(hint)}</span></span></button>`;
const renderShareMenu = () => {
  const menu = document.querySelector('#chat-share-menu');
  if (!menu || !selectedChat) return;
  const resumeState = shareResumeState();
  const rows = [];
  // Only inside an existing match (brivia_can_message); without a resume the row leads to Profile (no dead end).
  if (resumeState !== null && shareMatches.get(String(selectedChat.id)) === true) {
    rows.push(resumeState
      ? shareItem('resume', RESUME_DOC_ICON, 'Share my resume', 'PDF · they always see your latest')
      : `<div class="chat-share-row">${shareItem('resume', RESUME_DOC_ICON, 'Share my resume', NO_RESUME_HINT, ' aria-disabled="true"')}<button type="button" class="chat-share-add" data-share-action="add-resume" data-nav="profile">Add resume</button></div>`);
  }
  const area = parseAreaBody(areaShareBody(memberPlaceLabel));
  if (area) rows.push(shareItem('area', SHARE_PIN_ICON, 'Share my area', `${area.place}, ${area.scope.toLowerCase()}`));
  menu.innerHTML = rows.join('');
};
const closeShareMenu = ({ focusToggle = false } = {}) => {
  const menu = document.querySelector('#chat-share-menu');
  const toggle = document.querySelector('#chat-share-toggle');
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  toggle?.setAttribute('aria-expanded', 'false');
  if (focusToggle) toggle?.focus();
};
const openShareMenu = async () => {
  const menu = document.querySelector('#chat-share-menu');
  const toggle = document.querySelector('#chat-share-toggle');
  if (!menu || !toggle || !selectedChat) return;
  const personId = String(selectedChat.id);
  if (!shareMatches.has(personId)) await refreshShareMatch(personId);
  if (String(selectedChat?.id) !== personId) return;
  renderShareMenu();
  if (!menu.children.length) return;
  menu.hidden = false;
  toggle.setAttribute('aria-expanded', 'true');
  menu.querySelector('button')?.focus();
};
const focusResumeCard = () => window.requestAnimationFrame(() => {
  const card = document.querySelector('#profile-resume');
  if (!card || card.hidden) return;
  card.scrollIntoView({ block: 'center' });
  card.querySelector('[data-resume-action]')?.focus();
});
// A modal confirm sheet; resolves true on the primary action, false on Cancel, Escape or the backdrop.
const openShareConfirm = ({ title, lead = '', preview, note, confirmLabel, icon }) => new Promise((resolve) => {
  document.querySelector('dialog.share-confirm')?.remove();
  const dialog = document.createElement('dialog');
  dialog.className = 'share-confirm';
  dialog.setAttribute('aria-labelledby', 'share-confirm-title');
  dialog.setAttribute('aria-describedby', 'share-confirm-note');
  dialog.innerHTML = `<div class="share-confirm-panel"><span class="share-confirm-icon">${icon}</span><h2 class="share-confirm-title" id="share-confirm-title">${escapeHtml(title)}</h2>${lead ? `<p class="share-confirm-lead">${escapeHtml(lead)}</p>` : ''}${preview}<p class="share-confirm-note" id="share-confirm-note">${escapeHtml(note)}</p><div class="share-confirm-actions"><button type="button" class="share-confirm-button" data-share-cancel>Cancel</button><button type="button" class="share-confirm-button is-primary" data-share-confirm>${escapeHtml(confirmLabel)}</button></div></div>`;
  let done = false;
  const finish = (ok) => { if (done) return; done = true; if (dialog.open) dialog.close(); dialog.remove(); resolve(ok); };
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-share-cancel]')) finish(false);
    else if (event.target.closest('[data-share-confirm]')) finish(true);
  });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector('[data-share-confirm]')?.focus();
});
// The composer's send-error copy (shared with the text send below). Since 0013 a block never refuses a send (the
// message is withheld), so a refusal means the pair is no longer matched: neutral copy, never the word "blocked".
const chatSendErrorCopy = (error) => (/row-level security|policy|brivia_is_blocked_between|blocked/i.test(error?.message || '')
  ? 'You can no longer message this member.'
  : (error?.message || 'Message could not be saved.'));
const sendShare = async (person, send) => {
  if (shareBusy || !supabase || !memberProfile.id) return;
  shareBusy = true;
  try {
    await send();
    if (String(selectedChat?.id) === String(person.id)) await loadChatMessages(person);
  } catch (error) {
    showToast(chatSendErrorCopy(error));
  } finally {
    shareBusy = false;
    document.querySelector('#chat-input')?.focus();
  }
};
const confirmResumeShare = async () => {
  const person = selectedChat;
  if (!person || shareBusy || !shareResumeState()) return;
  const size = formatResumeSize(resume.info?.size);
  const ok = await openShareConfirm({
    title: `Share your resume with ${person.name || 'this member'}?`,
    preview: `<div class="share-confirm-doc"><span class="share-confirm-doc-icon">${RESUME_DOC_ICON}</span><span class="share-confirm-doc-copy"><span class="share-confirm-doc-title">Resume · PDF</span><span class="share-confirm-doc-meta">${escapeHtml([RESUME_FILE_NAME, size].filter(Boolean).join(' · '))}</span></span></div>`,
    note: RESUME_SHARE_NOTE,
    confirmLabel: 'Share resume',
    icon: RESUME_DOC_ICON,
  });
  if (!ok) { document.querySelector('#chat-share-toggle')?.focus(); return; }
  await sendShare(person, async () => {
    const bytes = resume.info?.size || (await resumeInfo(memberProfile.id)).info?.size;
    await insertChatMessage(RESUME_SHARE_BODY, resumeShareAttachment(memberProfile.id, bytes));
  });
};
const confirmAreaShare = async () => {
  const person = selectedChat;
  const body = areaShareBody(memberPlaceLabel);
  if (!person || shareBusy || !body) return;
  const ok = await openShareConfirm({
    title: `Send your area to ${person.name || 'this member'}?`,
    lead: "They'll see:",
    preview: `<p class="share-confirm-preview">${escapeHtml(body)}</p>`,
    note: AREA_SHARE_NOTE,
    confirmLabel: 'Send area',
    icon: SHARE_PIN_ICON,
  });
  if (!ok) { document.querySelector('#chat-share-toggle')?.focus(); return; }
  await sendShare(person, () => insertChatMessage(body, null, { message_type: 'text' }));
};
const bindChatShare = (form, closeMenus) => {
  const toggle = form.querySelector('#chat-share-toggle');
  const menu = form.querySelector('#chat-share-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', () => {
    const wasOpen = !menu.hidden;
    closeMenus();
    document.querySelector('#chat-more-menu')?.setAttribute('hidden', '');
    document.querySelector('#chat-more')?.setAttribute('aria-expanded', 'false');
    if (!wasOpen) openShareMenu();
  });
  menu.addEventListener('click', (event) => {
    if (event.target.closest('[data-share-action="add-resume"]')) { closeShareMenu(); focusResumeCard(); return; }
    const item = event.target.closest('[data-share]');
    if (!item || item.getAttribute('aria-disabled') === 'true') return;
    closeShareMenu();
    if (item.dataset.share === 'resume') confirmResumeShare();
    else if (item.dataset.share === 'area') confirmAreaShare();
  });
  document.addEventListener('keydown', (event) => {
    if (menu.hidden) return;
    if (event.key === 'Escape') { if (event.defaultPrevented) return; event.preventDefault(); closeShareMenu({ focusToggle: true }); return; }
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || !menu.contains(document.activeElement)) return;
    const buttons = [...menu.querySelectorAll('button')];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length - 1 : index - 1);
    buttons[next].focus();
  });
  // Tabbing out of the menu (and away from "+") closes it.
  const onFocusOut = (event) => {
    if (menu.hidden || !event.relatedTarget) return;
    if (!menu.contains(event.relatedTarget) && event.relatedTarget !== toggle) closeShareMenu();
  };
  menu.addEventListener('focusout', onFocusOut);
  toggle.addEventListener('focusout', onFocusOut);
};
// Open on a shared resume: a fresh 60 s link each time, opened in a new tab without an opener; nothing is stored.
const openSharedResume = async (button) => {
  const path = button.dataset.resumeOpen;
  const id = button.dataset.messageId;
  if (!path || !id || sharedResumeOpening.has(id)) return;
  // Open the tab inside the click (Safari blocks a window.open after an await), then point it at the signed link.
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  sharedResumeOpening.add(id);
  const { url, error } = await resumeSignedUrl(path, 60);
  sharedResumeOpening.delete(id);
  const refocus = () => document.querySelector(`#chat-messages [data-resume-open][data-message-id="${CSS.escape(id)}"]`)?.focus();
  if (error || !url) {
    tab?.close();
    sharedResumeFailed.add(id);
    renderMessages();
    refocus();
    return;
  }
  if (sharedResumeFailed.delete(id)) { renderMessages(); refocus(); }
  if (tab) tab.location.href = url;
  else {
    const link = Object.assign(document.createElement('a'), { href: url, target: '_blank', rel: 'noopener noreferrer' });
    document.body.append(link); link.click(); link.remove();
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
  form.insertAdjacentHTML('afterbegin', `<div class="chat-compose-tools"><button class="chat-compose-icon" id="chat-emoji-toggle" type="button" aria-label="Open emoji picker" aria-expanded="false">☺</button><button class="chat-compose-icon" id="chat-attach-toggle" type="button" aria-label="Open attachment options" aria-expanded="false">${CHAT_ATTACH_ICON}</button><button class="chat-share-toggle" id="chat-share-toggle" type="button" aria-label="Share" aria-expanded="false" aria-controls="chat-share-menu" hidden><span class="chat-share-glyph" aria-hidden="true">${CHAT_PLUS_ICON}</span></button><div class="chat-share-menu" id="chat-share-menu" role="group" aria-label="Share in this chat" hidden></div><div class="chat-emoji-picker" id="chat-emoji-picker" hidden><button type="button" data-chat-emoji="😀">😀</button><button type="button" data-chat-emoji="😂">😂</button><button type="button" data-chat-emoji="😍">😍</button><button type="button" data-chat-emoji="🔥">🔥</button><button type="button" data-chat-emoji="👏">👏</button><button type="button" data-chat-emoji="✨">✨</button><button type="button" data-chat-emoji="🤝">🤝</button><button type="button" data-chat-emoji="❤️">❤️</button></div><div class="chat-attachment-menu" id="chat-attachment-menu" hidden><button type="button" data-chat-picker="photo">PHOTO / VIDEO</button><button type="button" data-chat-picker="document">DOCUMENT</button><button type="button" data-chat-picker="gif">GIF</button><button type="button" data-chat-picker="camera">CAMERA</button></div></div>`);
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
    closeShareMenu();
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
  // Capture phase: controls such as the chat "..." button and the chat-row avatar stop propagation (the A3 rule).
  document.addEventListener('click', (event) => { if (!form.contains(event.target)) closeMenus(); }, true);
  bindChatShare(form, closeMenus);
  // D5: typing signals (throttled in chat-typing.js); clearing the draft ends the burst.
  input?.addEventListener('input', () => { if (input.value.trim()) noteTyping(); else typingSession?.sender.stop(); });
  // The "+" (D4) takes 44 px of the row: on phones the placeholder gets shorter so it is never clipped.
  const fullPlaceholder = input?.getAttribute('placeholder') || 'Write a thoughtful message...';
  const narrowComposer = window.matchMedia('(max-width: 480px)');
  const tinyComposer = window.matchMedia('(max-width: 360px)');
  const fitPlaceholder = () => { if (input) input.placeholder = tinyComposer.matches ? 'Message...' : narrowComposer.matches ? 'Write a message...' : fullPlaceholder; };
  fitPlaceholder();
  narrowComposer.addEventListener?.('change', fitPlaceholder);
  tinyComposer.addEventListener?.('change', fitPlaceholder);
};
ensureChatComposer();
// extra: further columns for a plain text message (the area share sends message_type 'text' explicitly).
const insertChatMessage = async (body, attachment = null, extra = null) => {
  if (selectedChat && readBlockedUserIds().has(String(selectedChat.id))) {
    throw new Error('This user is blocked. Unblock the user before sending a message.');
  }
  const payload = { sender_id: memberProfile.id, recipient_id: selectedChat.id, body: body || '' };
  // A resume message names the sender's own resumes/<id>/resume.pdf and carries no URL (0012 §D).
  if (attachment?.kind === 'resume') Object.assign(payload, resumeMessageFields(attachment));
  else if (attachment) Object.assign(payload, {
    message_type: attachment.kind,
    attachment_url: attachment.path ? null : attachment.url,
    attachment_path: attachment.path || null,
    attachment_name: attachment.name,
    attachment_mime: attachment.mime,
    attachment_size: attachment.size,
  });
  if (extra) Object.assign(payload, extra);
  const { error } = await supabase.from('brivia_messages').insert(payload);
  if (error) {
    if (attachment) {
      // Roll back a chat upload; never for a resume, which is the member's own file in their Profile.
      if (attachment.path && attachment.kind !== 'resume') await removeMessageAttachment(attachment.path);
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
  typingSession?.sender.stop();
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
    showToast(chatSendErrorCopy(error));
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
  const noNote = event.currentTarget.querySelector('.pitch-no-note');
  const pending = claimPendingPitch();
  if (!pending) return; // already resolved (double submit) or no like in progress
  setBusy(submit, true);
  if (noNote) noNote.disabled = true; // D-071: no second request while the note is in flight
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
    advanceCard(pending.person, 'pitch');
  } finally {
    setBusy(submit, false);
    if (noNote) noNote.disabled = false;
  }
});
// D-071: "Send without a note" resolves the sheet exactly as closing it does (D-018, unchanged: one request with note
// null through dismissPendingPitch, the same quota read and card advance). claimPendingPitch makes a second tap, or a
// tap while SEND PITCH is in flight, a no-op; a tap inside the opening window (the tap that opened the sheet landing
// on it) is ignored, as for the backdrop.
document.querySelector('#pitch-modal .pitch-no-note')?.addEventListener('click', (event) => {
  if (event.currentTarget.disabled || !pendingPitch || performance.now() - pitchOpenedAt < PITCH_OPENING_MS) return;
  closeOverlays();
});
document.querySelector('#logout-button')?.addEventListener('click', logoutMember);
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
    await routeIncompleteMember(onboarding, ownRow);
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
  memberProfile.resumePath = rowProfile.resumePath; // the row's, never a cached copy (0012, D4)
  memberProfile = withoutCredentials(memberProfile);  // never cache a password (Ruling I11)
  memberProfile.email = session.user.email || memberProfile.email || '';
  if (!memberProfile.name || memberProfile.name === 'New Member') memberProfile.name = session.user.user_metadata?.name || 'New Member';
  window.localStorage.setItem('brivia-member-profile', JSON.stringify(memberProfile));
  // Show the authenticated shell as soon as the profile is verified. Optional
  // inbox/notification queries must never leave the whole app invisible.
  document.body.classList.remove('app-auth-pending');
  // The profile needs only the member's own row: show it now rather than after the inbox and the deck have loaded
  // (a slow deck left "New Member" and an empty checklist on the profile meanwhile; Phase C Task 6).
  renderProfile();
  initResume(ownRow);
  if (document.body.dataset.appView === 'profile' && profileInterests.status === 'idle') loadProfileInterests();
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
  if (document.body.dataset.appView === 'profile' && profileInterests.status === 'idle') loadProfileInterests();
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
  // Back from "Sign in with Google again" (R5 re-auth): reopen the delete dialog on the profile view, but only for the
  // same member who asked (F3): another account picked in Google's chooser gets nothing, and the marker is dropped.
  let reauthReturn = false;
  try { const raw = window.sessionStorage.getItem(REAUTH_DELETE_KEY); window.sessionStorage.removeItem(REAUTH_DELETE_KEY); reauthReturn = reauthMarkerMatches(raw, session.user.id); } catch { /* storage unavailable */ }
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

