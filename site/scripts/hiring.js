// Hiring (D-137, spec docs/superpowers/specs/2026-11-02-hiring-design.md). Pure helpers: the role catalogue, labels,
// the client mirror of the server's text rule, who counts as a hirer or a seeker, the card bar's words, the deck lift
// and the notification row. No DOM, no storage, no network: hiring-ui.js and app.js do that.

export const FAMILIES = [
  ['software', 'Software & engineering'], ['data', 'Data & AI'], ['design', 'Design'], ['product', 'Product'],
  ['marketing', 'Marketing & growth'], ['sales', 'Sales & business development'], ['content', 'Content & media'],
  ['operations', 'Operations & support'], ['finance', 'Finance & accounts'], ['people', 'People & HR'],
  ['research', 'Research & science'], ['other', 'Other'],
];
export const familyLabel = (id) => (FAMILIES.find(([key]) => key === id) || FAMILIES[FAMILIES.length - 1])[1];

// [title, family, ...synonyms]. Titles are what both sides pick, so a seeker's "SDE" and a hirer's "Software Engineer"
// meet on one canonical title (the server compares titles case-insensitively).
const ROLES = [
  ['Software Engineer', 'software', 'SDE', 'Software Developer', 'Software Development Engineer', 'Programmer', 'Coder'],
  ['Frontend Developer', 'software', 'Front-end Developer', 'Front End Developer', 'Frontend Engineer', 'UI Developer', 'Web Developer'],
  ['Backend Developer', 'software', 'Back-end Developer', 'Back End Developer', 'Backend Engineer', 'API Developer'],
  ['Full-stack Developer', 'software', 'Full Stack Developer', 'Fullstack Developer', 'MERN Developer', 'Full-stack Engineer'],
  ['React Developer', 'software', 'React.js Developer', 'ReactJS Developer'],
  ['Mobile Developer', 'software', 'App Developer', 'Android Developer', 'iOS Developer', 'Flutter Developer', 'React Native Developer'],
  ['DevOps Engineer', 'software', 'Site Reliability Engineer', 'SRE', 'Cloud Engineer', 'Platform Engineer'],
  ['QA Engineer', 'software', 'Tester', 'Test Engineer', 'SDET', 'Quality Assurance Engineer'],
  ['Security Engineer', 'software', 'Cybersecurity Analyst', 'Security Analyst', 'Penetration Tester'],
  ['Embedded Engineer', 'software', 'Firmware Engineer', 'Embedded Systems Engineer', 'IoT Engineer'],
  ['Game Developer', 'software', 'Unity Developer', 'Game Programmer'],
  ['Blockchain Developer', 'software', 'Web3 Developer', 'Smart Contract Developer'],
  ['Engineering Manager', 'software', 'Tech Lead', 'Team Lead', 'Engineering Lead'],
  ['Data Analyst', 'data', 'Business Intelligence Analyst', 'BI Analyst', 'Analytics Analyst', 'MIS Analyst'],
  ['Data Scientist', 'data', 'Applied Scientist'],
  ['Data Engineer', 'data', 'ETL Developer', 'Big Data Engineer', 'Analytics Engineer'],
  ['Machine Learning Engineer', 'data', 'ML Engineer', 'AI Engineer', 'Deep Learning Engineer'],
  ['Generative AI Engineer', 'data', 'GenAI Engineer', 'LLM Engineer', 'Prompt Engineer', 'AI Developer'],
  ['Product Designer', 'design', 'UI/UX Designer', 'UX Designer', 'UI Designer', 'Interaction Designer'],
  ['Graphic Designer', 'design', 'Visual Designer', 'Brand Designer', 'Illustrator'],
  ['Motion Designer', 'design', 'Animator', '3D Artist', 'Motion Graphics Designer'],
  ['UX Researcher', 'design', 'User Researcher', 'Design Researcher'],
  ['Product Manager', 'product', 'PM', 'Associate Product Manager', 'APM', 'Product Owner'],
  ['Project Manager', 'product', 'Program Manager', 'Scrum Master', 'Delivery Manager'],
  ['Business Analyst', 'product', 'Product Analyst'],
  ['Marketing Executive', 'marketing', 'Marketing Associate', 'Marketer', 'Marketing Manager'],
  ['Digital Marketer', 'marketing', 'Performance Marketer', 'SEO Specialist', 'SEM Specialist', 'Growth Marketer'],
  ['Social Media Manager', 'marketing', 'Social Media Executive', 'Community Manager'],
  ['Brand Manager', 'marketing', 'Brand Strategist'],
  ['Sales Executive', 'sales', 'Sales Associate', 'Inside Sales', 'Business Development Executive', 'BDE', 'BDR', 'SDR'],
  ['Account Manager', 'sales', 'Key Account Manager', 'Client Relationship Manager'],
  ['Business Development Manager', 'sales', 'BDM', 'Partnerships Manager'],
  ['Content Writer', 'content', 'Copywriter', 'Writer', 'Technical Writer', 'Blogger'],
  ['Content Creator', 'content', 'Creator', 'YouTuber', 'Influencer'],
  ['Video Editor', 'content', 'Editor', 'Video Producer'],
  ['Photographer', 'content', 'Videographer', 'Cinematographer'],
  ['Journalist', 'content', 'Reporter', 'Editorial Assistant'],
  ['Operations Executive', 'operations', 'Operations Associate', 'Operations Manager', 'Ops Executive'],
  ['Customer Support Executive', 'operations', 'Customer Success', 'Customer Service', 'Support Engineer', 'Customer Success Manager'],
  ['Supply Chain Executive', 'operations', 'Logistics Executive', 'Procurement Executive'],
  ['Office Administrator', 'operations', 'Admin Executive', 'Executive Assistant', 'Office Manager'],
  ['Accountant', 'finance', 'Accounts Executive', 'Chartered Accountant', 'CA', 'Bookkeeper'],
  ['Financial Analyst', 'finance', 'Investment Analyst', 'Equity Research Analyst', 'FP&A Analyst'],
  ['HR Executive', 'people', 'HR Generalist', 'Human Resources Executive', 'HR Manager'],
  ['Talent Acquisition', 'people', 'Recruiter', 'Technical Recruiter', 'HR Recruiter'],
  ['Research Assistant', 'research', 'Research Associate', 'Research Intern', 'Lab Assistant'],
  ['Research Scientist', 'research', 'Scientist', 'Researcher'],
  ['Teacher', 'other', 'Tutor', 'Trainer', 'Instructor', 'Faculty'],
  ['Consultant', 'other', 'Management Consultant', 'Strategy Consultant'],
  ['Lawyer', 'other', 'Legal Associate', 'Advocate', 'Paralegal'],
];

