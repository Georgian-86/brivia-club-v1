-- Helper for the R8 drift check in run.sh (not a *.test.sql). Prints one tab-separated line per policy in the public
-- and storage schemas, wrapper normalised, to stdout (run.sh redirects it into $STAGE).
\pset tuples_only on
\copy (select schemaname, tablename, policyname, cmd, roles::text, permissive, replace(coalesce(qual, '-'), '( SELECT auth.uid() AS uid)', 'auth.uid()'), replace(coalesce(with_check, '-'), '( SELECT auth.uid() AS uid)', 'auth.uid()') from pg_policies where schemaname in ('public', 'storage') order by schemaname, tablename, policyname) to stdout
