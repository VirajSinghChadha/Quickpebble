# Setting up accounts (one time, about 15 minutes)

Accounts run on Supabase (project `vlhttxrenggbmpsrgmpm`). The app and the admin site only ever hold the
public *publishable* key. Two secrets live on Supabase and must **never** go in chat, the repo or the app:

- `KEY_ENC_SECRET`: encrypts users' saved API keys. **If you lose it, every saved key becomes unreadable** (users would just re-enter theirs). Save it in your password manager first.
- `ADMIN_CODE`: the code you type on the admin page. Use 16+ characters.

Run these in Terminal from the repo folder (`Quickpebble`).

## 1. Database and functions

```bash
npx supabase login
npx supabase link --project-ref vlhttxrenggbmpsrgmpm
npx supabase db push
```

Make the encryption secret, copy it into your password manager, then store it on Supabase:

```bash
openssl rand -base64 32
```

```bash
read -s -p "Paste the secret: " S && npx supabase secrets set KEY_ENC_SECRET="$S"; unset S
```

```bash
read -s -p "Choose an admin code: " A && npx supabase secrets set ADMIN_CODE="$A"; unset A
```

```bash
npx supabase functions deploy account
npx supabase functions deploy admin
```

## 2. Emails must show the code (dashboard)

Supabase's default emails contain a link, not a code. In **Authentication → Emails → Templates** edit
**both** "Confirm sign up" (new users) and "Magic Link" (returning users). Put this in the body:

```html
<h2>Your Quick Pebble code</h2>
<p>Enter this code in the app: <strong>{{ .Token }}</strong></p>
```

## 3. Sending more than a few emails an hour (Brevo)

1. Sign up at brevo.com and verify your email.
2. **Senders & IP → Senders**: add an address you can open and confirm it.
3. **SMTP & API → SMTP**: generate an SMTP key (keep it private).
4. Supabase: **Authentication → Emails → SMTP Settings**: enable custom SMTP and enter Brevo's host (`smtp-relay.brevo.com`), port `587`, your Brevo login, the SMTP key, and the sender address.

## 4. The website and admin panel

The `site/` folder is plain static files. In Cloudflare: **Workers & Pages → Create → Pages → Upload assets**,
drag the `site` folder in, and deploy. The admin panel is at `/admin.html`. Create your first beta code there.

## 5. Check it works

1. Open the admin page, enter the admin code, create a code.
2. Open the app, enter your email, type the emailed code, then your name and the access code.
3. Settings → AI → save a Gemini key. Sign out and in again: the key comes back.
