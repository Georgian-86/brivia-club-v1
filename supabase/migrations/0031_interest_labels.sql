set lock_timeout = '5s';
-- 0031_interest_labels.sql: the interest catalogue uses the founder's exact wording (founder request 2026-11-03,
-- D-135: "put this list for all the interests"). Applied by hand in the Supabase SQL editor, as postgres, after 0017
-- (README "## 0031"). 0001-0030 are frozen. Idempotent: the local harness applies every migration twice.
--
-- The founder's A-Z list was already the catalogue (0017, D-109): 1,129 offered nodes, all active, none sensitive. But
-- 0017 reused 139 older nodes under their older labels, 65 of which differ from the founder's wording ("Machine
-- learning", "AR and VR", "Garba and dandiya", "Piano and keys", ...). This sets those labels to the founder's exact
-- wording. Ids do not change, so members who chose them keep them and ORBIT's topology is untouched; then
-- catalog_order is recomputed A-Z (case-insensitive), because a few labels move letter ("Urban Birding").
-- A label is changed only while it still reads as 0017 left it (a moderator's later relabel is kept).

update public.interest_node n set label = l.new_label
  from (values
  ('community.volunteering.animal_rescue', 'Animal rescue', 'Animal Rescue'),
  ('lifestyle.home.aquariums', 'Aquarium keeping', 'Aquarium Keeping'),
  ('tech.frontier.ar_vr', 'AR and VR', 'AR/VR'),
  ('food.cooking.barbecue', 'Barbecue and tandoor', 'Barbecue'),
  ('outdoors.nature.birdwatching.urban_birding', 'Birding in the city', 'Urban Birding'),
  ('learning.reading.book_clubs', 'Book clubs', 'Book Clubs'),
  ('community.environment.climate_action', 'Climate action', 'Climate Action'),
  ('tech.software.competitive_programming', 'Competitive programming', 'Competitive Programming'),
  ('tech.ai_data.computer_vision', 'Computer vision', 'Computer Vision'),
  ('tech.ai_data.data_engineering', 'Data engineering', 'Data Engineering'),
  ('tech.software.devops', 'DevOps and cloud', 'DevOps'),
  ('arts.visual.digital_illustration', 'Digital illustration', 'Digital Illustration'),
  ('tech.hardware.electronics', 'Electronics tinkering', 'Electronics'),
  ('tech.security.ethical_hacking', 'Ethical hacking', 'Ethical Hacking'),
  ('arts.design.fashion_design', 'Fashion design', 'Fashion Design'),
  ('arts.writing.fiction', 'Fiction writing', 'Fiction Writing'),
  ('sports.fitness.functional', 'Functional fitness', 'Functional Fitness'),
  ('tech.software.game_dev', 'Game development', 'Game Development'),
  ('stage_screen.dance.garba', 'Garba and dandiya', 'Garba'),
  ('arts.design.graphic_design', 'Graphic design', 'Graphic Design'),
  ('business.startups.growth', 'Growth marketing', 'Growth Marketing'),
  ('community.civic.heritage_conservation', 'Heritage conservation', 'Heritage Conservation'),
  ('music.listening.hip_hop', 'Hip-hop', 'Hip-Hop'),
  ('lifestyle.home.home_decor', 'Home decor', 'Home Decor'),
  ('music.listening.indie', 'Indie music', 'Indie Music'),
  ('arts.design.interior_design', 'Interior design', 'Interior Design'),
  ('games.tabletop.jigsaws', 'Jigsaw puzzles', 'Jigsaw Puzzles'),
  ('arts.crafts.knitting', 'Knitting and crochet', 'Knitting'),
  ('business.careers.leadership', 'Leading teams', 'Leadership'),
  ('stage_screen.online.live_streaming', 'Live streaming', 'Live Streaming'),
  ('tech.ai_data.machine_learning', 'Machine learning', 'Machine Learning'),
  ('learning.reading.graphic_novels', 'Manga and graphic novels', 'Graphic Novels'),
  ('food.cooking.meal_prep', 'Meal prep', 'Meal Prep'),
  ('games.video.mobile', 'Mobile gaming', 'Mobile Gaming'),
  ('sports.endurance.cycling.mountain_biking', 'Mountain biking', 'Mountain Biking'),
  ('music.making.production', 'Music production', 'Music Production'),
  ('tech.ai_data.nlp', 'Natural-language processing', 'Natural Language Processing'),
  ('tech.software.open_source', 'Open source', 'Open Source'),
  ('community.social.parenting', 'Parenting groups', 'Parenting'),
  ('games.video.pc', 'PC gaming', 'PC Gaming'),
  ('business.money.personal_finance', 'Personal finance', 'Personal Finance'),
  ('music.instruments.piano', 'Piano and keys', 'Piano'),
  ('business.startups.product_management', 'Product management', 'Product Management'),
  ('learning.humanities.policy', 'Public policy', 'Public Policy'),
  ('business.careers.public_speaking', 'Public speaking', 'Public Speaking'),
  ('tech.frontier.quantum', 'Quantum computing', 'Quantum Computing'),
  ('business.money.real_estate', 'Real estate', 'Real Estate'),
  ('games.video.retro', 'Retro gaming', 'Retro Gaming'),
  ('sports.endurance.cycling.road_cycling', 'Road cycling', 'Road Cycling'),
  ('outdoors.riding.road_trips', 'Road trips', 'Road Trips'),
  ('outdoors.water.scuba', 'Scuba diving', 'Scuba Diving'),
  ('business.marketing.social_marketing', 'Social media marketing', 'Social Media Marketing'),
  ('games.collecting.stamps', 'Stamp collecting', 'Stamp Collecting'),
  ('stage_screen.theatre.stand_up', 'Stand-up comedy', 'Stand-Up Comedy'),
  ('arts.photography.street_photography', 'Street photography', 'Street Photography'),
  ('sports.racket.table_tennis', 'Table tennis', 'Table Tennis'),
  ('lifestyle.style.tattoos', 'Tattoo art', 'Tattoo Art'),
  ('food.drinks.tea', 'Tea tasting', 'Tea Tasting'),
  ('sports.endurance.running.trail_running', 'Trail running', 'Trail Running'),
  ('community.civic.urban_planning', 'Urban planning', 'Urban Planning'),
  ('stage_screen.film.video_editing', 'Video editing', 'Video Editing'),
  ('tech.software.web_development', 'Web development', 'Web Development'),
  ('music.instruments.violin', 'Western violin', 'Violin'),
  ('arts.photography.wildlife_photography', 'Wildlife photography', 'Wildlife Photography'),
  ('stage_screen.film.world_cinema', 'World cinema', 'World Cinema')) as l(id, old_label, new_label)
 where n.id = l.id and n.label = l.old_label;

-- The pickers list the catalogue in catalog_order under letter headings: A-Z by label again.
with ordered as (
  select id, row_number() over (order by lower(label), id) as ord
    from public.interest_node where catalog_order is not null
)
update public.interest_node n set catalog_order = o.ord
  from ordered o
 where n.id = o.id and n.catalog_order is distinct from o.ord;
