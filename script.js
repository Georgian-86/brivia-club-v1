// Shared landing + auth behaviour. Styles come from the page entries (landing-entry.js, auth-entry.js), never from here.
import {
  supabase, supabaseReady, saveProfile, withoutCredentials, isRateLimited, declareAdult, setHomeCity, setMemberInterests,
} from './supabase.js';
import { isPendingExpired, dataUrlToFile } from './pending-profile.js';
import { realName } from './onboarding-guard.js';
import { isComplete, toPayload, budgetFromRows } from './passion-budget.js';
import { AREA_SAVE_ERROR, AREA_RATE_LIMITED } from './area-pick.js';
import { signupMethods } from './signup-flow.js';
import { fillGoogleMark } from './google-mark.js';
import { setBusy } from './app-skeletons.js';
import { initGuidedSignup, openGuidedSignup, openLoginCode, showGuidedFromHistory, showGuidedPending, guidedScreen, guidedAnswers } from './signup-screens.js';
// Registers 18+, Name, Area, Interests and Reveal into the shell.
import { ADULT_SAVE_ERROR, INTERESTS_SAVE_ERROR } from './signup-profile-screens.js';
import { motionAllowed, introPlan, markLoaded, INTRO_CAP_MS, INTRO_START_GRACE_MS } from './landing-motion.js';

document.querySelectorAll('.skeleton img').forEach(markLoaded);

const introBurst = document.querySelector('#intro-burst');
const introSkip = introBurst?.querySelector('.intro-skip');
const introVideo = introBurst?.querySelector('.intro-video');
const landingMotion = motionAllowed({
  reducedMotion: Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
  saveData: Boolean(navigator.connection?.saveData),
});
// First visit only (localStorage, so a new tab or a later visit never replays it). The auth pages set
// sessionStorage 'brivia-skip-intro-once' to skip it once; reduced-motion and save-data visitors get posters only.
let plan = 'play';
try {
  const fromAuth = window.sessionStorage.getItem('brivia-skip-intro-once') === 'true';
  window.sessionStorage.removeItem('brivia-skip-intro-once');
  const seenBefore = window.localStorage.getItem('brivia-intro-seen') === 'true';
  plan = introPlan({ seenBefore, fromAuth });
  if (plan === 'skip' || fromAuth) window.localStorage.setItem('brivia-intro-seen', 'true');
} catch {}
if (!landingMotion) plan = 'skip';
if (introBurst && plan === 'skip') {
  introBurst.remove();
}
if (introBurst && plan === 'play') {
  try { window.localStorage.setItem('brivia-intro-seen', 'true'); } catch {}
  document.body.classList.add('intro-active');
  let introDone = false;
  const finishIntro = (fast = false) => {
    if (introDone) return;
    introDone = true;
    document.body.classList.remove('intro-active');
    if (fast === true) introBurst.style.animationDuration = '.12s';
    introBurst.classList.add('is-skipped');
    window.setTimeout(() => introBurst.remove(), fast === true ? 160 : 500);
  };
  introVideo?.addEventListener('ended', () => window.setTimeout(finishIntro, 400), { once: true });
  if (introVideo) {
    introVideo.muted = true;
    introVideo.preload = 'auto';
    introVideo.play().catch(() => {});
  }
  introSkip?.addEventListener('click', () => finishIntro());
  // Never look stuck: if the video has not started within the grace period, fade out; hard cap either way.
  window.setTimeout(() => { if (!introVideo || introVideo.currentTime === 0) finishIntro(); }, INTRO_START_GRACE_MS);
  // The cap counts from navigation start (not from when this script ran) and leaves room for the 120 ms fade.
  window.setTimeout(() => finishIntro(true), Math.max(0, INTRO_CAP_MS - 150 - Math.round(window.performance?.now?.() || 0)));
}

/* Keep the landing-page music enabled on desktop and mobile. Browsers may
   reject autoplay with sound, so retry immediately on the first real gesture. */
const landingVideos = [...document.querySelectorAll('.hero-video, [data-playground-video]')];
// Videos start late (hero when idle, playground when near the viewport) and never under reduced-motion or save-data.
// Until a video has started, the gesture handler leaves it alone, so nothing is force-loaded. Every video keeps
// `muted` + `playsinline` in the HTML (iOS autoplay); the first user gesture unmutes them as before.
const startedLandingVideos = new Set();
// Set by the first user gesture; a video that starts later (idle hero, playground near the viewport) is unmuted on start.
let landingAudioUnlocked = false;
const playLandingVideo = (video) => {
  video.muted = false;
  video.defaultMuted = false;
  video.volume = 1;
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(() => {});
  });
};
const startLandingVideo = (video) => {
  if (!landingMotion || startedLandingVideos.has(video)) return;
  startedLandingVideos.add(video);
  video.preload = 'auto';
  // After a gesture, start unmuted (the gesture handler has already run, so it cannot do this later); before one, start
  // muted from the HTML attribute without an unmuted attempt the browser would reject.
  if (landingAudioUnlocked) playLandingVideo(video);
  else video.play().catch(() => {});
};
const enableLandingVideoAudio = () => {
  landingAudioUnlocked = true;
  startedLandingVideos.forEach(playLandingVideo);
};
const heroLandingVideo = document.querySelector('.hero-video');
if (landingMotion && heroLandingVideo) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => startLandingVideo(heroLandingVideo), { timeout: 2000 });
  else window.setTimeout(() => startLandingVideo(heroLandingVideo), 1200);
}
const belowFoldVideos = landingVideos.filter((video) => video !== heroLandingVideo);
if (landingMotion && belowFoldVideos.length) {
  if ('IntersectionObserver' in window) {
    const videoObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        startLandingVideo(entry.target);
        videoObserver.unobserve(entry.target);
      });
    }, { rootMargin: '200px' });
    belowFoldVideos.forEach((video) => videoObserver.observe(video));
  } else belowFoldVideos.forEach(startLandingVideo);
}
let landingMusicContext;
let landingMusicGain;
let landingMusicTimer;
const startLandingMusic = () => {
  if (landingMusicContext) {
    if (landingMusicContext.state === 'suspended') landingMusicContext.resume().catch(() => {});
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  landingMusicContext = new AudioContextClass();
  landingMusicGain = landingMusicContext.createGain();
  landingMusicGain.gain.value = 0.045;
  landingMusicGain.connect(landingMusicContext.destination);
  const chord = [220, 277.18, 329.63, 440];
  const playBar = () => {
    if (!landingMusicContext || !landingMusicGain) return;
    const start = landingMusicContext.currentTime + 0.04;
    chord.forEach((frequency, index) => {
      const oscillator = landingMusicContext.createOscillator();
      const gain = landingMusicContext.createGain();
      oscillator.type = index % 2 ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.22 : 0.12, start + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.2);
      oscillator.connect(gain).connect(landingMusicGain);
      oscillator.start(start);
      oscillator.stop(start + 3.25);
    });
  };
  playBar();
  landingMusicTimer = window.setInterval(playBar, 3200);
  window.__briviaLandingAudioEnabled = true;
};
const enableLandingExperienceAudio = () => {
  enableLandingVideoAudio();
  startLandingMusic();
  try { playgroundSoundEnabled = true; } catch { /* The declaration is initialized before user gestures can fire. */ }
};
['pointerdown', 'touchstart', 'keydown'].forEach((eventName) => {
  window.addEventListener(eventName, enableLandingExperienceAudio, { once: true, passive: eventName !== 'keydown' });
});

