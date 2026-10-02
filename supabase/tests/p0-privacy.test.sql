-- P0 privacy: members must not read each other's email/phone.
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-00000000000a'), ('bbbbbbbb-0000-0000-0000-00000000000b')
  on conflict do nothing;
insert into public.profiles (id, name, full_name, email, phone, phone_country_code, phone_number, city)
values
 ('aaaaaaaa-0000-0000-0000-00000000000a','A','A Person','a@example.com','+1 555','+1','555','Austin'),
 ('bbbbbbbb-0000-0000-0000-00000000000b','B','B Person','b@example.com','+1 666','+1','666','Dallas')
on conflict (id) do nothing;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a"}';
do $$
declare n int;
begin
  select count(*) into n from public.profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  if n <> 0 then raise exception 'FAIL: A can read B base profile row (% rows)', n; end if;
  select count(*) into n from public.profiles where email = 'b@example.com';
  if n <> 0 then raise exception 'FAIL: A can read B email'; end if;
  select count(*) into n from public.public_profiles where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  if n <> 1 then raise exception 'FAIL: public_profiles missing B (% rows)', n; end if;
  select count(*) into n from public.profiles where id = 'aaaaaaaa-0000-0000-0000-00000000000a' and email = 'a@example.com' and phone_number = '555';
  if n <> 1 then raise exception 'FAIL: A cannot read own full row'; end if;
end $$;
rollback;

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='public_profiles'
     and column_name in ('email','phone','phone_country_code','phone_number');
  if n <> 0 then raise exception 'FAIL: public_profiles exposes % private columns', n; end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='public_profiles'
     and column_name in ('id','name','full_name','gender','city','state','experience','skills','looking_for','photo_url','cover_url','created_at');
  if n <> 12 then raise exception 'FAIL: public_profiles has % of 12 expected columns', n; end if;
end $$;

begin;
set local role anon;
do $$
begin
  begin
    perform 1 from public.public_profiles;
    raise exception 'FAIL: anon can select public_profiles';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
select 'p0-privacy.test.sql OK' as result;
