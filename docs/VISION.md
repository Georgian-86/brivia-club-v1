# Brivia Club: vision and non-negotiables

*Owner: founding team. Last updated 2026-10-02. Change only with a matching entry in `DECISIONS.md`.*

## One line

**Find the people near you who love what you love, and the rare people far away who are worth the distance.**

## The problem

Interest-based networking today forces a bad trade-off:

- **Social and dating apps** are proximity-first, but they match on looks and vibes rather than on deep shared interests.
- **Professional networks** (LinkedIn and similar) are interest- and career-aware but location-blind. The best
  "match" is often 2,000 km away and useless for meeting up on a Sunday.
- **Communities and groups** (Discord, WhatsApp, Meetup) gather around interests, but nothing matches *people to
  people* and nothing explains why two people should meet.

## What Brivia does differently

| Principle | What it means in the product |
|---|---|
| **Interests are the currency** | Every member declares interests with intensity (Passion Budget) and a mode (learn / play / teach / build). Matching runs on these. |
| **Location first** | The feed fills from concentric Proximity Rings: neighbourhood, city, region, state, country, world. Near beats far at equal fit. |
| **Distance must be earned** | A far person enters your feed only if the resonance clears that ring's escape-velocity threshold. These cards are labelled "Worth the distance". |
| **Search is unrestricted** | Search is intent-driven, so it can reach anyone, anywhere. You can send a Long-Range Request to someone far away. |
| **Mutual consent** | A connection opens only after a mutual like or an accepted request. |
| **Explain every match** | Every card says why, using real evidence: shared rare interests, teach↔learn fit, "~3 km away". It never invents a reason. |
| **Privacy by design** | Only a coarse location cell is stored for matching. Other members see rounded distance, never coordinates, email or phone. |
| **Adaptive to sparse places** | In a small town the local rings widen automatically, so the feed is never empty and never silently global. |

## Who it's for (initial)

Students and young professionals in Indian cities (the current member base and assets are India-centric), who want
to meet people around shared interests: sports partners, jam sessions, study groups, co-builders, hobby communities.
The builder and team-formation use case from the older `brivia-club` strategy is **one interest mode (`build`)**,
not the whole product.

## Core user flows

1. **Onboard:** name, photo, coarse location (city pick or browser geolocation snapped to a cell), up to 12 interests,
   20 passion points spread across them, a mode per interest, and availability windows.
2. **Discover (feed / swipe deck):** ORBIT-ranked, ring-ordered, with at most 2 "Worth the distance" cards a day.
3. **Search:** free text plus filters (interest, city, mode). Results can be anywhere, show coarse distance, and offer
   *Request* on far people.
4. **Connect:** mutual like, or an accepted request, opens chat with icebreakers built from the shared interests.
5. **Learn:** every like, pass, request and reply updates the member's taste model and improves the next feed.

## Success metrics (first 90 days of beta)

- % of new members with ≥3 local (ring ≤ 1) matches within 7 days
- Like-back rate on ring 0–1 cards vs "Worth the distance" cards. Far cards should not convert worse; if they do, the threshold is too low.
- Long-range request acceptance rate (target > 30%; lower means spammy, so tighten the quota)
- Chat started within 48 h of connecting
- Members who meet IRL (self-reported, in-chat prompt), the real north star

## Out of scope for now

Dating features, paid boosts that bypass the gate (a pay-to-escape gate would destroy the trust in "Worth the distance"),
public follower counts, exact-location maps of members.
