# Brivia Club: personal-data breach runbook

Use this when you suspect or confirm that member data was accessed, lost, altered or disclosed without permission.
Keep it open and fill the log as you go. Short lines on purpose: you will be stressed.

> **Every statutory deadline below is "to confirm with counsel".** The citations came from arena critics and have not been
> verified against the current Acts and Rules. Treat the deadlines as the strictest plausible reading until counsel confirms.

## 0. Owner and contacts

- **Incident owner:** the founder. One owner, one decision log.
- **Grievance inbox:** thebrivia.club@gmail.com (2FA must be on, see section 3).
- **Emergency (a member is in danger):** 112.
- **Supabase project:** `wfbddovczpfdrspmxgfo`. **Hosting:** Vercel. **Code:** GitHub.
- **Counsel:** `[fill in name and phone before you need them]`

## 1. Decision log (copy per incident)

Write every decision with the time you made it (IST, 24 h). Never edit old lines; append.

```
Incident id:            BR-YYYYMMDD-01
Detected at (IST):
Detected by / how:
Owner:                  founder

| Time (IST) | Who | Decision or action | Why | Evidence kept (where) |
|---|---|---|---|---|
|            |     |                    |     |                       |
```

Clock starts at **detection** (when you first have reason to believe it happened). Write that time first.

## 2. First-hour checklist

- [ ] Write the detection time in the log. Start the log.
- [ ] Do not delete anything. Do not "clean up". Evidence first.
- [ ] Pause the purge job (section 3) so nothing is erased.
- [ ] Take screenshots or exports: Supabase logs, auth logs, Vercel logs, GitHub audit, the alert itself.
- [ ] Contain: rotate secrets (section 3), starting with whatever was exposed.
- [ ] Note who else knows. Tell them not to discuss it outside this log.
- [ ] Start the assessment (section 4).
- [ ] Put the **CERT-In 6-hour** time in the log as an absolute clock time *[confirm with counsel]*.
- [ ] Call counsel.

## 3. Containment

### 3.1 Pause the purge cron (preserves evidence)

The nightly job `brivia-purge-expired-requests` deletes expired requests. Pause it so nothing relevant is erased.
Run in the Supabase SQL editor (as `postgres`):

```sql
select cron.unschedule('brivia-purge-expired-requests');
```

Confirm it is gone:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

**Restore when the incident is closed** (re-creates all nightly jobs; each is unscheduled by name first, so no duplicates):

```sql
select public.brivia_schedule_nightly_jobs();
```

Log the pause and the restore with times.

### 3.2 Rotate secrets (in this order, adjust to what leaked)

- [ ] **JWT secret** (Supabase, Project Settings, API/JWT). **This signs every member out.** Expect support mail.
- [ ] **Service-role key** (anon key changes with the JWT secret; update `VITE_SUPABASE_ANON_KEY`).
- [ ] **Database password** (Project Settings, Database).
- [ ] **Vercel environment variables:** update `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, then redeploy.
- [ ] **GitHub tokens:** personal access tokens, deploy keys, Actions secrets, Vercel-GitHub integration.
- [ ] Revoke unknown sessions and collaborators (GitHub, Vercel, Supabase organisation members).
- [ ] **Confirm 2FA is on** for thebrivia.club@gmail.com, and for the Supabase, Vercel and GitHub accounts.
- [ ] Reset the grievance inbox password if it may be exposed.

Never paste secrets into this document, the log or chat.

### 3.3 Storage check (orphaned files)

Run the orphan report (section 7) and keep the output with the evidence.

## 4. Assessment

Answer each in the log. "Unknown" is a valid answer; say what you are doing to find out.

- [ ] **What happened?** (access, loss, alteration, disclosure; accidental or malicious)
- [ ] **Which data?** Tables, buckets, auth data. Name them.
  - `profiles`, `member_interest`, `member_orbit`, `messages`, `requests`, `matches`, `blocks`, posts, event logs
  - Storage: `profile-photos`, `profile-covers`, `message-attachments`, `community-posts`
  - Auth: emails, phone numbers (never exposed to other members by design)
- [ ] **How many members?** Count them. Include deleted and test members separately.
- [ ] **Is location involved?** Remember: **only a coarse cell (about 2 km square) is stored, never coordinates**, and
  the app shows rounded distances. Say so plainly in notices, and do not overstate or understate.
- [ ] **Sensitive content?** Private interests, messages, photos, any report or block content.
- [ ] **Children?** The service is 18+. If a minor's data is involved, tell counsel at once.
- [ ] **When** did it start and stop? Is it still happening?
- [ ] **Likely harm** to members (stalking, impersonation, phishing, embarrassment).
- [ ] **Decision:** reportable or not, and who decided. If unsure, treat as reportable until counsel says otherwise.

## 5. Notifications

Order: CERT-In, Board, members, processors. Prepare all four notices in parallel. Log the send time of each.

| Who | Deadline (to confirm with counsel) | How |
|---|---|---|
| CERT-In | Within **6 hours** of noticing | incident@cert-in.org.in |
| Data Protection Board of India | Intimation **without delay**; detailed report within **72 hours** | Board's prescribed channel `[confirm with counsel]` |
| Affected members | Without delay, plain language | Email from thebrivia.club@gmail.com |
| Processors (Supabase, Vercel) | Immediately | Their support or security contacts |

If you do not have all facts, send what you know and say what is still being checked. A late complete notice is worse
than a timely partial one *[confirm with counsel]*.

### 5.1 Template: CERT-In (6 hours) *[confirm with counsel]*

```
To: incident@cert-in.org.in
Subject: Cyber incident report: Brivia Club (thebrivia.club)

