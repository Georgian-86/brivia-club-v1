import './style.css';
import './auth-theme.css';
import './playground.css';
import './letter-theme.css';
import './intro-reference.css';
import './deep-wine-theme.css';
import './auth-polish.css';
import './mobile-site.css';
import './mobile-final-fixes.css';
import {
  supabase, supabaseReady, saveProfile, compressedImageDataUrl, PHOTO_ERROR_MESSAGE, withoutCredentials, rowToProfile, isRateLimited,
  declareAdult, setHomeLocation, setHomeCity, setMemberInterests, setSensitiveConsent, fetchMyInterests, fetchInterestNodes, searchPlaces, onboardingStatus,
} from './supabase.js';
import { buildPendingOnboarding, isPendingExpired } from './pending-profile.js';
import {
  MAX_INTERESTS, MODES, emptyBudget, addInterest, removeInterest, stepPoints, setMode, pointsLeft, isComplete, toPayload,
  counterText, budgetFromRows,
} from './passion-budget.js';
import { defaultCoverUrl, normalizeCoverUrl } from './cover-assets.js';

const introBurst = document.querySelector('#intro-burst');
const introSkip = introBurst?.querySelector('.intro-skip');
const introVideo = introBurst?.querySelector('.intro-video');
let skipIntro = false;
try {
  const introSeen = window.sessionStorage.getItem('brivia-intro-seen') === 'true';
  const skipFromAuth = window.sessionStorage.getItem('brivia-skip-intro-once') === 'true';
  skipIntro = introSeen || skipFromAuth;
  window.sessionStorage.removeItem('brivia-skip-intro-once');
  if (!introSeen || skipFromAuth) window.sessionStorage.setItem('brivia-intro-seen', 'true');
} catch {}
if (introBurst && skipIntro) {
  introBurst.remove();
}
if (introBurst && !skipIntro) {
  document.body.classList.add('intro-active');
  const finishIntro = () => {
    document.body.classList.remove('intro-active');
    introBurst.classList.add('is-skipped');
    window.setTimeout(() => introBurst.remove(), 500);
  };
  introVideo?.addEventListener('ended', () => window.setTimeout(finishIntro, 400), { once: true });
  introVideo?.play().catch(() => {});
  introSkip?.addEventListener('click', finishIntro);
  window.setTimeout(finishIntro, 5000);
}

/* Keep the landing-page music enabled on desktop and mobile. Browsers may
   reject autoplay with sound, so retry immediately on the first real gesture. */
const landingVideos = [...document.querySelectorAll('.hero-video, [data-playground-video]')];
const enableLandingVideoAudio = () => {
  landingVideos.forEach((video) => {
    video.muted = false;
    video.defaultMuted = false;
    video.volume = 1;
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {});
    });
  });
};
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
enableLandingVideoAudio();
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
    if (!playgroundVideo.muted) playgroundVideo.play().catch(() => {});
    updatePlaygroundAudioToggle();
  });
  updatePlaygroundAudioToggle();
  playgroundStage.addEventListener('click', (event) => {
    // Keep the animation muted until the user explicitly taps the audio toggle.
    playgroundVideo?.play().catch(() => {});
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
const requestedAuthView = window.location.hash === '#signup' ? 'signup' : 'login';
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
const signupForm = document.querySelector('#signup-form');
const signupSuccess = document.querySelector('#auth-success');
const loginForm = document.querySelector('#login-form');
const loginNote = document.querySelector('#login-note');
const signupPasswordFields = signupForm?.querySelector('.signup-password-fields');
const signupStepLabel = signupForm?.querySelector('[data-signup-step-label]');
const signupProgress = signupForm?.querySelector('.signup-progress-track');
const signupProgressFill = signupForm?.querySelector('[data-signup-progress-fill]');
let signupCurrentStep = 1;
let adultAlreadyDeclared = false;  // the member row already has adult_declared_at (completion re-entry): no second declare_adult
let profileCompletionUser = null;
let authCloseTimer;
let authEnvelopeTimer;
let resetLooking = () => {};
let resetPhoto = () => {};
let resetCover = () => {};
let fillLooking = () => {};
let profileCompletionPhotoUrl = '';
let profileCompletionCoverUrl = '';

const photoUpload = document.querySelector('[data-photo-upload]');
if (photoUpload) {
  const photoInput = photoUpload.querySelector('.photo-input');
  const photoPreview = photoUpload.querySelector('.photo-preview');
  const photoFileName = photoUpload.querySelector('.photo-file-name');
  const photoRemove = photoUpload.querySelector('.photo-remove');
  const photoTitle = photoUpload.querySelector('.photo-copy strong');
  let previewUrl = '';
  const defaultPhotoText = 'Optional · A clear photo helps people recognise you.';
  const imageExtension = /\.(jpg|jpeg|png|webp|gif|svg|avif|heic|heif|bmp|tif|tiff)$/i;

  photoInput?.addEventListener('change', () => {
    const file = photoInput.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    photoUpload.classList.add('has-file');
    photoRemove?.removeAttribute('hidden');
    if (photoTitle) photoTitle.textContent = 'CHANGE PROFILE PHOTO';
    if (file.type.startsWith('image/') || imageExtension.test(file.name)) {
      if (photoPreview) {
        photoPreview.textContent = '';
        photoPreview.style.backgroundImage = `url("${previewUrl}")`;
      }
    } else if (photoPreview) {
      photoPreview.textContent = 'FILE';
      photoPreview.style.backgroundImage = '';
    }
    if (photoFileName) photoFileName.textContent = file.name;
  });

  resetPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    if (photoInput) photoInput.value = '';
    photoUpload.classList.remove('has-file');
    photoRemove?.setAttribute('hidden', '');
    if (photoTitle) photoTitle.textContent = 'ADD A PROFILE PHOTO';
    if (photoPreview) {
      photoPreview.textContent = '＋';
      photoPreview.style.backgroundImage = '';
    }
    if (photoFileName) photoFileName.textContent = defaultPhotoText;
  };
  photoRemove?.addEventListener('click', () => {
    resetPhoto();
    photoInput?.focus();
  });
}

const coverPicker = document.querySelector('[data-cover-picker]');
const coverOptionUrl = (button) => normalizeCoverUrl(button?.querySelector('img')?.getAttribute('src') || button?.dataset.coverOption || '');
if (coverPicker) {
  const coverValue = coverPicker.querySelector('.cover-value');
  const coverPreview = coverPicker.querySelector('[data-cover-preview]');
  const coverInput = coverPicker.querySelector('.cover-input');
  const coverFileName = coverPicker.querySelector('.cover-file-name');
  let coverPreviewUrl = '';
  const defaultCover = defaultCoverUrl;

  const setCover = (url, button = null) => {
    if (coverValue) coverValue.value = url || '';
    if (coverPreview) {
      coverPreview.style.backgroundImage = url ? `url("${url}")` : '';
      coverPreview.classList.toggle('has-cover', Boolean(url));
      coverPreview.querySelector('span')?.toggleAttribute('hidden', Boolean(url));
    }
    coverPicker.querySelectorAll('.cover-choice').forEach((choice) => choice.classList.toggle('is-selected', choice === button));
  };

  coverPicker.querySelectorAll('.cover-choice').forEach((button) => {
    button.addEventListener('click', () => {
      if (coverPreviewUrl) {
        URL.revokeObjectURL(coverPreviewUrl);
        coverPreviewUrl = '';
      }
      if (coverInput) coverInput.value = '';
      if (coverFileName) coverFileName.textContent = 'Recommended: a wide image with room for your profile details.';
      setCover(coverOptionUrl(button) || defaultCover, button);
    });
  });
  coverInput?.addEventListener('change', () => {
    const file = coverInput.files?.[0];
    if (!file) return;
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = URL.createObjectURL(file);
    setCover(coverPreviewUrl);
    coverPicker.querySelectorAll('.cover-choice').forEach((choice) => choice.classList.remove('is-selected'));
    if (coverFileName) coverFileName.textContent = file.name;
  });
  resetCover = () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    coverPreviewUrl = '';
    if (coverInput) coverInput.value = '';
    if (coverFileName) coverFileName.textContent = 'Recommended: a wide image with room for your profile details.';
    const defaultChoice = coverPicker.querySelector('.cover-choice');
    setCover(coverOptionUrl(defaultChoice) || defaultCover, defaultChoice);
  };
  resetCover();
}

const lookingOptions = [
  'Hackathon Buddy', 'SIH Buddy', 'Travelling Buddy', 'Study Partner', 'Project Partner', 'Coding Partner', 'Startup Partner',
  'Co-founder', 'Teammate', 'Mentor', 'Mentee', 'Freelancer', 'Intern', 'Research Partner', 'Open Source Contributor',
  'Developer', 'Designer', 'AI Enthusiast', 'ML Enthusiast', 'Entrepreneur', 'Photographer', 'Content Creator', 'Video Editor',
  'UI/UX Designer', 'Data Analyst', 'Business Analyst', 'Marketer', 'Public Speaker', 'Writer', 'Volunteer', 'Event Participant',
  'Networking Contact', 'Career Mentor', 'Job Referral', 'Internship Referral', 'Accountability Partner', 'Language Exchange Partner',
  'Travel Companion', 'Trekking Partner', 'Sports Partner', 'Gaming Partner', 'Photography Partner', 'Event Companion',
  'Conference Companion', 'Workshop Partner', 'Competition Teammate', 'Roommate', 'Local Guide', 'Community Member', 'Collaborator', 'Other',
];

