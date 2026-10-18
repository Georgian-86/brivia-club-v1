// "Complete your profile" (Phase C, Task 5): pure, no DOM, no images (unit-tested in node). app.js passes the member's
// own profile (rowToProfile shape), their my_interests() rows, cover-assets.js defaultCoverUrl and normalizeCoverUrl.
//
//   profileChecklist(profile, interests, defaultCover, normalize?)
//     => { items: [{ key, label, done, action }], done, total: 5, complete }
//
// A cover counts only when it is set and is not the default preset. The default is matched by preset name, so the
// stored original path (/Images/Cover%20images/<name>), a legacy Vite-hashed value (/assets/<stem>-<hash>.PNG) and an
// optimized build URL (<stem>-<hash>.webp) of the default all count as "not chosen".
const VITE_HASH = /-[A-Za-z0-9_-]{8}(\.[A-Za-z0-9]+)$/;

const coverStem = (url) => {
  let name;
  try { name = decodeURIComponent(String(url)).split(/[?#]/)[0].split('/').pop(); } catch { name = String(url).split('/').pop(); }
  return name.replace(VITE_HASH, '$1').replace(/(\.[A-Za-z0-9]+)+$/, '');
};

const isDefaultCover = (cover, defaultCover) => {
  if (!defaultCover) return false;
  if (cover === defaultCover) return true;
  const stem = coverStem(cover);
  return Boolean(stem) && stem === coverStem(defaultCover);
};

const filled = (value) => (Array.isArray(value) ? value.some((item) => String(item ?? '').trim()) : Boolean(String(value ?? '').trim()));

export const profileChecklist = (profile, interests, defaultCover, normalize = (url) => url) => {
  const p = profile || {};
  const rawCover = p.coverUrl || p.cover_url || p.cover_image_url || '';
  const cover = rawCover ? normalize(rawCover) || rawCover : '';
  const fallback = defaultCover ? normalize(defaultCover) || defaultCover : '';
  const items = [
    { key: 'photo', label: 'Add a profile photo', done: filled(p.photoUrl || p.photo_url) },
    { key: 'cover', label: 'Choose a cover', done: Boolean(cover) && !isDefaultCover(cover, fallback) },
    { key: 'interests', label: 'Pick 3 or more interests', done: (Array.isArray(interests) ? interests.length : 0) >= 3 },
    { key: 'looking', label: "Say what you're looking for", done: filled(p.lookingFor ?? p.looking_for) },
    { key: 'experience', label: 'Add your experience', done: filled(p.experience) },
  ].map((item) => ({ ...item, action: 'editor' }));
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, complete: done === items.length };
};
