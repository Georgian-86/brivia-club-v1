-- 0076 (D-246): member badges. B1 a signed-in member reads them; anon reads nothing. B2 a member cannot give themselves
-- one, change one or remove one. B3 only 'admin' is a badge.
set brivia.harness_autocomplete = 'off';
begin;
create or replace function pg_temp.code_of(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'none'; exception when others then return sqlstate; end $$;
do $$
begin
  insert into auth.users(id) values ('0e760000-0000-4000-8000-000000000001'), ('0e760000-0000-4000-8000-000000000002') on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values
    ('0e760000-0000-4000-8000-000000000001', 'Badge 1', 'Badge 1', 'badge1@example.com'),
    ('0e760000-0000-4000-8000-000000000002', 'Badge 2', 'Badge 2', 'badge2@example.com') on conflict (id) do nothing;
  insert into public.member_badge (member_id, badge) values ('0e760000-0000-4000-8000-000000000001', 'admin');
  if pg_temp.code_of($q$insert into public.member_badge (member_id, badge) values ('0e760000-0000-4000-8000-000000000002', 'owner')$q$) <> '23514' then
    raise exception 'FAIL B3: a badge other than admin'; end if;
  if has_table_privilege('anon', 'public.member_badge', 'select') then raise exception 'FAIL B1: anon reads badges'; end if;
end $$;
select set_config('request.jwt.claims', json_build_object('sub', '0e760000-0000-4000-8000-000000000002')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.member_badge where member_id::text like '0e760000%';
  if n <> 1 then raise exception 'FAIL B1: a member reads % badges', n; end if;
  if pg_temp.code_of($q$insert into public.member_badge (member_id, badge) values ('0e760000-0000-4000-8000-000000000002', 'admin')$q$) <> '42501' then
    raise exception 'FAIL B2: a member gave themselves a badge'; end if;
  if pg_temp.code_of($q$update public.member_badge set member_id = '0e760000-0000-4000-8000-000000000002'$q$) <> '42501' then
    raise exception 'FAIL B2: a member moved a badge'; end if;
  if pg_temp.code_of($q$delete from public.member_badge$q$) <> '42501' then raise exception 'FAIL B2: a member removed a badge'; end if;
end $$;
reset role;
rollback;
select 'zp-member-badges.test ALL PASSED';