const lookingPicker = document.querySelector('[data-looking-picker]');
if (lookingPicker) {
  const lookingSearch = lookingPicker.querySelector('.looking-search');
  const lookingOtherInput = lookingPicker.querySelector('.looking-other-input');
  const lookingResults = lookingPicker.querySelector('.looking-results');
  const lookingSelected = lookingPicker.querySelector('.looking-selected');
  const lookingValue = lookingPicker.querySelector('.looking-value');
  const selectedLooking = [];
  let customLookingMode = false;

  const syncLooking = () => {
    if (lookingValue) lookingValue.value = selectedLooking.join(', ');
    if (lookingSearch) lookingSearch.setCustomValidity(selectedLooking.length ? '' : 'Choose at least one option.');
    if (lookingSelected) {
      lookingSelected.innerHTML = selectedLooking.map((item) => `<button type="button" class="skill-chip" data-remove-looking="${item.replace(/"/g, '&quot;')}">${item}<span aria-hidden="true">×</span></button>`).join('');
      lookingSelected.querySelectorAll('[data-remove-looking]').forEach((button) => {
        button.addEventListener('click', () => {
          const index = selectedLooking.indexOf(button.dataset.removeLooking);
          if (index > -1) selectedLooking.splice(index, 1);
          syncLooking();
          renderLooking();
          lookingSearch?.focus();
        });
      });
    }
  };

  const addLooking = (value) => {
    const cleanValue = value.trim();
    if (!cleanValue || selectedLooking.some((item) => item.toLowerCase() === cleanValue.toLowerCase())) return;
    selectedLooking.push(cleanValue);
    customLookingMode = false;
    lookingOtherInput?.setAttribute('hidden', '');
    if (lookingOtherInput) lookingOtherInput.value = '';
    if (lookingSearch) {
      lookingSearch.value = '';
      lookingSearch.placeholder = 'Search what brings you here...';
    }
    syncLooking();
    renderLooking();
    lookingSearch?.focus();
  };

  const renderLooking = () => {
    if (!lookingResults || !lookingSearch) return;
    const query = lookingSearch.value.trim().toLowerCase();
    const matches = lookingOptions.filter((item) => item.toLowerCase().includes(query));
    const hasExactMatch = lookingOptions.some((item) => item.toLowerCase() === query);
    if (query && !hasExactMatch) matches.push(`__custom__${lookingSearch.value.trim()}`);
    lookingResults.innerHTML = matches.length ? matches.map((item) => {
      if (item.startsWith('__custom__')) return `<button type="button" class="skill-option skill-option--custom" data-custom-looking="${item.slice(10).replace(/"/g, '&quot;')}">ADD “${item.slice(10)}” AS OTHER <span>＋</span></button>`;
      const isSelected = selectedLooking.includes(item);
      return `<button type="button" class="skill-option${isSelected ? ' is-selected' : ''}" data-looking-option="${item.replace(/"/g, '&quot;')}" role="option" aria-selected="${isSelected}">${item}<span>${isSelected ? '✓' : '＋'}</span></button>`;
    }).join('') : '<p class="skills-empty">No match. Type your own option and press Enter.</p>';
    lookingResults.querySelectorAll('[data-looking-option]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.dataset.lookingOption;
        if (item === 'Other') {
          customLookingMode = true;
          lookingPicker.classList.remove('is-open');
          lookingOtherInput?.removeAttribute('hidden');
          lookingOtherInput?.focus();
          return;
        }
        customLookingMode = false;
        lookingSearch.placeholder = 'Search what brings you here...';
        const index = selectedLooking.indexOf(item);
        if (index > -1) selectedLooking.splice(index, 1); else selectedLooking.push(item);
        syncLooking();
        renderLooking();
        lookingSearch.focus();
      });
    });
    lookingResults.querySelectorAll('[data-custom-looking]').forEach((button) => button.addEventListener('click', () => addLooking(button.dataset.customLooking)));
  };

  resetLooking = () => {
    selectedLooking.splice(0, selectedLooking.length);
    customLookingMode = false;
    lookingOtherInput?.setAttribute('hidden', '');
    if (lookingOtherInput) lookingOtherInput.value = '';
    if (lookingSearch) {
      lookingSearch.value = '';
      lookingSearch.placeholder = 'Search what brings you here...';
    }
    syncLooking();
    renderLooking();
  };
  fillLooking = (value) => {
    selectedLooking.splice(0, selectedLooking.length, ...String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
    syncLooking();
    renderLooking();
  };
  lookingSearch?.addEventListener('focus', () => { lookingPicker.classList.add('is-open'); renderLooking(); });
  lookingSearch?.addEventListener('input', () => { lookingPicker.classList.add('is-open'); renderLooking(); });
  lookingSearch?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !lookingSearch.value.trim()) return;
    event.preventDefault();
    addLooking(lookingSearch.value);
  });
  lookingOtherInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !lookingOtherInput.value.trim()) return;
    event.preventDefault();
    addLooking(lookingOtherInput.value);
  });
  document.addEventListener('click', (event) => {
    const clickedInsidePicker = event.composedPath().includes(lookingPicker);
    if (!clickedInsidePicker) {
      lookingPicker.classList.remove('is-open');
      lookingSearch?.setAttribute('aria-expanded', 'false');
    } else lookingSearch?.setAttribute('aria-expanded', String(lookingPicker.classList.contains('is-open')));
  });
  renderLooking();
}

// ---------------------------------------------------------------------------------------------------------------
// ORBIT onboarding (UX_SPEC flow A). Step 2 "Your area" and step 3 "What you care about" (interests + Passion Budget).
// Privacy (CLAUDE.md, Review Focus 4): coordinates live only in `areaChoice` below, in memory. They are never written
// to localStorage / sessionStorage, the URL, the DOM or a log, and are dropped as soon as the server has the cell.
// ---------------------------------------------------------------------------------------------------------------
const GEO_OPTIONS = { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 };
const AREA_FALLBACK_TEXT = 'No problem. Pick your city instead.';
const BUDGET_ERROR_TEXT = 'Place all 20 points to continue.';
// D-038 R3: sensitive interests are never shown to others and do not affect who the member sees yet.
const PRIVATE_HINT_TEXT = 'Private: never shown on your profile, and does not change who you see';
// R2: sensitive interests are offered only after the member opens the consent panel and continues (the box ticked).
// Their nodes stay in the catalog (as `hidden`) so stored picks still get labels. Consent is sent to the server only
// when a sensitive pick is submitted (finishOnboarding), never on Continue.
let privateUnlocked = false;
const escapeText = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const svgIcon = (name) => {
  const paths = {
    plus: '<path d="M12 5v14M5 12h14" />',
    minus: '<path d="M5 12h14" />',
    close: '<path d="M6 6l12 12M18 6L6 18" />',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" />',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />',
  };
  return `<svg class="ob-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || ''}</svg>`;
};
// Re-renders a container and puts focus back on the element with the same data-focus-key (keyboard users keep place).
const renderKeepingFocus = (container, html) => {
  if (!container) return;
  const active = document.activeElement;
  const key = active && container.contains(active) ? active.dataset?.focusKey : null;
  container.innerHTML = html;
  if (key) [...container.querySelectorAll('[data-focus-key]')].find((el) => el.dataset.focusKey === key)?.focus({ preventScroll: true });
};

// { kind: 'geo', lat, lng } | { kind: 'city', placeId, label } | { kind: 'keep', label } (a cell is already stored)
let areaChoice = null;
const areaRoot = signupForm?.querySelector('[data-area]');
const areaGeoButton = areaRoot?.querySelector('[data-area-geo]');
const areaCityButton = areaRoot?.querySelector('[data-area-city]');
const areaPicker = areaRoot?.querySelector('[data-area-picker]');
const areaFallback = areaRoot?.querySelector('[data-area-fallback]');
const areaSearch = areaRoot?.querySelector('#area-city-search');
const areaResults = areaRoot?.querySelector('#area-city-results');
const areaStatus = areaRoot?.querySelector('[data-area-status]');
const areaError = areaRoot?.querySelector('[data-area-error]');
let cityOptions = [];
let cityActive = -1;
let citySearchSeq = 0;
let citySearchTimer;
let geoPending = false;

