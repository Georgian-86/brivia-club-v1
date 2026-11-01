set lock_timeout = '5s';
-- 0019_cover_set_refresh.sql: the cover set changes (founder request 2026-11-01, D-116). "Remove the thoughtful room
-- cover pic and add these ones in the list."
-- Applied by hand in the Supabase SQL editor, as postgres, after 0014 (and after 0018; see README.md "## 0019").
-- 0001-0018 are frozen. Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Based on the latest definitions (grep of every migration, 2026-11-01):
--   * brivia_private.brivia_offered_cover_keys() (0014_preset_covers_only.sql:30): the 18 offered file names. Every
--     other cover helper (brivia_is_offered_cover, brivia_offered_cover_for, the brivia_profiles_cover_offered trigger)
--     reads this one list, so redefining it is the whole server change.
--
-- What changes:
--   1. brivia_offered_cover_keys(): '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG' ("THE THOUGHTFUL ROOM") is retired and 9
--      new covers are added at the end: 26 names. It mirrors PRESET_COVER_KEYS in site/scripts/preset-cover.js, in the
--      same order; tests/unit/preset-cover.test.mjs pins the two lists (and cover-assets.js and auth.html) equal.
--   2. One-time cleanup (brivia_private.brivia_clear_retired_covers()): every profile whose cover_url names the retired
--      file (the stored path, or a legacy Vite-hashed '/assets/163BDB0C-...' value) gets cover_url = null, which shows
--      the default cover. Test members too: the client no longer ships that image, so the old value would paint
--      nothing. Community posts are not changed (a post that used it shows without an image, like any unknown preset).

-- 1. The offered set ----------------------------------------------------------------------------------------------
create or replace function brivia_private.brivia_offered_cover_keys()
returns text[]
language sql
immutable
set search_path = public
as $$
  select array[
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
    'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG',
    '0F866BC9-857A-4BD6-A73F-70B0E3A1D787.PNG',
    '2BA86035-CBE4-4609-8AFC-E74F149DF54E.PNG',
    '66F669B5-3A06-4DDA-BDA9-C000623010CC.PNG',
    '7C0B5EFA-4E04-4BEC-AB5D-F7FD8FAA3A52.PNG',
    '84F018B6-29FB-4060-B2D9-E7DC157CE87E.PNG',
    '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG',
    '9761496E-AA69-4C9F-9F63-773B6FB53D94.PNG',
    'A6651B99-E0B9-472B-92FB-BABD5C87D2A0.PNG',
    'EFFF6FA8-4DBE-44CC-8980-661B610AB1A2.PNG'
  ]::text[];
$$;
revoke all on function brivia_private.brivia_offered_cover_keys() from public, anon, authenticated;

-- 2. Clear the retired cover (security definer, no client grants). Returns how many rows it changed; 0 on every
--    later run. A future retirement adds its stem to the array.
create or replace function brivia_private.brivia_clear_retired_covers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed integer;
begin
  update public.profiles p
     set cover_url = null
   where p.cover_url is not null
     and exists (select 1 from unnest(array['163BDB0C-64AC-44E7-8663-55C323ADB4FE']::text[]) r
                  where strpos(p.cover_url, r) > 0);
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function brivia_private.brivia_clear_retired_covers() from public, anon, authenticated;

select brivia_private.brivia_clear_retired_covers() as retired_covers_cleared;