const cursor = document.querySelector('.cursor');
window.addEventListener('pointermove', (event) => {
  if (!cursor) return;
  cursor.classList.add('active');
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;
});

const overlay = document.querySelector('.menu-overlay');
const setMenuOpen = (isOpen) => { overlay?.classList.toggle('open', isOpen); overlay?.setAttribute('aria-hidden', String(!isOpen)); };
document.querySelector('.menu-trigger')?.addEventListener('click', () => setMenuOpen(true));
document.querySelector('.menu-close')?.addEventListener('click', () => setMenuOpen(false));
overlay?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenuOpen(false)));
overlay?.addEventListener('click', (event) => { if (event.target === overlay) setMenuOpen(false); });

const menuMembership = document.querySelector('.menu-drawer-bottom');
const menuAuthButtons = [...document.querySelectorAll('[data-menu-auth]')];
const menuLogoutButton = document.querySelector('[data-menu-logout]');
const updateMenuSession = async () => {
  if (!supabase || !menuMembership) return;
  const { data } = await supabase.auth.getSession();
  const isLoggedIn = Boolean(data?.session?.user);
  menuMembership.classList.toggle('is-authenticated', isLoggedIn);
  menuAuthButtons.forEach((button) => { button.hidden = false; });
  if (menuLogoutButton) menuLogoutButton.hidden = !isLoggedIn;
};
updateMenuSession();
supabase?.auth.onAuthStateChange(() => updateMenuSession());

const heroNav = document.querySelector('.hero-nav');
const darkNavSections = document.querySelectorAll('.hero, .project-card, .showreel-section, .principles-section, .process-section, .pillars-stage, .site-footer');
const updateMenuContrast = () => {
  if (!heroNav) return;
  const navPoint = Math.max(1, heroNav.getBoundingClientRect().top + heroNav.offsetHeight / 2);
  const isOverDark = [...darkNavSections].some((section) => {
    const bounds = section.getBoundingClientRect();
    if (bounds.top > navPoint || bounds.bottom < navPoint) return false;
    if (section.matches('.hero, .project-card, .showreel-section, .process-section, .pillars-stage')) return true;
    const background = getComputedStyle(section).backgroundColor.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
    return background.length >= 3 && ((background[0] * 299 + background[1] * 587 + background[2] * 114) / 1000) < 145;
  });
  heroNav.classList.toggle('is-over-dark', isOverDark);
};
updateMenuContrast();
window.addEventListener('scroll', updateMenuContrast, { passive: true });
window.addEventListener('resize', updateMenuContrast);

document.querySelectorAll('.project-card').forEach((card) => {
  card.addEventListener('mouseenter', () => cursor?.classList.add('active'));
  card.addEventListener('mouseleave', () => cursor?.classList.remove('active'));
});

const orbitSection = document.querySelector('.orbit-section');
if (orbitSection && 'IntersectionObserver' in window) {
  const orbitObserver = new IntersectionObserver(([entry]) => {
    orbitSection.classList.toggle('is-visible', entry.isIntersecting);
  }, { threshold: 0.28 });
  orbitObserver.observe(orbitSection);
}

const letterSection = document.querySelector('.letter-section');
if (letterSection && 'IntersectionObserver' in window) {
  const letterObserver = new IntersectionObserver(([entry]) => {
    letterSection.classList.toggle('is-visible', entry.isIntersecting);
  }, { threshold: 0.2 });
  letterObserver.observe(letterSection);
}

