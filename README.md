# AURA Construction — website + Firebase backend

Static website (HTML/CSS/JS) with a Firebase backend:

| Piece | Firebase service | What it does |
|---|---|---|
| Quote form | Firestore `inquiries` | Visitors can **create** an inquiry, nobody but the admin can read it |
| Projects section | Firestore `projects` + Storage | Public can read; only the admin can add/edit/delete + upload photos |
| Admin panel (`/admin`) | Authentication | Email + password sign-in, restricted to UIDs listed in `admins` |
| Hosting | Hosting | HTTPS + security headers (CSP, HSTS, etc.) |

## Folder structure

```
aura-portfolio/
├── index.html                  public site
├── admin/
│   ├── index.html              admin panel (login, inquiries, projects)
│   ├── admin.js
│   └── admin.css
├── assets/
│   ├── css/styles.css
│   ├── img/                    logo-dark / logo-light / favicon (+ ceo.jpg later)
│   └── js/
│       ├── firebase-config.js  ← YOUR Firebase config goes here
│       ├── firebase-init.js    shared bootstrap (+ optional App Check)
│       ├── firebase-sdk.js     Firebase SDK, bundled locally (no CDN)
│       ├── main.js             public-site logic (projects, quote form)
│       ├── hero3d.js           3D construction scene
│       └── three.min.js        Three.js, self-hosted
├── firebase.json               hosting config + security headers
├── firestore.rules             database security rules
├── firestore.indexes.json
└── storage.rules               photo-upload security rules
```

## Setup (about 20 minutes)

### 1. Create the Firebase project
1. <https://console.firebase.google.com> → **Add project** (e.g. `aura-construction`).
2. **Project settings → General → Your apps → Web (`</>`)** → register an app → copy the `firebaseConfig` values into `assets/js/firebase-config.js`.
3. Also set `WHATSAPP_NUMBER` in that file (digits only, e.g. `94771234567`). It updates every WhatsApp button.

### 2. Turn on the services
- **Build → Authentication → Sign-in method** → enable **Email/Password** only.
- **Build → Firestore Database** → *Create database* → **Production mode** (the real rules are deployed in step 4).
- **Build → Storage** → *Get started*. (As far as I know, Firebase now requires the pay-as-you-go **Blaze** plan to use Cloud Storage; it has a free allowance. Please check this in your console, and set a **budget alert** — see the hardening list.)

### 3. Create the admin account
1. **Authentication → Users → Add user** → the client's email + a long, unique password.
2. Copy that user's **User UID**.
3. **Firestore → Start collection** `admins` → Document ID = **the UID** → add any one field (e.g. `role: "owner"`).

That document is the *only* thing that makes someone an admin. The rules do not let any client write to `admins`, so it can only be changed from the console.

### 4. Deploy rules + site
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy             # rules (Firestore + Storage) + hosting
```
On the first deploy Firebase may ask permission to let Storage rules read Firestore (needed for the admin check) — answer **yes**.

### 5. Custom domain
Firebase Console → **Hosting → Add custom domain** → follow the DNS records it shows. HTTPS certificates are automatic.

### 6. Add your domain to Auth
**Authentication → Settings → Authorized domains** → add your real domain (the `.web.app` one is there by default).

## Testing locally
ES modules do **not** work from `file://`. Run a tiny server instead:
```bash
npx serve .            # or:  python3 -m http.server 8080
```
Then open `http://localhost:3000` (or `:8080`). `localhost` is already an authorized Auth domain.

## Security model

**Everything the browser can do is controlled by the rules, not by the JavaScript.** Anyone can read the JS and call the Firebase API directly, so the rules are the real security.

| Threat | Defence |
|---|---|
| Stranger reads customer inquiries (names, phones) | `inquiries` readable only by admins (`firestore.rules`) |
| Stranger edits/deletes projects or uploads files | Writes require UID in `/admins`; Storage rules check the same + image type + 5 MB cap |
| Someone creates their own account and "logs in" | They can't: every privileged rule needs a UID listed in `/admins`, which only you can edit |
| Junk / oversized / malformed inquiries | Rules enforce exact field list, lengths, phone/email format, `status == 'new'`, server timestamp |
| Bots spamming the form | Honeypot field + 1-min / 5-per-day browser cooldown + **App Check** (see below) |
| XSS via stored data | All database content is written with `textContent`; image URLs must start with the project's Storage host |
| XSS / script injection in general | Strict CSP: only `'self'` scripts (Firebase + Three.js are bundled locally), no inline scripts/styles, no `eval` |
| Clickjacking | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Downgrade / sniffing | HSTS, `X-Content-Type-Options: nosniff`, `upgrade-insecure-requests` |
| Stolen admin session | Session ends when the tab closes; auto sign-out after 15 min idle; `Cache-Control: no-store` on `/admin` |
| Password guessing | Generic error message, 5-failure client lockout, Firebase's own throttling |
| Location leaks from site photos | Every upload is re-encoded in the browser, which strips EXIF/GPS data |
| Search engines indexing the admin page | `noindex` meta + `X-Robots-Tag` |

