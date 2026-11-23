# Week 2 (24–28 Nov) · built from last week's data

## What last week told us (engager analytics, 23 Nov)

| Post | Reactions | Comments | Reposts |
|---|---|---|---|
| 1 · 3:25 AM story, photo of Golu | 60 | 9 | 5 |
| 2 · "not a dating site", poster, 7:30 PM | 12 | 2 | 0 |
| 3 · 384 ms, text only, technical | 10 | 1 | 0 |

- The personal story with a real photo of Golu did 5–6x better than the other two. People engage with Golu, not with features.
- Engagers are almost all students and early-career developers (LPU, IIT Madras, Paytm, Oracle). That is the audience to write for: people building careers, hunting internships and hackathon teams.
- Few senior people or founders yet (Chayan Khatua, founder of TechJest; Sahil Mishra, building AROVAS; Atul Aditya, Principal Engineer at Oracle). Reaching them needs comments on their posts, not more hashtags.
- No replies from Golu under the comments on post 1, and three posts on three days in a row split the same small audience.

## Changes this week

- Every post leads with Golu building and learning, in first person; Brivia is the proof, not the pitch.
- 4–5 hashtags per post (5 is the ceiling before LinkedIn treats it as spam).
- A real photo or screenshot on every post where one exists.
- Reply to every comment within the first hour.
- Friday and Saturday added (Golu, 23 Nov). Saturday reach is lower, so Saturday gets the most shareable, student-friendly post.
- Never "co-founder": "we built it together", "co-developer".

---

## Tue 24 Nov · 8:30 AM IST · numbers + lessons (F7) · goal: saves, profile visits

264 decisions in 44 days.

That's how many product decisions Yashika and I logged while building Brivia Club, between 2 October and 14 November. Every one is written down — what was asked, what I found, what we chose, and how I checked it.

From the developer's chair, that came to 80 database migrations, 613 unit tests, 65 end-to-end test files and about 24,000 lines of JavaScript.

Three things I learned as an intern building a real product after work:

1. Write the decision down before you write the code. Unclear decisions turn into bugs.
2. Measure before you fix. My laptop said everything was fine. A slow phone with real data told the truth.
3. Small and shipped beats big and perfect. Most of those 264 decisions are tiny, and that's why the app feels finished.

I'm a Full Stack Developer intern at upGrad, AWS certified, and I care about DevOps and cloud. Brivia is where I get to use all of it on something real, with real users.

What's one habit that made you a better developer?

P.S. Link to Brivia in the first comment.

#buildinpublic #softwareengineering #fullstackdeveloper #learninpublic #startupindia

**First comment:** What those 264 decisions built: thebriviaclub.live
**Image:** a stats card made from the repo (264 decisions · 80 migrations · 600+ tests · 24k lines), same style as the night-log image.

---

## Wed 25 Nov · 8:30 AM IST · relatable story → Find my companion (F11) · goal: comments

Last week Yashika played a chess tournament in Bengaluru and came back with a medal and a question.

She watched parents spend their day off driving kids to the venue. And she asked how many times the rest of us cancel plans because nobody can come along, whether it's a concert, a meetup or a hackathon two metro stops away.

Most of us have done it.

So we built a button for it, and I got to write it.

On Brivia, open any event and tap Find my companion. You become visible to other people going to the same event who also want company. You swipe on each other. If both of you swipe right, you both get "You and [name] are going together", and the chat opens with the event at the top.

The hardest part wasn't the swipe. It was making sure two people can't both take the last swipe of the day at the same moment. Small detail, real bug, now fixed.

What's the last event you skipped because you didn't have company?

P.S. Link in the first comment.

#hackathon #networking #events #buildinpublic #startupindia

**First comment:** Find company for your next event: thebriviaclub.live
**Image:** a real event screenshot with Find my companion (none yet; text-only if Golu can't send one).

---

## Thu 26 Nov · 8:30 AM IST · the intern after hours (F16) · goal: likes, follows

During the day I'm a Full Stack Developer intern at upGrad.

After that, I build Brivia Club with Yashika.

The time comes from one place: watching strangers use something I wrote. That pulls me back to the laptop every night.

A few things that changed for me:

I stopped waiting for permission to work on hard problems. Database rules, privacy, real-time chat, performance on cheap phones. Nobody assigns those to an intern. On Brivia, they're mine.

I learned to love bug reports. Yashika's one-line "app is lagging, pls fix" taught me more about phones than any course.

I learned that "co-developer" is a real job. Turning an idea into something that works when a stranger opens it at 2 AM is its own skill.

Yashika once wrote that Brivia is something I have a part of. She's right, and I'm proud of that part.

If you're an intern building something on the side, what are you building?

#internship #softwaredeveloper #buildinpublic #learninpublic #upgrad

**First comment:** What we're building: thebriviaclub.live
**Image:** `golu-launch-night.jpg` again works, but a NEW real photo of Golu working would do better (ask Golu).

---

## Fri 27 Nov · 8:30 AM IST · bug story, framed as a lesson (F4) · goal: comments, saves

On 10 November our app froze on phones every 5 seconds.

It didn't crash. It stuttered for 120 to 250 milliseconds every 5 seconds — even when nobody touched the screen.

On my laptop, with a few test messages, it felt perfect. So I stopped trusting my laptop. I loaded realistic data, 40 chats and 1,200 messages, and slowed the phone's CPU down 4x.

There it was.

Every 5 seconds the app checked for new messages and re-read the latest 80. For each one it rewrote the whole notification list to storage. And old messages kept looking "new", so the list never settled.

The fix was boring: skip what's already older than the list, keep it sorted, save once and only when something changed.

The lesson I keep relearning: if it only works on your laptop, it doesn't work.

What's a bug you only found with real-world data?

#javascript #webdevelopment #debugging #buildinpublic #learninpublic

**First comment:** Try it on your phone and tell me if anything still stutters: thebriviaclub.live
**Image:** text-only, or a performance-profile screenshot if one exists.

---

## Sat 28 Nov · 10:00 AM IST · for job-hunters (F17) · goal: reposts, sign-ups

Two students want the same thing: a referral.

The first sends cold messages to strangers and waits.

The second finds people nearby who share her interests, and one of them happens to be hiring.

That second path is why we built a Hiring switch into Brivia, and it's one of the features I'm proudest of writing.

Flip it on and the deck changes. Instead of people around you, you see people who are hiring or who can refer you, from anywhere. Their card says so at the top, with the role. If you're hiring, the people open to that kind of role can find you.

It's still Brivia underneath: a real profile, shared interests, and a connection only when both people say yes. A referral lands better when there's already something to talk about.

If you're job-hunting this weekend, turn it on and tell me what you find.

Who helped you get your first internship?

P.S. Link in the first comment.

#jobsearch #internship #referral #hiring #careers

**First comment:** Turn on Hiring in Brivia: thebriviaclub.live
**Image:** `deck-member-blurred.jpg` (real "HIRING · FRONTEND DEVELOPER" card, member hidden).
