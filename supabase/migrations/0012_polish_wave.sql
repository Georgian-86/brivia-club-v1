-- 0012_polish_wave.sql: the polish wave (spec docs/superpowers/specs/2026-10-21-polish-wave-design.md).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0011. 0001-0011 are frozen.
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
-- Each task fills only its own section below.

-- §A5 blocked sends are withheld

-- §C post likes and saves
-- Private to the member: a like or save is visible only to its owner (no counts, no RPC). The insert policy checks
-- that the post exists under the posts select policy (a post the member cannot see cannot be liked).
-- A repeated insert is a unique_violation (23505); the client treats it as done.
do $c$
declare t text;
begin
  foreach t in array array['community_post_likes', 'community_post_saves'] loop
    execute format($f$create table if not exists public.%I (
      post_id uuid not null references public.community_posts(id) on delete cascade,
      member_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (post_id, member_id)
    )$f$, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, delete on public.%I to authenticated', t);
    -- the client lists by member_id; the primary key leads with post_id
    execute format('create index if not exists %I on public.%I (member_id, created_at desc)', t || '_member_idx', t);
    execute format('drop policy if exists %I on public.%I', 'Members can view their own ' || t, t);
    execute format('create policy %I on public.%I for select to authenticated using (member_id = (select auth.uid()))',
      'Members can view their own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Members can add their own ' || t, t);
    execute format($f$create policy %I on public.%I for insert to authenticated with check (
      member_id = (select auth.uid())
      and (select public.brivia_has_completed_profile())
      and exists (select 1 from public.community_posts p where p.id = post_id))$f$,
      'Members can add their own ' || t, t);
    execute format('drop policy if exists %I on public.%I', 'Members can remove their own ' || t, t);
    execute format('create policy %I on public.%I for delete to authenticated using (member_id = (select auth.uid()))',
      'Members can remove their own ' || t, t);
  end loop;
end $c$;

-- §D resumes, resume messages, typing, deletion
-- Resumes (D1). One PDF per member at resumes/<uid>/resume.pdf in a private bucket (5 MB, PDF only, enforced by
-- Storage). Only the owner writes it. Anyone else reads it (and so can create a short-lived signed URL, which Storage
-- authorises through the select policy) only while a 'resume' message from the owner to them exists AND the pair can
-- still message (matched, not blocked either way, same world): an unmatch or a block closes every old link at once.
-- The bucket is never public; no public URL exists.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];

drop policy if exists "Members can upload their resume" on storage.objects;
create policy "Members can upload their resume"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and name = (select auth.uid())::text || '/resume.pdf');
drop policy if exists "Members can replace their resume" on storage.objects;
create policy "Members can replace their resume"
  on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and name = (select auth.uid())::text || '/resume.pdf')
  with check (bucket_id = 'resumes' and name = (select auth.uid())::text || '/resume.pdf');
drop policy if exists "Members can delete their resume" on storage.objects;
create policy "Members can delete their resume"
  on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and name = (select auth.uid())::text || '/resume.pdf');
drop policy if exists "Members can read their resume or one shared with them" on storage.objects;
create policy "Members can read their resume or one shared with them"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resumes'
    and (
      name = (select auth.uid())::text || '/resume.pdf'
      or exists (
        select 1 from public.brivia_messages m
         where m.message_type = 'resume'
           and m.attachment_path = storage.objects.name
           and m.recipient_id = (select auth.uid())
           and brivia_private.brivia_can_message(m.sender_id)
      )
    )
  );

-- profiles.resume_path: the member's own resume path, or null. Readable only by the owner (profiles select is
-- own-row only; public_profiles and the member RPCs do not carry it). Editable by the owner, own path only.
alter table public.profiles add column if not exists resume_path text;
alter table public.profiles drop constraint if exists profiles_resume_path_own;
alter table public.profiles add constraint profiles_resume_path_own
  check (resume_path is null or resume_path = id::text || '/resume.pdf');
grant update (resume_path) on public.profiles to authenticated;

-- A resume message points at its sender's own resume, nothing else (brivia_messages_attachment_path_owner, 0003,
-- already pins the sender's folder). coalesce: a null path would make the check null, which a CHECK accepts.
alter table public.brivia_messages drop constraint if exists brivia_messages_resume_path;
alter table public.brivia_messages add constraint brivia_messages_resume_path
  check (message_type <> 'resume' or coalesce(attachment_path = sender_id::text || '/resume.pdf', false));

-- The 0003 message-attachments select policy, redefined verbatim plus `m.message_type <> 'resume'`: a resume message
-- (path <sender>/resume.pdf) must never open a same-named file in the message-attachments bucket.
drop policy if exists "Participants can view message attachments" on storage.objects;
create policy "Participants can view message attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.brivia_messages m
         where m.attachment_path = storage.objects.name
           and m.message_type <> 'resume'
           -- the object must sit in the SENDER's folder: a message cannot claim someone else's file
           and (storage.foldername(storage.objects.name))[1] = m.sender_id::text
           and (select auth.uid()) in (m.sender_id, m.recipient_id)
      )
    )
  );

