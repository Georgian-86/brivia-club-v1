-- Helper for the R8 drift check: lists public policies whose qual/with_check still holds a bare auth.uid() once the
-- initplan wrapper is removed, plus the forbidden connection-request insert policy. Empty output = clean.
\pset tuples_only on
\pset format unaligned
select 'unwrapped auth.uid(): ' || tablename || ' / ' || policyname from pg_policies
 where schemaname = 'public'
   and (replace(coalesce(qual, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%'
     or replace(coalesce(with_check, ''), '( SELECT auth.uid() AS uid)', '') like '%auth.uid()%');
select 'forbidden policy present: ' || policyname from pg_policies where policyname = 'Members can send connection requests';
