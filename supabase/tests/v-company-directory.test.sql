-- 0036 (D-140): companies and members' work.
-- C1 a member adds their startup once (the same website or name answers the same row), cannot use another member's
--    logo folder, at most 5 new ones a day; search finds it by name, prefix, typo and domain.
-- C2 the directory cache dedupes by Wikidata id and domain; a verified company is ranked first.
-- C3 set_my_work sets and clears title and company; member_work returns them for yourself; anon cannot call any of it.
set brivia.harness_autocomplete = 'off';
begin;
do $$
declare a uuid := '0e360000-0000-4000-8000-000000000001'; b uuid := '0e360000-0000-4000-8000-000000000002';
  c1 uuid; c2 uuid; c3 uuid; g uuid; refused text; i int; ids uuid[];
begin
  insert into auth.users(id) values (a), (b) on conflict do nothing;
  insert into public.profiles (id, name, full_name, email) values (a, 'Co A', 'Co A', 'coa@example.com'), (b, 'Co B', 'Co B', 'cob@example.com') on conflict (id) do nothing;

  -- C2 (service role: the Edge Function)
  select array_agg(x) into ids from public.brivia_cache_companies($j$[
    {"wikidata_id":"Q20000001","name":"Swiggy","domain":"https://www.swiggy.com","logo_path":"directory/Q20000001.png","industry":"Food delivery","country_code":"IN"},
    {"wikidata_id":"Q95","name":"Google","domain":"google.com","logo_path":"directory/Q95.png","country_code":"US"},
    {"wikidata_id":"bad","name":"Nope"}]$j$::jsonb) x;
  if array_length(ids, 1) <> 2 then raise exception 'FAIL C2: % cached', array_length(ids, 1); end if;
  perform public.brivia_cache_companies('[{"wikidata_id":"Q20000001","name":"Swiggy Ltd","domain":"swiggy.com"}]'::jsonb);
  if (select count(*) from public.company where domain = 'swiggy.com') <> 1 then raise exception 'FAIL C2: duplicated'; end if;
  update public.company set verified = true where wikidata_id = 'Q95' returning id into g;

  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);
  set local role authenticated;
  -- C1
  c1 := public.add_company('  My   Startup ', 'https://www.mystartup.in/about', 'Software', a::text || '/logo.webp');
  c2 := public.add_company('mystartup', 'mystartup.in', null, null);
  if c2 <> c1 then raise exception 'FAIL C1: same website made a second row'; end if;
  c3 := public.add_company('MY STARTUP', null, null, null);
  if c3 <> c1 then raise exception 'FAIL C1: same name made a second row'; end if;
  if (select name from public.company where id = c1) <> 'My Startup' then raise exception 'FAIL C1: name not tidied'; end if;
  refused := 'none';
  begin perform public.add_company('Other Co', null, null, b::text || '/x.webp'); exception when others then refused := sqlerrm; end;
  if refused <> 'invalid logo' then raise exception 'FAIL C1: another member''s logo folder'; end if;
  refused := 'none';
  begin perform public.add_company('https://spam.example', null, null, null); exception when others then refused := sqlerrm; end;
  if refused <> 'invalid name' then raise exception 'FAIL C1: a link as a name'; end if;
  for i in 1..4 loop perform public.add_company('Venture ' || i, null, null, null); end loop;
  refused := 'none';
  begin perform public.add_company('Venture 9', null, null, null); exception when others then refused := sqlerrm; end;
  if refused <> 'try again later' then raise exception 'FAIL C1: more than 5 a day'; end if;
  if (select id from public.search_companies('mysta') limit 1) <> c1 then raise exception 'FAIL C1: prefix'; end if;
  if (select id from public.search_companies('mystartup.in') limit 1) <> c1 then raise exception 'FAIL C1: domain'; end if;
  if (select name from public.search_companies('Swigy') limit 1) <> 'Swiggy' then raise exception 'FAIL C1: typo'; end if;
  if (select name from public.search_companies('goog') limit 1) <> 'Google' then raise exception 'FAIL C2: verified first'; end if;

  -- C3
  perform public.set_my_work('  Software   Engineer ', g);
  if (select job_title || ' at ' || company_name from public.member_work(array[a])) <> 'Software Engineer at Google' then
    raise exception 'FAIL C3: %', (select job_title || ' at ' || company_name from public.member_work(array[a])); end if;
  refused := 'none';
  begin perform public.set_my_work(repeat('x', 61), null); exception when others then refused := sqlerrm; end;
  if refused <> 'title too long' then raise exception 'FAIL C3: long title'; end if;
  perform public.set_my_work(null, null);
  if exists (select 1 from public.member_work(array[a])) then raise exception 'FAIL C3: not cleared'; end if;
  reset role;
  if has_function_privilege('anon', 'public.search_companies(text,int)', 'execute') or has_function_privilege('anon', 'public.member_work(uuid[])', 'execute')
     or has_function_privilege('authenticated', 'public.brivia_cache_companies(jsonb)', 'execute') then raise exception 'FAIL C3: grants'; end if;
