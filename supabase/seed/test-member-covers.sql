-- One-off: give the test members a preset cover on a database where the test world is ALREADY seeded.
-- (Seed v2 left t01-t24, t30-t32, t38, t46-t48 and t58-t60 without a cover, so their deck cards showed a placeholder.
-- A fresh run of test-members.sql now sets these covers itself; this script is only for the live database.)
--
-- WARNING: the SQL editor runs against the LIVE Supabase project. Run once, as postgres (the editor default).
-- Safe by construction:
--   * touches only rows that are is_test AND have the seed id prefix a7e57000-0000-4000-8000-;
--   * never overwrites a cover that is already set (only null or empty cover_url is filled);
--   * covers are the app's shipped preset illustrations (/Images/Cover%20images/<file>): no upload, no photo, no URL;
--   * idempotent: a second run changes 0 rows.
-- The last result row reports covers_set (rows changed) and test_members_without_cover (expect 0).

begin;

create temp table _seed_covers (n int primary key, cover text not null) on commit drop;
insert into _seed_covers (n, cover) values
  (1, '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG'),
  (2, '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG'),
  (3, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG'),
  (4, '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'),
  (5, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG'),
  (6, '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG'),
  (7, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG'),
  (8, '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png'),
  (9, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG'),
  (10, '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg'),
  (11, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG'),
  (12, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png'),
  (13, '71EFFB34-6301-4196-A085-967D12BF30CE.PNG'),
  (14, 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'),
  (15, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG'),
  (16, '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'),
  (17, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG'),
  (18, '5ae622b1-88f5-481b-8856-eb2eba35e606.png'),
  (19, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG'),
  (20, '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png'),
  (21, '163BDB0C-64AC-44E7-8663-55C323ADB4FE.PNG'),
  (22, 'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG'),
  (23, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG'),
  (24, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png'),
  (30, '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG'),
  (31, 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG'),
  (32, '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'),
  (38, '5ae622b1-88f5-481b-8856-eb2eba35e606.png'),
  (46, '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg'),
  (47, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png'),
  (48, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG'),
  (58, '5ae622b1-88f5-481b-8856-eb2eba35e606.png'),
  (59, 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG'),
  (60, '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png');

create temp table _cover_result on commit drop as
with u as (
  update public.profiles p
     set cover_url = '/Images/Cover%20images/' || c.cover
    from _seed_covers c
   where p.id = ('a7e57000-0000-4000-8000-' || lpad(c.n::text, 12, '0'))::uuid
     and p.is_test
     and p.id::text like 'a7e57000-0000-4000-8000-%'
     and (p.cover_url is null or btrim(p.cover_url) = '')
  returning 1)
select count(*)::int as covers_set from u;

select (select covers_set from _cover_result) as covers_set,
       (select count(*) from public.profiles
         where is_test and id::text like 'a7e57000-0000-4000-8000-%'
           and (cover_url is null or btrim(cover_url) = ''))::int as test_members_without_cover;

commit;
