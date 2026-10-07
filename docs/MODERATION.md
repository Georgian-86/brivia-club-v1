# Moderation routine (daily)

**Run every statement here in the Supabase SQL editor as the owner (`postgres`).** The moderation tables
(`member_report`, `member_flag`, `moderation_tombstone`, `moderation_pepper`) are owner-only: no member and no client can
read or write them. Nothing here is automated. Nothing alerts you to a new report, so this check is the only way reports
get read.

Why it is daily: `privacy.html` promises "We aim to read every report" and "We review every under-18 report within 72
hours". One qualifying under-18 report hides the member from everyone at once (`suspended_pending_review`, see
`docs/ORBIT_ENGINE.md` §7). The member sees only "Your profile is being reviewed. This usually takes up to 72 hours."
(`app.js`, final fix F2). A wrong report therefore hides an adult until you act.

Rules:
- **Never contact a reported member in a way that reveals who reported them.** Do not name the reporter, quote the note,
  or show messages only the reporter could have seen. The reported member is never told who reported them
  (`privacy.html`).
- Do not copy evidence out of the database except to keep an image (step 3). Report rows and evidence are purged after
  365 days.
- If anyone is in immediate danger, call 112 first.
- Record decisions that set a precedent (a confirmed under-18 account, a removal) in `docs/DECISIONS.md`.

## 1. New reports (since your last check)

Read-only. Newest first. Change the interval to cover the time since your last check.

```sql
select r.id, r.created_at, r.reason, r.qualifying,
       r.target_id, t.name as target_name,                -- null name: the target has deleted their account
       r.reporter_id is null as reporter_deleted,
       jsonb_array_length(r.evidence) as evidence_messages,
       left(r.note, 160) as note,
       f.reason as target_flag, f.expires_at as target_flag_expires
  from public.member_report r
  left join public.profiles t on t.id = r.target_id
  left join public.member_flag f on f.member_id = r.target_id
 where r.created_at > now() - interval '2 days'
 order by r.created_at desc;
```

`qualifying` is true when the reporter is completed, in the same world, at least 7 days old and has been in touch with
the target. Only qualifying reports raise flags. A non-qualifying report still deserves a read.

## 2. Current flags

Read-only.

```sql
select f.member_id, p.name, f.reason, f.flagged_at, f.expires_at,
       (select count(*) from public.member_report r where r.target_id = f.member_id) as reports_about
  from public.member_flag f
  left join public.profiles p on p.id = f.member_id
 order by f.flagged_at desc;
```

| reason | Set by | Effect | Expires |
|---|---|---|---|
| `suspended_pending_review` | a qualifying `underage` report | the member is hidden from everyone (not completed) | never: only you lift it |
| `reported` | 2+ distinct qualifying reporters in 30 days | left out of the k-anonymity count | 90 days (nightly purge) |
| `rejoin_review` | `declare_adult`, when a live tombstone matches the new account's email | left out of the k-anonymity count | never: only you clear it |
| `restricted` | you (step 5) | left out of the k-anonymity count; **does not hide the member** | never |

A member has at most one flag row. A later under-18 report replaces only `reported` and `rejoin_review`. It never
replaces `restricted`, so check step 1 for `underage` reports about restricted members.

## 3. The suspension queue (72-hour promise)

Read-only. Work the oldest first. `overdue` must be false for every row.

```sql
select f.member_id, p.name, f.flagged_at,
       round(extract(epoch from now() - f.flagged_at) / 3600) as hours_waiting,
       now() - f.flagged_at > interval '72 hours' as overdue,
       (select count(*) from public.member_report r where r.target_id = f.member_id and r.reason = 'underage') as underage_reports
  from public.member_flag f
  left join public.profiles p on p.id = f.member_id
 where f.reason = 'suspended_pending_review'
 order by f.flagged_at;
```

Read the evidence of one report (the text of the last 50 messages of the pair, newest first; `from_me` is the reporter's
side):

```sql
select id, created_at, reason, note, jsonb_pretty(evidence) as evidence
  from public.member_report where id = 123;   -- the report id from step 1
```

Evidence keeps only an `attachment_path` for images (bucket `message-attachments`). Open it in Dashboard → Storage while
you review. The image disappears if its owner deletes it or their account, so download a copy at once if you will need
it.

## 4. Rejoin reviews (a tombstone match)

Read-only. Shows each `rejoin_review` member with the deleted account's reasons and report ids. The tombstone holds only
a keyed digest of the old email, never the address.

```sql
select f.member_id, p.name, f.flagged_at, t.reasons, t.report_ids, t.deleted_at, t.expires_at
  from public.member_flag f
  join public.profiles p on p.id = f.member_id
  join auth.users u on u.id = f.member_id
  join public.moderation_tombstone t on t.digest = public.brivia_email_digest(u.email)
 where f.reason = 'rejoin_review';
```

Then read those earlier reports: `select id, created_at, reason, note from public.member_report where id = any('{1,2}'::bigint[]);`
(they may already be purged after 365 days).

## 5. Decide and act (one member at a time)

Replace the uuid. Each statement changes only that member's flag row.

- **Lift a suspension** (the under-18 report was wrong): the member becomes visible again at once.
  ```sql
  delete from public.member_flag where member_id = '00000000-0000-0000-0000-000000000000' and reason = 'suspended_pending_review';
  ```
- **Clear a flag** (`reported` or `rejoin_review` after review):
  ```sql
  delete from public.member_flag where member_id = '00000000-0000-0000-0000-000000000000' and reason in ('reported', 'rejoin_review');
  ```
- **Restrict** (confirmed abuse that does not need hiding: keeps them out of density counts, never expires). **This
  replaces any flag the member has, including a suspension, so a suspended member becomes visible again.** Do not use it
  on a member who must stay hidden.
  ```sql
  insert into public.member_flag (member_id, reason, expires_at)
  values ('00000000-0000-0000-0000-000000000000', 'restricted', null)
  on conflict (member_id) do update set reason = 'restricted', flagged_at = now(), expires_at = null;
  ```
- **Confirmed under-18:** leave `suspended_pending_review` in place (it never expires, so the member stays hidden). Record
  the decision in `docs/DECISIONS.md` and decide the account's removal there. There is no operator deletion statement
  in this runbook.

## 6. Monthly: career resumes

`purge_expired_requests()` deletes `career_applications` rows older than 180 days each night, but never Storage files.
Once a month, list resume files older than 180 days (read-only) and delete them in Dashboard → Storage →
`career-resumes`:

```sql
select name, created_at from storage.objects
 where bucket_id = 'career-resumes' and created_at <= now() - interval '180 days'
 order by created_at;
```