## Hardening checklist (do these before launch)

- [ ] **Enable App Check** — Firebase Console → App Check → register the web app with **reCAPTCHA v3** → paste the *site key* into `APP_CHECK_SITE_KEY` in `firebase-config.js` → after confirming the site works, click **Enforce** for Firestore and Storage. This is what stops scripts that bypass your website.
- [ ] **Authentication → Settings → User actions** → disable **"Enable create (sign-up)"** so nobody can register accounts at all (they would be harmless, but there's no reason to allow it).
- [ ] **Set a budget alert** (Google Cloud → Billing → Budgets) so abuse can never become a surprise bill.
- [ ] Use a **unique 16+ character password** for the admin, stored in a password manager. For two-factor sign-in, upgrade Authentication to **Identity Platform** (Firebase Console prompts you) and enable MFA.
- [ ] Keep admin accounts to the minimum (1–2 people). Inquiries contain personal data.
- [ ] Add a short privacy note / contact policy to the site (Sri Lanka's Personal Data Protection Act applies to businesses holding customers' details).
- [ ] After launch, check **Firestore → Usage** and **Authentication → Users** occasionally for anything odd.

## Known limits (be aware)
- **No server-side rate limiting.** Firestore rules can't count requests. The browser cooldown is only a courtesy; **App Check** is the real control. If spam ever becomes a problem, the next step is a Cloud Function in front of the form (and reCAPTCHA verification), which requires the Blaze plan.
- The `*.web.app` / `*.firebaseapp.com` addresses keep working alongside your custom domain.
- Fonts still load from Google Fonts (allowed in the CSP). They can be self-hosted later if you want zero third-party requests.

## Quick customisation
- **Phone / address / email** — `index.html` → *Contact* section (the phone number is also the `tel:` link).
- **CEO photo & name** — save the photo as `assets/img/ceo.jpg`, then follow the comment in `index.html` (About section).
- **Projects** — add them from `/admin`; until the first one exists, the site shows the six placeholder cards.

## After deploying — 5-minute test
1. Submit the quote form → the inquiry appears in **Firestore → inquiries** and in `/admin`.
2. In a private window, try to read `inquiries` or open `/admin` → no data without signing in.
3. Sign in with a *different* Firebase user that is **not** in `admins` → must be rejected.
4. Add a project with a photo in `/admin` → appears on the public site.
5. Firebase Console → **Firestore → Rules → Rules Playground**: simulate an unauthenticated `get` on `/inquiries/x` → must be **denied**.

---

## Hosting on GitHub Pages instead of Firebase Hosting

The site is fully static, so GitHub Pages works. Firebase still provides the backend (Auth, Firestore, Storage) — only the *hosting* changes.

1. Create a GitHub repo and push this folder (the `.gitignore` already blocks secret files).
2. Repo → **Settings → Pages** → *Deploy from a branch* → `main` / `(root)` → Save. The site appears at `https://USERNAME.github.io/REPO/`.
3. **Add that domain to Firebase** — Authentication → Settings → **Authorized domains** → add `USERNAME.github.io`. (Without this, admin login fails.)
4. If you enabled App Check, add `USERNAME.github.io` (or your custom domain) to the allowed domains of your reCAPTCHA key.
5. Deploy only the rules (not hosting):
   ```bash
   firebase deploy --only firestore:rules,storage
   ```
6. Optional custom domain: Settings → Pages → *Custom domain* + the DNS records GitHub shows, then tick **Enforce HTTPS**.

**What changes on GitHub Pages**
- GitHub can't send custom HTTP headers, so `firebase.json` headers don't apply. The Content-Security-Policy and referrer policy are therefore also set with `<meta>` tags in both pages, so those protections still work.
- Not possible on Pages: `X-Frame-Options` / `frame-ancestors` (clickjacking protection), HSTS (GitHub enforces HTTPS itself), and `no-store` caching on `/admin`. Your data stays protected by the Firestore/Storage rules and sign-in — the missing headers only reduce defence-in-depth. If you want all of them, use Firebase Hosting (also free) for the client site.
- The repo can be public: `firebase-config.js` holds identifiers, not secrets. **Never commit** a service-account JSON or passwords.

---

## Hosting on Vercel

Works great — Vercel can send the security headers (`vercel.json` mirrors `firebase.json`), so nothing is lost compared with Firebase Hosting.

1. Push the folder to a GitHub repo (see the GitHub section above).
2. <https://vercel.com> → **Add New → Project** → import the repo.
3. Settings: **Framework Preset = Other**, leave *Build Command* empty, *Output Directory* = `.` (root) → **Deploy**.
   (Or from the terminal: `npx vercel --prod` inside the folder.)
4. Add your domain to Firebase → Authentication → Settings → **Authorized domains** (your `*.vercel.app` production URL and any custom domain).
5. Deploy the database rules: `firebase deploy --only firestore:rules,storage`.
6. Custom domain: Vercel → Project → Settings → Domains.