const setAreaStatus = (text) => { if (areaStatus) areaStatus.textContent = text; };
const setAreaError = (text) => { if (areaError) areaError.textContent = text; };
const setCityListOpen = (open) => {
  areaSearch?.setAttribute('aria-expanded', String(open));
  areaResults?.toggleAttribute('hidden', !open);
  if (!open) { cityActive = -1; areaSearch?.removeAttribute('aria-activedescendant'); }
};
const highlightCity = (index) => {
  const options = [...(areaResults?.querySelectorAll('[role="option"]') || [])];
  if (!options.length) return;
  cityActive = (index + options.length) % options.length;
  options.forEach((option, i) => option.setAttribute('aria-selected', String(i === cityActive)));
  areaSearch?.setAttribute('aria-activedescendant', options[cityActive].id);
  options[cityActive].scrollIntoView({ block: 'nearest' });
};
const renderCityResults = async () => {
  if (!areaSearch || !areaResults) return;
  const seq = ++citySearchSeq;
  const { data, error } = await searchPlaces(areaSearch.value);
  if (seq !== citySearchSeq) return;
  cityOptions = error ? [] : data;
  areaResults.innerHTML = cityOptions.length
    ? cityOptions.map((place, i) => `<li class="area-city-option" role="option" id="area-city-option-${i}" aria-selected="false" data-place-index="${i}"><span>${escapeText(place.name)}</span><small>${escapeText(place.region)}</small></li>`).join('')
    : `<li class="area-city-empty" role="presentation">${error ? 'Cities could not load. Check your connection and try again.' : 'No city found. Try the nearest larger city.'}</li>`;
  setCityListOpen(true);
  cityActive = -1;
};
const chooseCity = (place) => {
  if (!place) return;
  areaChoice = { kind: 'city', placeId: place.id, label: `${place.name}, ${place.region}` };
  if (areaSearch) areaSearch.value = place.name;
  setCityListOpen(false);
  setAreaError('');
  setAreaStatus(`Your area: ${place.name}, ${place.region}. We use the city's centre, never your address.`);
};
const openCityPicker = (fallbackText = '') => {
  if (!areaPicker) return;
  areaPicker.hidden = false;
  areaCityButton?.setAttribute('aria-expanded', 'true');
  if (areaFallback) areaFallback.textContent = fallbackText;
  areaSearch?.focus();
  void renderCityResults();
};
const useMyLocation = () => {
  if (geoPending) return;
  setAreaError('');
  const geo = window.isSecureContext ? navigator.geolocation : undefined;
  if (!geo || typeof geo.getCurrentPosition !== 'function') { setAreaStatus(''); openCityPicker(AREA_FALLBACK_TEXT); return; }
  geoPending = true;
  areaGeoButton?.setAttribute('aria-busy', 'true');
  setAreaStatus('Finding your area…');
  let settled = false;
  const fallBack = () => {
    if (settled) return;
    settled = true;
    geoPending = false;
    areaGeoButton?.removeAttribute('aria-busy');
    setAreaStatus('');
    openCityPicker(AREA_FALLBACK_TEXT);
  };
  // A permission prompt that is never answered must not strand the member either.
  const guard = window.setTimeout(fallBack, 15000);
  try {
    geo.getCurrentPosition((position) => {
      window.clearTimeout(guard);
      if (settled) return;
      const lat = Number(position?.coords?.latitude);
      const lng = Number(position?.coords?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { fallBack(); return; }
      settled = true;
      geoPending = false;
      areaGeoButton?.removeAttribute('aria-busy');
      areaChoice = { kind: 'geo', lat, lng };
      if (areaPicker) areaPicker.hidden = true;
      areaCityButton?.setAttribute('aria-expanded', 'false');
      setAreaStatus("Got it. We keep only the ~2 km square you're in.");
    }, () => { window.clearTimeout(guard); fallBack(); }, GEO_OPTIONS);
  } catch {
    window.clearTimeout(guard);
    fallBack();
  }
};
const resetArea = () => {
  areaChoice = null;
  geoPending = false;
  areaGeoButton?.removeAttribute('aria-busy');
  if (areaPicker) areaPicker.hidden = true;
  areaCityButton?.setAttribute('aria-expanded', 'false');
  if (areaFallback) areaFallback.textContent = '';
  if (areaSearch) areaSearch.value = '';
  if (areaResults) areaResults.innerHTML = '';
  setCityListOpen(false);
  setAreaStatus('');
  setAreaError('');
};
const keepCurrentArea = (label) => {
  areaChoice = { kind: 'keep', label: label || '' };
  setAreaStatus(label ? `Your area: ${label}. Choose again to change it.` : 'Your area is set. Choose again to change it.');
};
areaGeoButton?.addEventListener('click', useMyLocation);
areaCityButton?.addEventListener('click', () => openCityPicker(''));
areaSearch?.addEventListener('input', () => {
  // The visible options no longer match what was typed: drop them so Enter cannot pick a stale city.
  citySearchSeq += 1;
  cityOptions = [];
  if (areaResults) areaResults.innerHTML = '';
  setCityListOpen(false);
  window.clearTimeout(citySearchTimer);
  citySearchTimer = window.setTimeout(() => void renderCityResults(), 150);
});
areaSearch?.addEventListener('focus', () => { if (!areaResults?.children.length) void renderCityResults(); });
areaSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (areaSearch.getAttribute('aria-expanded') !== 'true') { void renderCityResults(); return; }
    highlightCity(cityActive + (event.key === 'ArrowDown' ? 1 : -1) + (cityActive < 0 && event.key === 'ArrowUp' ? 1 : 0));
  } else if (event.key === 'Enter') {
    event.preventDefault(); // never submit the signup form from the city search
    if (cityActive >= 0) chooseCity(cityOptions[cityActive]);
    else if (cityOptions.length === 1) chooseCity(cityOptions[0]);
  } else if (event.key === 'Escape' && areaSearch.getAttribute('aria-expanded') === 'true') {
    event.preventDefault();
    event.stopPropagation();
    setCityListOpen(false);
  }
});
areaResults?.addEventListener('mousedown', (event) => event.preventDefault()); // keep focus in the input
areaResults?.addEventListener('click', (event) => {
  const option = event.target.closest('[data-place-index]');
  if (option) chooseCity(cityOptions[Number(option.dataset.placeIndex)]);
});

// Step 3: interests and the Passion Budget.
let budget = emptyBudget();
let interestCatalog = null; // { groups: [{ id, label, domain, items: [{ id, label, sensitive, search }] }] }
let interestCatalogPromise = null;
const openInterestGroups = new Set();
const interestPicker = signupForm?.querySelector('[data-interest-picker]');
const interestSearch = interestPicker?.querySelector('#interest-search');
const interestHelp = interestPicker?.querySelector('#interest-help');
const interestResults = interestPicker?.querySelector('#interest-results');
const budgetList = signupForm?.querySelector('#budget-list');
const budgetCounter = signupForm?.querySelector('#budget-counter');
const budgetError = signupForm?.querySelector('#budget-error');
const budgetEmpty = signupForm?.querySelector('[data-budget-empty]');
const budgetNext = signupForm?.querySelector('[data-signup-step="3"] .signup-next');
const INTEREST_HELP_TEXT = 'Choose 1 to 12. Select again to remove.';
const normalizeSearch = (value) => String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();

const buildInterestCatalog = (nodes) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map();
  const hidden = [];
  nodes.filter((node) => node.level === 2).forEach((node) => {
    groups.set(node.id, { id: node.id, label: node.label, domain: byId.get(node.parent_id)?.label || '', items: [] });
  });
  nodes.filter((node) => node.level >= 3).forEach((node) => {
    const group = groups.get(node.id.split('.').slice(0, 2).join('.'));
    if (!group) return;
    const parent = node.level === 4 ? byId.get(node.parent_id)?.label || '' : '';
    const item = { id: node.id, label: node.label, sensitive: Boolean(node.sensitive), search: normalizeSearch(`${node.label} ${parent} ${group.label}`) };
    if (item.sensitive && !privateUnlocked) hidden.push(item);
    else group.items.push(item);
  });
  return { groups: [...groups.values()].filter((group) => group.items.length), hidden };
};
let interestNodes = [];
const loadInterestCatalog = () => {
  interestCatalogPromise ||= fetchInterestNodes().then(({ data, error }) => {
    if (error) throw error;
    interestNodes = data || [];
    interestCatalog = buildInterestCatalog(interestNodes);
    return interestCatalog;
  }).catch((error) => { interestCatalogPromise = null; throw error; });
  return interestCatalogPromise;
};
const interestChip = (item) => {
  const selected = budget.items.some((chosen) => chosen.id === item.id);
  const full = !selected && budget.items.length >= MAX_INTERESTS;
  return `<button type="button" class="interest-chip${selected ? ' is-selected' : ''}${item.sensitive ? ' is-private' : ''}" data-interest-id="${escapeText(item.id)}" data-focus-key="chip:${escapeText(item.id)}" aria-pressed="${selected}"${full ? ' aria-disabled="true"' : ''}><span class="interest-chip-label">${escapeText(item.label)}</span>${svgIcon(selected ? 'check' : 'plus')}${item.sensitive ? `<small class="interest-private">${svgIcon('lock')}${PRIVATE_HINT_TEXT}</small>` : ''}</button>`;
};
const renderInterestResults = () => {
  if (!interestResults) return;
  if (!interestCatalog) {
    interestResults.innerHTML = '<p class="interest-loading">Loading interests…</p>';
    loadInterestCatalog().then(() => { renderBudget(); renderInterestResults(); }).catch(() => {
      interestResults.innerHTML = '<p class="interest-loading">Interests could not load. <button type="button" class="interest-retry" data-interest-retry>TRY AGAIN</button></p>';
    });
    return;
  }
  const query = normalizeSearch(interestSearch?.value);
  // A short result count in the polite live region (only when it changes, so re-renders do not re-announce).
  const setHelp = (text) => { if (interestHelp && interestHelp.textContent !== text) interestHelp.textContent = text; };
  if (query) {
    const total = interestCatalog.groups.reduce((sum, group) => sum + group.items.filter((item) => item.search.includes(query)).length, 0);
    setHelp(total === 0 ? 'No matches' : total === 1 ? '1 match' : `${total} matches`);
  } else if (/match/.test(interestHelp?.textContent || '')) setHelp(INTEREST_HELP_TEXT);
  if (!query) {
    // Browse: one collapsible group per category (level 2); chips (levels 3-4) inside.
    renderKeepingFocus(interestResults, interestCatalog.groups.map((group) => `<details class="interest-group" data-interest-group="${escapeText(group.id)}"${openInterestGroups.has(group.id) ? ' open' : ''}><summary data-focus-key="group:${escapeText(group.id)}"><span>${escapeText(group.label)}</span><small>${escapeText(group.domain)}</small></summary><div class="interest-chips">${group.items.map(interestChip).join('')}</div></details>`).join(''));
    return;
  }
  let shown = 0;
  const html = interestCatalog.groups.map((group) => {
    const items = group.items.filter((item) => item.search.includes(query)).slice(0, Math.max(0, 40 - shown));
    shown += items.length;
    if (!items.length) return '';
    return `<div class="interest-group is-match" data-interest-group="${escapeText(group.id)}"><p class="interest-group-title"><span>${escapeText(group.label)}</span><small>${escapeText(group.domain)}</small></p><div class="interest-chips">${items.map(interestChip).join('')}</div></div>`;
  }).join('');
  renderKeepingFocus(interestResults, html || '<p class="interest-loading">No interest matches that yet. Try a broader word.</p>');
};
const catalogNode = (id) => interestCatalog?.groups.flatMap((group) => group.items).find((node) => node.id === id)
  || interestCatalog?.hidden?.find((node) => node.id === id) || null;