Organisation: Brivia Club (location-first, interest-matched networking for adults, India)
Reporter: [name], founder; thebrivia.club@gmail.com; [phone]
Incident id: BR-YYYYMMDD-01
Time of detection (IST): [ ]
Time incident began (IST, if known): [ ]
Type of incident: [unauthorised access / data exposure / credential leak / defacement / other]
Systems affected: Supabase project (Postgres, Auth, Storage), Vercel hosting, GitHub repository [edit]
Data affected: [categories]; approx. [N] members; location data: coarse ~2 km cell only, no coordinates
Impact and status: [ongoing / contained at HH:MM IST]
Actions taken so far: [e.g. purge job paused, JWT secret and keys rotated at HH:MM]
Indicators (IPs, accounts, timestamps, log excerpts): [attach]
Next update: [time]
```

### 5.2 Template: Data Protection Board of India *[confirm with counsel: form, channel, content]*

Part A, **intimation without delay**:

```
Subject: Intimation of personal data breach: Brivia Club
Data Fiduciary: Brivia Club, [legal entity / founder name], thebrivia.club@gmail.com
Incident id: BR-YYYYMMDD-01
Date and time of detection (IST): [ ]
Brief description of the breach (nature, extent, timing): [ ]
Categories of personal data: [ ]
Approx. number of Data Principals affected: [ ]
Likely consequences: [ ]
Measures taken or proposed to mitigate: [ ]
Contact: [name, email, phone]
A detailed report will follow within 72 hours [confirm with counsel].
```

Part B, **detailed report within 72 hours** *[confirm with counsel]*:

```
Incident id: BR-YYYYMMDD-01
1. Nature, extent and timing of the breach (timeline from the decision log):
2. Cause and how it was discovered:
3. Personal data and Data Principals affected (categories, counts, location data: coarse cell only):
4. Likely consequences for affected members:
5. Mitigation and containment (what, when, by whom):
6. Findings of the investigation so far, and what is still unknown:
7. Notices sent: members [date/time], CERT-In [date/time], processors [date/time]:
8. Steps to prevent recurrence:
9. Contact for the Board:
```

### 5.3 Template: affected members (plain language, no jargon)

Include all seven: what happened, how much, when, likely consequences, what we did, what you can do, who to contact.

```
Subject: Important: a security incident affecting your Brivia Club account

Hello [first name],

We are writing to tell you about a security incident at Brivia Club.

What happened: [one or two plain sentences].
What it involved: [exactly which of your details, for example profile text, interests, messages, photos, email].
Your exact location was not involved: we never store coordinates, only a coarse area about 2 km across.
[Edit this line to match the facts; remove it if location was involved and say so instead.]
When: it happened between [date/time] and [date/time]. We found it on [date].
What this could mean for you: [likely consequences, for example unwanted messages or phishing emails pretending to be us].
What we have done: [contained it, changed our keys, signed everyone out, reported it to the authorities as required].
What you can do:
  - Sign in again (you may have been signed out) and change your password.
  - Be careful with messages that ask for money, codes or passwords. We will never ask for these.
  - Use a different password here from other sites.
  - [Add anything specific to this incident.]
Questions or concerns: write to thebrivia.club@gmail.com. If you feel unsafe, call 112.
You may also complain to the Data Protection Board of India.

We are sorry. We will keep you informed.
[Name], founder, Brivia Club
```

### 5.4 Template: processors (Supabase, Vercel)

```
To: [Supabase / Vercel security or support contact]
Subject: Security incident, project [wfbddovczpfdrspmxgfo / Vercel project name]

We are investigating a personal-data incident affecting our project. Incident id: BR-YYYYMMDD-01.
Detected at (IST): [ ]. Account/org: [ ]. Contact: [name, phone, email].
Please: (1) preserve logs and backups for the period [ ] to [ ]; (2) tell us of any access to our project from
unfamiliar addresses; (3) tell us what you can share for our regulator report; (4) tell us if you see platform-side causes.
```

## 6. After the incident

- [ ] Restore the purge job: `select public.brivia_schedule_nightly_jobs();` and confirm with `select jobname from cron.job;`.
- [ ] Write the post-incident review in the log: cause, timeline, what worked, what to change.
- [ ] Ask the controller or founder to append a decision to `docs/DECISIONS.md`.
- [ ] Re-check the privacy notice (`privacy.html`) if what we collect or retain changed.
- [ ] Keep the log and evidence. Retention period: *[confirm with counsel]*.

## 7. Nightly orphan-folder report (read-only)

Member files live under a folder named after the member's `auth.users` id. After an account is deleted, files can be left
behind (the database cannot delete storage files; see `supabase/seed/README.md`). This lists storage objects in the four
member buckets whose first folder is **not** a current auth user. Run it nightly in the SQL editor (or any time during an incident).
It changes nothing.

```sql
select o.bucket_id,
       (storage.foldername(o.name))[1] as first_folder,
       count(*)                        as objects,
       min(o.created_at)               as oldest,
       max(o.created_at)               as newest
from storage.objects o
where o.bucket_id in ('profile-photos', 'profile-covers', 'message-attachments', 'community-posts')
  and not exists (
    select 1 from auth.users u
    where u.id::text = (storage.foldername(o.name))[1]
  )
group by o.bucket_id, (storage.foldername(o.name))[1]
order by newest desc;
```

How to read it:
- No rows: nothing orphaned.
- Rows: each is a folder with no matching member. Remove the files through the Storage dashboard or API (never by SQL).
- A first folder that is not a UUID at all (for example a stray root file) also shows up. Look at it before deleting.
- During a breach, keep the output with the evidence before removing anything.