const norm = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const tidy = (value) => String(value || '').trim().replace(/\s+/g, ' ');

const BY_NAME = new Map();
for (const [title, family, ...synonyms] of ROLES) {
  for (const name of [title, ...synonyms]) if (!BY_NAME.has(norm(name))) BY_NAME.set(norm(name), { title, family });
}
export const ROLE_TITLES = ROLES.map(([title]) => title).sort((a, b) => a.localeCompare(b));

// Words that name a family when the title is the member's own (e.g. "Senior Golang Engineer" -> software).
const FAMILY_WORDS = [
  ['data', /\b(data|analytics|machine learning|ml|ai|scientist)\b/],
  ['design', /\b(design|designer|ux|ui|illustrat|artist)\b/],
  ['product', /\b(product|project|program|scrum)\b/],
  ['marketing', /\b(marketing|marketer|seo|growth|brand|social media)\b/],
  ['sales', /\b(sales|business development|account|bd)\b/],
  ['content', /\b(content|writer|editor|video|photo|journalis|copy)\b/],
  ['finance', /\b(finance|financial|account(ant|s)|audit|tax)\b/],
  ['people', /\b(hr|human resources|recruit|talent)\b/],
  ['research', /\b(research|lab)\b/],
  ['operations', /\b(operations|ops|support|logistics|admin)\b/],
  ['software', /\b(developer|engineer|programmer|sde|devops|software|coder|qa|tester)\b/],
];

