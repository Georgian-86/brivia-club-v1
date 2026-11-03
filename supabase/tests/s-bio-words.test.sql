-- 0033 (D-137): a bio is at most 20 words.
-- W1 a member saves 1 and 20 words; 21 is refused; an older long bio stays until it is edited.

do $$
declare mid uuid := '00000000-0000-4000-8000-0000000b10d1'; refused boolean := false; twenty text; old_bio text;
begin
  insert into auth.users (id, email) values (mid, 'biowords@example.com') on conflict (id) do nothing;
  insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Bio Words', 'Bio Words', 'biowords@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
  twenty := E'  ' || rtrim(repeat(E'word  \n', 20)) || E'  ';   -- extra spaces and line breaks never count
  if exists (select 1 from pg_proc where proname = 'brivia_bio_word_guard' and has_function_privilege('authenticated', oid, 'execute')) then
    raise exception 'FAIL W1: the guard is callable by members'; end if;
  update public.profiles set bio = 'Hi' where id = mid;
  update public.profiles set bio = twenty where id = mid;
  if (select bio from public.profiles where id = mid) <> twenty then raise exception 'FAIL W1: 20 words not saved'; end if;
  begin update public.profiles set bio = twenty || ' more' where id = mid; exception when check_violation then refused := true; end;
  if not refused then raise exception 'FAIL W1: 21 words accepted'; end if;
  -- An older long bio (before 0033) stays; changing something else keeps it.
  alter table public.profiles disable trigger profiles_bio_word_guard;
  old_bio := rtrim(repeat('long ', 30));
  update public.profiles set bio = old_bio where id = mid;
  alter table public.profiles enable trigger profiles_bio_word_guard;
  update public.profiles set name = 'Bio Words 2' where id = mid;
  if (select bio from public.profiles where id = mid) <> old_bio then raise exception 'FAIL W1: an older bio was touched'; end if;
  delete from public.profiles where id = mid;
  delete from auth.users where id = mid;
end $$;
select 's-bio-words.test W1 OK';
