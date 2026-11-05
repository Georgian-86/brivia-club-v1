set lock_timeout = '5s';
-- 0066_hiring_unlimited.sql (D-217, founder 2026-11-06: "make the limit to 1000 words for this, also hirings can be
-- unlimited"). Apply after 0065 (README "## 0066"), with the client deploy. 0001-0065 are frozen. Idempotent.
--   1. A role's "A line about it" holds up to 1000 words (was 200 characters); at most 8000 characters.
--   2. save_hiring_role: 0037's body without the 3-open-roles cap ('role_cap'), and with the new about limit.

alter table public.hiring_role drop constraint if exists hiring_role_about_check;
alter table public.hiring_role add constraint hiring_role_about_check check (about is null or char_length(about) <= 8000);

create or replace function public.save_hiring_role(p_id uuid, p_title text, p_family text, p_level text,
                                                   p_work_mode text, p_help text, p_company text default null,
                                                   p_about text default null)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_title text := nullif(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'), '');
  v_company text := nullif(regexp_replace(btrim(coalesce(p_company, '')), '\s+', ' ', 'g'), '');
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
  v_id uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not public.brivia_hiring_enabled() then raise exception 'hiring is off' using errcode = 'P0001'; end if;
  if not public.brivia_member_completed(me) then raise exception 'complete your profile' using errcode = '22023'; end if;
  if v_title is null or char_length(v_title) not between 3 and 60 then raise exception 'role title' using errcode = '22023'; end if;
  if v_company is not null and char_length(v_company) not between 2 and 60 then raise exception 'company' using errcode = '22023'; end if;
  -- D-217: up to 1000 words (and 8000 characters, so one word cannot be a wall of text).
  if v_about is not null and (char_length(v_about) > 8000
     or coalesce(array_length(regexp_split_to_array(v_about, '\s+'), 1), 0) > 1000) then
    raise exception 'about too long' using errcode = '22001';
  end if;
  if not (public.brivia_role_text_ok(v_title) and public.brivia_role_text_ok(v_company) and public.brivia_role_text_ok(v_about)) then
    raise exception 'no links or contact details' using errcode = '22023';
  end if;
  if p_family not in ('software', 'data', 'design', 'product', 'marketing', 'sales', 'content', 'operations', 'finance',
                      'people', 'research', 'other')
     or p_level not in ('intern', 'entry', 'mid', 'senior', 'lead')
     or p_work_mode not in ('onsite', 'hybrid', 'remote') or p_help not in ('hiring', 'refer') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('brivia_hiring_role:' || me::text, 0));
  if p_id is null then
    insert into public.hiring_role (member_id, title, family, level, work_mode, help, company, about)
    values (me, v_title, p_family, p_level, p_work_mode, p_help, v_company, v_about)
    returning id into v_id;
  else
    update public.hiring_role r
       set title = v_title, family = p_family, level = p_level, work_mode = p_work_mode, help = p_help,
           company = v_company, about = v_about, updated_at = now()
     where r.id = p_id and r.member_id = me and r.status <> 'closed'
    returning r.id into v_id;
    if v_id is null then raise exception 'role not found' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.save_hiring_role(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.save_hiring_role(uuid, text, text, text, text, text, text, text) to authenticated;