// roleFor(title): the canonical title and family for what the member picked or typed.
export const roleFor = (title) => {
  const raw = tidy(title);
  if (!raw) return null;
  const known = BY_NAME.get(norm(raw));
  if (known) return { ...known, known: true };
  const lower = norm(raw);
  const hit = FAMILY_WORDS.find(([, pattern]) => pattern.test(lower));
  return { title: raw, family: hit ? hit[0] : 'other', known: false };
};

export const LEVELS = [
  ['intern', 'Internship'], ['entry', 'Entry level'], ['mid', 'Mid level'], ['senior', 'Senior'], ['lead', 'Lead'],
];
export const LEVEL_HINT = { intern: '', entry: '0 to 2 years', mid: '2 to 5 years', senior: '5+ years', lead: '' };
export const MODES = [['onsite', 'On-site'], ['hybrid', 'Hybrid'], ['remote', 'Remote']];
export const HELP = [['hiring', "I'm hiring"], ['refer', 'I can refer']];
const label = (pairs, id) => (pairs.find(([key]) => key === id) || [null, ''])[1];
export const levelLabel = (id) => label(LEVELS, id);
export const modeLabel = (id) => label(MODES, id);
export const helpBadge = (id) => (id === 'refer' ? 'Can refer' : 'Hiring manager');

// The role's line under its title: "Mid level · Hybrid · Lumen Labs".
export const roleMeta = (role) => [levelLabel(role?.level), modeLabel(role?.work_mode), tidy(role?.company)].filter(Boolean).join(' · ');

// The client mirror of brivia_role_text_ok (0033): the same refusal, shown by the field before saving.
export const ROLE_TEXT_ERROR = 'Links and contact details go in chat, after you connect.';
export const roleTextIssue = (text) => {
  const value = String(text || '');
  if (!value.trim()) return '';
  const bad = /(https?:\/\/|www\.|[a-z0-9-]+\.(com|in|io|co|net|org|me|ly|gl|app|dev|link|xyz)(\/|\b))/i.test(value)
    || value.includes('@')
    || /\d{7,}/.test(value.replace(/[\s().+-]/g, ''))
    || /(wa\.me|t\.me|telegram|whatsapp)/i.test(value);
  return bad ? ROLE_TEXT_ERROR : '';
};

// Looking-for values (case-insensitive: members type their own spelling). "Developer" alone is not job seeking.
export const HIRER_VALUES = ['Hiring', 'Can Give Referrals'];
export const SEEKER_VALUES = ['Job Referral', 'Internship Referral', 'Job Opportunities'];
const has = (values, wanted) => {
  const set = new Set((Array.isArray(values) ? values : String(values || '').split(',')).map(norm));
  return wanted.some((value) => set.has(norm(value)));
};
export const isHirerValue = (value) => has([value], HIRER_VALUES);
export const isSeekerValue = (value) => has([value], SEEKER_VALUES);
export const lookingForRoles = (values) => ({ hirer: has(values, HIRER_VALUES), seeker: has(values, SEEKER_VALUES) });
// "Can Give Referrals" preselects "I can refer" in Add a role.
export const defaultHelp = (values) => (has(values, ['Can Give Referrals']) && !has(values, ['Hiring']) ? 'refer' : 'hiring');

// The deck card's bar: the best role when it fits, else the count. fit(text) says whether a string fits the bar.
export const cardBarLabels = (hiring) => {
  const roles = Array.isArray(hiring?.roles) ? hiring.roles : [];
  if (!roles.length) return null;
  const best = tidy(hiring.best_title || roles[0].title).toUpperCase();
  const short = roles.length === 1 ? 'HIRING' : `HIRING · ${roles.length} ROLES`;
  return { full: `HIRING · ${best}`, short, compact: 'HIRING' };
};
export const pickBarLabel = (labels, fits) => {
  if (!labels) return '';
  for (const text of [labels.full, labels.short, labels.compact]) if (fits(text)) return text;
  return labels.compact;
};

