-- 0069 (D-227): the event-brochures bucket has no size limit of its own and still takes PDFs only.
do $$
declare lim bigint; types text[];
begin
  select file_size_limit, allowed_mime_types into lim, types from storage.buckets where id = 'event-brochures';
  if not found then raise exception 'FAIL B1: the event-brochures bucket is missing'; end if;
  if lim is not null then raise exception 'FAIL B1: the brochure bucket still has a size limit (%)', lim; end if;
  if types is distinct from array['application/pdf'] then raise exception 'FAIL B1: the brochure bucket takes %', types; end if;
  raise notice 'B1 OK';
end $$;
