-- Iteration 3 final review I-1 (D-036, spec §7 / §9.1.5): the legacy free-text city and state are private.
-- get_candidates, search_members and list_members return city and state as null for every row (the composite type
-- and the signatures are unchanged); search never matches city text; a client can no longer update city or state.
-- Members are completed by the harness autocomplete fixture (name + city). Everything runs in one transaction that is
-- rolled back, so the other suites never see these members.
begin;
insert into auth.users(id) values
  ('c17c17c1-0000-0000-0000-0000000000a1'), ('c17c17c1-0000-0000-0000-0000000000b2')
  on conflict do nothing;
-- V the viewer, T the target, whose city and state are set (and unusual, so a search can only hit them).
insert into public.profiles (id, name, full_name, email, city, state, created_at)
values ('c17c17c1-0000-0000-0000-0000000000a1', 'Vee Viewer', 'Vee Viewer', 'cv@example.com', 'Pune', 'MH', now() + interval '1000 years'),
       ('c17c17c1-0000-0000-0000-0000000000b2', 'Tee Target', 'Tee Target', 'ct@example.com', 'Zanzibarton', 'Ungujastate', now() + interval '999 years')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c17c17c1-0000-0000-0000-0000000000a1"}';
do $$
declare
  t constant uuid := 'c17c17c1-0000-0000-0000-0000000000b2';
  n int;
  r record;
begin
  -- The target is visible, so these checks are about the columns, not about visibility.
  select count(*) into n from public.get_candidates(array[t]);
  if n <> 1 then raise exception 'FAIL I-1: get_candidates does not show the target (% rows)', n; end if;
  select * into r from public.get_candidates(array[t]);
  if r.city is not null or r.state is not null then raise exception 'FAIL I-1: get_candidates returns city/state (%, %)', r.city, r.state; end if;

  select * into r from public.search_members('Tee Target') where id = t;
  if r.id is null then raise exception 'FAIL I-1: search_members by name does not find the target'; end if;
  if r.city is not null or r.state is not null then raise exception 'FAIL I-1: search_members returns city/state (%, %)', r.city, r.state; end if;

  -- list_members is executable by no client role since D-038 (R4): checked as the owner, with the viewer's claims.
  reset role;
  select * into r from public.list_members(20) where id = t;
  if r.id is null then raise exception 'FAIL I-1: list_members does not show the target'; end if;
  if r.city is not null or r.state is not null then raise exception 'FAIL I-1: list_members returns city/state (%, %)', r.city, r.state; end if;

  -- No row from any of the three carries a city or state, whoever it is.
  select count(*) into n from public.list_members(20) where city is not null or state is not null;
  if n <> 0 then raise exception 'FAIL I-1: list_members returns % rows with city/state', n; end if;
  set local role authenticated;

  -- City and state text are not searchable.
  select count(*) into n from public.search_members('Zanzibarton');
  if n <> 0 then raise exception 'FAIL I-1: searching the target''s city finds % rows', n; end if;
  select count(*) into n from public.search_members('Ungujastate');
  if n <> 0 then raise exception 'FAIL I-1: searching the target''s state finds % rows', n; end if;
end $$;

-- A client update of city or state fails; the other editable columns still update.
do $$
declare stmt text; failed boolean; n int;
begin
  foreach stmt in array array[
    'update public.profiles set city = ''Elsewhere'' where id = auth.uid()',
    'update public.profiles set state = ''Elsewhere'' where id = auth.uid()'
  ] loop
    failed := false;
    begin
      execute stmt;
    exception when insufficient_privilege then failed := true;
    end;
    if not failed then raise exception 'FAIL I-1: a client may run %', stmt; end if;
  end loop;
  update public.profiles set name = 'Vee Viewer', full_name = 'Vee Viewer', phone = '', phone_country_code = '',
    phone_number = '', experience = 'x', looking_for = '{Friends}', updated_at = now()
  where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL I-1: the editable profile update touched % rows', n; end if;
end $$;
rollback;

select 'orbit-city-private.test I-1 city/state private OK' as result;