// The strip under the distance, for a seeker whose roles fit: "Frontend Developer · Hybrid" / "Fits what you're open to · Can refer".
export const stripModel = (hiring) => {
  if (!hiring?.fits) return null;
  const role = (hiring.roles || [])[0];
  if (!role) return null;
  return { title: [tidy(role.title), modeLabel(role.work_mode)].filter(Boolean).join(' · '), help: helpBadge(role.help) };
};

// The deck lift: at most one lifted card in every `every` cards (spec §7.3), lifted cards first in their slot. Ids
// already in the queue move instead of repeating; ids not in `available` are skipped.
export const interleaveLift = (queue, lifted, every = 5) => {
  const liftSet = new Set(lifted.map(String));
  const rest = queue.map(String).filter((id) => !liftSet.has(id));
  const lifts = [...new Set(lifted.map(String))];
  const out = [];
  let r = 0;
  while (lifts.length || r < rest.length) {
    if (lifts.length) out.push(lifts.shift());
    for (let k = 0; k < every - 1 && r < rest.length; k += 1) out.push(rest[r++]);
    if (r >= rest.length && lifts.length) { out.push(...lifts); break; }
  }
  return out;
};

// The notification row: once a day at most, only when a fitting hirer is new since the last row.
export const hiringRowModel = ({ suggestions = [], seen = [], lastShownDay = '', today = '' } = {}) => {
  const seenSet = new Set(seen.map(String));
  const fresh = suggestions.filter((s) => !seenSet.has(String(s.id)));
  if (!fresh.length || lastShownDay === today) return null;
  const n = suggestions.length;
  const titles = [...new Set(suggestions.map((s) => tidy(s.role_title)).filter(Boolean))];
  return {
    count: n,
    text: n === 1 ? 'Someone near you is hiring' : `${n} people near you are hiring`,
    detail: `For roles like yours${titles.length ? ` · ${titles.slice(0, 2).join(', ')}` : ''}`,
    ids: suggestions.map((s) => String(s.id)),
  };
};

// Days left on a role, and whether it is time for "Still hiring?" (3 days or fewer).
export const daysLeft = (expiresAt, now = Date.now()) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 86400000));
export const needsRenewal = (role, now = Date.now()) => role?.status !== 'closed' && daysLeft(role?.expires_at, now) <= 3;

// The ask sheet's foot line.
export const askFootLine = (signalsLeft, asksLeft) => {
  const parts = [];
  if (Number.isFinite(signalsLeft)) parts.push(`Uses 1 of your ${signalsLeft} signals left today`);
  parts.push(asksLeft === 1 ? '1 role ask left today' : `${asksLeft} role asks left today`);
  return parts.join(' · ');
};
export const ASK_MIN = 20;
export const ASK_MAX = 500;
export const ROLES_MAX = 3;

// The answer to a failed ask, by the server's code / message.
export const askErrorText = (error) => {
  const msg = String(error?.message || '');
  if (msg.includes('role_ask_cap')) return 'You can ask about 3 roles a day. Try again tomorrow.';
  if (msg.includes('role_not_taking_asks')) return 'This role isn\'t taking new asks right now.';
  if (msg.includes('signal_quota_exhausted')) return 'You\'ve used today\'s signals. They come back tomorrow.';
  if (msg.includes('signal_live_cap')) return 'You have too many requests waiting for an answer. Try again later.';
  if (error?.code === '23505' || msg.includes('already asked')) return 'You\'ve already asked about this role.';
  if (error?.code === 'P0002') return 'This role is no longer open.';
  if (msg.includes('note too short')) return `Write at least ${ASK_MIN} characters.`;
  return 'Your ask could not be sent. Please try again.';
};