const principleItems = document.querySelectorAll('.principle');
const principleImages = document.querySelectorAll('.principle-image');
const principleNodes = document.querySelectorAll('[data-principle-node]');
const principlePhotos = document.querySelectorAll('[data-principle-photo]');
const principlesConstellation = document.querySelector('[data-principles-constellation]');
const photoFlightDeck = document.querySelector('[data-photo-flight-deck]');
const principlesVisual = document.querySelector('.principles-visual');
const principlesSection = document.querySelector('.principles-section');
const matchingHeroWord = document.querySelector('.matching-hero-word');
let matchingPointerFrame;
let matchingPointerEvent;
let swipeResetTimer;
const triggerMatchingSwipe = (direction) => {
  if (!photoFlightDeck && !matchingHeroWord) return;
  const swipeX = direction === 'left' ? 1 : -1;
  [photoFlightDeck, matchingHeroWord].forEach((element) => {
    if (!element) return;
    element.style.setProperty('--swipe-x', swipeX);
    element.classList.remove('is-swiping');
    void element.offsetWidth;
    element.classList.add('is-swiping');
  });
  window.clearTimeout(swipeResetTimer);
  swipeResetTimer = window.setTimeout(() => {
    photoFlightDeck?.classList.remove('is-swiping');
    matchingHeroWord?.classList.remove('is-swiping');
  }, 1120);
};
principlesSection?.addEventListener('wheel', (event) => {
  if (Math.abs(event.deltaX) < 12 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
  triggerMatchingSwipe(event.deltaX > 0 ? 'left' : 'right');
}, { passive: true });
let matchingTouchStartX;
principlesSection?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') matchingTouchStartX = event.clientX;
});
principlesSection?.addEventListener('pointerup', (event) => {
  if (event.pointerType !== 'touch' || matchingTouchStartX === undefined) return;
  const distance = event.clientX - matchingTouchStartX;
  if (Math.abs(distance) > 42) triggerMatchingSwipe(distance < 0 ? 'left' : 'right');
  matchingTouchStartX = undefined;
});
principlesSection?.addEventListener('pointercancel', () => { matchingTouchStartX = undefined; });
let matchingSceneFrame;
const updateMatchingScene = () => {
  if (!principlesSection || !principlesSection.classList.contains('is-visible')) return;
  const bounds = principlesSection.getBoundingClientRect();
  const travel = Math.max(bounds.height - window.innerHeight, 1);
  const progress = Math.max(0, Math.min(1, -bounds.top / travel));
  const drift = (progress - .5) * 90;
  const wordDrift = (progress - .5) * -54;
  principlesConstellation?.style.setProperty('--scroll-drift', `${drift * .36}px`);
  photoFlightDeck?.style.setProperty('--scroll-drift', `${drift}px`);
  matchingHeroWord?.style.setProperty('--word-drift', `${wordDrift}px`);
};
const requestMatchingSceneUpdate = () => {
  if (matchingSceneFrame) return;
  matchingSceneFrame = window.requestAnimationFrame(() => {
    matchingSceneFrame = undefined;
    updateMatchingScene();
  });
};
window.addEventListener('scroll', requestMatchingSceneUpdate, { passive: true });
window.addEventListener('resize', requestMatchingSceneUpdate);
requestMatchingSceneUpdate();
if (principlesSection && 'IntersectionObserver' in window) {
  const principlesRevealObserver = new IntersectionObserver(([entry]) => {
    principlesSection.classList.toggle('is-visible', entry.isIntersecting);
  }, { threshold: 0.12 });
  principlesRevealObserver.observe(principlesSection);
}
principlesVisual?.addEventListener('pointermove', (event) => {
  matchingPointerEvent = event;
  if (matchingPointerFrame) return;
  matchingPointerFrame = window.requestAnimationFrame(() => {
    matchingPointerFrame = undefined;
    if (!matchingPointerEvent) return;
    const bounds = principlesVisual.getBoundingClientRect();
    const x = ((matchingPointerEvent.clientX - bounds.left) / bounds.width - .5) * 18;
    const y = ((matchingPointerEvent.clientY - bounds.top) / bounds.height - .5) * 18;
    principlesConstellation?.style.setProperty('--pointer-x', `${x}px`);
    principlesConstellation?.style.setProperty('--pointer-y', `${y}px`);
    photoFlightDeck?.style.setProperty('--pointer-x', `${x}px`);
    photoFlightDeck?.style.setProperty('--pointer-y', `${y}px`);
  });
});
principlesVisual?.addEventListener('pointerleave', () => {
  principlesConstellation?.style.setProperty('--pointer-x', '0px');
  principlesConstellation?.style.setProperty('--pointer-y', '0px');
  photoFlightDeck?.style.setProperty('--pointer-x', '0px');
  photoFlightDeck?.style.setProperty('--pointer-y', '0px');
});
if (principleItems.length && principleImages.length && 'IntersectionObserver' in window) {
  const principleObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const key = entry.target.dataset.principle;
      principleItems.forEach((item) => item.classList.toggle('is-active', item === entry.target));
      principleImages.forEach((image) => image.classList.toggle('is-active', image.dataset.principleImage === key));
      principleNodes.forEach((node) => node.classList.toggle('is-active', node.dataset.principleNode === key));
      principlePhotos.forEach((photo) => photo.classList.toggle('is-active', photo.dataset.principlePhoto === key));
      if (principlesConstellation) {
        principlesConstellation.classList.remove('is-pulsing');
        void principlesConstellation.offsetWidth;
        principlesConstellation.classList.add('is-pulsing');
      }
    });
  }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });

  principleItems.forEach((item) => principleObserver.observe(item));
}

const pillarItems = document.querySelectorAll('.pillar');
const pillarWords = document.querySelectorAll('.pillar-word');
const pillarImages = document.querySelectorAll('.pillar-image');
const pillarCurrent = document.querySelector('.pillar-current');
if (pillarItems.length && 'IntersectionObserver' in window) {
  const pillarObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const key = entry.target.dataset.pillar;
      const number = entry.target.querySelector(':scope > span')?.textContent || '01';
      pillarItems.forEach((item) => item.classList.toggle('is-active', item === entry.target));
      pillarWords.forEach((word) => word.classList.toggle('is-active', word.dataset.pillarWord === key));
      pillarImages.forEach((image) => image.classList.toggle('is-active', image.dataset.pillarImage === key));
      if (pillarCurrent) pillarCurrent.textContent = number;
    });
  }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });

  pillarItems.forEach((item) => pillarObserver.observe(item));
}

