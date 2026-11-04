-- hiring-test-members.sql: open hiring roles and "Roles I'm open to" for seeded test members (founder request
-- 2026-11-04: "add some real looking profiles who are hiring so that the feature can be tested end to end", D-162).
-- Run in the Supabase SQL editor as postgres (never through the service_role key), AFTER test-members.sql and after
-- migrations 0037 and 0047. Idempotent: fixed ids; a re-run reopens every seeded role for another 30 days and rewrites
-- the seeded intents. Undo: purge-test-members.sql (deleting the seeded profiles cascades to these rows).
--
-- Who sees it: only the test world (0047 brivia_hiring_seen_by). Add your own account as a tester to see it:
--   insert into public.brivia_tester(member_id) select id from auth.users where email = '<your email>' on conflict do nothing;
-- A real member who is not a tester sees no seeded role, even with open_test_world on.
--
-- Every company below is invented for testing. Seeded members never reply: an ask stays "Asked" until the purge.
--   12 hirers, 14 roles, across Thane, Mumbai, Bengaluru, Pune and Delhi; 6 seekers who let hirers find them.
begin;

do $$
begin
  if to_regclass('public.hiring_role') is null then
    raise exception 'Run migration 0037_hiring.sql first (public.hiring_role is missing).';
  end if;
  if to_regprocedure('public.brivia_hiring_seen_by(uuid, uuid)') is null then
    raise exception 'Run migration 0047_hiring_test_world.sql first: without it real members would see seeded jobs.';
  end if;
  if not exists (select 1 from public.profiles where is_test) then
    raise exception 'Run test-members.sql first (no seeded test members found).';
  end if;
end $$;

create temp table _seed_roles (
  k int primary key, n int not null, title text not null, family text not null, level text not null,
  work_mode text not null, help text not null, company text, about text, opened_days int not null
) on commit drop;

insert into _seed_roles (k, n, title, family, level, work_mode, help, company, about, opened_days) values
  -- Thane
  (1, 40, 'Robotics Software Engineer', 'software', 'mid', 'onsite', 'hiring', 'Kestrel Motion Works',
      'ROS 2 and C++ for warehouse robots. A small team, with real hardware on the bench every week.', 4),
  (2, 42, 'Embedded Systems Engineer', 'software', 'senior', 'hybrid', 'refer', null,
      'Firmware for industrial sensors. I can refer strong people into my team.', 9),
  (3, 42, 'Hardware Research Intern', 'research', 'intern', 'onsite', 'refer', null,
      'Six months in the sensor lab. Final-year engineering students welcome.', 2),
  -- Mumbai
  (4, 11, 'Backend Engineer', 'software', 'senior', 'hybrid', 'hiring', 'Banyan Byte Labs',
      'Go and Postgres behind an AI writing tool. Two office days a week in Lower Parel.', 6),
  (5, 11, 'Machine Learning Engineer', 'data', 'mid', 'remote', 'hiring', 'Banyan Byte Labs',
      'Evaluation and fine-tuning for language models. Python first, papers welcome.', 6),
  (6, 8, 'Brand Marketing Manager', 'marketing', 'senior', 'hybrid', 'hiring', 'Jamun & Co. Studio',
      'Lead launches for three consumer brands. You would work with me directly.', 12),
  (7, 34, 'Content Writer', 'content', 'entry', 'remote', 'refer', null,
      'Scripts and long-form for a video studio. Happy to refer writers who bring a portfolio.', 3),
  -- Bengaluru
  (8, 6, 'DevOps Engineer', 'software', 'mid', 'hybrid', 'refer', 'Peepal Cloud Systems',
      'Kubernetes and Terraform on a platform team of six.', 5),
  (9, 26, 'Product Manager', 'product', 'senior', 'onsite', 'hiring', 'Marigold Ledger',
      'Own onboarding for small-business payments, from research to launch.', 8),
  (10, 25, 'Frontend Developer', 'software', 'mid', 'hybrid', 'refer', null,
      'React and TypeScript on a design-led product team. I can refer you in.', 1),
  -- Pune
  (11, 23, 'Senior Data Engineer', 'data', 'senior', 'remote', 'hiring', 'Saffron Grid Analytics',
      'Spark and dbt pipelines for energy data. Fully remote, on India hours.', 10),
  (12, 50, 'UI/UX Designer', 'design', 'entry', 'onsite', 'hiring', 'Ghats & Grids Studio',
      'Mobile apps for local clients. A portfolio matters more than years.', 7),
  -- Delhi
  (13, 13, 'Data Analyst', 'data', 'entry', 'hybrid', 'hiring', 'Ledgerline Fintech',
      'SQL and dashboards for lending risk. Freshers with strong SQL are welcome.', 4),
  (14, 18, 'Site Reliability Engineer', 'software', 'senior', 'remote', 'refer', null,
      'On-call that is actually calm. I can refer experienced SREs.', 11);

