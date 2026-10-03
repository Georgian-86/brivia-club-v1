-- purge-test-members.sql: removes EVERY test member and everything tied to them, in ONE transaction (Ruling P7).
-- Run in the Supabase SQL editor as postgres BEFORE launch. This is the LIVE project: it deletes rows for
-- profiles with is_test = true, plus orphan auth.users rows with a @test.brivia.club email and no profile
-- (a half-finished seed). Real members (is_test = false) are never touched. Safe to run when nothing is
-- seeded (all counts are 0). The final result set shows rows deleted per table and rows remaining (must be 0).
--
-- Deleting auth.users cascades to profiles and from there to matches, connection_requests, brivia_blocks,
-- brivia_messages, community_posts and interaction (all "on delete cascade"). Storage objects are removed
-- explicitly below. Note: on Supabase, SQL cannot delete files from Storage (it refuses direct deletes), so if
-- test members ever uploaded files, delete them via the Storage UI/API; the script tells you when this applies.

begin;

create temp table _purge_ids on commit drop as
  select id from public.profiles where is_test
  union
  select u.id from auth.users u
   where lower(u.email) like '%@test.brivia.club'
     and not exists (select 1 from public.profiles p where p.id = u.id);

create temp table _purge_report (tbl text, deleted bigint default 0, remaining bigint default 0) on commit drop;
insert into _purge_report(tbl) values
  ('auth.users'), ('profiles'), ('connection_requests'), ('matches'), ('brivia_blocks'),
  ('brivia_messages'), ('community_posts'), ('interaction'), ('storage.objects');

create temp table _purge_before on commit drop as
  select 'auth.users' as tbl, count(*) as n from auth.users where id in (select id from _purge_ids)
  union all select 'profiles', count(*) from public.profiles where id in (select id from _purge_ids)
  union all select 'connection_requests', count(*) from public.connection_requests
    where from_id in (select id from _purge_ids) or to_id in (select id from _purge_ids)
  union all select 'matches', count(*) from public.matches
    where user1_id in (select id from _purge_ids) or user2_id in (select id from _purge_ids)
  union all select 'brivia_blocks', count(*) from public.brivia_blocks
    where blocker_id in (select id from _purge_ids) or blocked_id in (select id from _purge_ids)
  union all select 'brivia_messages', count(*) from public.brivia_messages
    where sender_id in (select id from _purge_ids) or recipient_id in (select id from _purge_ids)
  union all select 'community_posts', count(*) from public.community_posts where author_id in (select id from _purge_ids)
  union all select 'interaction', count(*) from public.interaction
    where viewer_id in (select id from _purge_ids) or target_id in (select id from _purge_ids)
  union all select 'storage.objects', count(*) from storage.objects
    where owner in (select id from _purge_ids) or (storage.foldername(name))[1] in (select id::text from _purge_ids);

-- Storage rows first (folder "<uid>/..." or owner).
do $$
begin
  delete from storage.objects
   where owner in (select id from _purge_ids) or (storage.foldername(name))[1] in (select id::text from _purge_ids);
exception when others then
  raise notice 'storage.objects rows for test members were not deleted by SQL (%). Remove their files via the Storage API or dashboard.', sqlerrm;
end $$;

-- Explicit deletes from the dependants (belt and braces; the cascade would do the same), then the users.
delete from public.interaction where viewer_id in (select id from _purge_ids) or target_id in (select id from _purge_ids);
delete from public.brivia_messages where sender_id in (select id from _purge_ids) or recipient_id in (select id from _purge_ids);
delete from public.community_posts where author_id in (select id from _purge_ids);
delete from public.brivia_blocks where blocker_id in (select id from _purge_ids) or blocked_id in (select id from _purge_ids);
delete from public.matches where user1_id in (select id from _purge_ids) or user2_id in (select id from _purge_ids);
delete from public.connection_requests where from_id in (select id from _purge_ids) or to_id in (select id from _purge_ids);
delete from public.profiles where id in (select id from _purge_ids);
delete from auth.users where id in (select id from _purge_ids);

update _purge_report r set deleted = b.n from _purge_before b where b.tbl = r.tbl;
update _purge_report set remaining = case tbl
  when 'auth.users' then (select count(*) from auth.users where id in (select id from _purge_ids))
  when 'profiles' then (select count(*) from public.profiles where id in (select id from _purge_ids))
  when 'connection_requests' then (select count(*) from public.connection_requests where from_id in (select id from _purge_ids) or to_id in (select id from _purge_ids))
  when 'matches' then (select count(*) from public.matches where user1_id in (select id from _purge_ids) or user2_id in (select id from _purge_ids))
  when 'brivia_blocks' then (select count(*) from public.brivia_blocks where blocker_id in (select id from _purge_ids) or blocked_id in (select id from _purge_ids))
  when 'brivia_messages' then (select count(*) from public.brivia_messages where sender_id in (select id from _purge_ids) or recipient_id in (select id from _purge_ids))
  when 'community_posts' then (select count(*) from public.community_posts where author_id in (select id from _purge_ids))
  when 'interaction' then (select count(*) from public.interaction where viewer_id in (select id from _purge_ids) or target_id in (select id from _purge_ids))
  else (select count(*) from storage.objects where owner in (select id from _purge_ids) or (storage.foldername(name))[1] in (select id::text from _purge_ids))
end;

select tbl, deleted, remaining from _purge_report order by tbl;

commit;