-- delete_my_account, redefined: the 0005 body unchanged except that 'resumes' joins the member-folder bucket list, so
-- a stored resume blocks deletion (storage_not_empty) until the client removes it through the Storage API.
-- Same signature, grants and errors.
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_amr jsonb := auth.jwt() -> 'amr';
  v_last bigint;
  v_email text;
  v_reasons text[];
  v_reports bigint[];
begin
  if uid is null then
    raise exception 'profile required' using errcode = 'P0002';
  end if;
  if p_confirm is distinct from 'DELETE' then
    raise exception 'confirmation required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_amr) = 'array' then
    select max((e ->> 'timestamp')::bigint) into v_last
      from jsonb_array_elements(v_amr) e
     where jsonb_typeof(e) = 'object' and e ->> 'timestamp' ~ '^[0-9]{1,12}$';
  end if;
  if v_last is null or v_last < extract(epoch from now())::bigint - 600 then
    raise exception 'reauth_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from storage.objects o
              where (o.bucket_id in ('profile-photos', 'profile-covers', 'message-attachments', 'community-posts', 'resumes')
                     and (storage.foldername(o.name))[1] = uid::text)
                 or (o.bucket_id <> 'career-resumes' and (o.owner_id = uid::text or o.owner = uid))) then
    raise exception 'storage_not_empty' using errcode = 'P0001';
  end if;
  select u.email into v_email from auth.users u where u.id = uid;
  select coalesce(array_agg(r.id order by r.id), '{}'::bigint[]) into v_reports from public.member_report r where r.target_id = uid;
  select array(select distinct x from (select r.reason as x from public.member_report r where r.target_id = uid
                                       union all select f.reason from public.member_flag f where f.member_id = uid) q order by x)
    into v_reasons;
  if v_email is not null and (cardinality(v_reports) > 0 or exists (select 1 from public.member_flag f where f.member_id = uid)) then
    insert into public.moderation_tombstone (digest, reasons, report_ids, expires_at)
    values (public.brivia_email_digest(v_email), v_reasons, v_reports, now() + interval '365 days')
    on conflict (digest) do update
      set reasons = array(select distinct x from unnest(public.moderation_tombstone.reasons || excluded.reasons) x order by x),
          report_ids = array(select distinct x from unnest(public.moderation_tombstone.report_ids || excluded.report_ids) x order by x),
          deleted_at = now(),
          expires_at = greatest(public.moderation_tombstone.expires_at, excluded.expires_at);
  end if;
  insert into public.consent_event (member_id, kind, notice_version) values (uid, 'account_deleted', public.brivia_notice_version());
  delete from auth.users where id = uid;
end;
$$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- Typing indicator authorization (D2). The chat sends "typing" as a Realtime broadcast on a private channel whose topic
-- is typing:<lower member id>:<higher member id> (lower case, text order, so both members build the same string).
-- Realtime Authorization checks realtime.messages policies when a socket joins (select = receive) and sends (insert).
-- Only the two members of a live pair may do either: the caller is one of the two ids, the topic matches the format
-- exactly, and brivia_can_message(other) holds (matched, not blocked either way, same world). A block therefore ends
-- typing both ways without any signal. anon gets nothing. A topic names exactly one pair, so no member can join another
-- pair's channel. Guarded: a no-op where Realtime Authorization (realtime.messages) is not present.
do $typing$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;

  execute $f$
    create or replace function brivia_private.brivia_typing_topic_ok(p_topic text)
    returns boolean
    language plpgsql
    stable
    security definer
    set search_path = public
    as $b$
    declare
      m text[];
      me uuid := auth.uid();
      lo uuid;
      hi uuid;
    begin
      if me is null or p_topic is null then
        return false;
      end if;
      m := regexp_match(p_topic,
        '^typing:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');
      if m is null or not (m[1] collate "C" < m[2] collate "C") then
        return false;
      end if;
      lo := m[1]::uuid;
      hi := m[2]::uuid;
      if me = lo then
        return coalesce(brivia_private.brivia_can_message(hi), false);
      elsif me = hi then
        return coalesce(brivia_private.brivia_can_message(lo), false);
      end if;
      return false;
    end;
    $b$
  $f$;
  revoke all on function brivia_private.brivia_typing_topic_ok(text) from public, anon;
  grant execute on function brivia_private.brivia_typing_topic_ok(text) to authenticated;

  drop policy if exists "Matched members can receive typing" on realtime.messages;
  create policy "Matched members can receive typing"
    on realtime.messages for select to authenticated
    using (extension = 'broadcast' and brivia_private.brivia_typing_topic_ok((select realtime.topic())));
  drop policy if exists "Matched members can send typing" on realtime.messages;
  create policy "Matched members can send typing"
    on realtime.messages for insert to authenticated
    with check (extension = 'broadcast' and brivia_private.brivia_typing_topic_ok((select realtime.topic())));
end
$typing$;
