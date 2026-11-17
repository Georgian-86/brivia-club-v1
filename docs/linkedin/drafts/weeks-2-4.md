# Weeks 2–4 drafts (24 Nov to 10 Dec), awaiting Golu's approval

Status: DRAFT. Nothing is scheduled. Rules for every post (Golu, 17 Nov): never "co-founder". Use "we built it
together", "co-developer" or "the developer". Yashika is the founder. Link goes in the first comment
(thebriviaclub.live). No ORBIT ranking details. Facts come from Yashika's public posts, `docs/DECISIONS.md` or Golu.

---

## Post 4 · Tue 24 Nov, 8:30 AM IST · F11 relatable story → Find my companion · goal: likes + sign-ups

Last week Yashika played a chess tournament in Bengaluru and came back with a medal and a question.

She watched parents spend their day off driving kids to the venue. And she asked how many times the rest of us cancel plans because nobody can come along. A concert. A meetup. A hackathon two metro stops away.

Most of us have done it.

So we built a button for it.

On Brivia, open any event and tap Find my companion. You become visible to other people going to the same event who also want company. You swipe on each other. If both of you swipe right, it's a match, you both get "You and [name] are going together", and the chat opens with the event at the top.

No awkward group-chat ask. No waiting for a friend to confirm. Just someone going to the same place, who also didn't want to go alone.

Yashika ended her post with the most honest line: sometimes all you need is someone to say "kitne vje chalna hai?"

What's the last event you skipped because you didn't have company?

P.S. Link in the first comment.

#networking #events #startupindia #buildinpublic