const isSensitiveInterest = (id) => Boolean(catalogNode(id)?.sensitive);
// The consent panel (R2): a real <dialog> (focus trap, Escape, focus return are the platform's). Nothing is pre-ticked;
// "Not now" and "Continue" weigh the same. Continue unlocks the private chips; the server call happens at submit.
const privateDialog = signupForm?.querySelector('#private-consent');
const privateOpenButton = signupForm?.querySelector('[data-private-open]');
const privateCheck = privateDialog?.querySelector('[data-private-checkbox]');
const privateContinue = privateDialog?.querySelector('[data-private-continue]');
const privateMessage = privateDialog?.querySelector('[data-private-message]');
let serverWantedConsent = false;
const openPrivateConsent = (message = '') => {
  if (!privateDialog || privateDialog.open) return;
  if (privateCheck) privateCheck.checked = false;
  if (privateContinue) privateContinue.disabled = true;
  if (privateMessage) { privateMessage.textContent = message; privateMessage.hidden = !message; }
  if (typeof privateDialog.showModal === 'function') privateDialog.showModal(); else privateDialog.setAttribute('open', '');
  privateCheck?.focus();
};
const closePrivateConsent = () => {
  if (privateDialog?.open) privateDialog.close();
  // The platform returns focus to the opener; if that is gone (hidden after Continue, or a refusal opened the panel)
  // focus lands on the interest search.
  if (!document.activeElement || document.activeElement === document.body || privateOpenButton?.hidden) interestSearch?.focus();
};
const unlockPrivate = () => {
  privateUnlocked = true;
  if (interestCatalog) interestCatalog = buildInterestCatalog(interestNodes);
  if (privateOpenButton) privateOpenButton.hidden = true;
  renderInterestResults();
};
privateOpenButton?.addEventListener('click', () => openPrivateConsent());
privateCheck?.addEventListener('change', () => { if (privateContinue) privateContinue.disabled = !privateCheck.checked; });
privateDialog?.querySelector('[data-private-cancel]')?.addEventListener('click', closePrivateConsent);
privateContinue?.addEventListener('click', () => { if (!privateCheck?.checked) return; unlockPrivate(); closePrivateConsent(); });
const budgetNote = signupForm?.querySelector('[data-budget-note]');
const showBudgetNote = (text) => { if (budgetNote) { budgetNote.textContent = text; budgetNote.hidden = !text; } };
const budgetRow = (item) => {
  const id = escapeText(item.id);
  // A pending list carries no labels: the taxonomy names them once it is loaded.
  const label = escapeText(catalogNode(item.id)?.label || item.label);
  const sensitive = isSensitiveInterest(item.id);
  return `<li class="budget-row" data-budget-row="${id}">
    <div class="budget-row-head"><span class="budget-label">${label}</span>${sensitive ? `<small class="interest-private">${svgIcon('lock')}${PRIVATE_HINT_TEXT}</small>` : ''}</div>
    <div class="budget-controls">
      <div class="budget-stepper" role="group" aria-label="Points for ${label}">
        <button type="button" class="budget-step" data-step="-1" data-id="${id}" data-focus-key="minus:${id}" aria-label="Remove a point from ${label}">${svgIcon('minus')}</button>
        <span class="budget-points"><span data-budget-points>${item.points}</span><span class="sr-only"> points</span></span>
        <button type="button" class="budget-step" data-step="1" data-id="${id}" data-focus-key="plus:${id}" aria-label="Add a point to ${label}">${svgIcon('plus')}</button>
      </div>
      <div class="mode-control" role="radiogroup" aria-label="How you take part in ${label}">${MODES.map((mode) => `<label class="mode-option"><input type="radio" name="mode-${id}" value="${mode}" data-id="${id}" data-focus-key="mode:${id}:${mode}"${item.mode === mode ? ' checked' : ''} /><span>${mode[0].toUpperCase()}${mode.slice(1)}</span></label>`).join('')}</div>
      <button type="button" class="budget-remove" data-remove-interest="${id}" data-focus-key="remove:${id}" aria-label="Remove ${label}">${svgIcon('close')}</button>
    </div>
  </li>`;
};
// Updates the counter, the stepper states and Next without rebuilding the rows.
const syncBudgetState = () => {
  const left = pointsLeft(budget);
  if (budgetCounter) budgetCounter.textContent = counterText(budget);
  budget.items.forEach((item) => {
    const row = [...(budgetList?.querySelectorAll('[data-budget-row]') || [])].find((el) => el.dataset.budgetRow === item.id);
    if (!row) return;
    row.querySelector('[data-budget-points]').textContent = String(item.points);
    row.querySelector('[data-step="-1"]').setAttribute('aria-disabled', String(item.points <= 1));
    row.querySelector('[data-step="1"]').setAttribute('aria-disabled', String(left <= 0));
  });
  const complete = isComplete(budget);
  budgetNext?.setAttribute('aria-disabled', String(!complete));
  // Completing the budget clears only the "place all points" error; a save error stays until step 3 is re-entered.
  if (complete && budgetError?.textContent === BUDGET_ERROR_TEXT) budgetError.textContent = '';
  if (budgetEmpty) budgetEmpty.hidden = budget.items.length > 0;
};
const renderBudget = () => {
  renderKeepingFocus(budgetList, budget.items.map(budgetRow).join(''));
  syncBudgetState();
};
const setBudget = (next, { rerenderChips = false } = {}) => {
  const rowsChanged = next.items.length !== budget.items.length || next.items.some((item, i) => item.id !== budget.items[i]?.id);
  budget = next;
  if (rowsChanged) renderBudget(); else syncBudgetState();
  if (rowsChanged || rerenderChips) renderInterestResults();
};
const resetBudget = () => {
  budget = emptyBudget();
  if (interestSearch) interestSearch.value = '';
  if (interestHelp) interestHelp.textContent = INTEREST_HELP_TEXT;
  if (budgetError) budgetError.textContent = '';
  showBudgetNote('');
  renderBudget();
  if (interestCatalog) renderInterestResults();
};
const toggleInterest = (id) => {
  const item = catalogNode(id);
  if (!item) return;
  if (budget.items.some((chosen) => chosen.id === id)) { setBudget(removeInterest(budget, id)); return; }
  const next = addInterest(budget, { id: item.id, label: item.label });
  if (next === budget) { if (interestHelp) interestHelp.textContent = `You can choose up to ${MAX_INTERESTS} interests. Remove one to add another.`; return; }
  if (interestHelp) interestHelp.textContent = INTEREST_HELP_TEXT;
  setBudget(next);
};
interestSearch?.addEventListener('input', renderInterestResults);
interestSearch?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') event.preventDefault();
  if (event.key === 'Escape') {
    // Escape clears the search (and is consumed: the global Escape never closes the signup from here).
    event.preventDefault();
    if (interestSearch.value) { interestSearch.value = ''; renderInterestResults(); }
  }
});
interestResults?.addEventListener('click', (event) => {
  if (event.target.closest('[data-interest-retry]')) { renderInterestResults(); return; }
  const chip = event.target.closest('[data-interest-id]');
  if (chip) toggleInterest(chip.dataset.interestId);
});
interestResults?.addEventListener('toggle', (event) => {
  const group = event.target.closest?.('[data-interest-group]');
  if (!group || group.tagName !== 'DETAILS') return;
  if (group.open) openInterestGroups.add(group.dataset.interestGroup); else openInterestGroups.delete(group.dataset.interestGroup);
}, true);
budgetList?.addEventListener('click', (event) => {
  const step = event.target.closest('[data-step]');
  if (step) {
    if (step.getAttribute('aria-disabled') === 'true') return;
    setBudget(stepPoints(budget, step.dataset.id, Number(step.dataset.step)));
    return;
  }
  const remove = event.target.closest('[data-remove-interest]');
  if (remove) {
    const id = remove.dataset.removeInterest;
    const rows = [...budgetList.querySelectorAll('[data-budget-row]')];
    const index = rows.findIndex((row) => row.dataset.budgetRow === id);
    setBudget(removeInterest(budget, id));
    // Keep keyboard focus in the list: the next row's remove button, else the search field.
    const nextRow = budgetList.querySelectorAll('[data-budget-row]')[Math.min(index, budget.items.length - 1)];
    (nextRow?.querySelector('[data-remove-interest]') || interestSearch)?.focus({ preventScroll: true });
  }
});
budgetList?.addEventListener('change', (event) => {
  const radio = event.target.closest('input[type="radio"][data-id]');
  if (radio) budget = setMode(budget, radio.dataset.id, radio.value);
});
const showBudgetError = () => { if (budgetError) budgetError.textContent = BUDGET_ERROR_TEXT; };
renderBudget();

if (authCta && authModal) {
  authCta.classList.add('auth-trigger');
  authCta.setAttribute('href', '/auth.html');
  authCta.setAttribute('aria-haspopup', 'dialog');
  authCta.innerHTML = '<span class="button-label">START SWIPING</span><span class="button-arrows">→</span>';
}

const resetSignup = () => {
  signupForm?.reset();
  resetArea();
  resetBudget();
  resetLooking();
  resetPhoto();
  resetCover();
  setAdultError('');
  adultAlreadyDeclared = false;
  profileCompletionUser = null;
  profileCompletionPhotoUrl = '';
  profileCompletionCoverUrl = '';
  signupForm?.elements.namedItem('email')?.removeAttribute('readonly');
  setSignupPasswordMode(true);
  setSignupStep(1, false);
  const submit = signupForm?.querySelector('[type="submit"]');
  if (submit) submit.innerHTML = 'CREATE MY PROFILE <span>→</span>';
  signupForm?.removeAttribute('hidden');
  signupSuccess?.setAttribute('hidden', '');
  const backButton = authModal?.querySelector('.auth-back-trigger');
  if (backButton) {
    backButton.removeAttribute('hidden');
    backButton.textContent = '← BACK TO LOGIN';
  }
};

