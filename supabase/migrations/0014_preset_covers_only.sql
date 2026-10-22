set lock_timeout = '5s';
-- 0014_preset_covers_only.sql: covers come only from the set Brivia provides (founder request 2026-10-22, D-080).
-- "I don't want anyone to use their own cover pictures. They can change between what all options is provided but not
-- from their own."
-- Applied by hand in the Supabase SQL editor, as postgres, after 0013 (see README.md "## 0014"). 0001-0013 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Based on the latest definitions (grep of every migration, 2026-10-22):
--   * public.brivia_is_preset_cover (0003_trust_hardening.sql:738, grants 0004:1692): the SHAPE of a preset path
--     (/assets/... or /Images/Cover images/...). It is unchanged here: community posts (0008) still use it.
--   * profiles_cover_url_storage CHECK (0003:761): own profile-covers Storage URL or that shape. Unchanged (frozen); the
--     trigger below is stricter, and a trigger (not a new CHECK) never re-validates rows nobody writes.
--   * storage.objects policies on 'profile-covers': insert "Members can upload their profile cover" and update
--     "Members can update their profile cover" (0001_baseline.sql:334-346), select "Members can view their own profile
--     covers" (0001:338), delete "Members can delete their profile covers" (0005_p0b_dpdp_safety.sql:526). Insert and
--     update are dropped below; select and delete stay, so old files can still be listed and removed and
--     delete_my_account's storage_not_empty check (0005, 0012) keeps working.
--
-- What changes:
--   1. brivia_private.brivia_offered_cover_keys(): the 18 preset file names. It mirrors PRESET_COVER_KEYS in
--      site/scripts/preset-cover.js; tests/unit/preset-cover.test.mjs pins the two lists (and cover-assets.js) equal.
--      A stored cover is exactly '/Images/Cover%20images/' || key.
--   2. A BEFORE INSERT OR UPDATE OF cover_url trigger on public.profiles: cover_url must be null, '' or an offered
--      path. An UPDATE that leaves cover_url unchanged is allowed (the client resends the row it read).
--   3. One-time cleanup of real members (is_test = false; test members are untouched): an offered cover stays; a legacy
--      value that site/scripts/cover-name.js resolveCoverKey maps to a preset (old Vite-hashed '/assets/<stem>-<hash>.<ext>'
--      builds) becomes that preset's path; anything else (an uploaded Storage cover, an unknown path) becomes null,
--      which shows the default cover. SQL never deletes Storage objects: the README tells the founder to remove the old
--      uploaded file in the Storage dashboard.
--   4. No new uploads into 'profile-covers' (insert and update policies dropped).

-- 1. The offered set ----------------------------------------------------------------------------------------------
create or replace function brivia_private.brivia_offered_cover_keys()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
    '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG',
    '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG',
    '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg',
    '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG',
    '3453059c-4864-46f7-ae45-6f7049939b9f.png',
    '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG',
    '5ae622b1-88f5-481b-8856-eb2eba35e606.png',
    '71EFFB34-6301-4196-A085-967D12BF30CE.PNG',
    '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG',
    '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG',
    '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG',
    '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png',
    'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG',
    'b66eff76-068e-4f2a-b789-a27051a11f5a.png',
    'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG',
    'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG',
    'E7E0AFAA-B547-4228-97C0-88E527151123.PNG',
    'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'
  ]::text[];
$$;

create or replace function brivia_private.brivia_is_offered_cover(p_url text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(p_url = any (select '/Images/Cover%20images/' || k from unnest(brivia_private.brivia_offered_cover_keys()) k), false);
$$;

-- The offered path a stored value stands for, or null. Mirrors resolveCoverKey (site/scripts/cover-name.js): the last
-- path segment (with %20 decoded) is a key; or, without a Vite hash (-<8 chars> before the extension), it is a key; or
-- a .webp name matches a key by stem (the name without its last extension). Case-sensitive, like the client.
create or replace function brivia_private.brivia_offered_cover_for(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  with name as (
    select replace(regexp_replace(coalesce(p_url, ''), '^.*/', ''), '%20', ' ') as n
  ), parts as (
    select n, regexp_replace(n, '-[A-Za-z0-9_-]{8}(\.[A-Za-z0-9]+)$', '\1') as unhashed from name
  ), hit as (
    select k from parts, unnest(brivia_private.brivia_offered_cover_keys()) k
     where p_url is not null and p_url !~ '\.\.'
       and (k = parts.n
            or (parts.unhashed <> parts.n and k = parts.unhashed)
            or (parts.n ~ '\.webp$'
                and regexp_replace(k, '\.[^.]*$', '') in (regexp_replace(parts.n, '\.[^.]*$', ''),
                                                          regexp_replace(parts.unhashed, '\.[^.]*$', ''))))
     order by (k = parts.n) desc, (k = parts.unhashed) desc
     limit 1
  )
  select '/Images/Cover%20images/' || k from hit;
$$;

revoke all on function brivia_private.brivia_offered_cover_keys() from public, anon, authenticated;
revoke all on function brivia_private.brivia_is_offered_cover(text) from public, anon, authenticated;
revoke all on function brivia_private.brivia_offered_cover_for(text) from public, anon, authenticated;

-- 2. The guard -----------------------------------------------------------------------------------------------------
-- SECURITY DEFINER so the member needs no grant on the helpers above; it reads only NEW and OLD.
create or replace function brivia_private.brivia_guard_cover_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cover_url is null or new.cover_url = '' then return new; end if;
  if tg_op = 'UPDATE' and new.cover_url is not distinct from old.cover_url then return new; end if;
  if brivia_private.brivia_is_offered_cover(new.cover_url) then return new; end if;
  -- The message names cover_url on purpose: an old cached client (saveProfile) retries the save without cover_url
  -- when the error mentions it, so a stale tab still saves the rest of the profile.
  raise exception 'cover_url is not an offered cover' using errcode = '23514',
    detail = 'A cover must be one of the covers Brivia provides.';
end;
$$;
revoke all on function brivia_private.brivia_guard_cover_url() from public, anon, authenticated;

-- 3. One-time cleanup (real members only). Returns how many rows it changed; 0 on every later run.
create or replace function brivia_private.brivia_cleanup_custom_covers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.profiles p
     set cover_url = brivia_private.brivia_offered_cover_for(p.cover_url)
   where not p.is_test
     and p.cover_url is not null
     and not brivia_private.brivia_is_offered_cover(p.cover_url)
     and p.cover_url is distinct from brivia_private.brivia_offered_cover_for(p.cover_url);
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function brivia_private.brivia_cleanup_custom_covers() from public, anon, authenticated;

select brivia_private.brivia_cleanup_custom_covers() as covers_cleaned;

drop trigger if exists brivia_profiles_cover_offered on public.profiles;
create trigger brivia_profiles_cover_offered
  before insert or update of cover_url on public.profiles
  for each row execute function brivia_private.brivia_guard_cover_url();

-- 4. No new uploads into profile-covers --------------------------------------------------------------------------
drop policy if exists "Members can upload their profile cover" on storage.objects;
drop policy if exists "Members can update their profile cover" on storage.objects;