const playgroundStage = document.querySelector('[data-playground-stage]');
const playgroundVideo = document.querySelector('[data-playground-video]');
const playgroundAudioToggle = document.querySelector('[data-playground-audio-toggle]');
const playgroundShuttle = null;
let playgroundAudioContext;
let playgroundSoundEnabled = Boolean(window.__briviaLandingAudioEnabled);
let playgroundStarted = false;

const getPlaygroundAudio = () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  playgroundAudioContext ||= new AudioContextClass();
  if (playgroundAudioContext.state === 'suspended') playgroundAudioContext.resume().catch(() => {});
  return playgroundAudioContext;
};

const playBadmintonHit = () => {
  if (!playgroundSoundEnabled) return;
  const audio = getPlaygroundAudio();
  if (!audio) return;
  const now = audio.currentTime;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(730, now);
  oscillator.frequency.exponentialRampToValueAtTime(160, now + .12);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(.22, now + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .15);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(now); oscillator.stop(now + .16);
};

const playGuitarStrum = () => {
  if (!playgroundSoundEnabled) return;
  const audio = getPlaygroundAudio();
  if (!audio) return;
  const now = audio.currentTime;
  [196, 247, 294, 392, 494].forEach((frequency, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    const start = now + index * .035;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(.08, start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + 1.45);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start); oscillator.stop(start + 1.5);
  });
};

const startPlaygroundRally = () => {
  if (!playgroundStage || !playgroundShuttle || playgroundStarted) return;
  playgroundStarted = true;
  const runCycle = () => {
    playgroundStage.classList.remove('is-guitar');
    playgroundShuttle.style.animation = 'none';
    void playgroundShuttle.offsetWidth;
    playgroundShuttle.style.animation = '';
  };
  playgroundShuttle.addEventListener('animationstart', playBadmintonHit);
  playgroundShuttle.addEventListener('animationend', () => {
    playgroundStage.classList.add('is-guitar');
    playGuitarStrum();
    window.setTimeout(runCycle, 3500);
  });
  runCycle();
};

if (playgroundStage) {
  const updatePlaygroundAudioToggle = () => {
    if (!playgroundVideo || !playgroundAudioToggle) return;
    const isUnmuted = !playgroundVideo.muted;
    playgroundAudioToggle.classList.toggle('is-unmuted', isUnmuted);
    playgroundAudioToggle.setAttribute('aria-pressed', String(isUnmuted));
    playgroundAudioToggle.setAttribute('aria-label', isUnmuted ? 'Mute animation' : 'Unmute animation');
  };
  playgroundAudioToggle?.addEventListener('pointerdown', (event) => event.stopPropagation());
  playgroundAudioToggle?.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
  playgroundAudioToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!playgroundVideo) return;
    playgroundVideo.muted = !playgroundVideo.muted;
    if (!playgroundVideo.muted && landingMotion) playgroundVideo.play().catch(() => {});
    updatePlaygroundAudioToggle();
  });
  updatePlaygroundAudioToggle();
  playgroundStage.addEventListener('click', (event) => {
    // Keep the animation muted until the user explicitly taps the audio toggle.
    if (landingMotion) playgroundVideo?.play().catch(() => {});
    startPlaygroundRally();
  });
  if ('IntersectionObserver' in window) {
    const playgroundObserver = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { startPlaygroundRally(); playgroundObserver.disconnect(); } }, { threshold: .28 });
    playgroundObserver.observe(playgroundStage);
  } else startPlaygroundRally();
}

const serviceSection = document.querySelector('.services-marquee');
const serviceRows = document.querySelectorAll('.service-row');
const serviceProgress = document.querySelector('.services-progress');
if (serviceSection && serviceRows.length) {
  const updateServiceProgress = () => {
    const bounds = serviceSection.getBoundingClientRect();
    const travel = Math.max(1, bounds.height - window.innerHeight);
    const amount = Math.min(100, Math.max(0, (-bounds.top / travel) * 100));
    if (serviceProgress) serviceProgress.textContent = `${Math.round(amount)}%`;
  };
  let progressTick = false;
  window.addEventListener('scroll', () => {
    if (progressTick) return;
    progressTick = true;
    requestAnimationFrame(() => {
      updateServiceProgress();
      progressTick = false;
    });
  }, { passive: true });
  updateServiceProgress();

  if ('IntersectionObserver' in window) {
    const serviceObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        serviceRows.forEach((row) => row.classList.toggle('is-active', row === entry.target));
      });
    }, { rootMargin: '-38% 0px -38% 0px', threshold: 0 });
    serviceRows.forEach((row) => serviceObserver.observe(row));
  }
}

const showreelSection = document.querySelector('.showreel-section');
const showreelToggle = document.querySelector('.showreel-toggle');
if (showreelSection && showreelToggle) {
  showreelToggle.addEventListener('click', () => {
    const paused = showreelSection.classList.toggle('is-paused');
    showreelToggle.setAttribute('aria-pressed', String(paused));
    showreelToggle.setAttribute('aria-label', paused ? 'Play showreel' : 'Pause showreel');
    const label = showreelToggle.querySelector('span:last-child');
    const icon = showreelToggle.querySelector('.showreel-toggle-icon');
    if (label) label.textContent = paused ? 'PLAY' : 'PAUSE';
    if (icon) icon.textContent = paused ? '▶' : 'Ⅱ';
  });
}

