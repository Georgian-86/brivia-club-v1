-- 0017 (D-109): the founder's interest catalogue (interest_node.catalog_order) and add_member_interest ("Other").
-- Ids 0c170000-0000-4000-8000-0000000000NN: 01 A (completed), 02 B (completed), 03 N (no profile).
-- C1 the catalogue: 1129 offered nodes, ordered 1..N A-Z, level 3-4, never sensitive, every parent exists; reused 0004
--    nodes keep their id and label; "Gospel Music" and "NLP" are not offered.
-- C2 add_member_interest reuses an existing active node by label (case-insensitive, spaces collapsed).
-- C3 a new label becomes member.custom.<slug> (level 3), a second call returns it, a slug collision gets _2.
-- C4 validation: too short, too long, symbols, blocked words and a sensitive label are refused (22023).
-- C5 at most 5 new labels per member per 24 h (PT429); a reused label does not count.
-- C6 no session (anon / no profile) is refused; anon cannot execute it.
-- C7 the new node is accepted by set_member_interests and shows in profiles.skills.
set brivia.harness_autocomplete = 'off';
create or replace function pg_temp.gp(n int) returns uuid language sql immutable as $$
  select ('0c170000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

do $$
declare g int;
begin
  for g in 1..2 loop
    insert into auth.users(id) values (pg_temp.gp(g)) on conflict do nothing;
    insert into public.profiles (id, name, full_name, email, experience, looking_for)
    values (pg_temp.gp(g), 'Gcat ' || g, 'Gcat ' || g, 'gcat' || g || '@example.com', 'Some years', array['Friends']) on conflict (id) do nothing;
  end loop;
  insert into auth.users(id) values (pg_temp.gp(3)) on conflict do nothing;
end $$;

-- C1
do $$
declare n int; m int;
begin
  select count(*), max(catalog_order) into n, m from public.interest_node where catalog_order is not null;
  if n <> 1129 or m <> 1129 then raise exception 'FAIL C1: % catalogue nodes, max order %', n, m; end if;
  if exists (select 1 from public.interest_node where catalog_order is not null and (level < 3 or sensitive or status <> 'active')) then
    raise exception 'FAIL C1: a catalogue node is not an active, public level-3/4 interest'; end if;
  if exists (select 1 from public.interest_node c where c.catalog_order is not null
              and not exists (select 1 from public.interest_node p where p.id = c.parent_id)) then
    raise exception 'FAIL C1: a catalogue node has no parent'; end if;
  if exists (select 1 from (select label, lag(label) over (order by catalog_order) prev from public.interest_node where catalog_order is not null) s
              where lower(prev) > lower(label)) then raise exception 'FAIL C1: the catalogue is not A-Z'; end if;
  if (select label from public.interest_node where id = 'sports.racket.badminton') <> 'Badminton'
     or (select catalog_order from public.interest_node where id = 'sports.racket.badminton') is null then
    raise exception 'FAIL C1: Badminton was not reused'; end if;
  if (select label from public.interest_node where id = 'tech.frontier.ar_vr') <> 'AR and VR' then raise exception 'FAIL C1: an existing label changed'; end if;
  if (select level from public.interest_node where id = 'tech.software.python') <> 3 then raise exception 'FAIL C1: Python missing'; end if;
  if exists (select 1 from public.interest_node where catalog_order is not null and lower(label) in ('gospel music', 'nlp')) then
    raise exception 'FAIL C1: a left-out label is offered'; end if;
  if (select count(*) from public.interest_node where catalog_order is not null and lower(label) = 'ui design') <> 1 then
    raise exception 'FAIL C1: duplicates were not collapsed'; end if;
end $$;
select 'g-interest-catalog.test C1 OK';

-- C2-C5, C7 as member A; C6 without a session.
do $$
declare a text; b text; c text; refused text; i int; code text;
begin
  if has_function_privilege('anon', 'public.add_member_interest(text)', 'execute') then raise exception 'FAIL C6: anon may call add_member_interest'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.gp(1))::text, true);
  -- C2
  a := public.add_member_interest('  python ');
  if a <> 'tech.software.python' then raise exception 'FAIL C2: python -> %', a; end if;
  a := public.add_member_interest('Board   games');
  if a <> 'games.board.board_games' then raise exception 'FAIL C2: Board games -> %', a; end if;
  -- C3
  a := public.add_member_interest('Kite  Surfing Club');
  if a <> 'member.custom.kite_surfing_club' then raise exception 'FAIL C3: new node %', a; end if;
  if (select label from public.interest_node where id = a) <> 'Kite Surfing Club' then raise exception 'FAIL C3: label not collapsed'; end if;
  if public.add_member_interest('kite surfing club') <> a then raise exception 'FAIL C3: the second call made another node'; end if;
  b := public.add_member_interest('Kite-Surfing Club');
  if b <> 'member.custom.kite_surfing_club_2' then raise exception 'FAIL C3: collision -> %', b; end if;
  c := public.add_member_interest('मधुबनी कला');
  if c !~ '^member\.custom\.[a-z0-9_]+$' then raise exception 'FAIL C3: a Devanagari label -> %', c; end if;
  -- C4
  foreach refused in array array['a', repeat('x', 41), '<script>', 'buy now!!', 'Fuck this', 'casual hookup', 'www.spam.com', '12345', 'kirtan  and chanting', '🎸 Guitar'] loop
    code := null;
    begin perform public.add_member_interest(refused); exception when others then code := sqlstate; end;
    if code is distinct from '22023' then raise exception 'FAIL C4: "%" gave %', refused, coalesce(code, 'no error'); end if;
  end loop;
  -- Review fix: a retired label is refused (a moderator's retirement sticks); a curly apostrophe is a straight one.
  reset role;
  update public.interest_node set status = 'retired' where id = 'member.custom.kite_surfing_club_2';
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.gp(1))::text, true);
  code := null;
  begin perform public.add_member_interest('kite-surfing club'); exception when others then code := sqlstate; end;
  if code is distinct from '22023' then raise exception 'FAIL C4: a retired label gave %', coalesce(code, 'no error'); end if;
  if public.add_member_interest('Women’s Football') <> public.add_member_interest('Women''s football') then raise exception 'FAIL C3: curly and straight apostrophes differ'; end if;
  -- C5: four new so far (kite, kite 2, madhubani, women's football); one more passes, the sixth is refused; a reused label still works.
  perform public.add_member_interest('Bonsai Shaping');
  code := null;
  begin perform public.add_member_interest('Tea Blending'); exception when others then code := sqlstate; end;
  if code is distinct from 'PT429' then raise exception 'FAIL C5: the sixth new label gave %', coalesce(code, 'no error'); end if;
  if public.add_member_interest('Chess') <> 'games.board.chess' then raise exception 'FAIL C5: a reused label was capped'; end if;
  -- C7
  perform public.set_member_interests(jsonb_build_array(
    jsonb_build_object('interest_id', 'member.custom.kite_surfing_club', 'points', 12),
    jsonb_build_object('interest_id', 'games.board.chess', 'points', 8)));
  reset role;
  if not ((select skills from public.profiles where id = pg_temp.gp(1)) @> array['Kite Surfing Club']) then
    raise exception 'FAIL C7: the custom interest is not on the profile'; end if;
  -- B reuses A's label (shown and matched): same id, no new node.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.gp(2))::text, true);
  if public.add_member_interest('KITE SURFING CLUB') <> 'member.custom.kite_surfing_club' then raise exception 'FAIL C3: B got another node'; end if;
  -- C6
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.gp(3))::text, true);
  code := null;
  begin perform public.add_member_interest('Origami Club'); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL C6: no profile gave %', coalesce(code, 'no error'); end if;
  perform set_config('request.jwt.claims', '{}', true);
  code := null;
  begin perform public.add_member_interest('Origami Club'); exception when others then code := sqlstate; end;
  if code is distinct from '42501' then raise exception 'FAIL C6: no session gave %', coalesce(code, 'no error'); end if;
  reset role;
  if (select count(*) from public.interest_node where id like 'member.custom.%') <> 5 then raise exception 'FAIL C5: % custom nodes', (select count(*) from public.interest_node where id like 'member.custom.%'); end if;
end $$;
select 'g-interest-catalog.test C2-C7 OK';

delete from public.member_interest where member_id::text like '0c170000-%';
delete from public.interest_rewrite where member_id::text like '0c170000-%';
delete from public.member_custom_interest where member_id::text like '0c170000-%';
delete from public.interest_node where id like 'member.custom.%' and not exists (select 1 from public.member_interest mi where mi.interest_id = interest_node.id);
delete from public.profiles where id::text like '0c170000-%';
delete from auth.users where id::text like '0c170000-%';
