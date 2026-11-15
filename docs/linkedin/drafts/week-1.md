# Week 1 drafts (posts 1–3), awaiting Golu's approval

Status: DRAFT. Nothing is scheduled. Fill every `[bracket]` with the real detail or delete the line.

---

## Post 1 · Tue 17 Nov, 8:30 AM IST · Product intro (this week's one offer post) · goal: reposts and sign-ups

Brivia Club is live, and I'm one of the two people who built it.

It's a swipe-style app for meeting people near you who care about the same things you do.

Not dates. Hackathon teammates, event buddies, travel companions, people who are hiring, people looking for a referral.

How it works:

You pick your interests. Brivia shows you people nearby who share them.

You get 10 swipes a day, so each one is a real choice.

A match only happens when both of you say yes. Then you chat and make a plan.

Other members never see your exact location, phone number or email. They see a rounded distance like "~3 km".

The idea is Yashika's. She founded Brivia after struggling to find a teammate for her first hackathon. I'm the co-founder and developer, and my job is making sure it works when you open it.

In October we put it in front of 20 to 30 players at the 1st NF3 PRO Open Chess Tournament. They found bugs, told us what confused them, and we fixed it.

If you're looking for a team, a plan for this weekend, or people who get your interests, try it and tell me what breaks.

What's one interest you wish more people near you shared?

P.S. Link in the first comment.

**First comment:** Try it here: thebriviaclub.com. Founder: Yashika (tag). Feedback and bug reports welcome.
**Tag:** Yashika.
**Image:** 2–4 real screenshots (deck card with shared interests and "~3 km", a match, chat), as a carousel.

---

## Post 2 · Wed 18 Nov, 7:30 PM IST · F11 Emotional cold-open · goal: likes

Story source: the git log for the night of 24–25 Oct 2026 (IST). Confirmed by Golu (15 Nov): he stayed awake that
night and the NF3 PRO Open was on 25 Oct. Yashika's launch post went up later, on 8 Nov.

3:25 AM. The build broke because of one stray curly brace.

That was the night before the 1st NF3 PRO Open Chess Tournament. Yashika had sponsored it for one reason: to put Brivia Club in front of 20 to 30 real testers before launch. Chess players, who notice everything.

My log from that night:

1:07 AM: show or hide your password on every password field.
3:13 AM: launch polish.
3:25 AM: the build fails. One brace in one CSS file. Fixed.
5:23 AM: a favicon, and a first-run tutorial so nobody opens the app lost.
6:52 AM: picking your interests at sign-up becomes a simple dropdown.
9:01 AM: a proper phone login, because that's what everyone at the tournament would use.

None of it was glamorous. All of it was something a stranger would trip over in the first minute.

That day the players actually used it. They found bugs we had never seen and told us what confused them. We fixed those too.

I met Yashika at upGrad. She shared her vision for Brivia with me, and we made it live together. Her job is the vision. Mine is making sure it works when someone opens it for the first time.

What's the latest you've stayed up to ship something?

P.S. Link in the first comment if you want to try it.

**First comment:** thebriviaclub.com — would love your honest feedback, bugs included.
**Tag:** Yashika (where her name appears).
**Image:** `docs/linkedin/images/post1-night-log.png` (that night's real commits, IST).

---

## Post 3 · Thu 19 Nov, 8:30 AM IST · F7 Odd-precision · goal: saves

384 milliseconds.

That's how long Brivia Club's chat took to check one member's messages. Members felt it as a chat that lagged.

Here's what was going on, straight from our decision log:

- One member had about 700 messages.
- Every message went through two privacy checks, one row at a time.
- Each check cost about 0.4 ms.
- The "any new messages?" check runs every few seconds and had run about 126,000 times.

The privacy rule was right. It decides which messages you're allowed to see, and we were never going to loosen it.

The fix was to stop asking it the same question 700 times. Now the rule runs once per query: work out which messages are hidden from you, work out which people are outside your world, then filter.

Same rule. Same privacy. About 30 ms instead of 384.

The lesson for me as the developer: I didn't need a faster server. I needed to stop doing per-row work that could be done once.

What's the smallest change that gave you the biggest speed-up?

P.S. The bug report was one line from Yashika: "chat section and landing page is bit slow and unresponsive". That one line was worth more than any dashboard.

**First comment:** If you want to feel the difference: thebriviaclub.com
**Image:** a screenshot of the before/after timing, or the query diff (no secrets, no member data).
**Hashtags (optional):** #buildinpublic #postgres

---

## Moved to week 2 · Wed 25 Nov, 7:30 PM IST · F18 False-binary dissolve · goal: comments

Yashika had to convince her mom that Brivia Club is not a dating site.

Fair question. It has swipes.

But think about how you actually meet people who share your interests.

A dating app? It knows how close someone is. It has no idea you both want to build a fintech project or play rapid chess on Sundays.

A career network? It knows your skills and interests. The best match it finds might live 2,000 km away, which is no use for a hackathon this weekend.

Brivia starts nearby, then lets shared interests decide who you see.

You swipe on people, not photos of people. A match only happens when both of you say yes. Other members see a rounded distance like "~3 km", never your exact location, phone or email.

The idea is simple: the right teammate is often a few streets away, and neither of you knows it.

How did you meet the last person you built something with?

**First comment:** thebriviaclub.com
**Image:** a two-panel card made from real screenshots (Brivia's deck card showing "~3 km" and shared interests). Avoid naming or mocking any other app.

---

