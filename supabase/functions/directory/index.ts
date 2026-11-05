// directory (D-140): the two lookups the browser cannot do against the database alone. Members only (verify_jwt).
//
//   { kind: 'company', q }  Organisations from Wikidata (free, worldwide, CC0): search, keep the results that describe an
//                           organisation, read each one's website and logo, store the logo once in the company-logos
//                           bucket (directory/<Qid>.<ext>), and cache the rows in public.company
//                           (brivia_cache_companies). Answers { companies: [{ id, name, domain, logo_path, industry,
//                           verified, source }] }. Next time the same company comes from the database search alone.
//   { kind: 'postal', q }   A postal code through OpenStreetMap Photon, mapped to the nearest directory city in its
//                           country (brivia_nearest_cities). Answers { places: [{ id, name, region, country, postal }] }.
//   { kind: 'places', q }   D-202: a city, town, village or district the directory does not have yet ("South Goa"),
//                           looked up in OpenStreetMap Photon and added to the directory (brivia_add_osm_places), so it
//                           is there for everyone after. Answers { places: [{ id, name, region, country, country_code }] }.
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

// D-202: the OpenStreetMap objects that are somewhere a member lives or an event happens: cities, towns, villages,
// suburbs and districts (a county-level "South Goa", a city district), never a street, a shop, a state or a country.
const SETTLEMENT = new Set(['city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood', 'municipality', 'locality',
  'borough', 'county', 'district', 'state_district', 'region', 'island']);
const isSettlement = (p: any) => {
  if (p.osm_key === 'place') return SETTLEMENT.has(String(p.osm_value));
  if (p.osm_key === 'boundary' && p.osm_value === 'administrative') return ['city', 'district', 'county', 'locality'].includes(String(p.type));
  return false;
};

const domainOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
};
const timed = (url: string, init: RequestInit = {}, ms = 6000) => fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });

// A site's square icon, stored once at <base>.<ext>; '' when none could be read. Google's icon service first (128 px),
// then DuckDuckGo's. Raster only.
// D-148 follow-up: then the "www." host, the site's own apple-touch-icon and favicon, and last the logo Wikidata lists
// for an organisation with that website (a Commons PNG), so a site with an SVG-only icon still gets a mark.
const commonsLogoFor = async (site: string) => {
  try {
    const q = `SELECT ?logo WHERE { ?o wdt:P856 ?w . FILTER(CONTAINS(LCASE(STR(?w)), "${site.replace(/[^a-z0-9.-]/g, '')}")) ?o wdt:P154 ?logo . } LIMIT 1`;
    const r = await timed(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { accept: 'application/sparql-results+json' } }, 8000);
    const file = r.ok ? (await r.json())?.results?.bindings?.[0]?.logo?.value || '' : '';
    return file ? `${file.replace(/^http:/, 'https:')}?width=128` : '';
  } catch { return ''; }
};
const storeIcon = async (admin: any, site: string, base: string) => {
  const www = site.startsWith('www.') ? site : `www.${site}`;
  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=128`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(www)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(site)}.ico`,
    `https://${www}/apple-touch-icon.png`,
    `https://${site}/apple-touch-icon.png`,
    `https://${www}/favicon.ico`,
    `https://${site}/favicon.ico`,
    'commons',
  ];
  for (let source of sources) {
    if (source === 'commons') { source = await commonsLogoFor(site); if (!source) continue; }
    try {
      const img = await timed(source, {}, 5000);
      let type = (img.headers.get('content-type') || '').split(';')[0].trim();
      const bytes = img.ok ? new Uint8Array(await img.arrayBuffer()) : new Uint8Array();
      // An .ico served as a generic file: trust it only with the icon signature (00 00 01 00).
      if (!/^image\//.test(type) && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) type = 'image/x-icon';
      if (bytes.length > 64 && bytes.length < 300_000 && /^image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(type)) {
        const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('gif') ? 'gif' : 'ico';
        const path = `${base}.${ext}`;
        const up = await admin.storage.from('company-logos').upload(path, bytes, { contentType: type, upsert: true });
        if (!up.error) return path;
      }
    } catch { /* try the next source */ }
  }
  return '';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method' });
  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'auth' });
  const admin = createClient(url, service, { auth: { persistSession: false } });
  let body: { kind?: string; q?: string; ids?: string[] } = {};
  try { body = await req.json(); } catch { body = {}; }

  // D-148: the bulk logo pass (README "## 0040"). Given up to 40 company ids, each one still without a logo gets its
  // site's square icon, fetched once per website and stored. It only fills empty logos of directory companies, never a
  // member's own organisation, so it needs no member session (the platform still requires the project's key).
  if (body.kind === 'logos') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => /^[0-9a-f-]{36}$/.test(String(x))).slice(0, 40);
    if (!ids.length) return json(200, { done: 0 });
    const { data: rows } = await admin.from('company').select('id,icon_domain,domain,logo_path,source').in('id', ids);
    const byDomain = new Map<string, string>();
    let done = 0;
    for (const r of rows || []) {
      const site = r.icon_domain || r.domain;
      if (r.logo_path || r.source === 'member' || !site) continue;
      let path = byDomain.get(site);
      if (path === undefined) { path = await storeIcon(admin, site, `directory/c-${r.id}-icon`); byDomain.set(site, path); }
      if (path) { await admin.rpc('brivia_set_company_icon', { p_id: r.id, p_path: path }); done += 1; }
    }
    return json(200, { done, seen: (rows || []).length });
  }

  const asMember = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: who, error: whoError } = await asMember.auth.getUser(token);
  if (whoError || !who?.user?.id) return json(401, { error: 'auth' });
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

  if (body.kind === 'places') {
    try {
      // Only the typed text goes to Photon. "South Goa, India" searches "South Goa" and keeps hits in India.
      const [name, ...rest] = q.split(',');
      const want = rest.join(',').trim().toLowerCase();
      const res = await timed(`https://photon.komoot.io/api/?q=${encodeURIComponent(name.trim())}&limit=12&lang=en`);
      const geo = res.ok ? await res.json() : { features: [] };
      const rows = [];
      for (const f of geo.features || []) {
        const p = f?.properties || {};
        const [lng, lat] = f?.geometry?.coordinates || [];
        const cc = String(p.countrycode || '').toUpperCase();
        if (!isSettlement(p) || typeof lat !== 'number' || typeof lng !== 'number' || !/^[A-Z]{2}$/.test(cc) || !p.name) continue;
        if (want && !`${p.country || ''} ${p.state || ''} ${cc}`.toLowerCase().includes(want)) continue;
        rows.push({ osm_ref: `${String(p.osm_type || '').toUpperCase()}${p.osm_id}`, name: String(p.name).slice(0, 120),
          region: String(p.state || '').slice(0, 120), country: String(p.country || '').slice(0, 80), country_code: cc, lat, lng,
          kind: String(p.osm_value || p.type || '').slice(0, 20) });
        if (rows.length >= 6) break;
      }
      if (!rows.length) return json(200, { places: [] });
      const { data, error } = await admin.rpc('brivia_add_osm_places', { p_rows: rows });
      return json(200, { places: error ? [] : data || [] });
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
