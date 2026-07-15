# Iman Hindawi — Website + Admin Dashboard

A personal website (Actress · Entrepreneur · Philanthropist) with a password-protected
admin dashboard for editing all text and images. Content is stored in `data/content.json`
and uploaded images in `public/assets/uploads/`.

## Run

```powershell
cd C:\Users\USER\personal-portfolio
npm install       # first time only
npm start
```

Then open:

- **Website** → http://localhost:3000
- **Dashboard** → http://localhost:3000/admin

## Login

Sign in with **email + password**:

- Email: **`i.alhindawi5@gmail.com`**
- Password: **`iman-admin`**  (change it any time via *Reset password*)

The owner account is created automatically on first run from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` (defaults above). Passwords are stored **hashed** (scrypt) in
`data/auth.json` — never in plain text.

## Contact form & messages

The public site has a **contact form**. When a visitor submits it:

1. The message is saved to `data/messages.json`.
2. It appears in the **Messages** inbox in the dashboard (with an unread badge that
   auto-refreshes every 30s). You can mark read/unread, reply (opens your mail app),
   or delete.
3. A **notification email** is sent to the owner's address (or `NOTIFY_EMAIL` if set),
   with the visitor's address as *reply-to* so you can respond directly.

Email delivery uses the same Gmail setup as password reset (see below). Without it,
new messages still save and show in the dashboard; the notification is printed to the
server console instead.

## Admin users

In the dashboard, the **Admin Users** panel lets you add or remove people who can
sign in and edit the site. New users log in with their own email + password. The
owner account cannot be deleted, and you cannot delete yourself.

## Reset password (email verification code)

Use **Forgot password?** on the login screen, or **Reset password** in the dashboard:

1. Enter your email → a 6-digit code is sent.
2. Enter the code + a new password → done.

### Enabling real emails

By default the app runs in **dev mode** and shows the code on screen / in the server
console. To email codes for real via Gmail, create an **App Password**
(Google Account → Security → 2-Step Verification → App passwords) and start with:

```powershell
$env:GMAIL_USER = "i.alhindawi5@gmail.com"
$env:GMAIL_APP_PASSWORD = "your-16-char-app-password"
npm start
```

## What you can edit in the dashboard

- **Hero** — eyebrow, first/last name, tagline
- **Intro** paragraph
- **Actress / Entrepreneur / Philanthropist** — index label, title, body, list items, CTA, and **image upload**
- **Quote** and attribution
- **Contact** — heading, sub text, email, and social links

Click **Save changes** to write everything to `data/content.json`. The public site reads
from the same file, so changes appear on the next page refresh.

## Project structure

```
personal-portfolio/
├─ server.js            Express server + content/upload API
├─ data/content.json    All editable content (the "database")
├─ public/              The public website (index.html, styles.css, script.js)
│  └─ assets/uploads/   Uploaded section images
└─ admin/               The dashboard (index.html, admin.css, admin.js)
```