-- Role ids: a7e57000-0000-4000-9000-0000000000KK. Only for a seeded member who exists and is not under review.
insert into public.hiring_role as r (id, member_id, title, family, level, work_mode, help, company, about, status,
                                     paused_by_report, opened_at, expires_at, renewals, closed_at, created_at, updated_at)
select ('a7e57000-0000-4000-9000-' || lpad(s.k::text, 12, '0'))::uuid, p.id, s.title, s.family, s.level, s.work_mode,
       s.help, s.company, s.about, 'open', false, now() - make_interval(days => s.opened_days),
       now() - make_interval(days => s.opened_days) + interval '30 days', 0, null,
       now() - make_interval(days => s.opened_days), now()
  from _seed_roles s
  join public.profiles p on p.id = ('a7e57000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid and p.is_test
on conflict (id) do update
   set title = excluded.title, family = excluded.family, level = excluded.level, work_mode = excluded.work_mode,
       help = excluded.help, company = excluded.company, about = excluded.about, status = 'open',
       paused_by_report = false, opened_at = excluded.opened_at, expires_at = excluded.expires_at, closed_at = null,
       updated_at = now()
 where r.member_id = excluded.member_id;

-- Seekers who let hirers find them (the hirer side: post a role as a tester and they appear as suggestions).
create temp table _seed_intents (
  n int primary key, titles text[] not null, families text[] not null, level text, work_modes text[] not null,
  visibility text not null
) on commit drop;
insert into _seed_intents (n, titles, families, level, work_modes, visibility) values
  (39, array['Robotics Software Engineer'], array['software'], 'mid', array['onsite', 'hybrid'], 'everyone'),
  (41, array['Robotics Engineer', 'Embedded Systems Engineer'], array['software', 'research'], 'entry', array['onsite', 'hybrid'], 'hirers'),
  (10, array['Software Engineer Intern', 'Backend Developer'], array['software'], 'intern', array['onsite', 'hybrid', 'remote'], 'everyone'),
  (35, array['Content Writer', 'Copywriter'], array['content', 'marketing'], 'entry', array['remote'], 'hirers'),
  (27, array['Product Designer', 'UI/UX Designer'], array['design'], 'entry', array['hybrid', 'remote'], 'hirers'),
  (22, array['Frontend Developer', 'Software Engineer'], array['software'], 'entry', array['hybrid', 'remote'], 'hirers');

insert into public.role_intent (member_id, titles, families, level, work_modes, visibility, findable, private_company)
select p.id, s.titles, s.families, s.level, s.work_modes, s.visibility, true, null
  from _seed_intents s
  join public.profiles p on p.id = ('a7e57000-0000-4000-8000-' || lpad(s.n::text, 12, '0'))::uuid and p.is_test
on conflict (member_id) do update
   set titles = excluded.titles, families = excluded.families, level = excluded.level, work_modes = excluded.work_modes,
       visibility = excluded.visibility, findable = true, private_company = null, updated_at = now()
 where public.role_intent.member_id in (select id from public.profiles where is_test);

do $$
declare roles int; intents int;
begin
  select count(*) into roles from public.hiring_role where id::text like 'a7e57000-0000-4000-9000-%' and status = 'open';
  select count(*) into intents from public.role_intent i join public.profiles p on p.id = i.member_id where p.is_test;
  raise notice 'hiring seed: % open seeded roles, % seeded seekers', roles, intents;
end $$;

commit;
