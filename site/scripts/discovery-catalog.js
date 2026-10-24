// The discovery filter catalog (D-062). Pure helpers, no DOM, no storage.
//
// Before, the "Skills & interests" and "Looking for" boxes only suggested values found on cards already loaded, so a
// member could not pick Chess or Guitar unless someone on screen had it. The suggestions now come from three sources,
// merged: the labels on loaded cards (spelled as members wrote them), this standard list, and the live taxonomy's
// selectable, non-sensitive labels (spec §3.1: levels 3-4; a sensitive interest is never offered as a filter).
// Filtering itself is unchanged: app.js matches a selected value against each card's skills / looking-for, so a
// catalog value with no match on the loaded cards honestly shows "0 people match".

// The quick-pick row shown above the box (one tap adds the filter).
export const POPULAR_INTERESTS = [
  'Chess', 'Music', 'Guitar', 'Hackathons', 'Badminton', 'Coding', 'Startups', 'Photography', 'Travel', 'Fitness',
  'Reading', 'Cricket',
];

export const INTEREST_CATALOG = [
  // Games and sport
  'Chess', 'Board games', 'Video games', 'Esports', 'Badminton', 'Cricket', 'Football', 'Basketball', 'Tennis',
  'Table tennis', 'Volleyball', 'Kabaddi', 'Running', 'Cycling', 'Swimming', 'Trekking', 'Hiking', 'Climbing', 'Yoga',
  'Fitness', 'Gym', 'Martial arts', 'Skating',
  // Music and the arts
  'Music', 'Guitar', 'Piano', 'Keyboard', 'Drums', 'Violin', 'Flute', 'Tabla', 'Singing', 'Songwriting', 'Music production',
  'DJing', 'Dance', 'Theatre', 'Stand-up comedy', 'Poetry', 'Writing', 'Blogging', 'Reading', 'Book club', 'Painting',
  'Sketching', 'Calligraphy', 'Photography', 'Filmmaking', 'Video editing', 'Graphic design', 'UI/UX design', 'Fashion',
  'Pottery', 'Crafts',
  // Building and tech
  'Hackathons', 'Coding', 'Competitive programming', 'Open source', 'Web development', 'App development', 'Startups',
  'Entrepreneurship', 'Product management', 'Robotics', 'Electronics', 'Cybersecurity', 'Blockchain', 'Cloud computing',
  'Machine learning', 'Data science', 'Python', 'SQL', 'Data Structures & Algorithms', 'Git', 'GitHub', 'REST APIs',
  'JavaScript', 'React', 'Linux', 'AWS', 'Generative AI', 'Prompt Engineering', 'LLMs', 'RAG', 'AI Agents', 'AI Automation',
  'n8n', 'Docker', 'Data Analysis', 'Power BI', 'Tableau', 'Excel',
  // Ideas, work and life
  'Public Speaking', 'Debate', 'Quizzing', 'Model UN', 'Personal finance', 'Investing', 'Stock market', 'Marketing',
  'Content creation', 'Podcasts', 'Sales', 'Negotiation', 'Project Management', 'Volunteering', 'Social impact',
  'Sustainability', 'Travel', 'Food', 'Cooking', 'Baking', 'Coffee', 'Languages', 'History', 'Philosophy', 'Psychology',
  'Astronomy', 'Science', 'Mathematics', 'Movies', 'Anime', 'Gardening', 'Pets', 'Meditation',
];

export const LOOKING_FOR_CATALOG = [
  'Hackathon Buddy', 'SIH Buddy', 'Chess Partner', 'Jam Partner', 'Band Member', 'Gym Buddy', 'Running Buddy',
  'Travelling Buddy', 'Study Partner', 'Project Partner', 'Coding Partner', 'Startup Partner', 'Co-founder', 'Teammate',
  'Mentor', 'Mentee', 'Freelancer', 'Intern', 'Research Partner', 'Open Source Contributor', 'Developer', 'Designer',
  'AI Enthusiast', 'ML Enthusiast', 'Entrepreneur', 'Photographer', 'Content Creator', 'Video Editor', 'UI/UX Designer',
  'Data Analyst', 'Business Analyst', 'Marketer', 'Public Speaker', 'Writer', 'Volunteer', 'Event Participant',
  'Networking Contact', 'Career Mentor', 'Job Referral', 'Internship Referral', 'Accountability Partner',
  'Language Exchange Partner', 'Trekking Partner', 'Sports Partner', 'Gaming Partner', 'Photography Partner',
  'Event Companion', 'Conference Companion', 'Workshop Partner', 'Competition Teammate', 'Roommate', 'Local Guide',
  'Community Member', 'Collaborator', 'Friends',
];

const normalize = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const clean = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

// The taxonomy's selectable (level 3-4), non-sensitive labels, in the given order, without duplicates.
export const taxonomyLabels = (nodes) => {
  const seen = new Set();
  const labels = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || node.sensitive || !(Number(node.level) >= 3)) continue;
    const label = clean(node.label);
    if (!label || seen.has(normalize(label))) continue;
    seen.add(normalize(label));
    labels.push(label);
  }
  return labels;
};

// One sorted list from the three sources. The first spelling wins: members, then the standard list, then the
// taxonomy (a member's own label is what the filter matches against).
export const catalogValues = ({ members = [], standard = [], taxonomy = [] } = {}) => {
  const unique = new Map();
  for (const value of [...members, ...standard, ...taxonomy]) {
    const label = clean(value);
    const key = normalize(label);
    if (key && !unique.has(key)) unique.set(key, label);
  }
  return [...unique.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

// The suggestions for a typed query: values not already selected (a Set of normalized values); with a query, the
// ones starting with it first, then the ones containing it. `limit` caps the list (default: no cap).
export const matchOptions = (values, query, selected = new Set(), limit = Infinity) => {
  const q = normalize(query);
  const open = (Array.isArray(values) ? values : []).filter((value) => !selected.has(normalize(value)));
  if (!q) return open.slice(0, limit);
  const starts = open.filter((value) => normalize(value).startsWith(q));
  const contains = open.filter((value) => !normalize(value).startsWith(q) && normalize(value).includes(q));
  return [...starts, ...contains].slice(0, limit);
};

// The Skills & interests / Looking for dropdowns (D-092; they replace the quick-pick capsules). An empty query opens
// the whole list with the popular picks on top; a typed query is one ranked list of the best 12. Selected values are
// left out (they show as chips above the field).
export const dropdownOptions = (values, query, selected = new Set(), popular = []) => {
  if (normalize(query)) return { popular: [], rest: matchOptions(values, query, selected, 12) };
  const open = matchOptions(values, '', selected);
  const byKey = new Map(open.map((value) => [normalize(value), value]));
  const top = [];
  for (const pick of popular) {
    const value = byKey.get(normalize(pick));
    if (value && !top.includes(value)) top.push(value);
  }
  const topKeys = new Set(top.map(normalize));
  return { popular: top, rest: open.filter((value) => !topKeys.has(normalize(value))) };
};
