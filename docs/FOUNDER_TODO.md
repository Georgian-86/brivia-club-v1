# Founder to-do: SMTP, Google sign-in and everything else only you can do

Last updated 2026-10-14. Work top to bottom. Each item says where to click and how to check it worked.
Dashboards change their menu names from time to time; if a label differs, search the dashboard for the word in bold.

---

## 1. Custom email sending (SMTP) — blocks any real test

**Why:** Supabase's built-in sender allows about 2 emails an hour. Sign-ups stall after that.

### Option A (quick, today): Gmail with an app password

1. On the Google account that will send the mail, turn on **2-Step Verification** (myaccount.google.com → Security).
2. Create an **App password** (myaccount.google.com → Security → App passwords). Name it "Brivia Supabase". Copy the
   16-character password.
3. Supabase dashboard → project `wfbddovczpfdrspmxgfo` → **Authentication** → **Emails** → **SMTP Settings** →
   enable **Custom SMTP**:
   - Sender email: the Gmail address. Sender name: `Brivia Club`
   - Host `smtp.gmail.com`, Port `465`, Username: the Gmail address, Password: the app password.
4. Gmail sends at most ~500 emails a day. Fine for testing, not for launch.

### Option B (for launch): a transactional provider on your own domain

Use Resend, Postmark or SendGrid with a domain you own (for example `mail.yourdomain.com`):

1. Create the account, add the domain, and add the DNS records it shows (SPF, DKIM, and a DMARC record) at your
   domain registrar. Wait until the provider shows the domain as **verified**.
2. Create an SMTP credential / API key. For Resend: host `smtp.resend.com`, port `465`, username `resend`, password =
   the API key.
3. Paste them into Supabase → **Authentication** → **Emails** → **SMTP Settings** as in Option A, sender
   `no-reply@yourdomain.com`, name `Brivia Club`.

### Then, for either option

4. **Rate limit:** Supabase → **Authentication** → **Rate Limits** → raise **emails sent per hour** (for example 60).
5. **Email templates:** Supabase → **Authentication** → **Emails** → **Templates**.
   - Today's live site (email + password sign-up) uses **Confirm signup**. Give it Brivia wording; keep the
     `{{ .ConfirmationURL }}` link in it.
   - The new step-by-step signup (going live later) sends a 6-digit code. Put the code in **both** the **Magic Link**
     and the **Confirm signup** templates, for example:
     ```html
     <h2>Your Brivia Club code</h2>
     <p>Enter this code to continue: <strong style="font-size:24px;letter-spacing:4px">{{ .Token }}</strong></p>
     <p>It expires in one hour. If you didn't ask for it, ignore this email.</p>
     ```
     Do this switch **when the new signup goes live**, not before: today's site still needs the confirmation link.
6. **Code settings:** Supabase → **Authentication** → **Sign In / Providers** → **Email**: keep **Confirm email** on,
   and check **Email OTP length** is `6` and **Email OTP expiration** is `3600` seconds (the app assumes one hour).
7. **Check it:** sign up on `https://brivia-club.vercel.app` with a fresh address; the email arrives within a minute,
   from your sender name, and not in spam.

---

## 2. Google sign-in

### In Google Cloud (console.cloud.google.com)

1. Create (or pick) a project named `Brivia Club`.
2. **Google Auth Platform** (older UI: **APIs & Services → OAuth consent screen**):
   - **Branding:** app name `Brivia Club`, support email, logo optional, app home page
     `https://brivia-club.vercel.app`, privacy policy `https://brivia-club.vercel.app/privacy.html`.
   - **Audience:** user type **External**. While it says **Testing**, only the **Test users** you list can sign in:
     add every tester's Google address (up to 100). For launch, press **Publish app** (Google may ask for
     verification because of the logo and domain; basic `email`, `profile`, `openid` scopes don't need a security
     review).
   - **Data access / Scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` only.
3. **Clients** (older UI: **Credentials → Create credentials → OAuth client ID**): type **Web application**.
   - Authorized JavaScript origins: `https://brivia-club.vercel.app`
   - Authorized redirect URIs: `https://wfbddovczpfdrspmxgfo.supabase.co/auth/v1/callback`
   - Copy the **Client ID** and **Client secret**.