end $$;
select 'v-company-directory.test C1-C3 OK';

-- C4 (0039, D-142): the founder's directory is seeded, verified, searchable by short name; a Wikidata hit fills the
-- seeded row (website, logo) instead of adding a second one.
do $$
declare before int; s uuid;
begin
  if (select count(*) from public.company where source = 'admin' and verified) < 900 then raise exception 'FAIL C4: seed %', (select count(*) from public.company where source = 'admin'); end if;
  if (select name from public.search_companies('tcs') limit 1) <> 'Tata Consultancy Services (TCS)' then raise exception 'FAIL C4: short name'; end if;
  if (select name from public.search_companies('Zeroda') limit 1) <> 'Zerodha' then raise exception 'FAIL C4: typo'; end if;
  select id into s from public.company where name = 'Razorpay';
  before := (select count(*) from public.company);
  perform public.brivia_cache_companies('[{"wikidata_id":"Q30000001","name":"Razorpay","domain":"https://razorpay.com","logo_path":"directory/Q30000001.png"}]'::jsonb);
  if (select count(*) from public.company) <> before then raise exception 'FAIL C4: a duplicate Razorpay'; end if;
  if (select logo_path || ' ' || domain from public.company where id = s) <> 'directory/Q30000001.png razorpay.com' then raise exception 'FAIL C4: not enriched'; end if;
end $$;
select 'v-company-directory.test C4 OK';
rollback;

-- C5 (0040, D-148): every seeded company has a website to read its icon from; the logo pass sees only those without a
-- logo, writes only a directory path, and never touches a member's own organisation; members cannot call either.
do $$
declare first uuid;
begin
  if exists (select 1 from public.company where source = 'admin' and icon_domain is null) then
    raise exception 'FAIL C5: % seeded companies without a website', (select count(*) from public.company where source = 'admin' and icon_domain is null); end if;
  if (select icon_domain from public.company where name = 'Swiggy') <> 'swiggy.com' then raise exception 'FAIL C5: Swiggy'; end if;
  select id into first from public.brivia_companies_needing_icons(1, 0);
  perform public.brivia_set_company_icon(first, 'https://evil.example/x.png');
  if (select logo_path from public.company where id = first) is not null then raise exception 'FAIL C5: a URL was stored'; end if;
  perform public.brivia_set_company_icon(first, 'directory/c-test-icon.png');
  if (select logo_path from public.company where id = first) <> 'directory/c-test-icon.png' then raise exception 'FAIL C5: icon not set'; end if;
  if exists (select 1 from public.brivia_companies_needing_icons(60, 0) where id = first) then raise exception 'FAIL C5: listed again'; end if;
  if has_function_privilege('authenticated', 'public.brivia_set_company_icon(uuid,text)', 'execute') then raise exception 'FAIL C5: grants'; end if;
  update public.company set logo_path = null where id = first;
end $$;
select 'v-company-directory.test C5 OK';
