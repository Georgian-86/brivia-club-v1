# Brivia Club auth emails

Branded HTML for the Supabase Auth email templates (deep wine on cream, as the site). Each file is pasted whole into
**Supabase dashboard → Authentication → Emails → Templates** (project `wfbddovczpfdrspmxgfo`). Supabase fills the
`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}` and `{{ .NewEmail }}` placeholders.

| Template in the dashboard | File | Subject |
|---|---|---|
| Confirm signup | `confirm-signup.html` | Confirm your email for Brivia Club |
| Magic link | `magic-link.html` | Your Brivia Club sign-in link |
| Reset password | `reset-password.html` | Reset your Brivia Club password |
| Change email address | `change-email.html` | Confirm your new Brivia Club email |
| Invite user | `invite.html` | You're invited to Brivia Club |
| Reauthentication | `reauthentication.html` | Your Brivia Club confirmation code |

Only *Confirm signup* is sent by the app today (`signUp` in `site/scripts/script.js`); the others are branded so any
email Supabase sends looks like Brivia.

## Custom SMTP (Gmail app password)

**Authentication → Emails → SMTP Settings → Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `briviaclub@gmail.com` |
| Sender name | `Brivia Club` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `briviaclub@gmail.com` |
| Password | the 16-letter Google app password, **without spaces** (never commit it) |
| Minimum interval between emails | 60 seconds (default) |

Then **Authentication → Rate Limits**: raise "emails sent per hour" from the built-in 2 (it only applies without custom
SMTP) to about 30. Gmail itself allows roughly 500 messages a day from a personal account; move to a domain sender
(for example Resend or Google Workspace on a brivia domain) before a public launch, so mail is less likely to land in
spam.

Check: sign up with a fresh address on https://brivia-club.vercel.app/auth.html#signup; the mail should come from
"Brivia Club" with the wine header, and its button should land back on `/auth.html`.

Rotate: delete the app password at myaccount.google.com/apppasswords, create a new one, paste it into SMTP Settings.
