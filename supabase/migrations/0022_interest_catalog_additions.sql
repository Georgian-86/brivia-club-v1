set lock_timeout = '5s';
-- 0022_interest_catalog_additions.sql: nine more catalogue interests from the founder (2026-11-02, D-122).
-- Applied by hand in the Supabase SQL editor, as postgres, after 0021 (see README.md "## 0022").
-- Idempotent: the local harness (bash supabase/tests/run.sh) applies every migration twice.
--
-- The source of truth stays supabase/catalog/interest-catalog.tsv, and 0017's generated block already holds these
-- nine rows, so a database that applies 0017 after this change gets them from 0017 and this file changes nothing.
-- This file is for a database where 0017 already ran: it adds the nine level-3 nodes under existing categories and
-- renumbers catalog_order A-Z (the same order 0017 writes). Before 0017 (no catalog_order column) it does nothing.
-- tests/unit/interest-catalog-additions.test.mjs checks that every row below is in the TSV with the same id and label.
-- Nothing sensitive is added. A node a moderator retired stays retired and out of the catalogue.

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'interest_node' and column_name = 'catalog_order') then
    raise notice '0022: nothing to do yet. Apply 0017 first; it already holds these interests.';
    return;
  end if;

  create temp table brivia_catalog_0022 (id text primary key, label text not null) on commit drop;
  insert into brivia_catalog_0022 (id, label) values
    ('music.singing.backing_vocals', 'Backing Vocals'),
    ('stage_screen.film.film_direction', 'Film Direction'),
    ('music.making.lyric_writing', 'Lyric Writing'),
    ('music.making.mixing_and_mastering', 'Mixing and Mastering'),
    ('music.making.music_direction', 'Music Direction'),
    ('outdoors.trekking.night_walks', 'Night Walks'),
    ('sports.precision.pistol_shooting', 'Pistol Shooting'),
    ('sports.precision.rifle_shooting', 'Rifle Shooting'),
    ('lifestyle.style.shopping', 'Shopping');

  if exists (select 1 from brivia_catalog_0022 c
              where not exists (select 1 from public.interest_node p where p.id = regexp_replace(c.id, '\.[^.]+$', ''))) then
    raise exception '0022: a new interest has no parent category';
  end if;

  insert into public.interest_node (id, parent_id, level, label, sensitive)
  select c.id, regexp_replace(c.id, '\.[^.]+$', ''), 3, c.label, false
    from brivia_catalog_0022 c
  on conflict (id) do nothing;

  -- The catalogue A-Z again, with the new nodes in place (a new node only while it is active and public).
  with cat as (
    select n.id, row_number() over (order by lower(n.label) collate "C", n.id) as ord
      from public.interest_node n
     where n.catalog_order is not null
        or (n.id in (select id from brivia_catalog_0022) and n.status = 'active' and not n.sensitive)
  )
  update public.interest_node n set catalog_order = cat.ord
    from cat
   where n.id = cat.id and n.catalog_order is distinct from cat.ord;
end $$;