const authModal = document.querySelector('#auth-modal');
const authCta = document.querySelector('.hero-nav .cta-button');
const isStandaloneAuthPage = document.body.classList.contains('auth-page');
// #signup opens the guided signup (Phase E); anything else opens the login view. The old 4-step form is gone (Task 5).
const requestedAuthView = window.location.hash === '#signup' ? 'guided' : 'login';
let authHistoryView = isStandaloneAuthPage ? requestedAuthView : 'welcome';
if (isStandaloneAuthPage) {
  window.history.replaceState({ briviaAuthView: requestedAuthView }, '', window.location.href);
}
const authViews = document.querySelectorAll('[data-auth-view]');
const authStep = authModal?.querySelector('.auth-step');
const authPanelKicker = authModal?.querySelector('.auth-panel-kicker');
const authShell = authModal?.querySelector('.auth-shell');
const authPanel = authModal?.querySelector('.auth-panel');
const authScrollbarThumb = authModal?.querySelector('.auth-scrollbar span');
const loginForm = document.querySelector('#login-form');
const loginNote = document.querySelector('#login-note');
let authCloseTimer;
let authEnvelopeTimer;

if (authCta && authModal) {
  authCta.classList.add('auth-trigger');
  authCta.setAttribute('href', '/auth.html');
  authCta.setAttribute('aria-haspopup', 'dialog');
  authCta.innerHTML = '<span class="button-label">START SWIPING</span><span class="button-arrows">→</span>';
}

const setAuthView = (view, historyMode = 'push') => {
  // Never leave a view hidden if the envelope transition was interrupted.
  authShell?.classList.remove('is-envelope-opening');
  authModal?.classList.add('is-open');
  document.documentElement.classList.remove('auth-routing');  // a view is chosen: auth.html's pre-script hold ends
  if (isStandaloneAuthPage && view !== authHistoryView && historyMode !== 'none') {
    const state = { briviaAuthView: view };
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = view === 'guided' ? '#signup' : view === 'login' ? '#login' : '';
    if (historyMode === 'replace') window.history.replaceState(state, '', nextUrl);
    else window.history.pushState(state, '', nextUrl);
  }
  authHistoryView = view;
  authViews.forEach((item) => {
    const isActive = item.dataset.authView === view;
    item.classList.toggle('is-active', isActive);
    item.toggleAttribute('hidden', !isActive);
  });
  authShell?.classList.toggle('is-guided', view === 'guided');  // the guided flow has its own header (signup.css)
  if (authStep) {
    const noCounter = view === 'guided';  // the counter means nothing beside the signup flow
    authStep.textContent = view === 'welcome' ? 'WELCOME' : view === 'login' ? '01 / 02' : '02 / 02';
    authStep.toggleAttribute('hidden', noCounter);
    authStep.style.display = noCounter ? 'none' : '';
  }
  if (authPanelKicker) authPanelKicker.textContent = view === 'welcome' ? 'THE BRIVIA CLUB' : view === 'login' ? 'RETURNING MEMBER' : 'YOUR APPLICATION';
  const authTopSignup = authModal?.querySelector('.auth-top-signup');
  if (authTopSignup) authTopSignup.innerHTML = view === 'guided' ? 'ALREADY A MEMBER? <b>LOG IN</b>' : 'NEW HERE? <b>CREATE ACCOUNT</b>';
  if (authShell) authShell.setAttribute('aria-labelledby', view === 'welcome' ? 'auth-welcome-title' : view === 'login' ? 'auth-title' : 'signup-screen-title');
};

if (isStandaloneAuthPage) {
  window.addEventListener('popstate', (event) => {
    const view = event.state?.briviaAuthView || 'welcome';
    setAuthView(view, 'none');
    if (view === 'guided') showGuidedFromHistory(event.state?.signupScreen);
  });
}

