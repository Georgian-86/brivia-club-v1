-- Iteration 2 (Trust), Task 1: column-locked profiles; is_test is owner-only.
insert into auth.users(id) values
  ('a1a1a1a1-0000-0000-0000-0000000000a1'), ('b1b1b1b1-0000-0000-0000-0000000000b1'),
  ('c1c1c1c1-0000-0000-0000-0000000000c1')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, city)
values ('a1a1a1a1-0000-0000-0000-0000000000a1','A','A','a1@example.com','Austin'),
       ('b1b1b1b1-0000-0000-0000-0000000000b1','B','B','b1@example.com','Dallas')
on conflict (id) do nothing;

-- Member A: editable columns succeed.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}';
do $$
declare n int;
begin
  update public.profiles set name='A2', full_name='A2', phone='1', phone_country_code='+1', phone_number='1',
    gender='Male', city='Houston', state='TX', experience='x', skills='{a,b}', looking_for='{c}',
    photo_url='p', cover_url='c', updated_at=now()
  where id = auth.uid();
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: editable update touched % rows', n; end if;
end $$;
rollback;

-- Member A: locked columns fail, each in its own savepoint-style block.
do $$
declare stmt text; failed boolean;
begin
  foreach stmt in array array[
    'update public.profiles set is_test = true where id = auth.uid()',
    'update public.profiles set email = ''evil@example.com'' where id = auth.uid()',
    'update public.profiles set created_at = now() - interval ''1 year'' where id = auth.uid()',
    'update public.profiles set id = ''c1c1c1c1-0000-0000-0000-0000000000c1'' where id = auth.uid()'
  ] loop
    failed := false;
    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}', true);
    begin
      execute stmt;
    exception when insufficient_privilege then failed := true;
    end;
    reset role;
    if not failed then raise exception 'FAIL: statement should be denied: %', stmt; end if;
  end loop;
end $$;

-- anon cannot update at all.
do $$
declare failed boolean := false;
begin
  set local role anon;
  begin
    update public.profiles set name = 'x';
  exception when insufficient_privilege then failed := true;
  end;
  reset role;
  if not failed then raise exception 'FAIL: anon update allowed'; end if;
end $$;

-- Insert as authenticated: email insertable, is_test forced false.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"c1c1c1c1-0000-0000-0000-0000000000c1"}';
insert into public.profiles (id, name, full_name, email, is_test)
values ('c1c1c1c1-0000-0000-0000-0000000000c1','C','C','c1@example.com', true);
do $$
begin
  if (select is_test from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: authenticated insert kept is_test=true';
  end if;
end $$;
rollback;

-- Owner (the role running this harness, as the seed script does) may set is_test.
do $$
begin
  insert into public.profiles (id, name, full_name, email, is_test)
  values ('c1c1c1c1-0000-0000-0000-0000000000c1','C','C','c1@test.brivia.club', true);
  if not (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner insert could not set is_test';
  end if;
  update public.profiles set is_test = false where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
  if (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner update could not clear is_test';
  end if;
  update public.profiles set is_test = true where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
  if not (select is_test from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1') then
    raise exception 'FAIL: owner update could not set is_test';
  end if;
  delete from public.profiles where id = 'c1c1c1c1-0000-0000-0000-0000000000c1';
end $$;

-- Trigger blocks is_test changes even if a future grant re-adds the column.
do $$
begin
  grant update (is_test) on public.profiles to authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"a1a1a1a1-0000-0000-0000-0000000000a1"}', true);
  update public.profiles set is_test = true where id = auth.uid();
  reset role;
  if (select is_test from public.profiles where id = 'a1a1a1a1-0000-0000-0000-0000000000a1') then
    raise exception 'FAIL: trigger did not hold is_test under a column grant';
  end if;
  revoke update (is_test) on public.profiles from authenticated;
end $$;
select 'trust.test OK';
