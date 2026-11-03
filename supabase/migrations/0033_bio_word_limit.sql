set lock_timeout = '5s';
-- 0033_bio_word_limit.sql: a bio is at most 20 words (founder request 2026-11-03, D-137). Applied by hand in the
-- Supabase SQL editor, as postgres, after 0032 (README "## 0033"). 0001-0032 are frozen. Idempotent.
--
-- The client counts words live and refuses to save past 20; this is the same rule on the server, so a hand-made
-- request cannot get round it. A word is a run of non-space text (extra spaces and line breaks never count). Only a
-- bio that is being written is checked: a longer bio saved before 0033 stays readable until its member edits it.
-- Empty stays allowed here (null clears a bio; older rows have none); the client asks for at least one word.

create or replace function public.brivia_bio_word_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.bio is not null
     and (tg_op = 'INSERT' or new.bio is distinct from old.bio)
     and btrim(new.bio, E' \t\r\n\f\v') <> ''
     and array_length(regexp_split_to_array(btrim(new.bio, E' \t\r\n\f\v'), '\s+'), 1) > 20 then
    raise exception 'bio_words: keep your bio to 20 words or fewer' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.brivia_bio_word_guard() from public, anon, authenticated;

drop trigger if exists profiles_bio_word_guard on public.profiles;
create trigger profiles_bio_word_guard
  before insert or update of bio on public.profiles
  for each row execute function public.brivia_bio_word_guard();
