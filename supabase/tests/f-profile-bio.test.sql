-- 0016 (D-104): profiles.bio and member_bio().
-- Ids f0160000-0000-4000-8000-0000000000NN: 01 A, 02 B (completed), 03 K (A blocked K), 04 I (incomplete).
-- B1 a member writes their own bio, never another's; over 300 characters is refused.
-- B2 member_bio: own, a visible member's; null for a blocked pair, an incomplete viewer's target, or no session.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.fp(n int) returns uuid language sql immutable as $$
  select ('f0160000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int; mid uuid; cell text := public.brivia_grid_cell(19.2183, 72.9781, 7);
begin
  for g in 1..4 loop
    mid := pg_temp.fp(g);
    insert into auth.users(id) values (mid) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (mid, 'Fbio ' || g, 'Fbio ' || g, 'fbio' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
    update public.profiles set adult_declared_at = now() where profiles.id = mid;
    if g <> 4 then
      insert into public.member_orbit (member_id, home_cell, home_cell_g6, home_cell_g5, place_id)
      values (mid, cell, public.brivia_grid_parent(cell, 6), public.brivia_grid_parent(cell, 5), public.brivia_nearest_place(cell)) on conflict (member_id) do nothing;
      insert into public.member_interest (member_id, interest_id, points) values (mid, 'sports.racket.badminton', 20) on conflict do nothing;
    end if;
  end loop;
  insert into public.brivia_blocks (blocker_id, blocked_id) values (pg_temp.fp(1), pg_temp.fp(3)) on conflict do nothing;
end $$;

do $$
declare refused boolean := false; n int; b text;
begin
  if has_function_privilege('anon', 'public.member_bio(uuid)', 'execute') then raise exception 'FAIL: anon may call member_bio'; end if;
  -- B1
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fp(2))::text, true);
  update public.profiles set bio = 'I cook and play badminton.' where id = pg_temp.fp(2);
  update public.profiles set bio = 'hijack' where id = pg_temp.fp(1);  -- RLS: not B's row, nothing changes
  begin update public.profiles set bio = repeat('x', 301) where id = pg_temp.fp(2); exception when check_violation then refused := true; end;
  reset role;
  if not refused then raise exception 'FAIL B1: a 301-character bio was accepted'; end if;
  if (select bio from public.profiles where id = pg_temp.fp(2)) <> 'I cook and play badminton.' then raise exception 'FAIL B1: own bio not saved'; end if;
  if (select bio from public.profiles where id = pg_temp.fp(1)) is not null then raise exception 'FAIL B1: B wrote A''s bio'; end if;
  update public.profiles set bio = 'K bio' where id = pg_temp.fp(3);
  update public.profiles set bio = 'I bio' where id = pg_temp.fp(4);
  -- B2
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fp(1))::text, true);
  b := public.member_bio(pg_temp.fp(2));
  if b is distinct from 'I cook and play badminton.' then raise exception 'FAIL B2: A reads %', b; end if;
  if public.member_bio(pg_temp.fp(3)) is not null then raise exception 'FAIL B2: A reads the bio of K, whom A blocked'; end if;
  if public.member_bio(pg_temp.fp(4)) is not null then raise exception 'FAIL B2: A reads an incomplete member''s bio'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fp(2))::text, true);
  if public.member_bio(pg_temp.fp(2)) is distinct from 'I cook and play badminton.' then raise exception 'FAIL B2: own bio'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.fp(4))::text, true);
  if public.member_bio(pg_temp.fp(2)) is not null then raise exception 'FAIL B2: an incomplete viewer reads a bio'; end if;
  reset role;
end $$;
select 'f-profile-bio.test B1-B2 OK';

delete from public.brivia_blocks where blocker_id::text like 'f0160000-%' or blocked_id::text like 'f0160000-%';
delete from public.member_interest where member_id::text like 'f0160000-%';
delete from public.member_orbit where member_id::text like 'f0160000-%';
delete from public.profiles where id::text like 'f0160000-%';
delete from auth.users where id::text like 'f0160000-%';
reset brivia.harness_autocomplete;
