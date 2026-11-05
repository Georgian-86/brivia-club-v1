set lock_timeout = '5s';
-- 0065_signup_company_search.sql (D-214, founder 2026-11-06: "remove this 18 year or older and instead put those title
-- and company organisation box make sure logo for every company is there"). Apply after 0064 (README "## 0065"), with
-- the client deploy. 0001-0064 are frozen. Idempotent.
--
-- Signup now asks for the member's title and organisation on its second screen, before the account exists (email
-- path). search_companies (0036, security invoker) becomes callable without a session, and anon may read the directory's
-- own companies (source 'directory' or 'admin': public names, websites and logos). Organisations members added
-- themselves stay visible to signed-in members only. Nothing else changes for anon.

grant select (id, name, name_key, domain, website, logo_path, industry, country_code, source, verified) on public.company to anon;
drop policy if exists company_select_anon on public.company;
create policy company_select_anon on public.company for select to anon using (source <> 'member');
grant execute on function public.search_companies(text, int) to anon;
