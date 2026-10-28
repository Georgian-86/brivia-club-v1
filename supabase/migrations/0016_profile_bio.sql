set lock_timeout = '5s';
-- 0016_profile_bio.sql: a short bio on the member's profile (founder request 2026-10-28, D-104: "Bio bhi ni aata").
-- Applied by hand in the Supabase SQL editor, as postgres, after 0015 (see README.md "## 0016"). 0001-0015 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- Based on the latest definitions: the profiles update grant (0004:560, plus resume_path in 0012:88) lists the
-- editable columns; profiles select is own row only (others read cards through definer RPCs).
--
-- What changes:
--   1. profiles.bio: text, at most 300 characters, null or non-blank. The member writes it (column grant).
--   2. member_bio(p_member): the bio of a member the caller can see (brivia_visible_to), or their own; null otherwise.
--      Cards (public_profile_card) are unchanged; the profile dialog asks for the bio when it opens.
alter table public.profiles add column if not exists bio text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_bio_length') then
    alter table public.profiles add constraint profiles_bio_length check (bio is null or char_length(bio) <= 300);
  end if;
end $$;
grant update (bio) on public.profiles to authenticated;

create or replace function public.member_bio(p_member uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(btrim(p.bio), '')
    from public.profiles p
   where p.id = p_member
     and auth.uid() is not null
     and (p.id = auth.uid() or public.brivia_visible_to(auth.uid(), p.id))
$$;
revoke all on function public.member_bio(uuid) from public, anon;
grant execute on function public.member_bio(uuid) to authenticated;
