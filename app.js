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
import { supabase, rowToProfile, saveProfile, uploadMessageAttachment, removeMessageAttachment, uploadCommunityPostImage, removeCommunityPostImage } from './supabase.js';
import { defaultCoverUrl, normalizeCoverUrl } from './cover-assets.js';
import { chatEmojiCategories } from './chat-emoji-data.js';
import { chatGifCatalog } from './chat-gif-data.js';
import './chat-attachments.css';
import './mobile-final-fixes.css';
import './community-feed.css';
import './chat-empty-state.css';

document.body.classList.add('app-auth-pending');
let appBackGuardActive = false;
 

// Never render cached profile data as the current user. The authenticated
// Supabase session and completed profile are the source of truth.
let memberProfile = {};

let people = [];
let remoteMatchIds = [];
let remoteConnectionIds = [];
let notifications = [];

let currentIndex = 0;
let currentPerson = people[0];
let activeFilter = 'all';
const exploreFilters = { query: '', location: '', skills: new Set(), lookingFor: new Set() };
const filterDrafts = { location: '', skills: '', lookingFor: '' };
let activeChatFilter = 'all';
let chatSearchQuery = '';
let selectedChat = null;
let chatShouldOpenAtLatest = false;
let suppressChatAutoOpen = false;
let pitchPerson = null;
const chatMessages = {};
const readChatIds = new Set();
let messageSyncTimer = null;
const overlayIds = ['info-modal', 'pitch-modal'];
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
    return supabase.from('brivia_blocks').upsert({ blocker_id: memberProfile.id, blocked_id: personId }, { onConflict: 'blocker_id,blocked_id' });
  }
  return supabase.from('brivia_blocks').delete().eq('blocker_id', memberProfile.id).eq('blocked_id', personId);
};
const blockedDatabaseMessage = (error) => /brivia_blocks|relation|schema cache|row-level security|policy/i.test(error?.message || '')
  ? 'Block setup is not enabled yet. Run supabase/blocking.sql in Supabase SQL Editor once.'
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
const notificationPreview = (message) => message?.body || (message?.attachment_url ? 'Sent an attachment.' : 'Sent you a message.');
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
  const unreadCount = enabled ? notifications.filter((notification) => !notification.read).length : 0;
  button.toggleAttribute('hidden', !enabled);
  if (!enabled) closeNotificationPanel();
  badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
  badge.toggleAttribute('hidden', unreadCount === 0);
  button.classList.toggle('has-unread', unreadCount > 0);
  button.setAttribute('aria-label', enabled ? (unreadCount ? `${unreadCount} unread notifications` : 'Notifications') : 'Notifications are off');
  const grouped = new Map();
  notifications.filter((notification) => !notification.read).forEach((notification) => {
    const key = String(notification.personId);
    const group = grouped.get(key) || { personId: key, count: 0, latest: notification };
    group.count += 1;
    if (new Date(notification.createdAt || 0) > new Date(group.latest.createdAt || 0)) group.latest = notification;
    grouped.set(key, group);
  });
  const unreadGroups = [...grouped.values()].sort((a, b) => new Date(b.latest.createdAt || 0) - new Date(a.latest.createdAt || 0));
  list.innerHTML = !enabled ? '<p class="notification-empty">Notifications are off in settings.</p>' : unreadGroups.length ? unreadGroups.map((group) => {
    const person = findPersonById(group.personId);
    const title = person?.name || 'a Brivia member';
    const messageLabel = `${group.count} message${group.count === 1 ? '' : 's'} from ${title}`;
    return `<button type="button" class="notification-item is-unread" data-notification-person="${escapeHtml(group.personId)}">${renderAvatar(person, 'notification-avatar')}<span class="notification-copy"><strong>${escapeHtml(messageLabel)}</strong></span><time>${escapeHtml(formatNotificationTime(group.latest.createdAt))}</time></button>`;
  }).join('') : '<p class="notification-empty">You are all caught up.</p>';
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
    if (shouldOpen) { panel?.removeAttribute('hidden'); button.setAttribute('aria-expanded', 'true'); renderNotifications(); }
  });
  document.querySelector('#notification-mark-all')?.addEventListener('click', () => {
    notifications = notifications.map((notification) => ({ ...notification, read: true }));
    saveNotifications();
    renderNotifications();
  });
  document.addEventListener('click', (event) => { if (!panel?.contains(event.target) && event.target !== button) closeNotificationPanel(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNotificationPanel(); });
};

