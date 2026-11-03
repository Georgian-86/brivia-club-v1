set lock_timeout = '5s';
-- 0044_chat_people_search.sql: find people from Chat search, connected or not, without needing a conversation
-- (founder request 2026-11-04, D-152: "A mutual connection should be discoverable through Chat search even if no
-- conversation has ever been initiated"). Applied after 0043 (README "## 0044"). 0001-0043 are frozen. Idempotent.
--
-- chat_people_search(p_query, p_limit): members the caller may see (brivia_visible_to: same world, no block either way,
-- both completed), matched by every word of the query against the start of any word of their name or full name, or
-- anywhere in their job title or company. Each row says how they relate to the caller:
--   status 'connected' (a match), 'request_received' (their request to the caller is pending), 'request_sent' (the
--   caller's request is pending, or was declined: a decline is never revealed), 'none'.
-- Connections answer from the first character; anyone else needs 2 (as search_members, so one letter never pages the
-- directory) and at most 8 of them come back. Connections come first, then those with a conversation, then name order.
-- has_conversation / last_message_at come from messages the caller can see (a withheld message is not counted).
-- What it returns is what the deck and profile already show to a member who can see them: name, photo, job title,
-- company and the first 140 characters of the bio. Never an email, phone, city or place.

create or replace function public.chat_people_search(p_query text, p_limit int default 20)
returns table(member_id uuid, name text, photo_url text, job_title text, company_name text, logo_path text,
              bio_preview text, status text, has_conversation boolean, last_message_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_q text := lower(btrim(regexp_replace(left(coalesce(p_query, ''), 80), '\s+', ' ', 'g')));
  v_words text[];
  v_len int;
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 30);
begin
  if uid is null or not public.brivia_member_completed(uid) then
    return;
  end if;
  v_len := char_length(replace(v_q, ' ', ''));
  if v_len < 1 then
    return;
  end if;
  -- LIKE wildcards in the query are literal.
  v_words := string_to_array(replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_'), ' ');
  return query
  with cand as (
    select p.id, p.name, p.full_name, p.photo_url, p.job_title, p.bio, c.name as company, c.logo_path as logo,
           exists (select 1 from public.matches m
                    where (m.user1_id = uid and m.user2_id = p.id) or (m.user2_id = uid and m.user1_id = p.id)) as is_match
      from public.profiles p
      left join public.company c on c.id = p.company_id
     where p.id <> uid
       and public.brivia_visible_to(uid, p.id)
       and (select bool_and(
             (' ' || lower(coalesce(p.name, '')) || ' ' || lower(coalesce(p.full_name, ''))) like '% ' || w || '%' escape '\'
             or lower(coalesce(p.job_title, '')) like '%' || w || '%' escape '\'
             or lower(coalesce(c.name, '')) like '%' || w || '%' escape '\')
            from unnest(v_words) w where w <> '')
  ),
  rel as (
    select cand.*,
           case
             when cand.is_match then 'connected'
             when exists (select 1 from public.connection_requests r
                           where r.from_id = cand.id and r.to_id = uid and r.status = 'pending') then 'request_received'
             when exists (select 1 from public.connection_requests r
                           where r.from_id = uid and r.to_id = cand.id and r.status in ('pending', 'declined')) then 'request_sent'
             else 'none'
           end as rel_status,
           (select max(b.created_at) from public.brivia_messages b
             where ((b.sender_id = uid and b.recipient_id = cand.id)
                 or (b.sender_id = cand.id and b.recipient_id = uid
                     and not exists (select 1 from brivia_private.withheld_message w where w.message_id = b.id)))) as last_at
      from cand
  ),
  ranked as (
    select rel.*,
           row_number() over (partition by rel.is_match order by (rel.last_at is not null) desc,
                              (lower(coalesce(rel.name, '')) like v_words[1] || '%' escape '\') desc,
                              lower(coalesce(rel.name, '')), rel.id) as pos
      from rel
     where rel.is_match or v_len >= 2
  )
  select r.id, r.name, r.photo_url, r.job_title, r.company, r.logo,
         case when nullif(btrim(r.bio), '') is null then null
              when char_length(btrim(r.bio)) > 140 then left(btrim(r.bio), 139) || '…'
              else btrim(r.bio) end,
         r.rel_status, r.last_at is not null, r.last_at
    from ranked r
   where (r.is_match and r.pos <= v_limit) or (not r.is_match and r.pos <= 8)
   order by r.is_match desc, (r.rel_status = 'request_received') desc, (r.last_at is not null) desc, r.last_at desc nulls last,
            lower(coalesce(r.name, '')), r.id;
end;
$$;
revoke all on function public.chat_people_search(text, int) from public, anon;
grant execute on function public.chat_people_search(text, int) to authenticated;
