-- test-members.sql: the test world, v2 (Phase D, Task 2): 60 clearly marked test members (Ruling P7) with posts,
-- matches and chats, for founder/QA demos before launch and to exercise the ORBIT roles end to end.
--
-- RUN THIS IN THE SUPABASE SQL EDITOR AS postgres. NOT via the service_role key, the REST API or any
-- client: only a session whose current_user AND session_user own public.profiles may set is_test
-- (0003, brivia_guard_is_test). Any other session silently stores is_test = false, and the check at the
-- end of this script then aborts (and rolls back) the whole seed.
-- This is the LIVE project when you run it in the dashboard. Apply migrations 0001-0006 and 0008 first (0008 lets
-- a test member's post show a preset illustration).
--
-- What it creates (all in one transaction, idempotent: ids are fixed, every insert is "on conflict do nothing" or
-- guarded by "not exists", so a re-run changes nothing):
--   * 60 auth.users rows (minimal columns, Ruling I2), emails tNN@test.brivia.club, random unusable password;
--     nobody can log in as them unless you reset a password in the Auth dashboard.
--   * 60 profiles, is_test = true: Mumbai 12, Thane 10, Pune 10, Bengaluru 14, Delhi 14. t01-t24 are v1, unchanged
--     (6 each in Bengaluru, Mumbai, Delhi, Pune); t25-t60 are new. Avatars are monograms (no photo); new members get
--     a preset cover illustration.
--     - 2-5 non-sensitive interests each (member_interest) and, for 3 members per city, one private (sensitive)
--       interest with its consent: profiles.sensitive_consent_at and one 'sensitive_give' consent_event, as
--       set_sensitive_consent writes them. Points sum to exactly 20 (the Passion Budget); modes cover all four
--       (learn, play, teach, build) in every city. profiles.skills is the display copy of the non-sensitive labels,
--       built the way set_member_interests builds it;
--     - a home cell (member_orbit) snapped with brivia_grid_cell from the city centroid in public.place plus a small
--       per-member offset (under 2 km), and the nearest place, with precision 'cell' (D-038, R2). No coordinate is
--       stored. No location_change row is written;
--     - looking_for taken from the onboarding chip list.
--   * ORBIT roles per city (the "first member" F is the city's first v2 member: t25 Bengaluru, t33 Mumbai,
--     t39 Thane, t49 Pune, t53 Delhi). 3 close neighbours (within 3 km, 2+ shared interests, overlap > 0.5, so
--     they lead F's deck every day); 2 members with weak overlap (1 shared interest, <= 0.25); 1 far-but-strong
--     match in another city (3 shared rare interests, > 350 km: it clears ORBIT's Worth-the-Distance gate and is
--     never in the interim deck, only in search); 2 flagged members (member_flag 'suspended_pending_review':
--     complete but invisible); 1 block (F blocks a strong match). Table: supabase/seed/README.md.
--   * connection_requests inserted the way members do: each match as two requests (1-2, 43-44, 13-14; the existing
--     trigger accepts both and creates the match; no direct insert into matches), plus 5 pending requests:
--     3->1, 4->1, 9->10, 5->8 (v1) and 1->40 (t01 in both directions). Run as the owner, auth.uid() is null, so the
--     cap trigger steps aside and RLS is bypassed; the AFTER INSERT consent trigger still runs, so the result obeys
--     the mutual-consent rule.
--   * 15 short messages, only between the 3 matched pairs (5, 6 and 4). No notification rows: the app derives
--     notifications from these requests, matches and messages.
--   * 30 community posts by unflagged members of all five cities. image_url is a preset illustration identifier
--     (/Images/Cover%20images/<file>, the app's preset set) with an empty image_path: nothing is uploaded.
-- Run the column check in seed/README.md first: this script was verified only against a local stub.
-- Requests expire after 30 days (Ruling I8): purge and re-seed to refresh.
-- Test members and real members never see each other (Ruling P14). Remove everything with purge-test-members.sql.

begin;
set local search_path = public, extensions;  -- pgcrypto: crypt/gen_salt live in "extensions" on Supabase

create temp table _seed_members (
  n int primary key, name text, gender text, city text, state text, experience text, interests text, looking_for text[],
  dy numeric, dx numeric, cover text
) on commit drop;
-- interests: 'interest_id:points[:mode],...' (active level-3/4 nodes, points summing to 20; mode defaults to play).
-- dy/dx: the home-cell offset from the city centroid in units of 0.005 degrees (v1 rows: computed below, as in v1).
-- v1 (t01-t24), unchanged:
insert into _seed_members (n, name, gender, city, state, experience, interests, looking_for) values
  (1, 'Aarav Nair', 'Male', 'Bengaluru', 'Karnataka', '7–12 years', 'tech.ai_data.data_analysis:8,tech.software.backend:5,games.board.chess:4,food.drinks.coffee:3', '{"Networking Contact","Job Referral"}'),
  (2, 'Diya Menon', 'Female', 'Bengaluru', 'Karnataka', '1–3 years', 'tech.software.web_development.frontend:8,sports.racket.badminton:6,stage_screen.theatre.open_mics:3,food.eating_out.cafe_hopping:3', '{"Sports Partner","Event Companion"}'),
  (3, 'Kabir Shetty', 'Male', 'Bengaluru', 'Karnataka', '12+ years', 'tech.ai_data.generative_ai:9,outdoors.trekking.himalayan_treks:6,lifestyle.travel.solo_travel:5', '{"Travel Companion","Trekking Partner"}'),
  (4, 'Ishita Rao', 'Female', 'Bengaluru', 'Karnataka', '3–7 years', 'arts.photography.street_photography:8,learning.languages.french:5,business.careers.mentoring:4,lifestyle.travel.heritage_sites:3', '{"Mentee","Internship Referral"}'),
  (5, 'Rohan Gowda', 'Male', 'Bengaluru', 'Karnataka', 'Student / just starting', 'business.startups.founding:8,business.startups.product_management:6,business.marketing.selling:3,sports.team.cricket.box_cricket:3', '{"Co-founder","Startup Partner"}'),
  (6, 'Sana Iyer', 'Female', 'Bengaluru', 'Karnataka', '7–12 years', 'tech.software.devops:7,arts.photography.wildlife_photography:6,outdoors.nature.birdwatching:4,stage_screen.online.short_video:3', '{"Photography Partner","Content Creator"}'),
  (7, 'Vihaan Deshmukh', 'Prefer not to say', 'Mumbai', 'Maharashtra', '1–3 years', 'tech.ai_data.data_analysis:7,tech.ai_data.machine_learning:5,learning.science.neuroscience:5,games.board.modern_board_games:3', '{"Research Partner","AI Enthusiast"}'),
  (8, 'Anaya Kapoor', 'Female', 'Mumbai', 'Maharashtra', '12+ years', 'business.careers.public_speaking:8,business.marketing.branding:5,learning.study.study_groups:4,learning.reading.book_clubs:3', '{"Study Partner","Project Partner"}'),
  (9, 'Arjun Mehta', 'Male', 'Mumbai', 'Maharashtra', '3–7 years', 'lifestyle.travel.weekend_getaways:7,learning.languages.japanese:5,outdoors.trekking.monsoon_treks:5,food.eating_out.street_food:3', '{"Language Exchange Partner","Local Guide"}'),
  (10, 'Meera Joshi', 'Female', 'Mumbai', 'Maharashtra', 'Student / just starting', 'tech.software.competitive_programming:8,tech.software.open_source:6,business.careers.mentoring:3,music.instruments.guitar:3', '{"Mentor","Career Mentor"}'),
  (11, 'Zayn Qureshi', 'Male', 'Mumbai', 'Maharashtra', '7–12 years', 'tech.ai_data.generative_ai:8,tech.software.open_source:5,tech.software.backend:4,games.video.esports:3', '{"Open Source Contributor","Collaborator"}'),
  (12, 'Tara Fernandes', 'Female', 'Mumbai', 'Maharashtra', '1–3 years', 'food.cooking.regional_indian:7,community.volunteering.disaster_relief:5,tech.software.web_development:5,learning.study.quizzing:3', '{"Hackathon Buddy","Coding Partner"}'),
  (13, 'Reyansh Malhotra', 'Male', 'Delhi', 'Delhi', '12+ years', 'tech.ai_data.data_analysis:8,business.money.stock_investing:5,sports.endurance.running:4,games.board.chess.blitz:3', '{"Networking Contact","Job Referral"}'),
  (14, 'Kiara Sethi', 'Female', 'Delhi', 'Delhi', '3–7 years', 'tech.software.web_development.frontend:7,sports.racket.badminton:5,stage_screen.dance.bollywood_dance:5,food.eating_out.cafe_hopping:3', '{"Sports Partner","Event Companion"}'),
  (15, 'Aditya Bansal', 'Male', 'Delhi', 'Delhi', 'Student / just starting', 'tech.ai_data.generative_ai:8,outdoors.trekking.himalayan_treks:7,learning.study.exam_prep:5', '{"Travel Companion","Trekking Partner"}'),
  (16, 'Naina Arora', 'Female', 'Delhi', 'Delhi', '7–12 years', 'arts.photography.portraits:8,learning.humanities.history.indian_history:5,business.careers.mentoring:4,lifestyle.travel.heritage_sites:3', '{"Mentee","Internship Referral"}'),
  (17, 'Dev Chauhan', 'Male', 'Delhi', 'Delhi', '1–3 years', 'business.startups.founding:7,business.startups.growth:6,sports.team.football.five_a_side:4,business.marketing.selling:3', '{"Co-founder","Startup Partner"}'),
  (18, 'Riya Khanna', 'Female', 'Delhi', 'Delhi', '12+ years', 'tech.software.devops:8,arts.photography.street_photography:5,stage_screen.online.podcasting:4,food.drinks.coffee.pour_over:3', '{"Photography Partner","Content Creator"}'),
  (19, 'Ayaan Kulkarni', 'Male', 'Pune', 'Maharashtra', '3–7 years', 'tech.ai_data.data_analysis:7,tech.ai_data.machine_learning:5,learning.science.astronomy:5,games.board.carrom:3', '{"Research Partner","AI Enthusiast"}'),
  (20, 'Myra Patil', 'Female', 'Pune', 'Maharashtra', 'Student / just starting', 'business.careers.public_speaking:7,learning.discussion.debating:6,learning.study.study_groups:4,learning.reading.book_clubs:3', '{"Study Partner","Project Partner"}'),
  (21, 'Krish Bhosale', 'Male', 'Pune', 'Maharashtra', '7–12 years', 'lifestyle.travel.weekend_getaways:6,outdoors.riding.motorcycle_touring:6,outdoors.trekking.monsoon_treks:5,learning.languages.marathi:3', '{"Language Exchange Partner","Local Guide"}'),
  (22, 'Pooja Joshi', 'Female', 'Pune', 'Maharashtra', '1–3 years', 'tech.software.competitive_programming:7,tech.software.open_source:5,business.careers.mentoring:4,music.instruments.piano:4', '{"Mentor","Career Mentor"}'),
  (23, 'Neil D''Souza', 'Male', 'Pune', 'Maharashtra', '12+ years', 'tech.ai_data.generative_ai:8,tech.software.backend:5,music.listening.rock_metal:4,games.video.pc:3', '{"Open Source Contributor","Collaborator"}'),
  (24, 'Sneha Pawar', 'Female', 'Pune', 'Maharashtra', '3–7 years', 'food.cooking.baking:7,community.volunteering.food_banks:5,tech.software.web_development:5,learning.study.quizzing:3', '{"Hackathon Buddy","Coding Partner"}');

-- v2 (t25-t60). Roles in the comment after each city (F = the city's first member; see the header).
insert into _seed_members (n, name, gender, city, state, experience, interests, looking_for, dy, dx, cover) values
  -- Bengaluru: F 25; neighbours 26 27 28; weak (v1) 2 4; far-strong 29 (-> 45 Thane); flagged 30 31; 25 blocks 32
  (25, 'Meghna Pillai', 'Female', 'Bengaluru', 'Karnataka', '3–7 years', 'outdoors.climbing.bouldering:7:play,food.cooking.baking.sourdough:6:build,learning.languages.french:4:learn,stage_screen.theatre.open_mics:3:teach', '{"Sports Partner","Workshop Partner"}', 0, 0, '3453059c-4864-46f7-ae45-6f7049939b9f.png'),
  (26, 'Nikhil Hegde', 'Male', 'Bengaluru', 'Karnataka', '7–12 years', 'outdoors.climbing.bouldering:8:teach,food.cooking.baking.sourdough:6:build,sports.racket.pickleball:6', '{"Sports Partner","Mentee"}', 0.3, 0, '71EFFB34-6301-4196-A085-967D12BF30CE.PNG'),
  (27, 'Lavanya Reddy', 'Female', 'Bengaluru', 'Karnataka', '1–3 years', 'food.cooking.baking.sourdough:7:learn,outdoors.climbing.bouldering:6:learn,learning.languages.french:4,wellbeing.health.peer_support:3', '{"Accountability Partner","Workshop Partner"}', 0, 0.3, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png'),
  (28, 'Farhan Ali', 'Male', 'Bengaluru', 'Karnataka', 'Student / just starting', 'outdoors.climbing.bouldering:6,food.cooking.baking.sourdough:5:learn,sports.endurance.cycling:5,stage_screen.theatre.open_mics:4', '{"Event Companion","Community Member"}', -0.3, 0, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG'),
  (29, 'Ananya Krishnan', 'Female', 'Bengaluru', 'Karnataka', '12+ years', 'music.indian_classical.carnatic_violin:7:teach,arts.visual.madhubani:7:teach,learning.languages.sanskrit:6:teach', '{"Collaborator","Workshop Partner"}', 2, -2, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG'),
  (30, 'Rahul Shenoy', 'Male', 'Bengaluru', 'Karnataka', '3–7 years', 'outdoors.climbing.bouldering:7,food.cooking.baking.sourdough:6:build,learning.languages.french:4:learn,stage_screen.theatre.open_mics:3:teach', '{"Sports Partner","Event Companion"}', 1.5, 1, null),
  (31, 'Kavya Bhat', 'Female', 'Bengaluru', 'Karnataka', '1–3 years', 'stage_screen.dance.kathak:10:learn,food.cooking.mithai:6,wellbeing.spirituality.kirtan:4', '{"Event Companion","Workshop Partner"}', -1.5, 2, null),
  (32, 'Siddharth Pai', 'Male', 'Bengaluru', 'Karnataka', '7–12 years', 'outdoors.climbing.bouldering:9,food.cooking.baking.sourdough:6,community.social.lgbtq:5', '{"Sports Partner","Networking Contact"}', -2, -1, null),
  -- Mumbai: F 33; neighbours 34 35 36; weak (v1) 7 9; far-strong 37 (-> 29 Bengaluru); flagged 38 and v1 12; 33 blocks v1 11
  (33, 'Rhea Sawant', 'Female', 'Mumbai', 'Maharashtra', '3–7 years', 'stage_screen.theatre.improv:7,arts.writing.screenwriting:6:build,learning.languages.japanese:4:learn,games.board.modern_board_games:3:teach', '{"Collaborator","Writer"}', 0, 0, '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'),
  (34, 'Kunal Desai', 'Male', 'Mumbai', 'Maharashtra', '12+ years', 'stage_screen.theatre.improv:8:teach,arts.writing.screenwriting:6:build,stage_screen.film.film_clubs:3,wellbeing.spirituality.interfaith:3', '{"Mentor","Collaborator"}', 0.3, 0, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG'),
  (35, 'Aisha Shaikh', 'Female', 'Mumbai', 'Maharashtra', '1–3 years', 'arts.writing.screenwriting:7:learn,stage_screen.theatre.improv:6,stage_screen.theatre.stand_up:4,music.listening.sufi_qawwali:3', '{"Writer","Event Companion"}', 0, 0.3, '5ae622b1-88f5-481b-8856-eb2eba35e606.png'),
  (36, 'Yash Thakkar', 'Male', 'Mumbai', 'Maharashtra', 'Student / just starting', 'arts.writing.screenwriting:6:learn,stage_screen.film.video_editing:6:build,stage_screen.theatre.improv:5:learn,learning.languages.japanese:3', '{"Video Editor","Project Partner"}', -0.3, 0, 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'),
  (37, 'Nandini Iyer', 'Female', 'Mumbai', 'Maharashtra', '7–12 years', 'music.indian_classical.carnatic_violin:8,arts.visual.madhubani:6,learning.languages.sanskrit:6', '{"Workshop Partner","Collaborator"}', 2, 2, '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG'),
  (38, 'Harsh Vora', 'Male', 'Mumbai', 'Maharashtra', '3–7 years', 'stage_screen.theatre.improv:7,arts.writing.screenwriting:6:build,learning.languages.japanese:4:learn,wellbeing.health.sober_social:3', '{"Collaborator","Writer"}', -2, 1, null),
  -- Thane: F 39; neighbours 40 41 42; weak 43 44; far-strong 45 (-> 29 Bengaluru); flagged 46 47; 39 blocks 48
  (39, 'Siddhi Joshi', 'Female', 'Thane', 'Maharashtra', '3–7 years', 'tech.hardware.robotics:7:build,arts.photography.film_cameras:6,music.indian_classical.tabla:4:learn,food.drinks.tea:3:teach', '{"Project Partner","Photography Partner"}', 0, 0, '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG'),
  (40, 'Aditya Patil', 'Male', 'Thane', 'Maharashtra', '7–12 years', 'tech.hardware.robotics:8:build,arts.photography.film_cameras:6,games.tabletop.rpg:6', '{"Teammate","Gaming Partner"}', 0.3, 0, '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG'),
  (41, 'Gauri Mhatre', 'Female', 'Thane', 'Maharashtra', '1–3 years', 'arts.photography.film_cameras:7:learn,tech.hardware.robotics:6:learn,wellbeing.spirituality.pilgrimages:4,food.drinks.tea:3', '{"Photography Partner","Mentor"}', 0, 0.3, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG'),
  (42, 'Rohit Naik', 'Male', 'Thane', 'Maharashtra', '12+ years', 'tech.hardware.robotics:6:teach,arts.photography.film_cameras:5,music.indian_classical.tabla:5:teach,outdoors.water.kayaking:4', '{"Mentee","Teammate"}', -0.3, 0, 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG'),
  (43, 'Snehal Gokhale', 'Female', 'Thane', 'Maharashtra', '3–7 years', 'lifestyle.home.indoor_plants:9,learning.reading.literary_fiction:4:learn,food.drinks.tea:4,community.social.womens_circles:3', '{"Community Member","Accountability Partner"}', 1.5, -1.5, '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png'),
  (44, 'Imran Khan', 'Male', 'Thane', 'Maharashtra', '1–3 years', 'sports.team.football:10,games.video.console:7,music.indian_classical.tabla:3:learn', '{"Sports Partner","Gaming Partner"}', -1.5, 1.5, 'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG'),
  (45, 'Omkar Bhide', 'Male', 'Thane', 'Maharashtra', '7–12 years', 'music.indian_classical.carnatic_violin:7:learn,arts.visual.madhubani:7:learn,learning.languages.sanskrit:6:learn', '{"Mentor","Workshop Partner"}', 2, 2, '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg'),
  (46, 'Varun Kadam', 'Male', 'Thane', 'Maharashtra', '3–7 years', 'tech.hardware.robotics:7:build,arts.photography.film_cameras:6,music.indian_classical.tabla:4:learn,food.drinks.tea:3:teach', '{"Project Partner","Teammate"}', 1, -2, null),
  (47, 'Pallavi Shinde', 'Female', 'Thane', 'Maharashtra', '12+ years', 'stage_screen.dance.garba:12,food.cooking.home_cooking:8:teach', '{"Event Companion","Community Member"}', -2, -1, null),
  (48, 'Tanmay Rane', 'Male', 'Thane', 'Maharashtra', 'Student / just starting', 'tech.hardware.robotics:9:build,arts.photography.film_cameras:7,learning.languages.sign_language:4:learn', '{"Teammate","Project Partner"}', -1, -2, null),
  -- Pune: F 49; neighbours 50 51 52; weak (v1) 21 22; far-strong v1 21 (-> 57 Delhi); flagged v1 20 24; 49 blocks v1 23
  (49, 'Isha Deshpande', 'Female', 'Pune', 'Maharashtra', '3–7 years', 'arts.visual.watercolour:7,outdoors.nature.stargazing:6:learn,music.instruments.piano:4:teach,learning.languages.marathi:3:build', '{"Workshop Partner","Trekking Partner"}', 0, 0, '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG'),
  (50, 'Chinmay Apte', 'Male', 'Pune', 'Maharashtra', '7–12 years', 'arts.visual.watercolour:8:teach,outdoors.nature.stargazing:6:build,outdoors.trekking.day_hikes:3,wellbeing.spirituality.kirtan:3', '{"Trekking Partner","Mentee"}', 0.3, 0, '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG'),
  (51, 'Ketaki Ranade', 'Female', 'Pune', 'Maharashtra', '1–3 years', 'outdoors.nature.stargazing:7:learn,arts.visual.watercolour:6:learn,music.instruments.piano:4,music.singing.devotional:3', '{"Workshop Partner","Event Companion"}', 0, 0.3, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG'),
  (52, 'Saurabh Jog', 'Male', 'Pune', 'Maharashtra', 'Student / just starting', 'arts.visual.watercolour:6:build,outdoors.nature.stargazing:5:teach,learning.languages.marathi:3:learn,sports.racket.squash:3,wellbeing.spirituality.scripture_study:3', '{"Sports Partner","Language Exchange Partner"}', -0.3, 0, '71EFFB34-6301-4196-A085-967D12BF30CE.PNG'),
  -- Delhi: F 53; neighbours 54 55 56; weak (v1) 14 16; far-strong 57 (-> v1 21 Pune); flagged 58 59; 53 blocks 60
  (53, 'Zoya Siddiqui', 'Female', 'Delhi', 'Delhi', '7–12 years', 'arts.writing.poetry.urdu_shayari:7,food.cooking.plant_based:6:build,learning.humanities.history.indian_history:4:learn,food.eating_out.cafe_hopping:3:teach', '{"Writer","Event Companion"}', 0, 0, '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG'),
  (54, 'Arnav Mathur', 'Male', 'Delhi', 'Delhi', '3–7 years', 'arts.writing.poetry.urdu_shayari:8:teach,food.cooking.plant_based:6,sports.racket.tennis:6', '{"Sports Partner","Mentee"}', 0.3, 0, '3453059c-4864-46f7-ae45-6f7049939b9f.png'),
  (55, 'Simran Kaur', 'Female', 'Delhi', 'Delhi', '1–3 years', 'food.cooking.plant_based:7:learn,arts.writing.poetry.urdu_shayari:6:learn,learning.humanities.history.indian_history:4,wellbeing.health.peer_support:3', '{"Writer","Accountability Partner"}', 0, 0.3, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG'),
  (56, 'Rehan Mirza', 'Male', 'Delhi', 'Delhi', '12+ years', 'arts.writing.poetry.urdu_shayari:6,food.cooking.plant_based:5:build,games.board.bridge:5:teach,food.eating_out.cafe_hopping:4', '{"Mentor","Event Companion"}', -0.3, 0, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG'),
  (57, 'Gurpreet Sandhu', 'Male', 'Delhi', 'Delhi', '7–12 years', 'lifestyle.travel.weekend_getaways:6,outdoors.riding.motorcycle_touring:6,outdoors.trekking.monsoon_treks:5,learning.languages.marathi:3', '{"Travel Companion","Trekking Partner"}', 2, -2, 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG'),
  (58, 'Kabir Ahuja', 'Male', 'Delhi', 'Delhi', '3–7 years', 'arts.writing.poetry.urdu_shayari:7,food.cooking.plant_based:6:build,learning.humanities.history.indian_history:4:learn,food.eating_out.cafe_hopping:3:teach', '{"Writer","Collaborator"}', 1.5, 1.5, null),
  (59, 'Meher Gill', 'Female', 'Delhi', 'Delhi', '1–3 years', 'stage_screen.dance.bharatanatyam:10,learning.reading.poetry_reading:6,wellbeing.spirituality.kirtan:4', '{"Event Companion","Workshop Partner"}', -1.5, 1, null),
  (60, 'Pranav Bedi', 'Male', 'Delhi', 'Delhi', 'Student / just starting', 'arts.writing.poetry.urdu_shayari:9,food.cooking.plant_based:7,wellbeing.health.sober_social:4', '{"Writer","Networking Contact"}', -1, -2, null);

-- v1 offsets (k = 0..5 within a city: about 0.6 km steps), exactly as v1 computed them.
update _seed_members set dy = ((n - 1) % 6) - 2.5, dx = (((n - 1) * 5) % 6) - 2.5 where n <= 24;

-- Flags (2 per city): complete members under review, invisible to everyone (0005 brivia_member_completed).
create temp table _seed_flags (n int primary key) on commit drop;
insert into _seed_flags values (30), (31), (38), (12), (46), (47), (20), (24), (58), (59);

-- Deterministic ids: a7e57000-0000-4000-8000-0000000000NN (NN = 01..60).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000',
       ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'authenticated', 'authenticated',
       't' || lpad(n::text, 2, '0') || '@test.brivia.club',
       crypt(gen_random_uuid()::text, gen_salt('bf')),   -- random, never stored anywhere: no one can log in
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"is_test":true}'::jsonb, now(), now(),
       '', '', '', '', '', '', '', ''   -- GoTrue cannot read NULL here (login/reset/admin list break), like Supabase's own seeding
from _seed_members
on conflict (id) do nothing;

insert into auth.identities (id, user_id, provider, provider_id, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, 'email', u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       now(), now(), now()
from auth.users u
where u.id::text like 'a7e57000-0000-4000-8000-%'
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

-- Profiles. A new member's cover is a preset illustration (brivia_is_preset_cover); nobody has a photo (monograms).
-- created_at: v1 members keep "now"; new members are spread over the last weeks (an owner session may set it).
insert into public.profiles (id, name, full_name, email, gender, city, state, experience, skills, looking_for, cover_url, is_test, created_at)
select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name, name, 't' || lpad(n::text, 2, '0') || '@test.brivia.club', gender, city, state, experience,
       '{}', looking_for, case when cover is not null then '/Images/Cover%20images/' || cover end, true,
       case when n <= 24 then now() else now() - make_interval(days => 3 + (n % 20)) end
from _seed_members
on conflict (id) do nothing;
-- R1: the seed declares the 18+ confirmation for its members (an owner session may set the column).
update public.profiles set adult_declared_at = now()
 where is_test and adult_declared_at is null and email like '%@test.brivia.club';

-- Interests: only for seeded members who have none yet (a re-run, or an edit made in the app, is left alone).
insert into public.member_interest (member_id, interest_id, points, mode)
select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid,
       split_part(i.item, ':', 1), split_part(i.item, ':', 2)::smallint, coalesce(nullif(split_part(i.item, ':', 3), ''), 'play')
from _seed_members m
cross join lateral unnest(string_to_array(m.interests, ',')) as i(item)
where not exists (select 1 from public.member_interest x
                   where x.member_id = ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid)
on conflict do nothing;

-- skills = the display copy of the member's non-sensitive interest labels (points desc, label asc), exactly as
-- set_member_interests writes it (a private interest never appears in skills).
update public.profiles p
   set skills = coalesce((select array_agg(nd.label order by mi.points desc, nd.label asc)
                            from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                           where mi.member_id = p.id and not nd.sensitive), '{}')
 where p.id in (select ('a7e57000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid from _seed_members);

-- Private interests need their separate consent (D-038 R3, DPDP), recorded as set_sensitive_consent(true) records it:
-- sensitive_consent_at (kept if already set) and one 'sensitive_give' event at the current notice version.
insert into public.consent_event (member_id, kind, notice_version)
select p.id, 'sensitive_give', public.brivia_notice_version()
  from public.profiles p
 where p.is_test and p.sensitive_consent_at is null
   and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                where mi.member_id = p.id and nd.sensitive)
   and not exists (select 1 from public.consent_event e where e.member_id = p.id and e.kind = 'sensitive_give');
update public.profiles p set sensitive_consent_at = now()
 where p.is_test and p.sensitive_consent_at is null
   and exists (select 1 from public.member_interest mi join public.interest_node nd on nd.id = mi.interest_id
                where mi.member_id = p.id and nd.sensitive);

-- Home cell: the city centroid plus the member's offset (units of 0.005 degrees, under 2 km), snapped to g7 with its
-- g6/g5 parents. Existing rows are left alone.
insert into public.member_orbit (member_id, cell_scheme, home_cell, home_cell_g6, home_cell_g5, place_id, precision)
select c.id, 'grid1', c.cell, public.brivia_grid_parent(c.cell, 6), public.brivia_grid_parent(c.cell, 5),
       public.brivia_nearest_place(c.cell), 'cell'
from (
  select ('a7e57000-0000-4000-8000-' || lpad(m.n::text, 12, '0'))::uuid as id,
         public.brivia_grid_cell(pl.lat + m.dy * 0.005, pl.lng + m.dx * 0.005, 7) as cell
  from _seed_members m
  join public.place pl on pl.name = m.city and pl.country = 'India'
) c
on conflict (member_id) do nothing;

-- Posts: 30 preset illustrations (no upload), by unflagged members of all five cities, over the last 12 days.
create temp table _seed_posts (k int primary key, n int, cover text, caption text, hours int) on commit drop;
insert into _seed_posts values
  (1, 25, '3453059c-4864-46f7-ae45-6f7049939b9f.png', 'New problem at the bouldering gym in Koramangala. Took me eleven tries.', 3),
  (2, 26, '71EFFB34-6301-4196-A085-967D12BF30CE.PNG', 'Pickleball doubles on Saturday at 7, two spots left.', 9),
  (3, 27, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png', 'Day 4 of the sourdough starter. It finally smells like bread.', 20),
  (4, 2, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG', 'Open mic night was full of first-timers. Loved it.', 31),
  (5, 29, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG', 'Teaching a free Carnatic violin basics session this month. Beginners welcome.', 44),
  (6, 6, 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG', 'Spotted a paradise flycatcher by the lake this morning.', 58),
  (7, 28, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG', 'Cycled to Nandi Hills for sunrise. Worth every hill.', 77),
  (8, 33, '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', 'Improv jam in Bandra on Thursday. No experience needed, just say yes.', 5),
  (9, 34, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG', 'Our film club is screening an old Satyajit Ray this weekend.', 26),
  (10, 35, '5ae622b1-88f5-481b-8856-eb2eba35e606.png', 'Finished the first draft of my short film script.', 50),
  (11, 36, 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG', 'Edited a 60-second reel of Marine Drive in the rain.', 69),
  (12, 37, '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG', 'Practising Madhubani borders between violin lessons.', 101),
  (13, 9, '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG', 'Monsoon trek to Kalsubai is on. Who is in?', 130),
  (14, 39, '3157077F-6C3B-4D85-BC8B-4646C85B33D1.PNG', 'Our line-following robot finally stopped falling off the table.', 2),
  (15, 40, '7423007B-E17D-4D46-A19F-499CC9A8DB99.PNG', 'Running a one-shot tabletop game in Thane on Sunday.', 14),
  (16, 41, '95DC81FA-C91B-46AE-BAF3-9EE71551A8D7.PNG', 'First roll of film developed. Half of it is my thumb.', 23),
  (17, 42, 'E7E0AFAA-B547-4228-97C0-88E527151123.PNG', 'Kayaking on Upvan lake before the heat kicks in.', 39),
  (18, 43, '9dc8500a-2dcf-47e6-a6b9-02e441edff68.png', 'My balcony jungle has a new monstera leaf.', 55),
  (19, 44, 'BDADEBC8-0C14-4E36-806F-9D23E61E3BD4.PNG', 'Five-a-side in Thane on Sunday mornings. We need a keeper.', 82),
  (20, 45, '2da16686-88d5-49d6-8ac7-afbf37ec69d9.jpg.jpeg', 'Learning Sanskrit verses with a violin teacher in Bengaluru, over video.', 120),
  (21, 49, '3EBA748D-DAD8-4128-97A0-047E251FDAF4.PNG', 'Watercolour of Sinhagad at dusk. Still learning skies.', 7),
  (22, 50, '94978B9F-A399-43FC-AC48-0A41088B5D27.PNG', 'Clear skies forecast: stargazing near Pune on Saturday night.', 33),
  (23, 51, 'AE983BB0-AF28-41D3-AA72-B03B4C7F7D8C.PNG', 'Saw Saturn''s rings through a borrowed telescope. Speechless.', 61),
  (24, 22, '71EFFB34-6301-4196-A085-967D12BF30CE.PNG', 'Piano practice log: 30 days in a row.', 150),
  (25, 53, '2257522A-04B9-4E3E-AB1A-A73D7BB8CCBF.PNG', 'Urdu shayari evening at a cafe in Hauz Khas. Bring a favourite sher.', 4),
  (26, 54, '3453059c-4864-46f7-ae45-6f7049939b9f.png', 'Tennis at Siri Fort, early mornings this week.', 18),
  (27, 55, 'DEB7869C-E852-450F-A371-65E2BF6167A2.PNG', 'Plant-based thali experiment: rajma without the cream.', 40),
  (28, 56, '9358893B-8EAB-4FD2-8E2E-A4812398D008.PNG', 'Bridge club looking for a fourth on Wednesdays.', 66),
  (29, 57, 'F28EA63E-1BEB-49E9-BA01-F62127017DB1.PNG', 'Planning a monsoon ride to the Western Ghats. Looking for company from Pune.', 95),
  (30, 16, 'b66eff76-068e-4f2a-b789-a27051a11f5a.png', 'Portrait walk through Chandni Chowk this Sunday.', 210);

do $$
declare
  f text := 'a7e57000-0000-4000-8000-';
begin
  if (select count(*) from public.profiles where is_test and email like '%@test.brivia.club') <> 60 then
    raise exception 'seed aborted: is_test was not stored. Run this script in the Supabase SQL editor as postgres (not service_role).';
  end if;
  -- Every seeded member is completed (D-030): interests summing to 20 and a cell. A flagged member is complete but
  -- not "completed" (the flag hides it), so it is checked without the flag here, before the flags are written.
  if exists (select 1 from _seed_members m
              where not (m.n in (select n from _seed_flags) or public.brivia_member_completed((f || lpad(m.n::text, 12, '0'))::uuid))) then
    raise exception 'seed aborted: a test member is not completed (interests or cell). Apply migrations 0001-0006 and 0008 first.';
  end if;
  if exists (select 1 from _seed_flags s
              where not exists (select 1 from public.member_flag x where x.member_id = (f || lpad(s.n::text, 12, '0'))::uuid)
                and not public.brivia_member_completed((f || lpad(s.n::text, 12, '0'))::uuid)) then
    raise exception 'seed aborted: a member to be flagged is not completed. Apply migrations 0001-0006 and 0008 first.';
  end if;
  -- Flags (owner-only table): under review, never expiring.
  insert into public.member_flag (member_id, reason, expires_at)
  select (f || lpad(n::text, 12, '0'))::uuid, 'suspended_pending_review', null from _seed_flags
  on conflict (member_id) do nothing;
  -- Blocks: each city's first member blocks one strong match (5 in all).
  insert into public.brivia_blocks (blocker_id, blocked_id)
  select (f || lpad(a::text, 12, '0'))::uuid, (f || lpad(b::text, 12, '0'))::uuid
    from (values (25, 32), (33, 11), (39, 48), (49, 23), (53, 60)) v(a, b)
  on conflict do nothing;
  -- Matches: both directions, so the consent trigger accepts the pair and creates the match.
  insert into public.connection_requests (from_id, to_id, note) values
    ((f || '000000000001')::uuid, (f || '000000000002')::uuid, 'Test fixture: Bengaluru hello'),
    ((f || '000000000002')::uuid, (f || '000000000001')::uuid, null),
    ((f || '000000000043')::uuid, (f || '000000000044')::uuid, 'Fellow Thane person, football and chai?'),
    ((f || '000000000044')::uuid, (f || '000000000043')::uuid, null),
    ((f || '000000000013')::uuid, (f || '000000000014')::uuid, 'Saw you play badminton in Saket.'),
    ((f || '000000000014')::uuid, (f || '000000000013')::uuid, null)
  on conflict do nothing;
  -- Pending requests (one direction only): t01 receives two and sends one.
  insert into public.connection_requests (from_id, to_id, note) values
    ((f || '000000000003')::uuid, (f || '000000000001')::uuid, 'Test fixture: pending'),
    ((f || '000000000004')::uuid, (f || '000000000001')::uuid, null),
    ((f || '000000000009')::uuid, (f || '000000000010')::uuid, 'Test fixture: pending'),
    ((f || '000000000005')::uuid, (f || '000000000008')::uuid, 'Test fixture: cross-city pending'),
    ((f || '000000000001')::uuid, (f || '000000000040')::uuid, 'Saw your robotics post. Data for robots, coffee sometime?')
  on conflict do nothing;
  -- Messages: only between matched pairs, only when the pair has none yet. created_at is staggered (owner session).
  insert into public.brivia_messages (sender_id, recipient_id, body, created_at)
  select (f || lpad(v.s::text, 12, '0'))::uuid, (f || lpad(v.r::text, 12, '0'))::uuid, v.body,
         now() - make_interval(mins => v.ago)
    from (values
      (2, 1, 'Hi Aarav, thanks for connecting!', 300),
      (1, 2, 'Hey Diya! Are you going to the open mic in Indiranagar on Friday?', 290),
      (2, 1, 'Thinking about it. Coffee before?', 240),
      (1, 2, 'Perfect. 6 pm at the cafe on 12th Main?', 200),
      (2, 1, 'See you there.', 180),
      (43, 44, 'Hi Imran! Glad we matched.', 900),
      (44, 43, 'Hey Snehal! Nice to meet someone else from Thane.', 880),
      (43, 44, 'Are you playing football this Sunday?', 860),
      (44, 43, 'Yes, 7 am. Come watch, chai after.', 700),
      (43, 44, 'Deal. I know a tea stall near Upvan lake.', 650),
      (44, 43, 'See you Sunday!', 600),
      (13, 14, 'Hi Kiara, nice to meet another Delhi member.', 1500),
      (14, 13, 'Hi Reyansh! Do you play badminton?', 1450),
      (13, 14, 'Badly, but I run every morning in Lodhi Garden.', 1400),
      (14, 13, 'Join our Saturday doubles in Saket then, we need a fourth.', 1300)
    ) v(s, r, body, ago)
   where exists (select 1 from public.matches m
                  where m.user1_id = least((f || lpad(v.s::text, 12, '0'))::uuid, (f || lpad(v.r::text, 12, '0'))::uuid)
                    and m.user2_id = greatest((f || lpad(v.s::text, 12, '0'))::uuid, (f || lpad(v.r::text, 12, '0'))::uuid))
     and not exists (select 1 from public.brivia_messages b
                      where least(b.sender_id, b.recipient_id) = least((f || lpad(v.s::text, 12, '0'))::uuid, (f || lpad(v.r::text, 12, '0'))::uuid)
                        and greatest(b.sender_id, b.recipient_id) = greatest((f || lpad(v.s::text, 12, '0'))::uuid, (f || lpad(v.r::text, 12, '0'))::uuid));
  -- Posts: fixed ids (a7e57000-0000-4000-9000-0000000000KK), preset illustration, empty image_path (0008 section 4).
  insert into public.community_posts (id, author_id, image_url, image_path, caption, created_at)
  select ('a7e57000-0000-4000-9000-' || lpad(p.k::text, 12, '0'))::uuid, (f || lpad(p.n::text, 12, '0'))::uuid,
         '/Images/Cover%20images/' || p.cover, '', p.caption, now() - make_interval(hours => p.hours)
    from _seed_posts p
  on conflict (id) do nothing;
end $$;

commit;

select (select count(*) from public.profiles where is_test) as test_members,
       (select count(*) from public.community_posts c join public.profiles p on p.id = c.author_id where p.is_test) as test_posts,
       (select count(*) from public.connection_requests r join public.profiles p on p.id = r.from_id where p.is_test) as test_requests,
       (select count(*) from public.matches m join public.profiles p on p.id = m.user1_id where p.is_test) as test_matches,
       (select count(*) from public.brivia_messages b join public.profiles p on p.id = b.sender_id where p.is_test) as test_messages,
       (select count(*) from public.member_flag x join public.profiles p on p.id = x.member_id where p.is_test) as flagged,
       (select count(*) from public.brivia_blocks b join public.profiles p on p.id = b.blocker_id where p.is_test) as blocks;
