# Week 3 (Mon 30 Nov – Sat 5 Dec) · approved by Golu 23 Nov ("only 30 Nov–5 Dec", Mon–Sat)

Same rules as week 2: Golu building and learning in first person, Brivia as proof, never "co-founder", 5 hashtags,
link in the first comment, facts only from `docs/DECISIONS.md`, Yashika's public posts or Golu.

---

## Mon 30 Nov · 9:30 AM IST · privacy, explained simply (F15) · goal: saves

"~3 km away."

That's all another member sees about where you are on Brivia. Not your street, not a pin on a map, and never your phone number or email.

Building this taught me that privacy is mostly a set of small, boring decisions you make early.

Here is the simple version of ours. Imagine the city as a grid of squares. Brivia keeps only the square you're roughly in, not the exact spot you're standing. When it shows you someone nearby, it rounds the distance, so "~3 km" might be a bit more or a bit less.

And a swipe alone never lets anyone message you. A connection happens only when both of you say yes.

It's easy to treat privacy as a settings page. On an app about meeting people nearby, it's the first thing a stranger feels when they open it.

In an app like this, would you pick privacy or knowing exactly how close someone is?

P.S. Link in the first comment.

#privacy #productdesign #buildinpublic #learninpublic #softwareengineering

**First comment:** Your location stays rounded on Brivia: thebriviaclub.live
**Image:** none (text), unless Golu sends a card screenshot with a rounded distance and no member visible.

---

## Tue 1 Dec · 8:30 AM IST · landing page weight (F17) · goal: saves

20 MB to open our landing page on a laptop. 7.5 MB on a phone.

That's what Brivia's hero video cost every visitor until 14 November — everyone was getting the 4K version.

Here is the same page, before and after.

Before: one 4K video for every screen.

After: a 1440p cut for laptops (5.7 MB), a 1536-pixel-tall cut for phones (3 MB), and the 4K master only for screens wider than 2,560 pixels.

I put the frames side by side and couldn't spot a difference. The laptop download dropped from over 20 MB to 6.6 MB, and the phone download from 8.6 MB to 4.2 MB.

For someone opening Brivia on mobile data in a college hostel, that's the gap between the page loading and them closing the tab.

What I took away: nobody sees your 4K master on a phone. They only wait for it.

What's the heaviest thing on your homepage right now?

P.S. Link in the first comment.

#webperformance #webdevelopment #frontend #buildinpublic #learninpublic

**First comment:** See the lighter page: thebriviaclub.live
**Image:** none (text).

---

## Wed 2 Dec · 8:30 AM IST · thank-you to the first testers (F14) · goal: reposts

20 to 30 chess players tested our app before anyone else did.

They were at the 1st NF3 PRO Open Chess Tournament on 25 October. Yashika sponsored it so Brivia would meet real people before launch, and I spent the night before shipping fixes so it would hold up.

They used it, found bugs we had never seen, and told us what confused them. We fixed them.

So here's a thank-you, a few weeks late.

To the organisers, for letting a brand-new app into their tournament. To every player who opened it between rounds and told us the truth. And to Yashika, who decided our first users should be people who notice everything.

If you were there that day, thank you. You helped build this.

What's the most useful feedback a stranger has ever given you?

P.S. Link in the first comment.

#chess #gratitude #buildinpublic #startupindia #community

**First comment:** The app those players helped shape: thebriviaclub.live
**Tag (manual):** Yashika, and the NF3 PRO organisers if Golu sends their names.
**Image:** a tournament photo if Golu has one; otherwise text.

---

## Thu 3 Dec · 8:30 AM IST · building chat (F4/F7) · goal: comments

On 3 November Yashika asked for read receipts.

It turned into three states, not two ticks. One tick means your message is stored, two cream ticks mean their app has loaded it, and two amber ticks mean they had the chat open on screen. Then came "Active 12 min ago" in the header.

The next day she asked for a switch to turn read receipts off, and that's where it got interesting. We made it mutual, like WhatsApp: if either person turns it off, neither of you sees "Read".

A small switch — but it decides what two people are allowed to know about each other.

Then came edit within 15 minutes, unsend, delete for me, and reactions on messages.

What I learned: in a chat app every feature is a privacy question wearing a UI costume.

Should read receipts be on or off by default?

P.S. Link in the first comment.

#webdevelopment #productdesign #javascript #buildinpublic #learninpublic

**First comment:** Try the chat: thebriviaclub.live
**Image:** a real chat screenshot with ticks (no other member's name or face), or text.

---

## Fri 4 Dec · 8:30 AM IST · everything Brivia does (F1, the week's offer post) · goal: reposts, sign-ups

Find a hackathon teammate who lives near you.

Find someone going to the same concert, so you're not going alone.

Find a person who is hiring, or who can refer you.

Find people who care about the same things you do, starting close to home.

That's Brivia Club, the app Yashika dreamed up and I've spent the last two months building with her.

You pick your interests and swipe through people nearby who share them, with 10 swipes a day so each one counts. You connect only when both of you say yes. Then you chat, share a place and make a plan.

Turn on Hiring to see people hiring or open to roles. Open any event and tap Find my companion.

Your exact location, phone and email stay private. Others see "~3 km".

Who's the one person you wish you'd met sooner?

P.S. Link in the first comment.

#networking #startupindia #buildinpublic #community #hackathon

**First comment:** Join the club: thebriviaclub.live
**Image:** `poster-find-your-people.jpg`.

---

## Sat 5 Dec · 10:00 AM IST · weekend question for students (F12-style, community) · goal: comments

Quick weekend question for every student reading this.

How did you find your last hackathon teammate?

A friend from class, a college WhatsApp group, a stranger on Discord, or you went alone?

I'm asking because Brivia started from that exact problem: Yashika couldn't find a single teammate for her first hackathon, and the app she wanted didn't exist.

So we built it together. You swipe through people nearby who share your interests, and you connect only when both of you say yes.

Drop your answer below. I read every comment.

P.S. Link in the first comment.

#hackathon #students #teamwork #buildinpublic #community

**First comment:** Find your next teammate: thebriviaclub.live
**Image:** none (text).
