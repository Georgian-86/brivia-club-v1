// Company / organisation on profiles (D-140, migration 0036). Pure helpers for the card line and the picker; the one
// browser-only helper (logoFileToWebp) is at the end. The line is deliberately quiet: a 14 px logo and one line of the
// card's own small type, in place of the experience line, so a card never grows.

export const TITLE_MAX = 60;
export const COMPANY_NAME_MAX = 80;
export const INDUSTRIES = Object.freeze([
  'Technology and software', 'Artificial intelligence', 'Finance and banking', 'Consulting', 'E-commerce',
  'Food and hospitality', 'Healthcare', 'Education', 'Automotive', 'Media and entertainment', 'Fashion and luxury',
  'Startups and venture capital', 'Manufacturing', 'Government and public sector', 'Non-profit', 'Other',
]);

export const cleanTitle = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
export const cleanCompanyName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, COMPANY_NAME_MAX);

// "https://www.Swiggy.com/about" -> "swiggy.com"; '' when it is not a website.
export const domainOf = (v) => {
  const d = String(v ?? '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/[/?#:].*$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) && d.length <= 120 ? d : '';
};

// member_work row -> { title, company, logoPath, verified } (empty strings when unset).
export const normalizeWork = (row = {}) => ({
  title: cleanTitle(row.job_title),
  company: cleanCompanyName(row.company_name),
  companyId: row.company_id ? String(row.company_id) : '',
  logoPath: String(row.logo_path || ''),
  verified: Boolean(row.verified),
});

// "Software Engineer at Google" · "Google" · "Software Engineer" · ''.
export const workLine = (work = {}) => {
  const title = cleanTitle(work.title);
  const company = cleanCompanyName(work.company);
  if (title && company) return `${title} at ${company}`;
  return title || company;
};

// The default mark when a company has no logo: a small building outline (inline SVG, currentColor).
export const ORG_ICON = '<svg class="work-logo work-logo--default" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 14V3.5L9 2v12M9 6h4v8M5 5.5h2M5 8h2M5 10.5h2M11 8.5h0M11 11h0M2 14h12"/></svg>';

// D-148: a company whose site gives no icon still gets a mark: its initials on a small tile ("State Bank of India
// (SBI)" -> "SB", "Zudio" -> "Z"). Words like "of", "and", "&" and anything in brackets are skipped.
export const companyInitials = (name) => {
  const words = cleanCompanyName(name).replace(/\([^)]*\)/g, ' ').split(/[\s/&+,.-]+/)
    .filter((w) => w && !/^(of|and|the|for|in|at|de|la|le|des|du|&)$/i.test(w) && /[\p{L}\p{N}]/u.test(w));
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '').slice(0, 1)).toUpperCase();
};
export const monogramMarkup = (name, escapeHtml = (s) => String(s)) => {
  const ini = companyInitials(name);
  return ini ? `<span class="work-logo work-logo--mono" aria-hidden="true">${escapeHtml(ini)}</span>` : ORG_ICON;
};

// The card line: [logo] Title at Company. escapeHtml is the page's; logoUrl the public URL (or '' for the default mark).
export const workMarkup = (work, { logoUrl = '', escapeHtml = (s) => String(s) } = {}) => {
  const line = workLine(work);
  if (!line) return '';
  const logo = work.company
    ? (logoUrl ? `<img class="work-logo" src="${escapeHtml(logoUrl)}" alt="" width="14" height="14" loading="lazy" decoding="async" />` : monogramMarkup(work.company, escapeHtml))
    : '';
  return `<span class="work-line" title="${escapeHtml(line)}">${logo}<span class="work-text">${escapeHtml(line)}</span></span>`;
};

// Merge the database search with the directory's answer: one row per company, database order first.
// The same company from both keeps the database's place and takes the directory's logo and website when it has them.
export const mergeCompanies = (local = [], remote = [], limit = 8) => {
  const byId = new Map(remote.filter((c) => c?.id).map((c) => [c.id, c]));
  const seen = new Set();
  const out = [];
  for (const c of [...local, ...remote]) {
    if (!c?.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const r = byId.get(c.id);
    out.push(r && r !== c ? { ...c, logo_path: c.logo_path || r.logo_path, domain: c.domain || r.domain } : c);
    if (out.length >= limit) break;
  }
  return out;
};

// Browser only: a picked logo to a 128 px square WebP (contained, transparent edges), under 300 KB.
export const logoFileToWebp = async (file, { size = 128 } = {}) => {
  if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('Choose a PNG, JPEG, WebP or GIF image.');
  if (file.size > 8 * 1024 * 1024) throw new Error('That image is too large. Choose one under 8 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const scale = Math.min(size / bitmap.width, size / bitmap.height);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  ctx.drawImage(bitmap, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
  if (!blob || blob.size > 300000) throw new Error("That logo couldn't be prepared. Try another image.");
  return blob;
};
