// Test world v3 generator (spec: docs/superpowers/specs/2026-10-25-test-world-v3-design.md).
// Writes supabase/seed/test-members-v3.sql and scripts/seed/test-members-v3.json (the manifest the photo step reads)
// from a fixed seed, so the output is reproducible: never edit the SQL by hand, change this file and re-run it.
//   node scripts/seed/gen-test-members-v3.mjs
// photo_url is written only for members whose /media/test-members/tNNN.webp exists, so the seed never points at a
// missing file: re-run after adding photos.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PRESET_COVER_KEYS } from '../../site/scripts/preset-cover.js';
import { LOOKING_FOR_CATALOG } from '../../site/scripts/discovery-catalog.js';

const ROOT = new URL('../../', import.meta.url);
const FIRST = 61;
const COUNT = 200;

// Deterministic PRNG (mulberry32).
let state = 0xb71a2026;
const rand = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const shuffle = (list) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};

// ---- Names: first names by gender and surnames by community, weighted per city ----
const FIRST_NAMES = {
  marathi: { m: ['Aniket', 'Sagar', 'Prathamesh', 'Ninad', 'Omkar', 'Tejas', 'Shreyas', 'Akshay', 'Mandar', 'Amey', 'Kedar', 'Swapnil', 'Rohan', 'Harshad', 'Vinayak'],
    f: ['Sayali', 'Rutuja', 'Mrunal', 'Ketaki', 'Shravani', 'Apurva', 'Prajakta', 'Gauri', 'Manasi', 'Tanvi', 'Aditi', 'Rasika', 'Pooja', 'Shruti', 'Vaishnavi'] },
  north: { m: ['Aman', 'Rahul', 'Ankit', 'Saurabh', 'Vivek', 'Abhishek', 'Kartik', 'Nikhil', 'Varun', 'Mohit', 'Gaurav', 'Rishabh', 'Shubham', 'Utkarsh', 'Pranjal'],
    f: ['Neha', 'Priya', 'Shivani', 'Ritika', 'Ayushi', 'Kritika', 'Sakshi', 'Muskan', 'Anjali', 'Shreya', 'Nidhi', 'Garima', 'Tanya', 'Vasudha', 'Ishani'] },
  punjabi: { m: ['Harpreet', 'Jaskaran', 'Manveer', 'Arjun', 'Karan', 'Sahil', 'Gurnoor', 'Parth', 'Tejveer', 'Dilpreet'],
    f: ['Simranjeet', 'Harleen', 'Jasleen', 'Navneet', 'Manpreet', 'Ravneet', 'Sukhmani', 'Prabhleen', 'Gurleen', 'Avneet'] },
  kannada: { m: ['Sharath', 'Pradeep', 'Chethan', 'Darshan', 'Manjunath', 'Vinay', 'Sudeep', 'Karthik', 'Abhay', 'Nandan'],
    f: ['Spoorthi', 'Bhavana', 'Akshatha', 'Sahana', 'Divya', 'Chaitra', 'Ramya', 'Shwetha', 'Pallavi', 'Anusha'] },
  tamil: { m: ['Karthikeyan', 'Arvind', 'Senthil', 'Vignesh', 'Pranav', 'Hari', 'Surya', 'Ashwin', 'Gokul', 'Balaji'],
    f: ['Janani', 'Keerthana', 'Nivetha', 'Aishwarya', 'Divya', 'Harini', 'Swathi', 'Madhumitha', 'Lakshmi', 'Sowmya'] },
  telugu: { m: ['Sai Teja', 'Vamsi', 'Charan', 'Srikanth', 'Nikhil', 'Rakesh', 'Harsha', 'Praveen', 'Kiran', 'Manoj'],
    f: ['Sravya', 'Harika', 'Lasya', 'Tejaswini', 'Sindhu', 'Keerthi', 'Mounika', 'Bhargavi', 'Sahithi', 'Navya'] },
  malayali: { m: ['Arjun', 'Vishnu', 'Akhil', 'Gokul', 'Sreejith', 'Nithin', 'Abhijith', 'Anand'],
    f: ['Anjana', 'Aparna', 'Gayathri', 'Parvathy', 'Nimisha', 'Devika', 'Athira', 'Sreelakshmi'] },
  bengali: { m: ['Sayan', 'Arnab', 'Soumya', 'Ritwik', 'Debojyoti', 'Anirban', 'Subhajit', 'Rudra', 'Indranil', 'Kaustav'],
    f: ['Ananya', 'Moumita', 'Sreeparna', 'Debolina', 'Rituparna', 'Tiyasha', 'Payel', 'Sohini', 'Ishita', 'Trisha'] },
  gujarati: { m: ['Dhruv', 'Harsh', 'Jainam', 'Parth', 'Chirag', 'Kunj', 'Meet', 'Yash', 'Nisarg', 'Hemang'],
    f: ['Khushi', 'Riddhi', 'Hetvi', 'Krupa', 'Dhwani', 'Nirali', 'Janvi', 'Foram', 'Bansari', 'Vidhi'] },
  rajasthani: { m: ['Yuvraj', 'Devendra', 'Lokesh', 'Hemant', 'Pratap', 'Naveen', 'Tushar', 'Jitendra'],
    f: ['Kanika', 'Priyanka', 'Bhavya', 'Mansi', 'Divyanshi', 'Tanisha', 'Jhanvi', 'Komal'] },
  muslim: { m: ['Arham', 'Faizan', 'Saif', 'Ayaan', 'Rizwan', 'Danish', 'Imaad', 'Zaid', 'Tabish', 'Owais'],
    f: ['Alina', 'Sana', 'Mehreen', 'Zainab', 'Hiba', 'Rukhsar', 'Nazia', 'Iqra', 'Afreen', 'Saba'] },
  christian: { m: ['Aaron', 'Joel', 'Ryan', 'Kevin', 'Jonathan', 'Clive', 'Brandon', 'Allan'],
    f: ['Sharon', 'Rachel', 'Natasha', 'Melissa', 'Joanne', 'Clara', 'Tanya', 'Leah'] },
  parsi: { m: ['Cyrus', 'Darius', 'Jehan', 'Farhad', 'Zubin'], f: ['Shernaz', 'Delnaz', 'Freyaz', 'Anahita', 'Zenobia'] },
  expat: { m: ['Lucas', 'Mateo', 'Daniel', 'Tom', 'Kenji'], f: ['Sophie', 'Elena', 'Hannah', 'Mai', 'Clara'] },
};
const SURNAMES = {
  marathi: ['Kulkarni', 'Deshpande', 'Joshi', 'Gaikwad', 'Pawar', 'Jadhav', 'Bhosale', 'Sawant', 'Mahajan', 'Chavan', 'Karande', 'Phadke', 'Gokhale', 'Lele', 'Bapat', 'Salunkhe', 'Mane', 'Kadam', 'Wagh', 'Nimkar', 'Thorat', 'Patwardhan'],
  north: ['Sharma', 'Verma', 'Gupta', 'Agarwal', 'Srivastava', 'Mishra', 'Tiwari', 'Pandey', 'Saxena', 'Chaturvedi', 'Tripathi', 'Rastogi', 'Bhatnagar', 'Dixit', 'Awasthi', 'Kapoor', 'Malhotra', 'Khanna', 'Chopra', 'Mehra'],
  punjabi: ['Gill', 'Sandhu', 'Dhillon', 'Grewal', 'Bajwa', 'Sidhu', 'Randhawa', 'Brar', 'Ahluwalia', 'Bedi', 'Sodhi', 'Chadha'],
  kannada: ['Gowda', 'Hegde', 'Shetty', 'Rao', 'Bhat', 'Kamath', 'Prabhu', 'Acharya', 'Kulkarni', 'Murthy', 'Shenoy', 'Nayak'],
  tamil: ['Iyer', 'Iyengar', 'Subramanian', 'Krishnan', 'Raghavan', 'Venkatesan', 'Natarajan', 'Sundaram', 'Ramasamy', 'Balasubramanian', 'Chandrasekaran', 'Murugan'],
  telugu: ['Reddy', 'Naidu', 'Rao', 'Chowdary', 'Varma', 'Raju', 'Kumar', 'Yadav', 'Goud', 'Sastry'],
  malayali: ['Nair', 'Menon', 'Pillai', 'Kurup', 'Panicker', 'Nambiar', 'Warrier', 'Thomas'],
  bengali: ['Chatterjee', 'Banerjee', 'Mukherjee', 'Ghosh', 'Bose', 'Sen', 'Das', 'Dutta', 'Chakraborty', 'Bhattacharya', 'Roy', 'Sarkar', 'Ganguly', 'Majumdar'],
  gujarati: ['Patel', 'Shah', 'Mehta', 'Desai', 'Joshi', 'Trivedi', 'Parikh', 'Modi', 'Vora', 'Bhatt', 'Thakkar', 'Panchal'],
  rajasthani: ['Rathore', 'Shekhawat', 'Choudhary', 'Meena', 'Jain', 'Agarwal', 'Bhati', 'Singhvi', 'Mathur', 'Purohit'],
  muslim: ['Khan', 'Shaikh', 'Ansari', 'Siddiqui', 'Qureshi', 'Mirza', 'Hussain', 'Syed', 'Pathan', 'Rizvi', 'Naqvi', 'Farooqui'],
  christian: ['D\'Souza', 'Fernandes', 'Pereira', 'Rodrigues', 'D\'Costa', 'Pinto', 'Lobo', 'Mathew', 'George', 'Varghese'],
  parsi: ['Irani', 'Mistry', 'Wadia', 'Batliwala', 'Contractor', 'Daruwala', 'Engineer'],
  expat: ['Moreau', 'García', 'Becker', 'Walsh', 'Tanaka', 'Nguyen', 'Rossi', 'Schmidt', 'Okafor', 'Lindqvist'],
};

