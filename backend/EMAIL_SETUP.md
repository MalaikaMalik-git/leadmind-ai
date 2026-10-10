# Meeting-link email — setup and spam-proofing

After a **qualified** call (phone *or* web call) LeadMind books the next free slot and emails the lead
the meeting link. This file explains how to make sure that email lands in the **inbox**.

> Nobody can promise 100% inbox placement, but the steps below remove every reason a filter has to doubt the message.

## 1. Configure SMTP (2 minutes)

Add to `backend/.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.address@gmail.com
SMTP_PASS=<16-character Google App Password>
EMAIL_FROM_NAME=LeadMind AI
```

Gmail App Password: Google Account → Security → 2-Step Verification (turn on) → **App passwords** → create one.
Mail sent through Gmail's own SMTP is signed by Google (SPF + DKIM pass automatically), which is the
best option when you do not own a domain.

If SMTP is **not** configured, the system falls back to Google Calendar's own invitation (works, but is
more often filtered as "invitation from an unknown sender").

## 2. Test before the demo

```
cd backend
npm run email:test -- your.other.address@gmail.com
```

Open the message → ⋮ → **Show original**: you want `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`.
For a score, send one to the address shown on <https://www.mail-tester.com> (aim for 9/10+).

## 3. If you later send from your own domain (recommended for real use)

Use a transactional provider (Brevo, Resend, SendGrid, Amazon SES, Postmark) over SMTP and add DNS records
for the domain you send from:

| Record | Purpose |
|--------|---------|
| **SPF** (TXT) | lists the servers allowed to send for your domain |
| **DKIM** (TXT/CNAME) | cryptographic signature the provider gives you |
| **DMARC** (TXT `_dmarc`) | start with `v=DMARC1; p=none; rua=mailto:you@yourdomain.com` |

Then set `SMTP_*` to the provider's values and `EMAIL_FROM_ADDRESS=meetings@yourdomain.com`.
Use a dedicated sending subdomain (e.g. `mail.yourdomain.com`) and turn **off** open/click tracking in the provider.

## What the code already does for deliverability

- One transactional email per meeting (Google's own invite is suppressed when ours is sent — no duplicates)
- Plain-text **and** HTML parts, no images, no tracking pixels, no URL shorteners
- The meeting URL is shown as visible text (link text = real target)
- Normal subject line (no caps, emoji or "!!!"), sender name consistent, **Reply-To** = the admin's real inbox
- `.ics` calendar file attached
- Header-injection safe (names/emails are stripped of line breaks)
- If SMTP fails, or Google has not produced a Meet link yet, the lead still gets Google's invitation
- What happened is stored on each meeting (`invite.channel` = `smtp` | `google` | `none`)

## Tips that matter more than any code

- Warm up: send a few real emails from the new address before the live demo.
- Ask the lead to reply "OK" or add you to contacts — a reply is the strongest "not spam" signal.
- Lead email must be correct — the web-call form requires it; for phone campaigns include an `email` column in the CSV.