function setSignupPasswordMode(enabled, required = enabled) {
  if (!signupPasswordFields) return;
  signupPasswordFields.toggleAttribute('hidden', !enabled);
  signupPasswordFields.querySelectorAll('input').forEach((input) => {
    input.required = required;
    if (!enabled) input.value = '';
  });
}

const SIGNUP_STEPS = 4;
const SIGNUP_STEP_LABELS = ['THE BASICS', 'YOUR AREA', 'WHAT YOU CARE ABOUT', 'SECURITY & PRESENCE'];
function setSignupStep(step, focusFirst = true) {
  signupCurrentStep = Math.min(SIGNUP_STEPS, Math.max(1, Number(step) || 1));
  signupForm?.querySelectorAll('[data-signup-step]').forEach((panel) => {
    panel.toggleAttribute('hidden', Number(panel.dataset.signupStep) !== signupCurrentStep);
  });
  if (signupProgress) { signupProgress.setAttribute('aria-valuemax', String(SIGNUP_STEPS)); signupProgress.setAttribute('aria-valuenow', String(signupCurrentStep)); }
  if (signupProgressFill) signupProgressFill.style.width = `${(signupCurrentStep / SIGNUP_STEPS) * 100}%`;
  if (signupStepLabel) signupStepLabel.textContent = `STEP ${signupCurrentStep} OF ${SIGNUP_STEPS} · ${SIGNUP_STEP_LABELS[signupCurrentStep - 1]}`;
  // The taxonomy is fetched while the member is on "Your area", so "What you care about" opens ready.
  if (signupCurrentStep >= 2 && !interestCatalog) loadInterestCatalog().then(() => { renderBudget(); renderInterestResults(); }).catch(() => {});
  if (signupCurrentStep === 3) {
    if (budgetError) budgetError.textContent = '';
    renderInterestResults();
  }
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  authPanel?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  if (focusFirst) {
    const activeStep = signupForm?.querySelector(`[data-signup-step="${signupCurrentStep}"]`);
    const firstVisibleField = [...(activeStep?.querySelectorAll('input:not([type="hidden"]):not([type="file"]), select, textarea, button:not(.signup-step-prev)') || [])]
      .find((field) => field.getClientRects().length && !field.disabled);
    firstVisibleField?.focus({ preventScroll: true });
  }
}

// R1: the 18+ confirmation. The error is inline (aria-describedby on the box), never a reportValidity bubble.
const adultBox = signupForm?.elements.namedItem('adultConfirm');
const adultError = document.getElementById('adult-error');
const ADULT_REQUIRED_TEXT = 'You need to be 18 or older to join Brivia.';
const ADULT_SAVE_ERROR = "We couldn't record your confirmation. Please try again.";
const setAdultError = (message) => {
  if (adultError) adultError.textContent = message || '';
  adultBox?.setAttribute('aria-invalid', message ? 'true' : 'false');
};
const validateAdultConfirm = () => {
  if (adultBox?.checked) { setAdultError(''); return true; }
  setAdultError(ADULT_REQUIRED_TEXT);
  adultBox?.focus();
  return false;
};
adultBox?.addEventListener('change', () => { if (adultBox.checked) setAdultError(''); });

const validateSignupStep = (step = signupCurrentStep) => {
  const activeStep = signupForm?.querySelector(`[data-signup-step="${step}"]`);
  if (!activeStep) return true;
  const fields = [...activeStep.querySelectorAll('input, select, textarea')].filter((field) => field.type !== 'hidden' && field.type !== 'file' && !field.disabled);
  for (const field of fields) {
    if (!field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }
  return true;
};
// Step gates. Step 2 needs an area; step 3 needs a complete Passion Budget (error beside the counter) and one
// "looking for" choice.
const validateOnboardingStep = (step) => {
  if (step === 2) {
    if (areaChoice) return true;
    setAreaError('Choose your area to continue.');
    return false;
  }
  if (step === 3) {
    if (!isComplete(budget)) { showBudgetError(); return false; }
    return validateSignupStep(3);
  }
  if (step === 1) return validateSignupStep(1) && validateAdultConfirm();
  return validateSignupStep(step);
};
signupForm?.querySelectorAll('.signup-next').forEach((button) => button.addEventListener('click', () => {
  const nextStep = Number(button.dataset.nextStep);
  if (nextStep && validateOnboardingStep(nextStep - 1)) setSignupStep(nextStep);
}));
signupForm?.querySelectorAll('.signup-step-prev').forEach((button) => button.addEventListener('click', () => {
  setSignupStep(button.dataset.prevStep || 1);
}));

const signupFeedback = signupForm ? document.createElement('p') : null;
if (signupFeedback && signupForm) {
  signupFeedback.className = 'auth-note';
  signupFeedback.id = 'signup-feedback';
  signupFeedback.setAttribute('aria-live', 'polite');
  signupForm.setAttribute('novalidate', '');
  signupForm.after(signupFeedback);
}

const signupSuccessTitle = signupSuccess?.querySelector('h2');
const signupSuccessMessage = signupSuccess?.querySelector('p');
signupSuccessTitle?.setAttribute('data-auth-success-title', '');
signupSuccessMessage?.setAttribute('data-auth-success-message', '');
if (signupSuccessMessage) signupSuccessMessage.textContent = 'We sent a verification link. Your email is your login ID; your password stays private and is never shown here.';

signupSuccess?.querySelectorAll('[data-copy-credential]').forEach((button) => {
  button.addEventListener('click', async () => {
    const key = button.dataset.copyCredential;
    const value = signupSuccess.querySelector(`[data-credential="${key}"]`)?.textContent || '';
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = 'COPIED';
      window.setTimeout(() => { button.textContent = 'COPY'; }, 1600);
    } catch {
      button.textContent = 'SELECT & COPY';
    }
  });
});

const setAuthView = (view, historyMode = 'push') => {
  // Never leave a view hidden if the envelope transition was interrupted.
  authShell?.classList.remove('is-envelope-opening');
  authModal?.classList.add('is-open');
  if (isStandaloneAuthPage && view !== authHistoryView && historyMode !== 'none') {
    const state = { briviaAuthView: view };
    const nextUrl = new URL(window.location.href);
    nextUrl.hash = view === 'signup' ? '#signup' : view === 'login' ? '#login' : '';
    if (historyMode === 'replace') window.history.replaceState(state, '', nextUrl);
    else window.history.pushState(state, '', nextUrl);
  }
  authHistoryView = view;
  authViews.forEach((item) => {
    const isActive = item.dataset.authView === view;
    item.classList.toggle('is-active', isActive);
    item.toggleAttribute('hidden', !isActive);
  });
  if (authStep) {
    authStep.textContent = view === 'welcome' ? 'WELCOME' : view === 'login' ? '01 / 02' : '02 / 02';
    authStep.toggleAttribute('hidden', view === 'signup');  // the counter means nothing beside the 4-step signup
    authStep.style.display = view === 'signup' ? 'none' : '';
  }
  if (authPanelKicker) authPanelKicker.textContent = view === 'welcome' ? 'THE BRIVIA CLUB' : view === 'login' ? 'RETURNING MEMBER' : 'YOUR APPLICATION';
  const authTopSignup = authModal?.querySelector('.auth-top-signup');
  if (authTopSignup) authTopSignup.innerHTML = view === 'signup' ? 'ALREADY A MEMBER? <b>LOG IN</b>' : 'NEW HERE? <b>CREATE ACCOUNT</b>';
  if (authShell) authShell.setAttribute('aria-labelledby', view === 'welcome' ? 'auth-welcome-title' : view === 'login' ? 'auth-title' : 'signup-title');
  if (view === 'signup') signupForm?.querySelector('input')?.focus();
};

if (isStandaloneAuthPage) {
  window.addEventListener('popstate', (event) => {
    setAuthView(event.state?.briviaAuthView || 'welcome', 'none');
  });
}