**First comment:** Find your companion for the next event: thebriviaclub.live
**Image:** a real screenshot of an event card with "Find my companion" (no other members' faces or names).

---

## Post 5 · Wed 25 Nov, 8:30 AM IST · F17 controlled comparison → Hiring switch · goal: comments + saves

Two people want the same thing: a referral.

The first sends cold messages to strangers and waits.

The second finds people nearby who share her interests, and one of them happens to be hiring.

That second path is why we built a Hiring switch into Brivia.

Flip it on and the deck changes. Instead of people around you, you see people who are hiring or who can refer you, from anywhere. Their card says so in a bar at the top, with the role. If you're the one hiring, the people open to that kind of role can find you.

It's still Brivia underneath: a real profile, shared interests, and a connection only when both people say yes. A referral lands better when there's already something to talk about.

We built it together in early November, and it's one of the features I'm proudest of.

If you're hiring interns or juniors, what makes you actually reply to someone?

P.S. Link in the first comment.

#hiring #referrals #startupindia #buildinpublic

**First comment:** Hiring, or looking for a referral? Turn on Hiring in Brivia: thebriviaclub.live
**Image:** `docs/linkedin/images/deck-member-blurred.jpg` (it shows a real "HIRING · FRONTEND DEVELOPER" card, member hidden).

---

## Post 6 · Thu 26 Nov, 8:30 AM IST · F4 time-anchor confession · goal: comments

On 10 November our app was freezing on phones every 5 seconds.

Not crashing. Just a stutter of 120 to 250 milliseconds, every 5 seconds, even when you weren't touching anything. Yashika's message was short: "the app is lagging too much, pls fix both on phones and laptop".

On my laptop it felt fine, with a handful of test messages. So I measured with realistic data: 40 conversations, 1,200 messages, on a phone with the CPU slowed down 4x. There it was.

Every 5 seconds the app checked for new messages and re-read the latest 80. For each one, it rewrote the whole notification list to storage. Worse, old messages kept looking new, so the list never settled.

The fix was boring: skip messages older than anything already in the list, keep it in order, and save once per check, only if something changed.

Lesson I keep relearning as the developer: if it only works on your laptop, it doesn't work.

What's a bug you could only find with real-world data?

P.S. Link in the first comment.

#buildinpublic #webdevelopment #javascript #startupindia

**First comment:** Try it on your phone and tell me if anything still stutters: thebriviaclub.live
**Image:** optional: a code diff or performance chart screenshot (no member data).

---

## Post 7 · Tue 1 Dec, 8:30 AM IST · F15 explain-to-kids → privacy · goal: saves

"~3 km away."

That's all another member sees about where you are on Brivia.

Not your street. Not a pin on a map. Not your phone number or email, ever.

Here's the simple version:

Imagine the city is a big grid of squares. Brivia only remembers which square you're roughly in, not the exact spot you're standing. When it shows you someone nearby, it rounds the distance, so "~3 km" could be a little more or a little less.

And nobody gets to message you just because they swiped. A connection happens only when both of you say yes.

An app about meeting people nearby has to feel safe to open first. Everything else comes after.

Which matters more to you in a people-nearby app: privacy, or seeing exactly how close someone is?

P.S. Link in the first comment.

#privacy #productdesign #buildinpublic #startupindia

**First comment:** Your location stays rounded on Brivia: thebriviaclub.live
**Image:** a real screenshot of a card showing a rounded distance (member hidden).

---

## Post 8 · Wed 2 Dec, 8:30 AM IST · F14 named gratitude → the first testers · goal: reposts

20 to 30 strangers broke our app before anyone else could.

They were chess players at the 1st NF3 PRO Open Chess Tournament on 25 October, and Yashika had sponsored it so Brivia would meet real people before launch.

They used it, found bugs we had never seen, and told us what confused them. We fixed them.

So, a thank-you, a few weeks late:

To the organisers, for letting a brand-new app into their tournament.
To every player who tried it between rounds and told us the truth.
And to Yashika, who decided our first users should be people who notice everything.

If you were there that day, thank you. You helped build this.

What's the most useful feedback you've ever got from a stranger?

P.S. Link in the first comment.

#gratitude #chess #startupindia #buildinpublic

**First comment:** The app those players helped shape: thebriviaclub.live
**Tag:** the NF3 PRO organisers (names needed from Golu) and Yashika.
**Image:** a tournament photo, if one exists; otherwise `golu-launch-night.jpg` is already used, so text only.

---

## Post 9 · Thu 3 Dec, 8:30 AM IST · F16 status-strip humility → building as two · goal: likes

Yashika gets DMs every week asking if Brivia is hiring developers.

She wrote about it under my last post, and I've been thinking about it since.

Brivia is built by two people. Yashika had the idea and decides what it should feel like. I write the code. We built it together, mostly after full working days, mostly late at night.

Two people means every bug report goes straight to the person who can fix it. It also means saying no to a lot of good ideas, because there are only so many nights in a week.

I don't have a big title for what I do here. I'm the co-developer who turns "pls fix" into a release.

And honestly, that's the job I wanted.

If you've built something with one other person, what made it work?

P.S. Link in the first comment.

#buildinpublic #startupindia #developers #indiehackers

**First comment:** What two people built: thebriviaclub.live
**Image:** a real photo of Golu working, or text only.

---

## Post 10 · Tue 8 Dec, 8:30 AM IST · F17 controlled A/B → landing page weight · goal: saves

20 MB to see our landing page on a laptop. 7.5 MB on a phone.

That's what Brivia's hero video cost every visitor until 14 November, because it was a 4K video.

Same page, two versions:

Before: one 4K video for everyone.
After: a 1440p cut for laptops (5.7 MB), a 1536-tall cut for phones (3 MB), and the 4K master only for screens wider than 2,560 px.

We compared the frames side by side and couldn't see a difference. The page download went from over 20 MB to 6.6 MB on a laptop, and from 8.6 MB to 4.2 MB on a phone.

For a lot of people opening Brivia on mobile data, that's the difference between the page loading and them leaving.

The lesson: nobody sees your 4K master on a phone. They just wait for it.

What's the heaviest thing on your homepage right now?

P.S. Link in the first comment.

#webperformance #webdevelopment #buildinpublic #startupindia

**First comment:** See the lighter page: thebriviaclub.live
**Image:** a side-by-side of the network tab before and after, if Golu can capture it; otherwise text only.

---

## Post 11 · Wed 9 Dec · RESERVED: why 10 swipes a day

Needs the real reason for the 10-swipe cap from Golu or Yashika before drafting.

---

## Post 12 · Thu 10 Dec, 8:30 AM IST · F1 anaphora → everything Brivia does (the month's main offer post) · goal: reposts + sign-ups

Find a hackathon teammate who lives near you.
Find someone going to the same concert, so you're not going alone.
Find a person who is hiring, or who can refer you.
Find people who care about the same things you do, starting close to home.

That's Brivia Club.

Pick your interests. Swipe through people nearby who share them, with 10 swipes a day so each one counts. Connect only when both of you say yes. Chat, share a place, make a plan.

Turn on Hiring to see people hiring or open to roles. Open any event and tap Find my companion. Post a note to the people you've connected with.

Your exact location, phone and email stay private. Others see "~3 km".

Yashika started Brivia after struggling to find a single teammate for a hackathon. We built it together so the next person doesn't have to.

Who's the one person you wish you'd met sooner?

P.S. Link in the first comment.

#networking #startupindia #buildinpublic #community

**First comment:** Join the club: thebriviaclub.live
**Images:** carousel of real screenshots: deck (member hidden), Companions, Hiring, chat (no member data).
