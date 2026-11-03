set lock_timeout = '5s';
-- 0032_interest_additions.sql: offer the two interests 0017 left out of the founder's A-Z list (founder request
-- 2026-11-03, D-136: "yes", add them). Applied by hand in the Supabase SQL editor, as postgres, after 0031
-- (README "## 0032"). 0001-0031 are frozen. Idempotent: the local harness applies every migration twice.
--
-- Gospel Music: a music genre under music.listening, public like the other genres. The founder chose to offer it;
--   this overrides D-038's note that it is a religion proxy for this one label (Devotional singing and Sufi and
--   qawwali stay sensitive).
-- NLP: offered as its own label under tech.ai_data, a sibling of Natural Language Processing, so ORBIT still sees
--   the two as close (same category).
-- Then catalog_order is recomputed A-Z, as in 0031.

insert into public.interest_node (id, parent_id, level, label, sensitive)
values ('music.listening.gospel_music', 'music.listening', 3, 'Gospel Music', false),
       ('tech.ai_data.nlp_short', 'tech.ai_data', 3, 'NLP', false)
on conflict (id) do nothing;

-- Give them a catalog_order (only if still unlisted and active: a moderator's retirement sticks).
update public.interest_node set catalog_order = 0
 where id in ('music.listening.gospel_music', 'tech.ai_data.nlp_short') and catalog_order is null and status = 'active'
   and not sensitive;

with ordered as (
  select id, row_number() over (order by lower(label), id) as ord
    from public.interest_node where catalog_order is not null
)
update public.interest_node n set catalog_order = o.ord
  from ordered o
 where n.id = o.id and n.catalog_order is distinct from o.ord;