const startGoogleAuth = async () => {
  if (!supabaseReady || !supabase) {
    if (loginNote) loginNote.textContent = 'Google sign-in is not configured yet. Please use email and password.';
    if (signupFeedback) signupFeedback.textContent = 'Google sign-in is not configured yet. Please use email and password.';
    return;
  }
  const buttons = authModal?.querySelectorAll('.auth-google-trigger') || [];
  buttons.forEach((button) => { button.disabled = true; });
  if (loginNote) loginNote.textContent = 'Connecting to Google...';
  if (signupFeedback) signupFeedback.textContent = 'Connecting to Google...';
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth.html`, queryParams: { prompt: 'select_account' } },
    });
    if (!error) return;
    buttons.forEach((button) => { button.disabled = false; });
    if (loginNote) loginNote.textContent = error.message || 'Google sign-in could not start.';
    if (signupFeedback) signupFeedback.textContent = error.message || 'Google sign-in could not start.';
  } catch (error) {
    buttons.forEach((button) => { button.disabled = false; });
    if (loginNote) loginNote.textContent = error.message || 'Google sign-in could not start.';
    if (signupFeedback) signupFeedback.textContent = error.message || 'Google sign-in could not start.';
  }
};

const getPhoneParts = (profile = {}, metadata = {}) => {
  const rawPhone = String(profile.phone || metadata.phone || '').trim();
  let countryCode = String(profile.phoneCountryCode || profile.phone_country_code || metadata.phoneCountryCode || metadata.phone_country_code || '').trim();
  let number = String(profile.phoneNumber || profile.phone_number || metadata.phoneNumber || metadata.phone_number || '').trim();
  if (!number && rawPhone) {
    const match = rawPhone.match(/^(\+\d{1,4})[\s.-]*(.*)$/);
    if (match) { countryCode = countryCode || match[1]; number = match[2]; }
    else number = rawPhone;
  }
  return { phoneCountryCode: countryCode || '+91', phoneNumber: number };
};

const normalizeSignupGender = (value) => {
  const gender = String(value || '').trim().toLowerCase();
  if (gender === 'male') return 'Male';
  if (gender === 'female') return 'Female';
  if (['prefer not to say', 'prefer_not_to_say', 'prefer not say'].includes(gender)) return 'Prefer not to say';
  return '';
};

// Completion (re-entry): the same 4-step form, prefilled, opened at `startStep`. `status` is my_onboarding_status():
// an existing cell is kept unless the member picks a new area; existing interests prefill the Passion Budget.
const showProfileCompletion = (user, savedProfile = null, { startStep = 1, status = null, adultDeclared = false } = {}) => {
  if (!signupForm || !user) return;
  resetSignup();
  profileCompletionUser = user;
  const metadata = user.user_metadata || {};
  const profile = savedProfile || {};
  const phoneParts = getPhoneParts(profile, metadata);
  const values = {
    name: realName(profile.name) || realName(metadata.name) || realName(metadata.full_name),
    email: user.email || profile.email || '',
    phoneCountryCode: phoneParts.phoneCountryCode,
    phoneNumber: phoneParts.phoneNumber,
    phone: profile.phone || metadata.phone || '',
    experience: profile.experience || metadata.experience || '',
    gender: normalizeSignupGender(profile.gender || metadata.gender),
  };
  Object.entries(values).forEach(([name, value]) => {
    const field = signupForm.elements.namedItem(name);
    if (field && value) field.value = value;
  });
  const emailField = signupForm.elements.namedItem('email');
  emailField?.setAttribute('readonly', '');
  fillLooking(profile.lookingFor || profile.looking_for || metadata.lookingFor || metadata.looking_for || '');
  profileCompletionPhotoUrl = profile.photoUrl || metadata.avatar_url || metadata.picture || '';
  profileCompletionCoverUrl = normalizeCoverUrl(profile.coverUrl || profile.cover_url || metadata.coverUrl || '');
  const savedCover = profileCompletionCoverUrl && [...(coverPicker?.querySelectorAll('.cover-choice') || [])].find((choice) => choice.dataset.coverOption === profileCompletionCoverUrl || coverOptionUrl(choice) === profileCompletionCoverUrl);
  if (savedCover) savedCover.click();
  setSignupPasswordMode(true, false);
  const submit = signupForm.querySelector('[type="submit"]');
  if (submit) submit.innerHTML = 'COMPLETE MY PROFILE <span>→</span>';
  const backButton = authModal?.querySelector('.auth-back-trigger');
  if (backButton) backButton.textContent = 'SIGN OUT / BACK TO LOGIN';
  if (signupFeedback) signupFeedback.textContent = 'Finish your Brivia profile to unlock the club.';
  if (status?.has_cell) keepCurrentArea(status.place_label || '');
  // R1: a member whose own row already has adult_declared_at sees the box ticked and is not asked again.
  if (adultDeclared && adultBox) { adultBox.checked = true; adultAlreadyDeclared = true; }
  setAuthView('signup');
  setSignupStep(startStep);
  // An OAuth or older account with no declaration yet lands on step 1 with only the box missing: focus it.
  if (startStep === 1 && !adultDeclared && realName(values.name)) adultBox?.focus();
};

// The first incomplete onboarding step for my_onboarding_status(): 2 without a cell, else 3 (interests / budget).
// A usable display name: trimmed, not empty and not the 'New Member' placeholder (the server's completion rule).
const realName = (value) => { const name = String(value || '').trim(); return name && name !== 'New Member' ? name : ''; };
// The first incomplete onboarding step: 1 without a real name or the 18+ declaration, 2 without a cell, else 3.
const firstIncompleteStep = (status, profileRow = null) => {
  if (!realName(profileRow?.name)) return 1;
  if (!profileRow?.adult_declared_at) return 1;  // R1: OAuth, old accounts and a failed declaration start at the box
  return status?.has_cell ? 3 : 2;
};
const PRIVATE_OMITTED_NOTE = "Private interests aren't kept while you confirm your email. Please pick them again.";
const AREA_SAVE_ERROR = "We couldn't save your area. Please try again.";
const INTERESTS_SAVE_ERROR = 'Your interests could not be saved. Please try again.';
// The server refuses a private (sensitive) interest until the member gives the separate consent (D-038 R3, R2). The
// client then opens the consent panel with this message.
const SENSITIVE_CONSENT_ERROR = 'Private interests need your consent first.';
const isSensitiveConsentError = (error) => /sensitive consent required/i.test(String(error?.message || ''));

// After a profile exists: the app when onboarding is complete, else the completion flow at the first incomplete step.
// An unknown status (RPC error) goes to the app, whose server-side visibility still requires completion (D-030).
// `pendingResult` (from applyPendingOnboarding) carries what happened to a pending signup's area and interests.
const routeAfterProfile = async (user, row = null, pendingResult = null) => {
  const { data: status, error } = await onboardingStatus();
  if (error || !status || status.completed !== false) { redirectToApp(); return; }
  let profileRow = row;
  if (!profileRow) ({ data: profileRow } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle());
  let startStep = firstIncompleteStep(status, profileRow);
  if (pendingResult?.orbitError && startStep > 2) startStep = 2;
  showProfileCompletion(user, profileRow ? rowToProfile(profileRow) : null, { startStep, status, adultDeclared: Boolean(profileRow?.adult_declared_at) });
  if (pendingResult?.adultError) setAdultError(ADULT_SAVE_ERROR);
  if (pendingResult?.orbitError) setAreaError(isRateLimited(pendingResult.orbitError.error, pendingResult.orbitError.status) ? 'Try again later.' : AREA_SAVE_ERROR);
  if (status.interests > 0) {
    const { data: rows } = await fetchMyInterests();
    if (Array.isArray(rows) && rows.length && !budget.items.length) setBudget(budgetFromRows(rows), { rerenderChips: true });
  }
  if (!budget.items.length && pendingResult?.budget?.items.length) {
    setBudget(pendingResult.budget, { rerenderChips: true });
    if (pendingResult.privateOmitted) showBudgetNote(PRIVATE_OMITTED_NOTE);
  }
  if (pendingResult?.interestsFailed && budgetError) budgetError.textContent = INTERESTS_SAVE_ERROR;
  window.history.replaceState({ briviaAuthView: 'signup' }, '', '/auth.html');
};

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

// A signup that needed email confirmation stored { interests, orbit } with the pending profile (never coordinates,
// never labels or sensitive interests). After login: a city choice and complete interests are applied; a geo choice is
// asked for again (step 2). Nothing fails silently: the result tells routeAfterProfile what to show, and the pending
// profile is removed only when every call that was made succeeded.
const applyPendingOnboarding = async (pending) => {
  const result = { orbitError: null, interestsFailed: false, budget: null, privateOmitted: false, ok: true };
  if (!pending || typeof pending !== 'object') return result;
  // R1: the declaration comes first (the server refuses location and interests before it). A pending profile from an
  // older build has none: nothing is applied and the member is asked on step 1; the pending data is kept.
  // The stored interests still prefill step 3 on these early returns.
  result.budget = budgetFromRows(pending.interests);
  result.privateOmitted = pending.privateOmitted === true;
  if (pending.adultDeclared !== true) { result.ok = false; return result; }
  const declared = await declareAdult();
  if (declared.error) { result.adultError = true; result.ok = false; return result; }
  if (pending.orbit?.kind === 'city' && typeof pending.orbit.placeId === 'string' && pending.orbit.placeId) {
    const { error, status } = await setHomeCity(pending.orbit.placeId);
    if (error) result.orbitError = { error, status };
    else dropPendingOrbit();  // applied: a later login must not spend another of the 3 daily location changes
  }
  const stored = budgetFromRows(pending.interests);
  result.budget = stored;
  result.privateOmitted = pending.privateOmitted === true;
  if (isComplete(stored)) {
    const { error } = await setMemberInterests(toPayload(stored));
    if (error) result.interestsFailed = true;
  }
  result.ok = !result.orbitError && !result.interestsFailed;
  if (result.ok) window.localStorage.removeItem('brivia-pending-profile');
  return result;
};
const PENDING_ONBOARDING_KEYS = ['interests', 'orbit', 'privateOmitted', 'savedAt', 'adultDeclared'];
const withoutOnboarding = (profile) => {
  const clean = { ...(profile || {}) };
  PENDING_ONBOARDING_KEYS.forEach((key) => { delete clean[key]; });
  return clean;
};

const restoreAuthPageSession = async () => {
  if (!document.body.classList.contains('auth-page')) return;
  if (!supabaseReady || !supabase) { setAuthView(requestedAuthView, 'none'); return; }
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get('error_description') || params.get('error');
  if (oauthError) {
    setAuthView('login');
    if (loginNote) loginNote.textContent = oauthError.replaceAll('+', ' ');
    window.history.replaceState({ briviaAuthView: 'login' }, '', '/auth.html');
    return;
  }
  const isAuthCallback = Boolean(params.get('code') || params.get('access_token') || window.location.hash.includes('access_token'));
  if (requestedAuthView === 'signup' && !isAuthCallback) {
    await supabase.auth.signOut().catch(() => {});
    resetSignup();
    setAuthView('signup', 'none');
    return;
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.user) {
    setAuthView(requestedAuthView, 'none');
    return;
  }
  const { data: profile, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error) {
    setAuthView('login');
    if (loginNote) loginNote.textContent = `We couldn't verify your Brivia profile: ${error.message}`;
    return;
  }
  if (profile) {
    await routeAfterProfile(session.user, profile);
    return;
  }
  const pending = readPendingProfile();
  const pendingMatches = pending?.email?.toLowerCase() === session.user.email?.toLowerCase();
  if (await restoreCachedMemberProfile(session.user, pendingMatches ? pending : null)) {
    const pendingResult = pendingMatches ? await applyPendingOnboarding(pending) : null;
    await routeAfterProfile(session.user, null, pendingResult);
    return;
  }
  showProfileCompletion(session.user, pendingMatches ? withoutOnboarding(pending) : null);
  window.history.replaceState({ briviaAuthView: 'signup' }, '', '/auth.html');
};