const DAILY_SWIPE_LIMIT = 15;
const SWIPE_RESET_WINDOW_MS = 24 * 60 * 60 * 1000;
let dailySwipeResetTimer;
const dailySwipeStorageKey = () => `brivia-daily-swipes:${memberProfile.id || 'anonymous'}`;
const readDailySwipeState = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(dailySwipeStorageKey()) || 'null');
    const count = Math.min(DAILY_SWIPE_LIMIT, Math.max(0, Number(saved?.count) || 0));
    let resetAt = Number(saved?.resetAt) || null;
    if (resetAt && Date.now() >= resetAt) return { count: 0, resetAt: null };
    // Migrate an older limit record that did not save its reset timestamp.
    if (count >= DAILY_SWIPE_LIMIT && !resetAt) {
      resetAt = Date.now() + SWIPE_RESET_WINDOW_MS;
      try { window.localStorage.setItem(dailySwipeStorageKey(), JSON.stringify({ ...saved, count, resetAt })); } catch { /* Continue if storage is unavailable. */ }
    }
    return { count, resetAt };
  } catch {
    return { count: 0, resetAt: null };
  }
};
const dailySwipeCount = () => readDailySwipeState().count;
const dailySwipeLimitReached = () => {
  const state = readDailySwipeState();
  return state.count >= DAILY_SWIPE_LIMIT && (!state.resetAt || Date.now() < state.resetAt);
};
const recordDailySwipe = () => {
  const state = readDailySwipeState();
  if (state.count >= DAILY_SWIPE_LIMIT) return false;
  state.count += 1;
  if (state.count === DAILY_SWIPE_LIMIT) state.resetAt = Date.now() + SWIPE_RESET_WINDOW_MS;
  try { window.localStorage.setItem(dailySwipeStorageKey(), JSON.stringify(state)); } catch { /* Continue for this session if storage is unavailable. */ }
  return true;
};
const updateDailySwipeUi = () => {
  const state = readDailySwipeState();
  const remaining = Math.max(0, DAILY_SWIPE_LIMIT - state.count);
  const counter = document.querySelector('#swipe-daily-count');
  if (counter) counter.textContent = `${remaining} SWIPES LEFT`;
  const inlineCounter = document.querySelector('#swipe-left-count');
  if (inlineCounter) inlineCounter.textContent = String(remaining);
  const resetTime = document.querySelector('#swipe-reset-time');
  if (resetTime && state.resetAt) {
    const resetAt = new Date(state.resetAt);
    const millisecondsLeft = Math.max(0, resetAt.getTime() - Date.now());
    const totalSeconds = Math.ceil(millisecondsLeft / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const countdown = hours > 0
      ? `${hours}h ${String(minutes).padStart(2, '0')}m`
      : `${minutes}m ${String(seconds).padStart(2, '0')}s`;
    const timeLabel = resetAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    resetTime.textContent = `Resets at ${timeLabel} · in ${countdown}`;
  } else if (resetTime) resetTime.textContent = '';
};
const scheduleDailySwipeReset = () => {
  window.clearInterval(dailySwipeResetTimer);
  let wasLimited = dailySwipeLimitReached();
  const refresh = () => {
    updateDailySwipeUi();
    const isLimited = dailySwipeLimitReached();
    if (wasLimited && !isLimited) renderHome();
    wasLimited = isLimited;
  };
  refresh();
  dailySwipeResetTimer = window.setInterval(refresh, 1000);
};

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

const renderAvatar = (person, className = 'mini-avatar') => person?.image ? `<div class="${className}"><img src="${person.image}" alt="${escapeHtml(person.name)}" /></div>` : `<div class="${className}">${escapeHtml(initials(person?.name))}</div>`;

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
  const location = normalizedValue([person.city, person.state].filter(Boolean).join(', '));
  const hasLocation = !exploreFilters.location || location.includes(exploreFilters.location);
  const hasName = !query || normalizedValue(person.name).includes(query);
  return hasName && hasLocation && hasSkill && hasLookingFor && hasSkillSearch && hasLookingSearch;
};
const getExplorePeople = () => people.filter(explorePersonMatches);
const syncExploreQueue = () => {
  const queue = getExplorePeople();
  const currentId = currentPerson?.id;
  if (!queue.length) { currentIndex = 0; currentPerson = null; return queue; }
  const matchingIndex = currentId ? queue.findIndex((person) => person.id === currentId) : -1;
  currentIndex = matchingIndex >= 0 ? matchingIndex : 0;
  currentPerson = queue[currentIndex];
  return queue;
};

