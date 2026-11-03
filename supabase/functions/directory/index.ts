// directory (D-140): the two lookups the browser cannot do against the database alone. Members only (verify_jwt).
//
//   { kind: 'company', q }  Organisations from Wikidata (free, worldwide, CC0): search, keep the results that describe an
//                           organisation, read each one's website and logo, store the logo once in the company-logos
//                           bucket (directory/<Qid>.<ext>), and cache the rows in public.company
//                           (brivia_cache_companies). Answers { companies: [{ id, name, domain, logo_path, industry,
//                           verified, source }] }. Next time the same company comes from the database search alone.
//   { kind: 'postal', q }   A postal code through OpenStreetMap Photon, mapped to the nearest directory city in its
//                           country (brivia_nearest_cities). Answers { places: [{ id, name, region, country, postal }] }.
//
// Nothing about the member is sent to either service: only the typed company name or postal code.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const UA = 'BriviaClub/1.0 (https://thebriviaclub.live; directory lookup)';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
// Wikidata descriptions that name an organisation ("Indian food delivery company", "American multinational technology
// company", "public research university", "investment bank", "ministry of the Government of India"...).
const ORG = /\b(company|companies|corporation|conglomerate|startup|start-up|enterprise|business|firm|bank|banking|insurer|insurance|fund|venture capital|private equity|holding|group|brand|retailer|chain|restaurant|marketplace|manufacturer|maker|producer|developer|publisher|studio|agency|consultancy|consulting|organi[sz]ation|non-profit|nonprofit|ngo|foundation|institute|institution|university|college|school|academy|hospital|clinic|airline|carrier|operator|exchange|ministry|department|government|authority|council|regulator|subsidiary|cooperative|co-operative|law firm|unicorn|delivery platform|food delivery|fintech|e-commerce)\b/i;
// D-144: never a place or a product (Gothenburg, Google Maps, Google Play and Google Scholar slipped in through
// "capital", "service" and "platform"): a description naming one of these is not an organisation.
// A description that says what it is ("American software company") wins over a product word in it.
const STRONG_ORG = /\b(company|companies|corporation|conglomerate|firm|bank|university|startup|start-up|organi[sz]ation|institute|ministry|subsidiary)\b/i;
const isOrg = (d: string) => ORG.test(d) && (STRONG_ORG.test(d) || !NOT_ORG.test(d));
const NOT_ORG = /\b(city|town|village|municipality|capital of|river|country|province|state of|district|software|app|application|website|web site|search engine|mapping|web browser|operating system|video game|film|album|song|programming language|feature|product|service by|service of|service from|distribution platform)\b/i;

const domainOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};
const timed = (url: string, init: RequestInit = {}, ms = 6000) => fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'auth' });
  const asMember = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who, error: whoError } = await asMember.auth.getUser(token);
  if (whoError || !who?.user?.id) return json(401, { error: 'auth' });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  let body: { kind?: string; q?: string } = {};
  try { body = await req.json(); } catch { body = {}; }
  const q = String(body.q || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return json(200, { companies: [], places: [] });

  if (body.kind === 'postal') {
    try {
      const res = await timed(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8`);
      const geo = res.ok ? await res.json() : { features: [] };
      const want = q.replace(/\s+/g, '').toLowerCase();
      const hits = (geo.features || []).filter((f: any) => String(f?.properties?.postcode || '').replace(/\s+/g, '').toLowerCase() === want).slice(0, 3);
      const places: unknown[] = [];
      const seen = new Set<string>();
      for (const f of hits) {
        const [lng, lat] = f.geometry?.coordinates || [];
        const cc = String(f.properties?.countrycode || '').toUpperCase();
        if (typeof lat !== 'number' || typeof lng !== 'number' || !/^[A-Z]{2}$/.test(cc)) continue;
        const { data } = await admin.rpc('brivia_nearest_cities', { p_lat: lat, p_lng: lng, p_cc: cc, p_limit: 2 });
        for (const p of data || []) { if (!seen.has(p.id)) { seen.add(p.id); places.push({ ...p, postal: q }); } }
      }
      return json(200, { places });
    } catch { return json(200, { places: [] }); }
  }

  if (body.kind !== 'company') return json(400, { error: 'kind' });
  try {
    const search = await timed(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&language=en&uselang=en&limit=12&search=${encodeURIComponent(q)}`);
    const found = search.ok ? (await search.json()).search || [] : [];
    const orgs = found.filter((r: any) => isOrg(String(r.description || ''))).slice(0, 8);
    if (!orgs.length) return json(200, { companies: [] });
    const ids = orgs.map((r: any) => r.id).filter((id: string) => /^Q\d+$/.test(id));
    // Already cached with a logo: no second trip.
    const { data: known } = await admin.from('company').select('wikidata_id,logo_path').in('wikidata_id', ids);
    const knownLogo = new Map((known || []).map((k: any) => [k.wikidata_id, k.logo_path]));
    const ent = await timed(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=${ids.join('|')}`);
    const entities = ent.ok ? (await ent.json()).entities || {} : {};
    const rows: any[] = [];
    for (const r of orgs) {
      const claims = entities[r.id]?.claims || {};
      const website = claims.P856?.[0]?.mainsnak?.datavalue?.value || '';
      const logoFile = claims.P154?.[0]?.mainsnak?.datavalue?.value || '';
      const domain = website ? domainOf(website) : '';
      // D-144: the square mark, like LinkedIn (Google's "G", not its wordmark): the site's own icon at 128 px first, the
      // Commons logo only when there is no website. Logos stored before carry no "-icon" and are fetched again.
      const known = knownLogo.get(r.id) || '';
      let logo_path = /-icon\.[a-z]+$/.test(known) ? known : '';
      const sources = [
        domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : '',
        logoFile ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(logoFile)}?width=128` : '',
      ].filter(Boolean);
      for (const source of logo_path ? [] : sources) {
        if (logo_path) break;
        {
          try {
            const img = await timed(source, {}, 5000);
            const type = img.headers.get('content-type') || '';
            const bytes = img.ok ? new Uint8Array(await img.arrayBuffer()) : new Uint8Array();
            // Raster only (an SVG can carry script): Commons serves SVG logos as PNG thumbnails at ?width=96.
            if (bytes.length > 64 && bytes.length < 300_000 && /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)/.test(type)) {
              const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'ico';
              const path = `directory/${r.id}-icon.${ext}`;
              const up = await admin.storage.from('company-logos').upload(path, bytes, { contentType: type, upsert: true });
              if (!up.error) logo_path = path;
            }
          } catch { /* no logo: the card shows the default mark */ }
        }
      }
      rows.push({ wikidata_id: r.id, name: String(r.label || q).slice(0, 80), domain, logo_path, industry: String(r.description || '').slice(0, 40) });
    }
    const { data: cachedIds, error } = await admin.rpc('brivia_cache_companies', { p_rows: rows });
    if (error) return json(200, { companies: [] });
    const idList = (cachedIds || []).map((x: any) => (typeof x === 'string' ? x : Object.values(x)[0]));
    const { data: companies } = await admin.from('company')
      .select('id,name,domain,logo_path,industry,verified,source').in('id', idList);
    const order = new Map(idList.map((id: string, i: number) => [id, i]));
    return json(200, { companies: (companies || []).sort((a: any, b: any) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)) });
  } catch {
    return json(200, { companies: [] });
  }
});