const updateAuthScrollbar = () => {
  if (!authPanel || !authScrollbarThumb) return;
  const scrollable = authPanel.scrollHeight - authPanel.clientHeight;
  const visibleRatio = scrollable > 0 ? authPanel.clientHeight / authPanel.scrollHeight : 1;
  const thumbSize = Math.max(18, visibleRatio * 100);
  const scrollRatio = scrollable > 0 ? authPanel.scrollTop / scrollable : 0;
  authScrollbarThumb.style.height = `${thumbSize}%`;
  authScrollbarThumb.style.top = `${scrollRatio * (100 - thumbSize)}%`;
};

const redirectToApp = () => {
  window.location.replace('/app.html');
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

const restoreCachedMemberProfile = async (user, preferredProfile = null) => {
  if (!user?.id || !supabase) return false;
  const userEmail = String(user.email || '').trim().toLowerCase();
  let cached = null;
  try { cached = JSON.parse(window.localStorage.getItem('brivia-member-profile') || 'null'); } catch { cached = null; }
  const metadata = user.user_metadata || {};
  const metadataProfile = {
    name: metadata.name || metadata.full_name || '',
    email: user.email || '',
    phone: metadata.phone || '',
    phoneCountryCode: metadata.phoneCountryCode || metadata.phone_country_code || '',
    phoneNumber: metadata.phoneNumber || metadata.phone_number || '',
    experience: metadata.experience || '',
    gender: metadata.gender || '',
    lookingFor: metadata.lookingFor || metadata.looking_for || '',
    coverUrl: metadata.coverUrl || metadata.cover_url || '',
  };
  const candidates = [preferredProfile, cached, metadataProfile].filter(Boolean);
  const candidate = candidates.find((item) => {
    const email = String(item.email || user.email || '').trim().toLowerCase();
    const name = String(item.name || item.full_name || '').trim();
    const hasProfileSignals = item !== metadataProfile || Boolean(item.phone || item.experience || item.gender || item.lookingFor || item.coverUrl);
    return email === userEmail && name && name !== 'New Member' && hasProfileSignals;
  });
  if (!candidate) return false;
  const profile = withoutOnboarding(withoutCredentials({ ...candidate, name: candidate.name || candidate.full_name }));
  delete profile.id;
  const { error } = await saveProfile(user.id, profile, null);
  if (error) return false;
  window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...profile, id: user.id, email: user.email }));
  return true;
};

authPanel?.addEventListener('scroll', updateAuthScrollbar, { passive: true });
window.addEventListener('resize', updateAuthScrollbar);
window.requestAnimationFrame(updateAuthScrollbar);

const openAuth = () => {
  if (!authModal) return;
  window.clearTimeout(authCloseTimer);
  window.clearTimeout(authEnvelopeTimer);
  authShell?.classList.remove('is-envelope-opening');
  resetSignup();
  setAuthView(authModal.querySelector('[data-auth-view="login"]') ? 'login' : 'welcome');
  authModal.removeAttribute('hidden');
  document.body.classList.add('auth-open');
  window.requestAnimationFrame(() => authModal.classList.add('is-open'));
  window.setTimeout(() => authModal.querySelector('input')?.focus(), 350);
};

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
  if (document.body.classList.contains('auth-page')) {
    try { window.sessionStorage.setItem('brivia-skip-intro-once', 'true'); } catch {}
    window.location.href = '/';
    return;
  }
  authModal.classList.remove('is-open');
  document.body.classList.remove('auth-open');
  authCloseTimer = window.setTimeout(() => authModal.setAttribute('hidden', ''), 420);
  authCta?.focus();
};

if (document.body.classList.contains('auth-page')) {
  window.addEventListener('pagehide', () => {
    try { window.sessionStorage.setItem('brivia-skip-intro-once', 'true'); } catch {}
  });
}

const openAuthEnvelope = (view) => {
  if (!authShell || authShell.classList.contains('is-envelope-opening')) return;
  window.clearTimeout(authEnvelopeTimer);
  authShell.classList.add('is-envelope-opening');
  authEnvelopeTimer = window.setTimeout(() => {
    setAuthView(view);
    authShell.classList.remove('is-envelope-opening');
  }, 1420);
};

authModal?.querySelector('.auth-close')?.addEventListener('click', closeAuth);
authModal?.querySelector('[data-auth-close]')?.addEventListener('click', closeAuth);
authModal?.querySelector('.auth-welcome-login')?.addEventListener('click', () => openAuthEnvelope('login'));
authModal?.querySelector('.auth-welcome-signup')?.addEventListener('click', () => openAuthEnvelope('signup'));
authModal?.querySelector('.auth-top-signup')?.addEventListener('click', async () => {
  if (authHistoryView === 'signup') { setAuthView('login'); return; }
  await supabase?.auth.signOut().catch(() => {});
  resetSignup();
  setAuthView('signup');
});
authModal?.querySelector('.auth-create-trigger')?.addEventListener('click', async () => {
  await supabase?.auth.signOut().catch(() => {});
  resetSignup();
  setAuthView('signup');
});
authModal?.querySelectorAll('.auth-google-trigger').forEach((button) => button.addEventListener('click', startGoogleAuth));
authModal?.querySelector('.auth-back-trigger')?.addEventListener('click', async () => {
  if (profileCompletionUser && supabase) {
    await supabase.auth.signOut();
    window.localStorage.removeItem('brivia-pending-profile');
  }
  resetSignup();
  setAuthView('login');
});
authModal?.querySelector('.auth-close-success')?.addEventListener('click', closeAuth);

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
    const pending = readPendingProfile();
    const pendingBelongsToUser = pending?.email?.toLowerCase() === data.user?.email?.toLowerCase();
    let loginPendingResult = null;
    if (pending && data.user && pendingBelongsToUser) {
      const safePending = withoutOnboarding(withoutCredentials(pending));
      const { error: profileError } = await saveProfile(data.user.id, safePending, null);
      if (profileError) throw profileError;
      loginPendingResult = await applyPendingOnboarding(pending);
      window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...safePending, id: data.user.id }));
    } else if (pending && !pendingBelongsToUser) {
      window.localStorage.removeItem('brivia-pending-profile');
    }
    const { data: ownProfile, error: ownProfileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    if (ownProfileError) throw ownProfileError;
    if (!ownProfile) {
      if (await restoreCachedMemberProfile(data.user)) {
        await routeAfterProfile(data.user);
        return;
      }
      showProfileCompletion(data.user, pendingBelongsToUser ? withoutOnboarding(pending) : null);
      return;
    }
    const cachedPendingProfile = pendingBelongsToUser ? withoutOnboarding(withoutCredentials(pending)) : {};
    window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...cachedPendingProfile, id: data.user.id, email: data.user.email || email }));
    if (pendingBelongsToUser && pending?.coverUrl) {
      await supabase.auth.updateUser({ data: { coverUrl: pending.coverUrl } }).catch(() => {});
    }
    await routeAfterProfile(data.user, ownProfile, loginPendingResult);
  } catch (error) {
    if (loginNote) loginNote.textContent = error.message || 'Could not sign you in. Check your email and password.';
  } finally {
    if (submit) submit.disabled = false;
  }
});

// The profile fields a signup stores (an allowlist: no password, no picker inputs, no coordinates).
const SIGNUP_PROFILE_FIELDS = ['name', 'email', 'phoneCountryCode', 'phoneNumber', 'gender', 'experience', 'lookingFor', 'coverUrl'];
const collectSignupProfile = (formData) => {
  const profile = {};
  SIGNUP_PROFILE_FIELDS.forEach((key) => { profile[key] = String(formData.get(key) || '').trim(); });
  return profile;
};