// Resolves to null once the Google redirect has started, or to the error message shown (the guided Welcome shows it).
const startGoogleAuth = async () => {
  if (!supabaseReady || !supabase) {
    if (loginNote) loginNote.textContent = 'Google sign-in is not configured yet. Please use email and password.';
    return 'Google sign-in is not configured yet.';
  }
  const buttons = authModal?.querySelectorAll('.auth-google-trigger') || [];
  buttons.forEach((button) => { button.disabled = true; });
  if (loginNote) loginNote.textContent = 'Connecting to Google...';
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth.html`, queryParams: { prompt: 'select_account' } },
    });
    if (!error) return null;
    buttons.forEach((button) => { button.disabled = false; });
    if (loginNote) loginNote.textContent = error.message || 'Google sign-in could not start.';
    return error.message || 'Google sign-in could not start.';
  } catch (error) {
    buttons.forEach((button) => { button.disabled = false; });
    if (loginNote) loginNote.textContent = error.message || 'Google sign-in could not start.';
    return error.message || 'Google sign-in could not start.';
  }
};

const redirectToApp = () => {
  window.location.replace('/app.html');
};

// ---------------------------------------------------------------------------------------------------------------
// After sign-in (Phase E Task 5): every route (a password or code login, a session on auth.html, a Google return,
// ?complete-profile=1 from the app gate) opens the guided flow at the first incomplete screen, or the app when done.
// The guided Reveal and resumeScreen (signup-flow.js) replace the old 4-step completion form.
//
// The old pending profile (kept for one release, spec §1.4, D-053 follow-up): an account made with the retired 4-step
// form that needed email confirmation stored its answers in localStorage 'brivia-pending-profile' (never coordinates;
// only { kind: 'city', placeId } or { kind: 'geo' }, interests as { id, points, mode }, the 18+ declaration). At the
// next login it is saved and applied once; whatever could not be applied is left for the guided screens (the stored
// picks preselected, the failure shown once on its screen). Remove this block, pending-profile.js and the
// 'brivia-pending-profile' cleanups one release after Phase E.
// ---------------------------------------------------------------------------------------------------------------
const PRIVATE_OMITTED_NOTE = "Private interests aren't kept while you confirm your email. Please pick them again.";

// Hands what the pending profile left undone to the guided screens: its picks, its name, and one notice.
const seedGuidedFromPending = (pending, result) => {
  const answers = guidedAnswers();
  const name = realName(pending?.name);
  if (name && !answers.name) answers.name = name;
  const ids = (result?.budget?.items || []).map((item) => item.id);
  if (ids.length && !answers.picks.length) answers.seedIds = ids;
  if (!result) return;
  if (result.adultError) answers.notice = { screen: 'adult', text: ADULT_SAVE_ERROR };
  else if (result.orbitError) answers.notice = { screen: 'area', text: isRateLimited(result.orbitError.error, result.orbitError.status) ? AREA_RATE_LIMITED : AREA_SAVE_ERROR };
  else if (result.interestsFailed) answers.notice = { screen: 'interests', text: INTERESTS_SAVE_ERROR };
  else if (result.privateOmitted) answers.notice = { screen: 'interests', text: PRIVATE_OMITTED_NOTE };
};

// Opens the guided flow at the first incomplete screen (the app when done or under review: resumeScreen).
const routeSignedIn = () => openGuidedSignup({ screen: 'resume', history: 'replace' });

// Removes the area choice from the stored pending profile once set_home_city has applied it, keeping the rest (for
// example interests that still have to be retried). Never throws.
const dropPendingOrbit = () => {
  try {
    const stored = JSON.parse(window.localStorage.getItem('brivia-pending-profile') || 'null');
    if (!stored || typeof stored !== 'object' || !('orbit' in stored)) return;
    delete stored.orbit;
    window.localStorage.setItem('brivia-pending-profile', JSON.stringify(stored));
  } catch { /* storage unavailable: nothing to drop */ }
};

// Applies a pending profile's onboarding: the 18+ declaration first (the server refuses location and interests before
// it), then a city choice, then complete interests. A geo choice is asked for again on Area (no coordinate was stored).
// Nothing fails silently: the result says what is left, and the pending profile is removed only when every call that
// was made succeeded.
const applyPendingOnboarding = async (pending) => {
  const result = { orbitError: null, interestsFailed: false, budget: null, privateOmitted: false, ok: true };
  if (!pending || typeof pending !== 'object') return result;
  result.budget = budgetFromRows(pending.interests);
  result.privateOmitted = pending.privateOmitted === true;
  // A pending profile from an older build has no declaration: nothing is applied (18+ asks), the pending data is kept.
  if (pending.adultDeclared !== true) { result.ok = false; return result; }
  const declared = await declareAdult();
  if (declared.error) { result.adultError = true; result.ok = false; return result; }
  if (pending.orbit?.kind === 'city' && typeof pending.orbit.placeId === 'string' && pending.orbit.placeId) {
    const { error, status } = await setHomeCity(pending.orbit.placeId);
    if (error) result.orbitError = { error, status };
    else dropPendingOrbit();  // applied: a later login must not spend another of the 3 daily location changes
  }
  if (isComplete(result.budget)) {
    const { error } = await setMemberInterests(toPayload(result.budget));
    if (error) result.interestsFailed = true;
  }
  result.ok = !result.orbitError && !result.interestsFailed;
  if (result.ok) window.localStorage.removeItem('brivia-pending-profile');
  return result;
};
// Never written or cached from the pending path: the onboarding answers (applied through their RPCs) and phone and
// gender (no longer collected: the 2026-10-20 notice does not list them; stored values are kept as they are).
const PENDING_ONBOARDING_KEYS = ['interests', 'orbit', 'privateOmitted', 'savedAt', 'adultDeclared', 'phone', 'phoneCountryCode', 'phoneNumber', 'gender'];
const withoutOnboarding = (profile) => {
  const clean = { ...(profile || {}) };
  PENDING_ONBOARDING_KEYS.forEach((key) => { delete clean[key]; });
  return clean;
};

// The pending signup profile, or null. One older than 7 days (or without savedAt) is removed, never applied.
const readPendingProfile = () => {
  let pending = null;
  try { pending = JSON.parse(window.localStorage.getItem('brivia-pending-profile') || 'null'); } catch { pending = null; }
  if (pending && isPendingExpired(pending)) {
    window.localStorage.removeItem('brivia-pending-profile');
    return null;
  }
  return pending && typeof pending === 'object' ? pending : null;
};

// The signup photo waits in the pending profile as a compressed data:image preview (email confirmation: no session
// could upload it). Turned back into a File here so saveProfile uploads it to storage; saveProfile never stores a
// data URL as the photo URL, so without this the photo was silently lost (live walkthrough, 2026-10-08).
const pendingPhotoFile = (pending) => dataUrlToFile(pending?.photoUrl, pending?.photoName || 'photo');
// Once uploaded, the preview in the pending profile is replaced by the stored URL (a later login, with the pending
// profile kept for a retry, rewrites that same URL: it never uploads twice and never writes photo_url = null). With
// no stored URL (the upload failed) the preview is dropped. Never throws.
const dropPendingPhoto = (storedUrl = '') => {
  try {
    const stored = JSON.parse(window.localStorage.getItem('brivia-pending-profile') || 'null');
    if (!stored || typeof stored !== 'object' || !String(stored.photoUrl || '').startsWith('data:')) return;
    if (storedUrl) stored.photoUrl = storedUrl; else delete stored.photoUrl;
    window.localStorage.setItem('brivia-pending-profile', JSON.stringify(stored));
  } catch { /* storage unavailable: nothing to drop */ }
};
// Saves a pending (or cached) profile after login, uploading its photo preview. A photo that cannot be processed or
// uploaded never blocks sign-in: the preview is dropped and the profile saved without it (the member adds a photo
// later in Edit profile). Returns saveProfile's result plus the profile to cache, which never holds a data: preview.
const savePendingProfile = async (userId, profile, source) => {
  const photo = pendingPhotoFile(source);
  let result = await saveProfile(userId, profile, photo, null, {}, { contact: false });
  if (result.error && photo) {
    dropPendingPhoto();
    result = await saveProfile(userId, { ...profile, photoUrl: '' }, null, null, {}, { contact: false });
  } else if (!result.error && photo) {
    dropPendingPhoto(result.data?.photo_url || '');
  }
  const cached = { ...profile };
  if (String(cached.photoUrl || '').startsWith('data:')) cached.photoUrl = result.data?.photo_url || '';
  return { ...result, cached };
};

// An account made with the old form whose row was never written (email confirmed in another browser): its profile is
// rebuilt from the pending profile, the cached member profile or the sign-up metadata the old form stored. A
// metadata-only account (no old-form answers, e.g. Google) has nothing to restore: the guided flow asks.
const restoreCachedMemberProfile = async (user, preferredProfile = null) => {
  if (!user?.id || !supabase) return false;
  const userEmail = String(user.email || '').trim().toLowerCase();
  let cached = null;
  try { cached = JSON.parse(window.localStorage.getItem('brivia-member-profile') || 'null'); } catch { cached = null; }
  const metadata = user.user_metadata || {};
  // Phone and gender in an old account's metadata are neither read nor written (no longer collected).
  const metadataProfile = {
    name: metadata.name || metadata.full_name || '',
    email: user.email || '',
    experience: metadata.experience || '',
    lookingFor: metadata.lookingFor || metadata.looking_for || '',
    coverUrl: metadata.coverUrl || metadata.cover_url || '',
  };
  const candidates = [preferredProfile, cached, metadataProfile].filter(Boolean);
  const candidate = candidates.find((item) => {
    const email = String(item.email || user.email || '').trim().toLowerCase();
    const name = String(item.name || item.full_name || '').trim();
    const hasProfileSignals = item !== metadataProfile || Boolean(item.experience || item.lookingFor || item.coverUrl);
    return email === userEmail && name && name !== 'New Member' && hasProfileSignals;
  });
  if (!candidate) return false;
  const profile = withoutOnboarding(withoutCredentials({ ...candidate, name: candidate.name || candidate.full_name }));
  delete profile.id;
  const { error, cached: saved } = await savePendingProfile(user.id, profile, candidate);
  if (error) return false;
  window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...saved, id: user.id, email: user.email }));
  return true;
};

// A login (password, or "Email me a code instead"): a pending profile for this address is saved and applied once; one
// for another address is dropped. Throws a save or read error for the caller to show.
const routeAfterLogin = async (user) => {
  const pending = readPendingProfile();
  const pendingBelongsToUser = Boolean(pending) && pending?.email?.toLowerCase() === user?.email?.toLowerCase();
  let pendingResult = null;
  let savedPending = null;
  if (pendingBelongsToUser) {
    const saved = await savePendingProfile(user.id, withoutOnboarding(withoutCredentials(pending)), pending);
    if (saved.error) throw saved.error;
    savedPending = saved.cached;
    pendingResult = await applyPendingOnboarding(pending);
    window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...savedPending, id: user.id }));
  } else if (pending) {
    window.localStorage.removeItem('brivia-pending-profile');
  }
  const { data: ownProfile, error: ownProfileError } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (ownProfileError) throw ownProfileError;
  if (!ownProfile) await restoreCachedMemberProfile(user);
  else {
    const cachedPendingProfile = savedPending || (pendingBelongsToUser ? withoutOnboarding(withoutCredentials(pending)) : {});
    window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...cachedPendingProfile, id: user.id, email: user.email || '' }));
    if (pendingBelongsToUser && pending?.coverUrl) await supabase.auth.updateUser({ data: { coverUrl: pending.coverUrl } }).catch(() => {});
  }
  if (pendingBelongsToUser) seedGuidedFromPending(pending, pendingResult);
  await routeSignedIn();
};

// auth.html with a session (a Google return, ?complete-profile=1, #signup, or an earlier sign-in): a member without a
// profile row whose pending profile matches gets it applied; then the guided flow resumes, or the app opens.
const routeSession = async (user) => {
  const { data: profile, error } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (error) {
    setAuthView('login');
    if (loginNote) loginNote.textContent = `We couldn't verify your Brivia profile: ${error.message}`;
    return;
  }
  if (!profile) {
    const pending = readPendingProfile();
    const pendingMatches = pending?.email?.toLowerCase() === user.email?.toLowerCase();
    if (await restoreCachedMemberProfile(user, pendingMatches ? pending : null)) {
      if (pendingMatches) seedGuidedFromPending(pending, await applyPendingOnboarding(pending));
    } else if (pendingMatches) seedGuidedFromPending(pending, null);
  }
  await routeSignedIn();
};