### In Supabase

4. **Authentication** → **Sign In / Providers** → **Google**: enable, paste the Client ID and Client secret, save.
5. **Authentication** → **URL Configuration**: Site URL `https://brivia-club.vercel.app`; Redirect URLs include
   `https://brivia-club.vercel.app/**`.
6. **Check it:** on the live site press **Continue with Google** with a test-user account; you land back in the app
   signed in. Then delete that account from Profile → Privacy to confirm the Google re-check on deletion works (this
   has never been tested live).

---

## 3. The new step-by-step signup (Phase E) — must be live before **3 November 2026**

It is finished on branch `claude/jolly-edison-49xvza`. Its database part (0009) is already live; the current site
keeps working only until 3 November. To go live:

1. Finish sections 1 and 2 above, including the `{{ .Token }}` templates.
2. **Decide the privacy-notice date:** `privacy.html` says the new notice takes effect **20 October**. Either deploy on
   or after 20 October, or tell me the deploy date and I change the page.
3. Vercel → project `brivia-club` → **Settings → Environment Variables**: add `VITE_SIGNUP_METHODS` for Production with
   `google,email` (or `google` if SMTP isn't ready, or empty to show "Signups open soon"). An empty value only hides
   the buttons: to really close sign-ups also turn off Supabase **Authentication → Sign In / Providers → Allow new users
   to sign up**.
4. Tell me "go" and I fast-forward `main`; Vercel deploys.
5. After deploy, one live check (I'll guide you): delete an account using an emailed code instead of a password.

---

## 4. Test world and data housekeeping

1. **Covers for test members:** run `supabase/seed/test-member-covers.sql` in the SQL editor (when I tell you it's
   ready; it only updates test members).
2. **The open-test-world switch is on.** Close it within about **6 nights**, or seeded members start counting toward
   real members' "~3 km" distances:
   `update public.brivia_world_switch set open_test_world = false, changed_at = now();`
3. **Before real launch:** close the switch and run `supabase/seed/purge-test-members.sql` (deletes all test members
   and everything tied to them).
4. Delete the stale QA user `brivia.qa.muzfgszm@maxxspace.com` (Authentication → Users).
5. Test-member passwords you set are for you only; anyone who signs in as a test member acts as that person.

---

## 5. Vercel

1. **Deployment Protection:** Vercel → project → **Settings → Deployment Protection**. If testers without a Vercel
   login can't open the site, set production to **no protection** (preview links can stay protected).
2. Optional: a custom domain (Settings → Domains). If you add one, also add it to Supabase URL Configuration and to
   the Google client's JavaScript origins.

---

## 6. Before letting real members in (not just invited testers)

The safety gate from the iteration-4 arena (`docs/arena/2026-10-07-iteration-4.md`, table "P0-C") is still open: for
example, suspending someone only after a second reporter corroborates a report. A closed test with people you invite
is fine; open public sign-ups are not, until P0-C ships.

---

## 7. Let my session test the live site

My cloud session's network policy blocks `brivia-club.vercel.app` and `wfbddovczpfdrspmxgfo.supabase.co`, so I can't
open the live site or create live accounts. In the session's title bar open the cloud environment menu → **Edit** →
**Network access**, and either choose a broader level or add these under **Allowed domains** (keep "Allow package
managers" ticked): `brivia-club.vercel.app`, `wfbddovczpfdrspmxgfo.supabase.co`, `fonts.googleapis.com`,
`fonts.gstatic.com`. Steps: https://code.claude.com/docs/en/cloud-environments#network-access
