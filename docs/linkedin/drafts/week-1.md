# Week 1 drafts (posts 1–3), awaiting Golu's approval

Status: DRAFT. Nothing is scheduled. Fill every `[bracket]` with the real detail or delete the line.

---

## Post 1 · Tue 17 Nov, 8:30 AM IST · F11 Emotional cold-open · goal: likes

Story source: the git log for the night of 5–6 Nov 2026 (IST), the only overnight work in the project's history.
Confirmed by Golu (15 Nov): the tournament was the morning of 6 Nov, right after this night.

4:55 AM. Last fix of the night went live.

The 1st NF3 PRO Open Chess Tournament was a few hours away. Yashika had sponsored it for one reason: to put Brivia Club in front of 20 to 30 real testers before launch. Chess players, who notice everything.

So that night, my log reads like this:

2:53 AM: read a chat on your phone, and the bell clears on your laptop too.
3:29 AM: sign-up asks for your title and organisation, so people know who they're swiping on.
4:23 AM: the link preview finally says "Swipe. Match. Build."
4:30 AM: a header that overlapped on smaller screens stops overlapping.
4:55 AM: done.

None of it was glamorous. All of it was something a stranger would trip over in the first minute.

Then the players actually used it. They found bugs we had never seen and told us what confused them. We fixed those too.

I met Yashika at upGrad. She shared her vision for Brivia with me, and we made it live together. Her job is the vision. Mine is making sure it works when someone opens it for the first time.

What's the latest you've stayed up to ship something?

P.S. Link in the first comment if you want to try it.

**First comment:** thebriviaclub.com — would love your honest feedback, bugs included.
**Tag:** Yashika (where her name appears).
**Image:** `docs/linkedin/images/post1-night-log.png` (that night's real commits, IST), or a tournament photo.

---

## Post 2 · Wed 18 Nov, 7:30 PM IST · F18 False-binary dissolve · goal: comments

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