const restoreAuthPageSession = async () => {
  if (!isStandaloneAuthPage) return;
  const showRequested = () => (requestedAuthView === 'guided' ? openGuidedSignup({ history: 'none' }) : setAuthView(requestedAuthView, 'none'));
  if (!supabaseReady || !supabase) { void showRequested(); return; }
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get('error_description') || params.get('error');
  if (oauthError) {
    setAuthView('login');
    if (loginNote) loginNote.textContent = oauthError.replaceAll('+', ' ');
    window.history.replaceState({ briviaAuthView: 'login' }, '', '/auth.html');
    return;
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) { void showRequested(); return; }
  // Signed in: the guided view (busy, no form) shows while the profile and any old pending profile are read, so the
  // login form never flashes.
  showGuidedPending();
  await routeSession(session.user);
};

initGuidedSignup({
  activate: (mode) => setAuthView('guided', mode),
  login: () => setAuthView('login'),
  startGoogle: startGoogleAuth,
  // "Email me a code instead": after the code, the same route as a password login (an old pending profile first).
  afterLogin: async (user) => {
    try { await routeAfterLogin(user); } catch (error) {
      setAuthView('login');
      if (loginNote) loginNote.textContent = error.message || 'Could not sign you in. Please try again.';
    }
  },
  methods: signupMethods(import.meta.env.VITE_SIGNUP_METHODS),
});

