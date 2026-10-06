// Self-serve account deletion, client side (Iteration 4, Task 9, ruling R5; critic A C3).
// Pure and injectable: no supabase import, no DOM. Order matters: the member's Storage objects go first (SQL never
// deletes Storage rows), then the delete_my_account RPC. Every step is safe to repeat, so a retry after a partial
// failure finishes the job. signOut and clearLocal run ONLY after the RPC succeeded.
//
//   deleteAccount({ storage, rpc, signOut, clearLocal, buckets, uid })
//     -> { ok: true } | { ok: false, stage: 'storage' | 'rpc' | 'reauth', error }
//   storage.from(bucket).list(prefix, { limit, offset }) / .remove(paths)   (Supabase Storage client shape)
//   rpc(name, args) -> { error }                                              (Supabase rpc shape)
export const DELETE_BUCKETS = ['profile-photos', 'profile-covers', 'message-attachments', 'community-posts'];
export const PAGE_SIZE = 100;
export const REMOVE_BATCH = 100;
const MAX_PASSES = 50; // a bucket that never empties is reported, not looped on forever

export const STORAGE_FAILED_COPY = "We removed some of your files but couldn't finish. Nothing else was deleted. Try again.";
export const RPC_FAILED_COPY = 'Your photos and files are gone, but your account still exists. Try again to finish, or email thebrivia.club@gmail.com.';
export const STORAGE_NOT_EMPTY_COPY = `${STORAGE_FAILED_COPY} If it keeps failing, email thebrivia.club@gmail.com.`;
export const REAUTH_COPY = 'For your security, confirm it is you before we delete your account.';

const asError = (error) => (error instanceof Error ? error : Object.assign(new Error(error?.message || String(error)), error && typeof error === 'object' ? error : {}));

// Every object path under `prefix` (one level of sub-folders is followed), paged until a page is short.
const listAll = async (bucket, prefix) => {
  const paths = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset });
    if (error) throw asError(error);
    const items = data || [];
    for (const item of items) {
      if (!item?.name) continue;
      if (item.id === null) paths.push(...await listAll(bucket, `${prefix}/${item.name}`)); // a folder entry
      else paths.push(`${prefix}/${item.name}`);
    }
    if (items.length < PAGE_SIZE) return paths;
  }
};

const emptyBucket = async (storage, name, uid) => {
  const bucket = storage.from(name);
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const paths = await listAll(bucket, uid);
    if (!paths.length) return; // a list that returns 0 items: the folder is empty
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await bucket.remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) throw asError(error);
    }
  }
  throw new Error(`${name} still holds files after ${MAX_PASSES} passes`);
};

export const rpcStage = (error) => {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  if (text.includes('reauth_required')) return 'reauth';
  if (text.includes('storage_not_empty')) return 'storage';
  return 'rpc';
};

export async function deleteAccount({ storage, rpc, signOut, clearLocal, buckets = DELETE_BUCKETS, uid }) {
  try {
    for (const name of buckets) await emptyBucket(storage, name, uid);
  } catch (error) {
    return { ok: false, stage: 'storage', error: asError(error) };
  }
  let result;
  try { result = await rpc('delete_my_account', { p_confirm: 'DELETE' }); } catch (error) { result = { error }; }
  if (result?.error) return { ok: false, stage: rpcStage(result.error), error: asError(result.error) };
  try { await signOut({ scope: 'local' }); } catch { /* the auth user is already gone: ignore */ }
  try { clearLocal(); } catch { /* nothing more to clear */ }
  return { ok: true };
}

// The copy shown in the dialog's role="alert" region for a failed run.
export const deletionErrorCopy = (stage) => {
  if (stage === 'storage') return STORAGE_NOT_EMPTY_COPY;
  if (stage === 'reauth') return REAUTH_COPY;
  return RPC_FAILED_COPY;
};

// Removes every `brivia-*` key and the Supabase auth token (`sb-*-auth-token`, so a failed signOut leaves no stale JWT).
export const clearBriviaKeys = (...stores) => {
  stores.forEach((store) => {
    try {
      if (!store) return;
      Object.keys(store).filter((key) => key.startsWith('brivia-') || /^sb-.*-auth-token$/.test(key)).forEach((key) => store.removeItem(key));
    } catch { /* storage unavailable */ }
  });
};

// Consent status line for the Privacy & account section.
export const consentStatusCopy = (at) => {
  if (!at) return 'Private interests: consent not given.';
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'Private interests: consent given.';
  return `Private interests: consent given on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
};

// Sign-in method of the current session user: 'password' when an email identity exists, else 'oauth'.
export const reauthMethod = (user) => {
  const meta = user?.app_metadata || {};
  const providers = [meta.provider, ...(Array.isArray(meta.providers) ? meta.providers : [])].filter(Boolean);
  if (providers.includes('email')) return 'password';
  return providers.length ? 'oauth' : 'password';
};

export const DELETE_DISCLOSURE = {
  deleted: [
    'Your profile, photos, interests and points.',
    'Your matches, requests and signals.',
    "Your messages, which disappear from other people's chats too.",
    'Your posts and the files you uploaded.',
  ],
  remains: [
    'Reports you made are kept for up to a year, without your name.',
    'Reports about you, with their evidence, are kept for 365 days.',
    'A log of your consent and this deletion is kept for 1 year.',
    'If you were reported or flagged before you deleted, a one-way code made from your email, with the reasons and ids of those reports, is kept for 365 days, so a rejoin can be reviewed.',
    "Entries about you in other members' daily limits clear within 30 days.",
    "Files other people sent you stay in their own folders.",
    'Sign-in and platform logs and backups clear on their own schedules, and cached images can take about an hour to disappear.',
    'Other devices stay signed in until they next check in.',
  ],
};