// ---- Cities: count, state, community weights and four interest "scenes" ----
const CITIES = [
  { city: 'Bengaluru', state: 'Karnataka', count: 30,
    mix: { kannada: 5, tamil: 2, telugu: 2, malayali: 2, north: 3, marathi: 1, bengali: 1, muslim: 1, christian: 1, expat: 1 },
    scenes: [
      ['tech.ai_data.generative_ai', 'tech.ai_data.machine_learning', 'business.startups.side_projects', 'tech.software.open_source', 'food.drinks.coffee.pour_over'],
      ['outdoors.climbing.bouldering.indoor_bouldering', 'sports.endurance.running.trail_running', 'outdoors.trekking.day_hikes', 'sports.endurance.cycling.road_cycling'],
      ['music.listening.indie', 'music.listening.live_gigs', 'stage_screen.theatre.open_mics', 'music.making.songwriting', 'food.drinks.craft_beer'],
      ['community.environment.lake_restoration', 'outdoors.nature.birdwatching.urban_birding', 'food.growing.terrace_gardening', 'community.environment.low_waste'],
    ] },
  { city: 'Mumbai', state: 'Maharashtra', count: 26,
    mix: { marathi: 5, gujarati: 3, north: 2, muslim: 2, christian: 2, parsi: 1, punjabi: 1, tamil: 1, bengali: 1 },
    scenes: [
      ['stage_screen.film.filmmaking', 'stage_screen.film.world_cinema', 'arts.writing.screenwriting', 'stage_screen.theatre.acting', 'stage_screen.film.video_editing'],
      ['sports.endurance.running.marathon', 'sports.fitness.functional', 'outdoors.trekking.monsoon_treks', 'sports.endurance.swimming.open_water'],
      ['food.eating_out.street_food', 'food.eating_out.cafe_hopping', 'arts.photography.street_photography', 'community.civic.heritage_conservation'],
      ['business.money.stock_investing', 'business.money.index_funds', 'business.startups.founding', 'business.careers.public_speaking'],
    ] },
  { city: 'Thane', state: 'Maharashtra', count: 22,
    mix: { marathi: 7, gujarati: 2, north: 2, muslim: 1, christian: 1, tamil: 1, kannada: 1 },
    scenes: [
      ['sports.team.cricket.box_cricket', 'sports.fandom.following_cricket', 'sports.racket.badminton.doubles', 'sports.fitness.gym'],
      ['outdoors.trekking.monsoon_treks', 'outdoors.nature.birdwatching', 'arts.photography.wildlife_photography', 'outdoors.trekking.camping'],
      ['music.indian_classical.tabla', 'music.instruments.harmonium', 'music.singing.film_songs', 'music.indian_classical.hindustani_vocal'],
      ['tech.software.web_development.frontend', 'tech.software.mobile_apps', 'tech.hardware.microcontrollers', 'games.video.console'],
    ] },
  { city: 'Pune', state: 'Maharashtra', count: 22,
    mix: { marathi: 7, north: 2, gujarati: 1, punjabi: 1, malayali: 1, bengali: 1, telugu: 1, muslim: 1 },
    scenes: [
      ['outdoors.trekking.day_hikes', 'outdoors.riding.motorcycle_touring', 'outdoors.trekking.camping', 'lifestyle.travel.weekend_getaways'],
      ['tech.software.backend', 'tech.software.devops', 'tech.ai_data.data_engineering', 'games.board.chess.blitz'],
      ['learning.reading.book_clubs', 'learning.reading.literary_fiction', 'learning.discussion.discussion_circles', 'arts.writing.journaling'],
      ['food.drinks.coffee.home_espresso', 'food.cooking.baking', 'lifestyle.home.indoor_plants', 'arts.crafts.pottery.wheel_throwing'],
    ] },
  { city: 'Delhi', state: 'Delhi', count: 18,
    mix: { north: 5, punjabi: 4, muslim: 2, bengali: 1, christian: 1, rajasthani: 1, malayali: 1 },
    scenes: [
      ['learning.humanities.history.indian_history', 'lifestyle.travel.heritage_sites', 'community.civic.heritage_conservation', 'arts.photography.street_photography'],
      ['learning.discussion.debating', 'learning.humanities.policy', 'learning.discussion.model_un', 'learning.study.exam_prep'],
      ['arts.writing.poetry', 'arts.writing.poetry.urdu_shayari', 'learning.reading.poetry_reading', 'stage_screen.theatre.storytelling'],
      ['sports.racket.badminton', 'sports.endurance.running', 'sports.fitness.gym', 'food.eating_out.cafe_hopping'],
    ] },
  { city: 'Hyderabad', state: 'Telangana', count: 18,
    mix: { telugu: 6, muslim: 3, north: 2, tamil: 1, kannada: 1, marathi: 1, bengali: 1, christian: 1 },
    scenes: [
      ['tech.ai_data.data_analysis', 'tech.ai_data.nlp', 'tech.software.competitive_programming', 'learning.study.study_groups'],
      ['sports.team.cricket', 'sports.racket.badminton', 'sports.fandom.fantasy_sports', 'sports.racket.table_tennis'],
      ['food.eating_out.street_food', 'lifestyle.travel.culinary_travel', 'food.cooking.regional_indian', 'lifestyle.travel.heritage_sites'],
      ['games.video.esports', 'games.video.pc', 'stage_screen.online.live_streaming', 'learning.reading.graphic_novels'],
    ] },
  { city: 'Chennai', state: 'Tamil Nadu', count: 14,
    mix: { tamil: 7, malayali: 1, telugu: 1, north: 1, christian: 1, muslim: 1 },
    scenes: [
      ['music.indian_classical.carnatic_vocal', 'music.indian_classical.mridangam', 'stage_screen.dance.bharatanatyam', 'music.indian_classical.veena'],
      ['games.board.chess', 'games.board.chess.chess_problems', 'learning.study.quizzing', 'learning.science.maths'],
      ['community.environment.beach_cleanups', 'outdoors.water.surfing', 'sports.endurance.swimming', 'community.environment.climate_action'],
      ['stage_screen.film.film_clubs', 'stage_screen.film.documentaries', 'arts.writing.essays', 'food.drinks.coffee'],
    ] },
  { city: 'Navi Mumbai', state: 'Maharashtra', count: 10,
    mix: { marathi: 4, malayali: 1, north: 1, tamil: 1, christian: 1, gujarati: 1 },
    scenes: [
      ['sports.endurance.cycling', 'outdoors.nature.birdwatching', 'community.environment.tree_planting', 'sports.endurance.walking'],
      ['tech.software.web_development', 'tech.ai_data.data_analysis', 'business.careers.freelancing', 'arts.design.ux_design'],
      ['community.social.pet_parents.dog_walks', 'community.volunteering.animal_rescue', 'lifestyle.home.aquariums', 'food.cooking.home_cooking'],
      ['sports.team.football.five_a_side', 'games.video.mobile', 'music.listening.hip_hop', 'stage_screen.dance.hip_hop_dance'],
    ] },
  { city: 'Gurugram', state: 'Haryana', count: 10,
    mix: { north: 4, punjabi: 3, rajasthani: 1, bengali: 1, expat: 1 },
    scenes: [
      ['business.startups.product_management', 'business.startups.growth', 'business.careers.leadership', 'business.startups.fundraising'],
      ['sports.racket.padel', 'sports.precision.golf', 'sports.fitness.hiit', 'wellbeing.yoga.flow_yoga'],
      ['music.making.djing', 'music.listening.electronic', 'food.drinks.mixology', 'stage_screen.dance.salsa'],
      ['lifestyle.travel.international', 'lifestyle.travel.solo_travel', 'arts.photography.phone_photography', 'food.eating_out.fine_dining'],
    ] },
  { city: 'Kolkata', state: 'West Bengal', count: 10,
    mix: { bengali: 7, north: 1, muslim: 1, christian: 1 },
    scenes: [
      ['learning.reading.indian_languages', 'learning.languages.bengali', 'arts.writing.fiction', 'learning.reading.book_clubs'],
      ['sports.fandom.following_football', 'sports.team.football', 'games.board.carrom', 'games.tabletop.trivia_nights'],
      ['stage_screen.film.world_cinema', 'stage_screen.theatre.street_theatre', 'music.singing.choir', 'arts.visual.sketching'],
      ['food.cooking.mithai', 'food.eating_out.street_food', 'food.drinks.tea', 'lifestyle.travel.heritage_sites'],
    ] },
  { city: 'Noida', state: 'Uttar Pradesh', count: 8,
    mix: { north: 5, punjabi: 1, bengali: 1, muslim: 1 },
    scenes: [
      ['tech.software.web_development', 'tech.software.game_dev', 'tech.frontier.ar_vr', 'games.video.pc'],
      ['learning.study.exam_prep', 'learning.study.study_abroad', 'learning.languages.french', 'learning.study.study_groups'],
      ['sports.fitness.calisthenics', 'sports.combat.boxing', 'sports.fitness.powerlifting', 'wellbeing.health.nutrition'],
      ['stage_screen.theatre.stand_up', 'stage_screen.online.podcasting', 'music.singing.karaoke', 'games.tabletop.escape_rooms'],
    ] },
  { city: 'Ahmedabad', state: 'Gujarat', count: 6,
    mix: { gujarati: 5, rajasthani: 1 },
    scenes: [
      ['stage_screen.dance.garba', 'music.singing.film_songs', 'food.eating_out.street_food', 'arts.crafts.block_printing'],
      ['business.startups.bootstrapping', 'business.marketing.social_marketing', 'business.money.real_estate', 'business.marketing.branding'],
      ['arts.design.interior_design', 'lifestyle.style.handloom', 'community.civic.urban_planning', 'arts.visual.sketching'],
      ['sports.team.cricket.tennis_ball_cricket', 'sports.endurance.cycling', 'sports.racket.pickleball', 'games.board.rummy'],
    ] },
  { city: 'Jaipur', state: 'Rajasthan', count: 6,
    mix: { rajasthani: 4, north: 1, muslim: 1 },
    scenes: [
      ['arts.crafts.block_printing', 'lifestyle.style.handloom', 'arts.crafts.jewellery', 'arts.visual.calligraphy'],
      ['lifestyle.travel.heritage_sites', 'outdoors.nature.wildlife_safaris', 'arts.photography.portraits', 'lifestyle.travel.slow_travel'],
      ['sports.precision.shooting', 'sports.equestrian' , 'sports.precision.archery', 'sports.fitness.gym'],
      ['music.instruments.guitar.fingerstyle', 'music.instruments.ukulele', 'food.drinks.tea', 'learning.reading.non_fiction'],
    ] },
];