const renderHome = (queue = getExplorePeople()) => {
  const card = document.querySelector('#swipe-card');
  const actions = document.querySelector('.swipe-actions');
  const hint = document.querySelector('.swipe-hint');
  const limitState = document.querySelector('#swipe-limit-state');
  let emptyState = document.querySelector('#home-empty-state');
  if (!emptyState && card?.parentElement) {
    emptyState = document.createElement('p');
    emptyState.id = 'home-empty-state';
    emptyState.className = 'empty-state';
    emptyState.textContent = 'No members in the community yet.';
    card.parentElement.append(emptyState);
  }
  if (!currentPerson) {
    card?.setAttribute('hidden', '');
    actions?.setAttribute('hidden', '');
    hint?.setAttribute('hidden', '');
    limitState?.setAttribute('hidden', '');
    if (emptyState) {
      const hasFilters = exploreFilters.query || exploreFilters.location || exploreFilters.skills.size || exploreFilters.lookingFor.size;
      emptyState.textContent = hasFilters ? 'No people match these filters.' : 'No members in the community yet.';
    }
    emptyState?.removeAttribute('hidden');
    const count = document.querySelector('#queue-count'); if (count) count.textContent = '00 / 00';
    return;
  }
  if (dailySwipeLimitReached()) {
    card?.setAttribute('hidden', '');
    actions?.setAttribute('hidden', '');
    hint?.setAttribute('hidden', '');
    emptyState?.setAttribute('hidden', '');
    limitState?.removeAttribute('hidden');
    const count = document.querySelector('#queue-count'); if (count) count.textContent = `${DAILY_SWIPE_LIMIT} / ${DAILY_SWIPE_LIMIT}`;
    updateDailySwipeUi();
    return;
  }
  card?.removeAttribute('hidden');
  actions?.removeAttribute('hidden');
  hint?.removeAttribute('hidden');
  limitState?.setAttribute('hidden', '');
  emptyState?.setAttribute('hidden', '');
  updateDailySwipeUi();
  const image = document.querySelector('#swipe-image');
  if (image) { image.src = currentPerson.coverUrl || currentPerson.image || ''; image.alt = `${currentPerson.name} cover image`; }
  if (card) card.style.setProperty('--card-avatar-image', `url("${currentPerson.image || ''}")`);
  const name = document.querySelector('#swipe-name'); if (name) name.textContent = currentPerson.name;
  const handle = document.querySelector('#swipe-location'); if (handle) handle.textContent = `@${currentPerson.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
  const cardLabel = document.querySelector('#swipe-card-label');
  if (cardLabel) {
    const profileText = `${currentPerson.role || ''} ${currentPerson.lookingFor || ''} ${(currentPerson.tags || []).join(' ')}`.toLowerCase();
    cardLabel.textContent = /engineer|developer|ai|tech|system|build/.test(profileText) ? 'BUILDING' : /marketing|content|brand|impact|startup/.test(profileText) ? 'IDEAS TO IMPACT' : 'CREATIVE SOUL';
  }
  const role = document.querySelector('#swipe-role'); if (role) role.textContent = currentPerson.role;
  const location = document.querySelector('#swipe-location'); if (location) location.textContent = `@${currentPerson.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
  const tags = document.querySelector('#swipe-tags'); if (tags) tags.innerHTML = currentPerson.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
  const count = document.querySelector('#queue-count'); if (count) count.textContent = `${String(currentIndex + 1).padStart(2, '0')} / ${String(people.length).padStart(2, '0')}`;
  const filteredQueueCount = document.querySelector('#queue-count');
  if (filteredQueueCount) filteredQueueCount.textContent = String(currentIndex + 1).padStart(2, '0') + ' / ' + String(queue.length).padStart(2, '0');
  card?.classList.remove('is-passing', 'is-liking');
};

const saveMatches = async (person) => {
  if (!supabase || !memberProfile.id || !person?.id) return false;
  const { error } = await supabase.from('matches').upsert({ user1_id: memberProfile.id, user2_id: person.id }, { onConflict: 'user1_id,user2_id' });
  if (error) {
    console.warn('Match could not be saved:', error.message);
    return false;
  }
  if (!remoteMatchIds.includes(person.id)) remoteMatchIds.push(person.id);
  if (!remoteConnectionIds.some((id) => String(id) === String(person.id))) remoteConnectionIds.push(person.id);
  restoreChatForMe(person.id);
  renderChats();
  return true;
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
  records.unshift({ id: String(person.id), name: person.name || 'Brivia member', city: person.city || '', image: person.image || '', removedAt: new Date().toISOString() });
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
const closeOverlays = () => overlayIds.forEach((id) => document.querySelector(`#${id}`)?.setAttribute('hidden', ''));

const fillInfo = (person) => {
  const avatar = document.querySelector('#info-avatar');
  if (avatar) avatar.innerHTML = person.image ? `<img src="${person.image}" alt="${escapeHtml(person.name)}" />` : escapeHtml(initials(person.name));
  const infoName = document.querySelector('#info-name'); if (infoName) infoName.textContent = `${person.name}, ${person.age}`;
  const infoRole = document.querySelector('#info-role'); if (infoRole) infoRole.textContent = `${person.role} · ${person.city}`;
  const infoBio = document.querySelector('#info-bio'); if (infoBio) infoBio.textContent = person.bio;
  const facts = document.querySelector('#info-facts'); if (facts) facts.innerHTML = `<div><span>BASED IN</span><strong>${escapeHtml(person.city)}</strong></div><div><span>INTERESTED IN</span><strong>${escapeHtml(person.tags[0])}</strong></div>`;
  const tags = document.querySelector('#info-tags'); if (tags) tags.innerHTML = person.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
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
  const location = [profile.city, profile.state].filter(Boolean).join(', ') || 'Brivia Club member';
  const modal = document.createElement('div');
  modal.id = 'public-profile-modal';
  modal.className = 'public-profile-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', `${profile.name || 'Member'} public profile`);
  modal.innerHTML = `<button class="public-profile-backdrop" type="button" data-public-profile-close aria-label="Close profile"></button><section class="public-profile-dialog"><button class="public-profile-close" type="button" data-public-profile-close aria-label="Close profile">×</button><div class="public-profile-cover"><div class="public-profile-avatar">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(profile.name)}" />` : escapeHtml(initials(profile.name))}</div></div><div class="public-profile-body"><p class="public-profile-kicker">BRIVIA MEMBER / PUBLIC PROFILE</p><h2>${escapeHtml(profile.name || 'Brivia member')}</h2><p class="public-profile-role">${escapeHtml(profile.role || 'Brivia member')}</p><p class="public-profile-location">${escapeHtml(location)}</p><p class="public-profile-bio">${escapeHtml(profile.bio || 'Open to meaningful connections inside the club.')}</p><div class="public-profile-facts"><div><span>LOOKING FOR</span><strong>${escapeHtml(lookingFor.join(', ') || 'Meaningful connections')}</strong></div><div><span>SKILLS &amp; INTERESTS</span><strong>${escapeHtml(skills.join(', ') || tags.join(', ') || 'Open to connect')}</strong></div></div><div class="public-profile-pills">${tags.length ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') : '<span>Open to connect</span>'}</div></div></section>`;
  document.body.append(modal);
  modal.querySelector('.public-profile-cover').style.backgroundImage = `url("${coverUrl.replace(/"/g, '%22')}")`;
  const close = () => modal.remove();
  modal.addEventListener('click', (event) => { if (event.target.closest('[data-public-profile-close]')) close(); });
  modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  modal.tabIndex = -1;
  window.setTimeout(() => modal.focus(), 0);
};

const openPitch = (person) => {
  pitchPerson = person;
  const pitchName = document.querySelector('#pitch-name'); if (pitchName) pitchName.textContent = person.name;
  const pitchMessage = document.querySelector('#pitch-message'); if (pitchMessage) pitchMessage.value = `Hey ${person.name}, I noticed we both care about ${person.tags[0].toLowerCase()}. Would love to connect and exchange ideas.`;
  openOverlay('pitch-modal');
  window.setTimeout(() => pitchMessage?.focus(), 80);
};

const swipe = (type) => {
  if (!currentPerson) return;
  if (!recordDailySwipe()) {
    renderHome();
    showToast('FREE LIMIT EXCEEDED — COME TOMORROW');
    return;
  }
  const card = document.querySelector('#swipe-card');
  card?.classList.add(type === 'like' ? 'is-liking' : 'is-passing');
  if (type === 'like') { saveMatches(currentPerson); openPitch(currentPerson); }
  window.setTimeout(() => {
    const queue = getExplorePeople();
    if (!queue.length) { currentPerson = null; currentIndex = 0; } else { currentIndex = (currentIndex + 1) % queue.length; currentPerson = queue[currentIndex]; }
    renderExplore();
  }, 280);
};

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
const profileLocationLabel = (person) => [person.city, person.state].filter(Boolean).join(', ');
const getFilterValues = () => ({
  names: uniqueFilterValues(people.map((person) => person.name)),
  locations: uniqueFilterValues(people.map(profileLocationLabel)),
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
  const locationInput = document.querySelector('#filter-location-input');
  const skillsInput = document.querySelector('#filter-skills-input');
  const lookingInput = document.querySelector('#filter-looking-for-input');
  if (!search || !locationInput || !skillsInput || !lookingInput) return;
  const { names, locations, skills, lookingFor } = getFilterValues();
  if (document.activeElement !== search && search.value !== exploreFilters.query) search.value = exploreFilters.query;
  if (document.activeElement !== locationInput && locationInput.value !== filterDrafts.location) locationInput.value = filterDrafts.location;
  if (document.activeElement !== skillsInput && skillsInput.value !== filterDrafts.skills) skillsInput.value = filterDrafts.skills;
  if (document.activeElement !== lookingInput && lookingInput.value !== filterDrafts.lookingFor) lookingInput.value = filterDrafts.lookingFor;
  renderSuggestionList(document.querySelector('#filter-name-suggestions'), names, exploreFilters.query, 'name', new Set(), false);
  renderSuggestionList(document.querySelector('#filter-location-suggestions'), locations, filterDrafts.location, 'location', new Set(), document.activeElement === locationInput);
  renderSelectedFilters(document.querySelector('#filter-skills-selected'), skills, exploreFilters.skills, 'skills');
  renderSuggestionList(document.querySelector('#filter-skills-suggestions'), skills, filterDrafts.skills, 'skills', exploreFilters.skills, document.activeElement === skillsInput);
  renderSelectedFilters(document.querySelector('#filter-looking-for-selected'), lookingFor, exploreFilters.lookingFor, 'looking-for');
  renderSuggestionList(document.querySelector('#filter-looking-for-suggestions'), lookingFor, filterDrafts.lookingFor, 'looking-for', exploreFilters.lookingFor, document.activeElement === lookingInput);
};
const updateDiscoveryFilterResult = (count) => {
  const result = document.querySelector('#discovery-filter-result');
  if (!result) return;
  const activeCount = exploreFilters.skills.size + exploreFilters.lookingFor.size + (exploreFilters.location ? 1 : 0) + (exploreFilters.query ? 1 : 0) + (filterDrafts.skills ? 1 : 0) + (filterDrafts.lookingFor ? 1 : 0);
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
    const haystack = `${person.name} ${person.email || ''} ${person.phone || ''} ${person.city} ${person.state || ''} ${person.role} ${person.experience || ''} ${person.skills || ''} ${person.lookingFor || ''} ${last?.text || ''} ${last?.attachment?.name || ''}`.toLowerCase();
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
  }).join('') : '<div class="inbox-empty"><strong>No threads found</strong><span>Send a pitch from Explore to open a private conversation.</span><button type="button" class="inbox-empty-action" data-nav="explore">EXPLORE PEOPLE ↗</button></div>'}`;
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
      attachment: message.attachment_url ? {
        url: message.attachment_url,
        path: message.attachment_path || '',
        name: message.attachment_name || 'Attachment',
        mime: message.attachment_mime || '',
        kind: message.message_type || ((message.attachment_mime || '').startsWith('video/') ? 'video' : 'document'),
        size: Number(message.attachment_size) || 0,
      } : null,
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
      return !previous || previous.id !== message.id || previous.text !== message.text || previous.createdAt !== message.createdAt || previous.attachment?.url !== message.attachment?.url;
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
    attachment: message.attachment_url ? {
      url: message.attachment_url,
      path: message.attachment_path || '',
      name: message.attachment_name || 'Attachment',
      mime: message.attachment_mime || '',
      kind: message.message_type || ((message.attachment_mime || '').startsWith('video/') ? 'video' : 'document'),
      size: Number(message.attachment_size) || 0,
    } : null,
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
  };
  sync();
  messageSyncTimer = window.setInterval(sync, 5000);
};

const syncIncomingNotificationsFromServer = async () => {
  if (!supabase || !memberProfile.id) return;
  const { data, error } = await supabase.from('brivia_messages').select('id,sender_id,recipient_id,body,created_at,attachment_url').eq('recipient_id', memberProfile.id).order('created_at', { ascending: false }).limit(80);
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
    avatar.innerHTML = person.image ? `<img src="${person.image}" alt="${escapeHtml(person.name)}" />` : escapeHtml(initials(person.name));
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
    if (!attachment?.url) return '';
    const url = escapeHtml(attachment.url);
    const name = escapeHtml(attachment.name || 'Attachment');
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
const completeChatAction = async (action) => {
  const person = selectedChat;
  if (!person) return;
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
        ? 'Run supabase/connection-removal.sql once in Supabase SQL Editor.'
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
    const remoteResult = await saveRemoteBlock(person.id, true);
    if (remoteResult.error) { showToast(blockedDatabaseMessage(remoteResult.error)); return; }
    const blockedIds = readBlockedUserIds();
    blockedIds.add(String(person.id));
    if (!saveBlockedUserIds(blockedIds)) { showToast('Could not block this user. Please try again.'); return; }
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
  if (!document.querySelector('#chat-more')) header.insertAdjacentHTML('beforeend', '<button class="chat-more" id="chat-more" type="button" aria-label="More chat options" aria-expanded="false">•••</button><div class="chat-more-menu" id="chat-more-menu" hidden><button type="button" data-chat-action="delete">Delete chat</button><button type="button" data-chat-action="remove-connection">Remove connection</button><button type="button" data-chat-action="block">Block user</button></div>');
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
  menu.innerHTML = '<button type="button" data-profile-setting="notifications">NOTIFICATIONS</button><button type="button" data-profile-setting="block">BLOCKED USERS</button><button type="button" data-profile-setting="removed">REMOVED CONNECTIONS</button><button type="button" data-profile-setting="logout">LOG OUT</button>';
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
        <label><span>CITY</span><input name="city" value="${escapeHtml(profile.city || '')}" /></label>
        <label><span>STATE</span><input name="state" value="${escapeHtml(profile.state || '')}" /></label>
        <label class="profile-edit-wide"><span>SKILLS / INTERESTS</span><input name="skills" list="profile-edit-skills-options" value="${escapeHtml(profile.skills || '')}" placeholder="Search or type skills, separated by commas" /><datalist id="profile-edit-skills-options">${profileEditDatalist('skills')}</datalist><small class="profile-edit-helper">Choose from suggestions or type your own.</small></label>
        <label class="profile-edit-wide"><span>LOOKING FOR</span><input name="lookingFor" list="profile-edit-looking-options" value="${escapeHtml(profile.lookingFor || '')}" placeholder="Search or type what you are looking for" /><datalist id="profile-edit-looking-options">${profileEditDatalist('lookingFor')}</datalist><small class="profile-edit-helper">Choose from suggestions or type your own.</small></label>
        <label><span>PROFILE PHOTO</span><input name="photoFile" type="file" accept="image/*" /></label>
        <label><span>COVER PHOTO</span><input name="coverFile" type="file" accept="image/*" /></label>
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
      city: String(formData.get('city') || '').trim(),
      state: String(formData.get('state') || '').trim(),
      experience: String(formData.get('experience') || '').trim(),
      skills: String(formData.get('skills') || '').trim(),
      lookingFor: String(formData.get('lookingFor') || '').trim(),
    };
    const photoFile = form.querySelector('[name="photoFile"]')?.files?.[0] || null;
    const coverFile = form.querySelector('[name="coverFile"]')?.files?.[0] || null;
    if (!nextProfile.name) { feedback.textContent = 'Please add your name.'; return; }
    submit.disabled = true;
    feedback.textContent = 'Saving your profile...';
    const { data, error } = await saveProfile(memberProfile.id, nextProfile, photoFile, coverFile);
    if (error) {
      submit.disabled = false;
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
    const members = people.filter((person) => blockedIds.has(String(person.id)));
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
          ? 'Removal is not enabled yet. Run supabase/connection-removal.sql in Supabase SQL Editor once.'
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
  document.querySelector('#profile-location').textContent = `${profile.city || 'Your city'}, ${profile.state || 'Your state'}`;
  const profileCover = document.querySelector('#profile-cover-image');
  if (profileCover) profileCover.style.backgroundImage = `url("${coverUrl}")`;
  const profileSidebarCover = document.querySelector('#profile-sidebar-cover');
  if (profileSidebarCover) profileSidebarCover.style.backgroundImage = `url("${coverUrl}")`;
  const avatar = document.querySelector('#profile-avatar');
  if (avatar) avatar.innerHTML = profile.photoUrl ? `<img src="${profile.photoUrl}" alt="${escapeHtml(profile.name)}" />` : escapeHtml(initials(profile.name));
  if (avatar && profile.photoName) avatar.title = profile.photoName;
  document.querySelector('#profile-email').textContent = profile.email || '—';
  document.querySelector('#profile-login-email').textContent = profile.email || '—';
  document.querySelector('#profile-phone').textContent = profile.phone || '—';
  document.querySelector('#profile-city').textContent = profile.city || '—';
  document.querySelector('#profile-state').textContent = profile.state || '—';
  const skills = (profile.skills || '').split(',').map((skill) => skill.trim()).filter(Boolean);
  const lookingFor = (profile.lookingFor || '').split(',').map((item) => item.trim()).filter(Boolean);
  const statEmail = document.querySelector('#profile-stat-email');
  const statCity = document.querySelector('#profile-stat-city');
  const statState = document.querySelector('#profile-stat-state');
  if (statEmail) statEmail.textContent = profile.email || 'â€”';
  if (statCity) statCity.textContent = profile.city || 'â€”';
  if (statState) statState.textContent = profile.state || 'â€”';
  document.querySelector('#profile-skills').innerHTML = skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') : '<span>No skills added yet</span>';
  document.querySelector('#profile-looking').innerHTML = lookingFor.length ? lookingFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Add your intentions to find better connections.</span>';
  const statLooking = document.querySelector('#profile-stat-looking');
  const statSkills = document.querySelector('#profile-stat-skills');
  if (statLooking) statLooking.innerHTML = lookingFor.length ? lookingFor.map((item) => `<span>${escapeHtml(item)}</span>`).join('') : '<span>Add your intentions</span>';
  if (statSkills) statSkills.innerHTML = skills.length ? skills.map((skill) => `<span>${escapeHtml(skill)}</span>`).join('') : '<span>Add a skill</span>';
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
    return `<article class="community-post-card"><div class="community-post-image-wrap community-post-profile-trigger" data-public-profile-id="${escapeHtml(authorId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(author.name)} profile"><span class="community-post-media-label">COMMUNITY</span><img src="${escapeHtml(post.image_url)}" alt="Post by ${escapeHtml(author.name)}" loading="lazy" /></div><div class="community-post-card-body"><div class="community-post-card-top"><span class="community-post-pill">POST</span><span class="community-post-more" aria-hidden="true">•••</span></div><h3>${escapeHtml(post.caption)}</h3><div class="community-post-author" data-public-profile-id="${escapeHtml(authorId)}" role="button" tabindex="0" aria-label="Open ${escapeHtml(author.name)} profile">${renderAvatar({ name: author.name, image: author.image }, 'community-post-avatar')}<div><strong>POSTED BY ${escapeHtml(author.name).toUpperCase()}</strong><span>${formatCommunityPostDate(post.created_at)}</span></div></div></div></article>`;
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
      ? '<div class="community-post-empty"><span>✦</span><h2>Community posts<br /><em>are almost here.</em></h2><p>Run <strong>supabase/community-posts.sql</strong> once to enable shared posts.</p></div>'
      : `<div class="community-post-empty"><span>!</span><h2>Could not load<br /><em>the feed.</em></h2><p>${escapeHtml(error.message || 'Please try again.')}</p></div>`;
    return;
  }
  communityPosts = data || [];
  communityPostAuthors = {};
  const authorIds = [...new Set(communityPosts.map((post) => post.author_id).filter(Boolean))];
  if (authorIds.length) {
    const authors = await supabase.from('profiles').select('*').in('id', authorIds);
    if (!authors.error) (authors.data || []).forEach((author) => {
      const authorProfile = rowToProfile(author);
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
  if (feedback) feedback.textContent = 'Publishing your post...';
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
    if (feedback) feedback.textContent = /community_posts|relation|schema cache/i.test(error.message || '')
      ? 'Run supabase/community-posts.sql once, then try again.'
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
document.querySelectorAll('[data-close-overlay]').forEach((button) => button.addEventListener('click', closeOverlays));
const discoveryFilterDrawer = document.querySelector('#discovery-filter-drawer');
const discoveryFilterButton = document.querySelector('#open-discovery-filters');
const closeDiscoveryFilters = () => {
  discoveryFilterDrawer?.setAttribute('hidden', '');
  discoveryFilterButton?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('discovery-filters-open');
};
discoveryFilterButton?.addEventListener('click', () => {
  renderFilterOptions();
  discoveryFilterDrawer?.removeAttribute('hidden');
  discoveryFilterButton.setAttribute('aria-expanded', 'true');
  document.body.classList.add('discovery-filters-open');
  window.setTimeout(() => document.querySelector('#drawer-filter-search')?.focus(), 80);
});
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
  } else if (kind === 'location') {
    exploreFilters.location = normalizedValue(value);
    filterDrafts.location = value;
    const input = document.querySelector('#filter-location-input');
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
  ['#drawer-filter-search', (value) => { exploreFilters.query = value; }],
  ['#filter-location-input', (value) => { filterDrafts.location = value; exploreFilters.location = normalizedValue(value); }],
  ['#filter-skills-input', (value) => { filterDrafts.skills = value; }],
  ['#filter-looking-for-input', (value) => { filterDrafts.lookingFor = value; }],
];
filterInputBindings.forEach(([selector, update]) => {
  const input = document.querySelector(selector);
  input?.addEventListener('input', (event) => { update(event.target.value); renderExplore(); });
  input?.addEventListener('focus', () => renderExplore());
});
document.querySelector('#clear-discovery-filters')?.addEventListener('click', () => {
  exploreFilters.query = '';
  exploreFilters.location = '';
  exploreFilters.skills.clear();
  exploreFilters.lookingFor.clear();
  filterDrafts.location = '';
  filterDrafts.skills = '';
  filterDrafts.lookingFor = '';
  renderExplore();
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
const getChatFileKind = (file) => {
  const mime = file.type || '';
  return mime === 'image/gif' ? 'gif' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document';
};
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
const renderPendingChatFiles = () => {
  const preview = document.querySelector('#chat-attachment-preview');
  if (!preview) return;
  preview.hidden = !pendingChatFiles.length;
  preview.innerHTML = pendingChatFiles.map((entry, index) => {
    const media = entry.kind === 'image' || entry.kind === 'gif'
      ? `<img src="${entry.previewUrl}" alt="" />`
      : entry.kind === 'video'
        ? `<video src="${entry.previewUrl}" muted preload="metadata"></video>`
        : '<span class="chat-file-preview-icon">↗</span>';
    return `<div class="chat-attachment-chip"><span class="chat-attachment-thumb">${media}</span><span class="chat-attachment-chip-copy"><strong>${escapeHtml(entry.file.name)}</strong><small>${entry.kind.toUpperCase()} · ${formatFileSize(entry.file.size)}</small></span><button type="button" data-remove-chat-file="${index}" aria-label="Remove ${escapeHtml(entry.file.name)}">×</button></div>`;
  }).join('');
  if (pendingChatGif) {
    preview.innerHTML += `<div class="chat-attachment-chip"><span class="chat-attachment-thumb"><img src="${escapeHtml(pendingChatGif.url)}" alt="${escapeHtml(pendingChatGif.label)} GIF" /></span><span class="chat-attachment-chip-copy"><strong>${escapeHtml(pendingChatGif.label)} GIF</strong><small>GIF · READY TO SEND</small></span><button type="button" data-remove-chat-gif aria-label="Remove GIF">×</button></div>`;
  }
  preview.hidden = !pendingChatFiles.length && !pendingChatGif;
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
    attachment_url: attachment.url,
    attachment_path: attachment.path,
    attachment_name: attachment.name,
    attachment_mime: attachment.mime,
    attachment_size: attachment.size,
  });
  const { error } = await supabase.from('brivia_messages').insert(payload);
  if (error) {
    if (attachment) {
      if (attachment.path) await removeMessageAttachment(attachment.path);
      if (/column|schema cache|message_type|attachment_/i.test(error.message || '')) throw new Error('Run supabase/chat-attachments.sql once to enable chat media.');
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
    const files = pendingChatFiles.map((entry) => entry.file);
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
    showToast(/row-level security|policy|brivia_is_blocked_between|blocked/i.test(error?.message || '')
      ? 'This conversation is blocked. Unblock the user before sending a message.'
      : (error.message || 'Message could not be saved.'));
  } finally {
    if (sendButton) sendButton.disabled = false;
  }
});
document.querySelector('#pitch-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const target = pitchPerson || currentPerson;
  const input = document.querySelector('#pitch-message');
  const body = input?.value.trim();
  if (!target || !body || !supabase || !memberProfile.id) return;
  const matchSaved = await saveMatches(target);
  if (!matchSaved) console.warn('Match row was not saved; continuing with the chat message.');
  const { error } = await supabase.from('brivia_messages').insert({ sender_id: memberProfile.id, recipient_id: target.id, body });
  if (error) { showToast(`Pitch could not be saved: ${error.message}`); return; }
  if (!remoteMatchIds.includes(target.id)) remoteMatchIds.push(target.id);
  renderChats();
  await loadChatMessages(target);
  closeOverlays();
  showToast(`Pitch sent to ${target.name}.`);
  pitchPerson = null;
});
document.querySelector('#logout-button')?.addEventListener('click', logoutMember);
document.querySelector('#app-logout-button')?.addEventListener('click', logoutMember);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { closeOverlays(); closeDiscoveryFilters(); } if (event.key === 'ArrowRight') swipe('like'); if (event.key === 'ArrowLeft') swipe('pass'); });

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
  delete memberProfile.loginPassword;
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
        attachment: message.attachment_url ? {
          url: message.attachment_url,
          path: message.attachment_path || '',
          name: message.attachment_name || 'Attachment',
          mime: message.attachment_mime || '',
          kind: message.message_type || ((message.attachment_mime || '').startsWith('video/') ? 'video' : 'document'),
          size: Number(message.attachment_size) || 0,
        } : null,
      });
    });
    remoteMatchIds = [...inboxIds];
  } else console.warn('Inbox could not load:', inboxError.message);
  // Sort locally so Explore still loads if created_at is missing from an older schema cache.
  const { data: rows, error } = await supabase.from('profiles').select('*').neq('id', session.user.id);
  if (!error && rows?.length) {
    rows.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    people = rows.map((row) => {
      const profile = rowToProfile(row);
      const skills = profile.skills.split(',').map((item) => item.trim()).filter(Boolean);
      const looking = profile.lookingFor.split(',').map((item) => item.trim()).filter(Boolean);
      const tags = [...skills, ...looking];
      const filters = ['all', ...tags.map((item) => item.toLowerCase()), profile.experience?.toLowerCase() || ''];
      return { ...profile, age: '', role: profile.experience || 'Brivia member', distance: '', bio: `${profile.name} is open to meaningful connections.`, tags: tags.length ? tags : ['Open to connect'], image: profile.photoUrl || '', filters: filters.filter(Boolean) };
    });
    currentPerson = people[0];
  } else if (error) showToast(`Community could not load: ${error.message}`);
  renderHome();
  renderExplore();
  renderChats();
  renderProfile();
  try { ensureNotificationControls(); renderNotifications(); } catch (error) { console.warn('Notification controls could not load:', error.message); }
  scheduleDailySwipeReset();
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
  document.querySelectorAll('.inbox-empty span').forEach((node) => {
    node.textContent = node.textContent.replace(/\bExplore\b/g, 'Connect');
  });
};
renameExploreToConnect();
new MutationObserver(renameExploreToConnect).observe(document.body, { childList: true, subtree: true });
