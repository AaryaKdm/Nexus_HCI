# Nexus

Nexus is a full-stack student career-networking application created for an HCI academic presentation. It uses a static HTML/CSS frontend, a Node.js/Express API, Supabase PostgreSQL, Supabase Authentication, Google OAuth, and row-level security.

## Architecture

```text
Browser pages → Express /api routes → Supabase PostgreSQL
      │                 │                    │
 Supabase Auth JWT ─────┘              Row-level security
```

Dynamic content is database-backed: profiles, jobs, applications, saved roles, feed posts, likes, comments, trends, people, connection requests, message threads, notifications, and contact submissions. Browser local storage is used only for the visual theme preference and Supabase's authentication session.

Current external opportunities are synchronized by the Express backend and normalized into the Supabase `jobs` table. Remotive works without an API key. Adzuna India listings are enabled when `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are configured. Every external listing displays its source and opens the provider's original application URL.

LinkedIn and Naukri do not provide an unrestricted public job-search feed for this use case. Nexus therefore provides query-aware outbound searches to those sites and does not scrape, copy, or misattribute their listings.

## Setup

1. Run `npm install`.
2. Create a free Supabase project and run `supabase/schema.sql` in **SQL Editor**.
   For an existing project with the old dummy people, run `supabase/real-users-migration.sql` before deploying the new server. It archives old demo interaction records and removes seeded demo people/posts; it does not delete registered auth users.
   On an existing project that already has real-member networking, run `supabase/education-demo-migration.sql` to add the university and demo-member fields and catch up older jobs/notifications columns. This migration only adds columns and an index; it does not remove existing data.
3. Copy `.env.example` to `.env` and add the Supabase URL, anon key, and server-only service-role key.
4. Add the public Supabase URL and anon key to `config.js`. Never put the service-role key in browser code.
5. Optional: register at `https://developer.adzuna.com` and add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` to `.env` for current India-focused listings. Remotive requires no credentials.
6. Configure Google OAuth when required:
   - JavaScript origin: `http://localhost:3000`
   - Google redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - Supabase Site URL: `http://localhost:3000`
   - Supabase redirect allow-list: `http://localhost:3000/index.html`
7. Run `npm start` and open `http://localhost:3000` (`npm run dev` enables file watching where supported).

To add 12 fictional demo members with real Indian schools, colleges, and universities, run `npm run seed:demo-members` after the migration. It creates real Supabase Auth accounts marked **Demo member**, and a few accepted connections only between those demo accounts. It does not connect, rename, or delete existing real users. New sign-in credentials are saved only to `.demo-credentials.json` on your machine (Git-ignored); do not commit or share this file publicly. Re-running the command will not create duplicate accounts or links. Demo accounts are for presentation, not verified alumni or real people; there are no automated replies.

People You May Know ranks non-connected members by mutual accepted connections, then shared college, university, and school. The Discover People page shows the complete ranked list. Members with blank education fields can still browse other accounts, but shared-school reasons require those fields to be filled in.

The profile editor offers type-ahead suggestions for location, school, college, and university. It reads `locations.json`, `schools_list.json`, and the existing `college_list.txt` (parsed as data, not executed) when editing opens. Suggestions rank starts-with matches first, then other containing matches. Arrow keys, Enter, Escape, pointer selection, and free-text entries are supported. No external autocomplete API or key is needed. Keep all three catalog files in the repository when deploying; `npm run build:frontend` copies them into `dist`.

## Verification

Run `npm run verify`, then confirm `http://localhost:3000/api/health` returns:

```json
{"ok":true,"supabaseConfigured":true}
```

Open `http://localhost:3000/api/readiness` to verify that every required database table exists.

See `docs/TEST_PLAN.md` for the formal test sequence and `docs/PROJECT_REPORT.md` for the presentation summary.

## Production deployment

The production architecture is:

```text
Vercel static frontend -> /api rewrite -> Render Express API -> Supabase
```

Deploy the backend first:

1. In Render, select **New > Blueprint** and connect this GitHub repository.
2. Render reads `render.yaml` and creates the free `nexus-hci-api` web service.
3. Enter `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` when prompted. These are server secrets; never add them to Git.
4. Initially set `CLIENT_ORIGIN` to `http://localhost:3000`. After Vercel assigns its URL, replace this with that exact URL (multiple origins can be comma-separated).
5. Confirm `https://nexus-hci.onrender.com/api/health` returns `{"ok":true,"supabaseConfigured":true}`.

Then deploy the frontend:

1. In Vercel, import the same GitHub repository as a new project.
2. Choose **Other** as the framework preset, leave the root directory as the repository root, and deploy. No frontend secrets are required.
3. `vercel.json` proxies `/api/*` to Render. If Render assigned a different service URL, update its rewrite destination and redeploy.
4. Copy the final Vercel URL into Render's `CLIENT_ORIGIN` variable.

Finally configure authentication:

1. In Supabase **Authentication > URL Configuration**, set **Site URL** to the Vercel production URL.
2. Add `https://YOUR-VERCEL-DOMAIN/index.html` and `https://YOUR-VERCEL-DOMAIN/login.html` to **Redirect URLs**. Keep the localhost URLs for development.
3. In Google Cloud OAuth, keep the authorized redirect URI as `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`. Add the Vercel URL under authorized JavaScript origins.
4. Test Google login, email login, jobs, applications, saved jobs, network requests, messages, profile updates, notifications, and contact submission in production.

The free Render tier can sleep when idle, so the first API request after inactivity may take longer. The service-role key belongs only in Render; Vercel needs no private Supabase key.

## Security

- The service-role key is server-only and `.env` is ignored by Git.
- Authenticated API routes validate the Supabase access token.
- User-owned tables use row-level security.
- Dynamic HTML values are escaped before rendering.
- API inputs are validated before database writes.

Seeded companies and Nexus-owned opportunities are fictional academic demonstration content. Member profiles, conversations, comments, and newly created posts belong to real authenticated accounts.