const EXPERIENCE = ['Student / just starting', '1–3 years', '3–7 years', '7–12 years', '12+ years'];
const MODES = ['play', 'play', 'learn', 'learn', 'build', 'teach'];

const taxonomy = new Set(readFileSync(new URL('scripts/seed/interest-ids.txt', ROOT), 'utf8').split('\n').filter(Boolean));
for (const c of CITIES) c.scenes = c.scenes.map((scene) => scene.filter((id) => taxonomy.has(id)));
const ALL = [...taxonomy];

const weighted = (mix) => {
  const bag = Object.entries(mix).flatMap(([k, w]) => Array(w).fill(k));
  return pick(bag);
};
// The v2 seed's names, so no v3 member repeats one.
const v2Names = new Set([...readFileSync(new URL('supabase/seed/test-members.sql', ROOT), 'utf8').matchAll(/\(\d+, '((?:[^']|'')+)', '(?:Male|Female|Prefer not to say)'/g)].map((m) => m[1].replace(/''/g, "'")));

// 20 points over k interests, descending, each >= 2.
const splitPoints = (k) => {
  for (;;) {
    const raw = Array.from({ length: k }, () => 0.4 + rand());
    const sum = raw.reduce((a, b) => a + b, 0);
    const pts = raw.map((r) => Math.max(2, Math.round((r / sum) * 20))).sort((a, b) => b - a);
    pts[0] += 20 - pts.reduce((a, b) => a + b, 0);
    if (pts[0] >= pts[1] && pts.every((p) => p >= 2)) return pts;
  }
};

const members = [];
const used = new Set(v2Names);
let n = FIRST;
for (const c of CITIES) {
  for (let i = 0; i < c.count; i += 1, n += 1) {
    const community = weighted(c.mix);
    const g = rand();
    const gender = g < 0.49 ? 'Male' : g < 0.97 ? 'Female' : 'Prefer not to say';
    const pool = FIRST_NAMES[community][gender === 'Female' ? 'f' : gender === 'Male' ? 'm' : (rand() < 0.5 ? 'f' : 'm')];
    let name;
    do { name = `${pick(pool)} ${pick(SURNAMES[community])}`; } while (used.has(name));
    used.add(name);
    // Interests: the scene's two core interests (so every pair in a scene shares at least two), maybe one more from
    // the scene, and 0-2 from anywhere. Smaller cities use fewer scenes, so no scene has a lone member.
    const sceneCount = c.count >= 18 ? 4 : c.count >= 10 ? 3 : 2;
    const scene = c.scenes[i % sceneCount];
    const fromScene = [scene[0], scene[1], ...(rand() < 0.6 ? [pick(scene.slice(2))] : [])];
    const extra = [];
    const extraCount = Math.floor(rand() * 3);
    while (extra.length < extraCount) {
      const id = rand() < 0.5 ? pick(pick(c.scenes)) : pick(ALL);
      if (!fromScene.includes(id) && !extra.includes(id) && ![...fromScene, ...extra].some((x) => x.startsWith(`${id}.`) || id.startsWith(`${x}.`))) extra.push(id);
    }
    const ids = shuffle([...fromScene, ...extra].slice(0, 5));
    const pts = splitPoints(ids.length);
    const interests = ids.map((id, k) => ({ id, points: pts[k], mode: pick(MODES) }));
    const looking = shuffle(LOOKING_FOR_CATALOG).slice(0, 1 + Math.floor(rand() * 3));
    // Home offset within ~6 km: units of 0.005 degrees (about 0.55 km), up to +-8 per axis, never exactly on the centroid.
    const dy = Math.round((rand() * 16 - 8) * 10) / 10 || 0.4;
    const dx = Math.round((rand() * 16 - 8) * 10) / 10 || -0.4;
    const tag = `t${String(n).padStart(3, '0')}`;
    members.push({
      n, tag, name, gender, city: c.city, state: c.state, community,
      experience: pick(EXPERIENCE), interests, looking_for: looking, dy, dx,
      cover: pick(PRESET_COVER_KEYS), joined_days_ago: 1 + Math.floor(rand() * 45),
      photo: existsSync(new URL(`site/media/test-members/${tag}.webp`, ROOT)) ? `/media/test-members/${tag}.webp` : null,
    });
  }
}
if (members.length !== COUNT) throw new Error(`expected ${COUNT} members, got ${members.length}`);

// ---- SQL ----
const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (list) => `'{${list.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(',')}}'`;
const rows = members.map((m) => `  (${m.n}, ${q(m.name)}, ${q(m.gender)}, ${q(m.city)}, ${q(m.state)}, ${q(m.experience)}, ${q(m.interests.map((x) => `${x.id}:${x.points}:${x.mode}`).join(','))}, ${arr(m.looking_for)}, ${m.dy}, ${m.dx}, ${q(m.cover)}, ${q(m.photo)}, ${m.joined_days_ago})`).join(',\n');
const withPhoto = members.filter((m) => m.photo).length;

const sql = `-- test-members-v3.sql: the test world, v3 (2026-10-25): 200 more test members, t061-t260, with faceless photos.
-- GENERATED by scripts/seed/gen-test-members-v3.mjs (fixed seed). Do not edit by hand: change the generator, re-run it.
-- Spec: docs/superpowers/specs/2026-10-25-test-world-v3-design.md. Steps: supabase/seed/README.md, "Seed v3".
--
-- RUN IN THE SUPABASE SQL EDITOR AS postgres, after test-members.sql (v2) and migration 0015. Not via service_role,
-- the REST API or a client: only the table owner can set is_test; the check at the end aborts and rolls back otherwise.
-- One transaction, idempotent (fixed ids, "on conflict do nothing" / "not exists"): a re-run changes nothing.
--   * 200 auth.users rows (random unusable password; nobody can log in) and 200 is_test profiles: Bengaluru 30,
--     Mumbai 26, Thane 22, Pune 22, Delhi 18, Hyderabad 18, Chennai 14, Navi Mumbai 10, Gurugram 10, Kolkata 10,
--     Noida 8, Ahmedabad 6, Jaipur 6.
--   * 2-5 non-sensitive interests each, points summing to 20; members of a city "scene" share 2-3 interests.
--   * A home cell within about 6 km of the city centre (no coordinate stored), a preset cover, and a faceless photo
--     shipped with the site (/media/test-members/tNNN.webp, allowed for test members only by 0015). ${withPhoto} of 200 have a photo.
-- Removed, with everything else in the test world, by purge-test-members.sql.

begin;
set local search_path = public, extensions;

create temp table _v3 (
  n int primary key, name text, gender text, city text, state text, experience text, interests text, looking_for text[],
  dy numeric, dx numeric, cover text, photo text, joined_days_ago int
) on commit drop;
insert into _v3 (n, name, gender, city, state, experience, interests, looking_for, dy, dx, cover, photo, joined_days_ago) values
${rows};

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000',
       ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated',
       't' || lpad(n::text, 3, '0') || '@test.brivia.club',
       crypt(gen_random_uuid()::text, gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"is_test":true}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''
from _v3
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
join _v3 v on u.id = ('a7e57000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid
where not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into public.profiles (id, name, full_name, email, gender, city, state, experience, skills, looking_for, cover_url, photo_url, is_test, created_at)
select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name, name, 't' || lpad(n::text, 3, '0') || '@test.brivia.club', gender, city, state, experience,
       '{}', looking_for, '/Images/Cover%20images/' || cover, photo, true,
       now() - make_interval(days => joined_days_ago, hours => n % 24)
from _v3
on conflict (id) do nothing;
update public.profiles set adult_declared_at = now()
 where is_test and adult_declared_at is null
   and id in (select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from _v3);
-- A photo added after a first run: fill it in (only where none is set, so an edit made in the app is kept).
update public.profiles p set photo_url = v.photo
  from _v3 v
 where p.id = ('a7e57000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid and p.is_test and p.photo_url is null and v.photo is not null;

insert into public.member_interest (member_id, interest_id, points, mode)
select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid,
       split_part(i.item, ':', 1), split_part(i.item, ':', 2)::smallint, split_part(i.item, ':', 3)
from _v3 m
cross join lateral unnest(string_to_array(m.interests, ',')) as i(item)
where not exists (select 1 from public.member_interest x
                   where x.member_id = ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid)
on conflict do nothing;

update public.profiles p
   set skills = coalesce((select array_agg(nd.label order by mi.points desc, nd.label asc)
                            from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                           where mi.member_id = p.id and not nd.sensitive), '{}')
 where p.id in (select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from _v3);

insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
select c.id, 'grid1', c.cell, public.brivia_grid_parent(c.cell, 6), public.brivia_grid_parent(c.cell, 5),
       public.brivia_nearest_place(c.cell), 'cell'
from (
  select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid as id,
         public.brivia_grid_cell(pl.lat + m.dy * 0.005, pl.lng + m.dx * 0.005, 7) as cell
  from _v3 m
  join public.place pl on pl.name = m.city and pl.country = 'India'
) c
on conflict (member_id) do nothing;

do $$
begin
  if (select count(*) from public.profiles p join _v3 v on p.id = ('a7e57000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid
       where p.is_test) <> 200 then
    raise exception 'seed v3 aborted: is_test was not stored. Run this script in the Supabase SQL editor as postgres (not service_role), after migration 0015.';
  end if;
  if exists (select 1 from _v3 v
              where not public.brivia_member_completed(('a7e57000-0000-4000-8000-' || lpad(v.n::text, 12, '0'))::uuid)) then
    raise exception 'seed v3 aborted: a v3 member is not completed (interests or cell). Apply migrations 0001-0015 first.';
  end if;
end $$;

commit;

select (select count(*) from public.profiles where is_test) as test_members,
       (select count(*) from public.profiles where is_test and email ~ '^t[0-9]{3}@test\\.brivia\\.club$') as v3_members,
       (select count(*) from public.profiles where is_test and photo_url like '/media/test-members/%') as v3_with_photo;
`;
writeFileSync(new URL('supabase/seed/test-members-v3.sql', ROOT), sql);
writeFileSync(new URL('scripts/seed/test-members-v3.json', ROOT), `${JSON.stringify(members.map(({ n, tag, name, gender, city, interests }) => ({ n, tag, name, gender, city, top: interests[0].id, interests: interests.map((x) => x.id) })), null, 1)}\n`);
console.log(`wrote 200 members (${withPhoto} with a photo)`);