class OnboardingStepError extends Error {}
// After saveProfile: the home area (location or city), then the Passion Budget. A failure returns the member to the
// step that failed with the error beside it; the profile row already saved is simply updated on the next try.
const cityWideLabel = (label) => (!label || /\(city-wide\)$/.test(label) ? label : `${label} (city-wide)`);
// R1: record the 18+ declaration right after the profile row exists and before any location or interest call.
const declareAdultStep = async () => {
  if (adultAlreadyDeclared) return;
  const { error } = await declareAdult();
  if (error) {
    setSignupStep(1, false);
    setAdultError(ADULT_SAVE_ERROR);
    adultBox?.focus();
    throw new OnboardingStepError(ADULT_SAVE_ERROR);
  }
  adultAlreadyDeclared = true;
};
const finishOnboarding = async () => {
  await declareAdultStep();
  if (areaChoice && areaChoice.kind !== 'keep') {
    const choice = areaChoice;
    const { data, error, status } = choice.kind === 'geo' ? await setHomeLocation(choice.lat, choice.lng) : await setHomeCity(choice.placeId);
    if (error) {
      setSignupStep(2);
      const message = isRateLimited(error, status) ? 'Try again later.' : AREA_SAVE_ERROR;
      setAreaError(message);
      throw new OnboardingStepError(message);
    }
    // The server has the cell: forget the coordinates.
    // set_home_city is always a city pick (precision 'place'): the label says so; a location result gets no suffix.
    const savedLabel = typeof data === 'string' && data ? data : choice.label || '';
    keepCurrentArea(choice.kind === 'city' ? cityWideLabel(savedLabel) : savedLabel);
  }
  // R2: consent is given only when a private interest is in the budget (or the server asked for it and the member agreed
  // in the panel), and is withdrawn again if the save then fails.
  const wantsConsent = budget.items.some((item) => isSensitiveInterest(item.id)) || (serverWantedConsent && privateUnlocked);
  let gaveConsent = false;
  if (wantsConsent) {
    const { error: consentError } = await setSensitiveConsent(true);
    if (consentError) {
      setSignupStep(3);
      if (budgetError) budgetError.textContent = INTERESTS_SAVE_ERROR;
      throw new OnboardingStepError(INTERESTS_SAVE_ERROR);
    }
    gaveConsent = true;
  }
  const { error } = await setMemberInterests(toPayload(budget));
  if (error) {
    if (gaveConsent) await setSensitiveConsent(false).catch(() => {});
    setSignupStep(3);
    if (isSensitiveConsentError(error)) {
      serverWantedConsent = true;
      if (budgetError) budgetError.textContent = '';
      openPrivateConsent(SENSITIVE_CONSENT_ERROR);
      throw new OnboardingStepError(SENSITIVE_CONSENT_ERROR);
    }
    if (budgetError) budgetError.textContent = INTERESTS_SAVE_ERROR;
    throw new OnboardingStepError(INTERESTS_SAVE_ERROR);
  }
};

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (signupCurrentStep < SIGNUP_STEPS) {
    if (validateOnboardingStep(signupCurrentStep)) setSignupStep(signupCurrentStep + 1);
    return;
  }
  signupForm.elements.namedItem('passwordConfirm')?.setCustomValidity('');
  for (const step of [1, 2, 3]) {
    if (!validateOnboardingStep(step)) {
      setSignupStep(step, false);
      validateOnboardingStep(step);
      if (signupFeedback) signupFeedback.textContent = 'Please complete this step first.';
      return;
    }
  }
  if (!signupForm.checkValidity()) {
    signupForm.reportValidity();
    if (signupFeedback) signupFeedback.textContent = 'Please complete all required fields.';
    return;
  }
  const formData = new FormData(signupForm);
  const password = String(formData.get('password') || '');
  const passwordConfirm = String(formData.get('passwordConfirm') || '');
  if (!profileCompletionUser && password !== passwordConfirm) {
    const confirmField = signupForm.elements.namedItem('passwordConfirm');
    confirmField?.setCustomValidity('Passwords do not match.');
    confirmField?.reportValidity();
    confirmField?.addEventListener('input', () => confirmField.setCustomValidity(''), { once: true });
    if (signupFeedback) signupFeedback.textContent = 'Your passwords do not match.';
    return;
  }
  if (profileCompletionUser && (password || passwordConfirm)) {
    if (password.length < 8 || passwordConfirm.length < 8) {
      if (signupFeedback) signupFeedback.textContent = 'Use at least 8 characters for your password.';
      return;
    }
    if (password !== passwordConfirm) {
      const confirmField = signupForm.elements.namedItem('passwordConfirm');
      confirmField?.setCustomValidity('Passwords do not match.');
      confirmField?.reportValidity();
      confirmField?.addEventListener('input', () => confirmField.setCustomValidity(''), { once: true });
      if (signupFeedback) signupFeedback.textContent = 'Your passwords do not match.';
      return;
    }
  }
  // The password goes to Supabase Auth only; it is never part of the stored or cached profile (Ruling I11).
  const profile = collectSignupProfile(formData);
  profile.gender = normalizeSignupGender(profile.gender);
  const phoneCountryCode = profile.phoneCountryCode || '+91';
  const phoneNumber = profile.phoneNumber.replace(/\D/g, '');
  profile.phoneCountryCode = phoneCountryCode;
  profile.phoneNumber = phoneNumber;
  profile.phone = `${phoneCountryCode} ${phoneNumber}`.trim();
  const photoFile = signupForm.querySelector('.photo-input')?.files?.[0] || null;
  profile.photoName = photoFile?.name || '';
  const mediaErrors = { photo: signupForm.querySelector('#profile-photo-error'), cover: signupForm.querySelector('#profile-cover-error') };
  const setMediaError = (which, message) => {
    const node = mediaErrors[which];
    if (!node) return;
    node.textContent = message || '';
    node.hidden = !message;
  };
  setMediaError('photo', ''); setMediaError('cover', '');
  // A photo that cannot be re-encoded is never used as-is (its EXIF could carry a location): stop BEFORE any account
  // or profile write, go back to the photo step and say so beside the field.
  const failMedia = (which) => {
    setSignupStep(4, false);
    setMediaError(which, PHOTO_ERROR_MESSAGE);
    if (signupFeedback) signupFeedback.textContent = '';
    signupForm.querySelector(which === 'photo' ? '.photo-input' : '.cover-input')?.focus();
  };
  if (photoFile) {
    try { profile.photoUrl = await compressedImageDataUrl(photoFile); } catch { failMedia('photo'); return; }
  } else if (profileCompletionPhotoUrl) profile.photoUrl = profileCompletionPhotoUrl;
  const coverFile = signupForm.querySelector('.cover-input')?.files?.[0] || null;
  profile.coverName = coverFile?.name || (profile.coverUrl?.startsWith('/assets/') || profile.coverUrl?.startsWith('/Images/Cover%20images/') ? 'Brivia suggestion' : '');
  if (coverFile) {
    try { profile.coverUrl = await compressedImageDataUrl(coverFile); } catch { failMedia('cover'); return; }
  } else if (profileCompletionCoverUrl) profile.coverUrl = normalizeCoverUrl(profileCompletionCoverUrl);
  const submit = signupForm.querySelector('[type="submit"]');
  if (submit) { submit.disabled = true; submit.setAttribute('aria-busy', 'true'); }
  if (signupFeedback) signupFeedback.textContent = 'Saving your profile...';
  try {
    if (!supabaseReady || !supabase) throw new Error('Supabase is not configured.');
    let sessionUser = profileCompletionUser;
    if (sessionUser) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user || sessionData.session.user.id !== sessionUser.id) throw new Error('Your sign-in session expired. Please continue with Google or log in again.');
      sessionUser = sessionData.session.user;
      if (profile.email.toLowerCase() !== sessionUser.email?.toLowerCase()) throw new Error('Use the verified email attached to this account.');
      if (password) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) throw passwordError;
      }
      const { error: profileError } = await saveProfile(sessionUser.id, profile, photoFile, coverFile);
      if (profileError) throw profileError;
      await finishOnboarding();
      window.localStorage.removeItem('brivia-pending-profile');
      window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...profile, id: sessionUser.id }));
      redirectToApp();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: profile.email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth.html`,
        // Auth metadata holds contact basics only: never interests (some are private) or any location.
        data: {
          name: profile.name,
          full_name: profile.name,
          phone: profile.phone,
          phoneCountryCode: profile.phoneCountryCode,
          phoneNumber: profile.phoneNumber,
          experience: profile.experience,
          gender: profile.gender,
          lookingFor: profile.lookingFor,
          coverUrl: profile.coverUrl,
        },
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error('We could not create your account. Please try again.');
    if (data.session) {
      profileCompletionUser = data.user;
      signupForm.elements.namedItem('email')?.setAttribute('readonly', '');
      setSignupPasswordMode(false);
      if (submit) submit.innerHTML = 'COMPLETE MY PROFILE <span>→</span>';
      const { error: profileError } = await saveProfile(data.user.id, profile, photoFile, coverFile);
      if (profileError) throw profileError;
      await finishOnboarding();
      window.localStorage.setItem('brivia-member-profile', JSON.stringify({ ...profile, id: data.user.id }));
      redirectToApp();
      return;
    }
    // Email confirmation: nothing can be written before a session exists. Keep the interests and only the KIND of
    // area choice (a city id, or "ask for my location again"); the coordinates are dropped here.
    // Interests as { id, points, mode } only, sensitive ones left out (asked for again after login), plus savedAt.
    const pendingOnboarding = buildPendingOnboarding(budget, isSensitiveInterest, areaChoice);
    window.localStorage.setItem('brivia-pending-profile', JSON.stringify({ ...profile, ...pendingOnboarding, adultDeclared: true }));
    areaChoice = null;
    const accountEmail = signupSuccess?.querySelector('[data-credential="account-email"]');
    if (accountEmail) accountEmail.textContent = profile.email;
    const successTitle = signupSuccess?.querySelector('[data-auth-success-title]');
    const successMessage = signupSuccess?.querySelector('[data-auth-success-message]');
    if (successTitle) successTitle.textContent = 'Check your email.';
    if (successMessage) successMessage.textContent = 'We sent a verification link. Verify your email, then sign in to finish activating your Brivia profile. Supabase manages your password securely; Brivia never displays it or saves it in your profile.';
    signupForm.setAttribute('hidden', '');
    if (signupFeedback) signupFeedback.textContent = '';
    signupSuccess?.removeAttribute('hidden');
    authModal?.querySelector('.auth-back-trigger')?.setAttribute('hidden', '');
    signupSuccess?.querySelector('button')?.focus();
  } catch (error) {
    const message = error.message || 'Could not create your account. Please try again.';
    if (signupFeedback) signupFeedback.textContent = message;
    if (!(error instanceof OnboardingStepError)) {
      if (loginNote) loginNote.textContent = message;
      if (authPanelKicker) authPanelKicker.textContent = message;
    }
  } finally {
    if (submit) { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  }
});

if (document.body.classList.contains('auth-page')) void restoreAuthPageSession();

// Escape closes the auth modal (on auth.html it leaves the page), but never when a control already handled it, never
// from a field of the signup form, and never once a signup is past step 1: progress must not be lost to one key.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || event.defaultPrevented || !authModal?.classList.contains('is-open')) return;
  const inSignup = signupForm && event.target instanceof Node && signupForm.contains(event.target);
  if (inSignup && (event.target.closest?.('input, select, textarea') || signupCurrentStep > 1)) return;
  if (!signupForm?.hasAttribute('hidden') && authHistoryView === 'signup' && signupCurrentStep > 1) return;
  closeAuth();
});