const updateAuthScrollbar = () => {
  if (!authPanel || !authScrollbarThumb) return;
  const scrollable = authPanel.scrollHeight - authPanel.clientHeight;
  const visibleRatio = scrollable > 0 ? authPanel.clientHeight / authPanel.scrollHeight : 1;
  const thumbSize = Math.max(18, visibleRatio * 100);
  const scrollRatio = scrollable > 0 ? authPanel.scrollTop / scrollable : 0;
  authScrollbarThumb.style.height = `${thumbSize}%`;
  authScrollbarThumb.style.top = `${scrollRatio * (100 - thumbSize)}%`;
};
authPanel?.addEventListener('scroll', updateAuthScrollbar, { passive: true });
window.addEventListener('resize', updateAuthScrollbar);
window.requestAnimationFrame(updateAuthScrollbar);

document.querySelectorAll('[data-menu-auth]').forEach((button) => button.addEventListener('click', () => {
  setMenuOpen(false);
  window.location.href = `/auth.html#${button.dataset.menuAuth}`;
}));
menuLogoutButton?.addEventListener('click', async () => {
  menuLogoutButton.disabled = true;
  menuLogoutButton.innerHTML = 'LOGGING OUT...';
  try {
    await supabase?.auth.signOut();
    window.localStorage.removeItem('brivia-member-profile');
    window.localStorage.removeItem('brivia-pending-profile');
  } finally {
    setMenuOpen(false);
    window.location.href = '/';
  }
});

const closeAuth = () => {
  if (!authModal) return;
  window.clearTimeout(authEnvelopeTimer);
  authShell?.classList.remove('is-envelope-opening');
  if (isStandaloneAuthPage) {
    try { window.sessionStorage.setItem('brivia-skip-intro-once', 'true'); } catch {}
    window.location.href = '/';
    return;
  }
  authModal.classList.remove('is-open');
  document.body.classList.remove('auth-open');
  authCloseTimer = window.setTimeout(() => authModal.setAttribute('hidden', ''), 420);
  authCta?.focus();
};

if (isStandaloneAuthPage) {
  window.addEventListener('pagehide', () => {
    try { window.sessionStorage.setItem('brivia-skip-intro-once', 'true'); } catch {}
  });
}

const openAuthEnvelope = (view) => {
  if (!authShell || authShell.classList.contains('is-envelope-opening')) return;
  window.clearTimeout(authEnvelopeTimer);
  authShell.classList.add('is-envelope-opening');
  authEnvelopeTimer = window.setTimeout(() => {
    if (view === 'guided') { authShell.classList.remove('is-envelope-opening'); void openGuidedSignup(); return; }
    setAuthView(view);
    authShell.classList.remove('is-envelope-opening');
  }, 1420);
};

authModal?.querySelector('.auth-close')?.addEventListener('click', closeAuth);
authModal?.querySelector('[data-auth-close]')?.addEventListener('click', closeAuth);
authModal?.querySelector('.auth-welcome-login')?.addEventListener('click', () => openAuthEnvelope('login'));
// Every signup entry point opens the guided flow (Phase E). Its Welcome handles an existing session (Continue or
// Sign out), so nothing is signed out here.
authModal?.querySelector('.auth-welcome-signup')?.addEventListener('click', () => openAuthEnvelope('guided'));
authModal?.querySelector('.auth-top-signup')?.addEventListener('click', () => {
  if (authHistoryView === 'guided') { setAuthView('login'); return; }
  void openGuidedSignup();
});
authModal?.querySelector('.auth-create-trigger')?.addEventListener('click', () => { void openGuidedSignup(); });
authModal?.querySelectorAll('.auth-google-trigger').forEach((button) => button.addEventListener('click', startGoogleAuth));
// The login view's Google button shows the same four-colour mark as the guided Welcome (google-mark.js, one source).
if (isStandaloneAuthPage) authModal?.querySelectorAll('.auth-google-mark').forEach(fillGoogleMark);

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const submit = loginForm.querySelector('.auth-submit');
  if (submit) submit.disabled = true;
  if (loginNote) loginNote.textContent = 'Checking your membership...';
  try {
    if (!supabaseReady || !supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await routeAfterLogin(data.user);
  } catch (error) {
    if (loginNote) loginNote.textContent = error.message || 'Could not sign you in. Check your email and password.';
  } finally {
    if (submit) submit.disabled = false;
  }
});

// "Email me a code instead" (Phase E Task 5): the guided Code screen, with a code that never creates an account.
const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const loginCodeButton = loginForm?.querySelector('[data-login-code]');
loginCodeButton?.addEventListener('click', async () => {
  const emailField = loginForm.elements.namedItem('email');
  const email = String(emailField?.value || '').trim();
  if (!LOGIN_EMAIL_RE.test(email)) {
    if (loginNote) loginNote.textContent = 'Enter your email address first, and we will email you a code.';
    emailField?.focus();
    return;
  }
  if (!supabaseReady || !supabase) { if (loginNote) loginNote.textContent = 'Login is not configured yet.'; return; }
  setBusy(loginCodeButton, true);
  if (loginNote) loginNote.textContent = '';
  const error = await openLoginCode(email);
  setBusy(loginCodeButton, false);
  if (error && loginNote) loginNote.textContent = error;
});

if (isStandaloneAuthPage) void restoreAuthPageSession();

// Escape closes the auth modal (on auth.html it leaves the page), but never when a control already handled it, and in
// the guided flow never past Welcome or from a half-typed field: progress must not be lost to one key.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !authModal?.classList.contains('is-open')) return;
  if (authHistoryView === 'guided' && (guidedScreen() !== 'welcome' || event.target.closest?.('input'))) return;
  closeAuth();
});
