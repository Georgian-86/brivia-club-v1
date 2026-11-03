-- 0031 (D-135): the catalogue uses the founder's exact wording.
-- L1 relabelled nodes read as the founder wrote them; their ids are unchanged.
-- L2 the offered catalogue is 1,131 nodes (0032 adds Gospel Music and NLP), catalog_order is 1..N without gaps and A-Z (case-insensitive), labels unique.
-- L3 nothing sensitive or retired is offered.
set brivia.harness_autocomplete = 'off';
do $$
declare bad text;
begin
  -- L1
  select string_agg(x.id || '=' || coalesce(n.label, '?'), ', ') into bad
    from (values ('tech.ai_data.machine_learning', 'Machine Learning'), ('tech.frontier.ar_vr', 'AR/VR'),
                 ('stage_screen.dance.garba', 'Garba'), ('tech.software.web_development', 'Web Development'),
                 ('outdoors.nature.birdwatching.urban_birding', 'Urban Birding')) x(id, want)
    left join public.interest_node n on n.id = x.id
   where n.label is distinct from x.want;
  if bad is not null then raise exception 'FAIL L1: %', bad; end if;
  -- L2
  if (select count(*) from public.interest_node where catalog_order is not null) <> 1131 then
    raise exception 'FAIL L2: % offered', (select count(*) from public.interest_node where catalog_order is not null); end if;
  if exists (select 1 from (select catalog_order, row_number() over (order by catalog_order) rn from public.interest_node where catalog_order is not null) t where t.catalog_order <> t.rn) then
    raise exception 'FAIL L2: catalog_order has gaps'; end if;
  if exists (select 1 from (select label, lag(label) over (order by catalog_order) prev from public.interest_node where catalog_order is not null) t where lower(t.prev) > lower(t.label)) then
    raise exception 'FAIL L2: not A-Z'; end if;
  if (select count(distinct lower(label)) from public.interest_node where catalog_order is not null) <> 1131 then raise exception 'FAIL L2: duplicate labels'; end if;
  if (select label from public.interest_node where catalog_order = 1) <> 'Abstract Art' or (select label from public.interest_node order by catalog_order desc nulls last limit 1) <> 'Zymology' then
    raise exception 'FAIL L2: ends'; end if;
  -- L4 (0032, D-136): Gospel Music is a public music genre, NLP a sibling of Natural Language Processing.
  if (select parent_id from public.interest_node where label = 'Gospel Music' and catalog_order is not null) is distinct from 'music.listening'
     or (select parent_id from public.interest_node where label = 'NLP' and catalog_order is not null) is distinct from 'tech.ai_data'
     or (select sensitive from public.interest_node where id = 'music.listening.gospel_music') then
    raise exception 'FAIL L4: Gospel Music or NLP missing or misplaced'; end if;
  if not (select sensitive from public.interest_node where id = 'music.listening.sufi_qawwali') then
    raise exception 'FAIL L4: Sufi and qawwali is no longer sensitive'; end if;
  -- L3
  if exists (select 1 from public.interest_node where catalog_order is not null and (sensitive or status <> 'active')) then
    raise exception 'FAIL L3: a sensitive or retired node is offered'; end if;
end $$;
