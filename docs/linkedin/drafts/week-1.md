# Week 1 drafts (posts 1–3), awaiting Golu's approval

Status: DRAFT. Nothing is scheduled. Fill every `[bracket]` with the real detail or delete the line.

---

## Post 1 · Tue 17 Nov, 8:30 AM IST · F11 Emotional cold-open · goal: likes

The tournament started in the morning. I hadn't slept.

The night before the 1st NF3 PRO Open Chess Tournament, Brivia Club still had to work on real phones, for real players, by sunrise.

Yashika had sponsored the tournament for one reason: to put the app in front of 20 to 30 genuine testers before launch. Not friends being polite. Chess players, who notice everything.

So I stayed up and kept fixing. [One real line on what you were fixing that night, e.g. which screen or bug.]

Then the players actually used it.

They used it, found bugs we had never seen, and told us what confused them. We fixed them.

I have shipped code before, but I had never watched a stranger use something I built and get stuck on it. That changes how you write the next line of code.

I met Yashika at upGrad. She shared her vision for Brivia with me, and we made it live together. Her job is the vision. Mine is making sure it actually works.

Brivia Club: swipe through people nearby who share your interests, for hackathons, events, travel, projects and referrals.

What's the first thing a real user broke in something you built?

P.S. Link in the first comment if you want to try it.

**First comment:** thebriviaclub.com — would love your honest feedback, bugs included.
**Tag:** Yashika (in the body where her name appears).
**Image:** a real photo from that night or the tournament (laptop, hall, the demo phone).

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
