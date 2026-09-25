# Nexus

Nexus is a full-stack student career-networking application created for an HCI academic presentation. It uses a static HTML/CSS frontend, a Node.js/Express API, Supabase PostgreSQL, Supabase Authentication, Google OAuth, and row-level security.

## Architecture

```text
Browser pages → Express /api routes → Supabase PostgreSQL
      │                 │                    │
 Supabase Auth JWT ─────┘              Row-level security
```

Dynamic content is database-backed: profiles, jobs, applications, saved roles, feed posts, likes, comments, trends, people, connection requests, message threads, notifications, and contact submissions. Browser local storage is used only for the visual theme preference and Supabase's authentication session.

## Setup

1. Run `npm install`.
2. Create a free Supabase project and run `supabase/schema.sql` in **SQL Editor**.
3. Copy `.env.example` to `.env` and add the Supabase URL, anon key, and server-only service-role key.
4. Add the public Supabase URL and anon key to `config.js`. Never put the service-role key in browser code.
5. Configure Google OAuth when required:
   - JavaScript origin: `http://localhost:3000`
   - Google redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - Supabase Site URL: `http://localhost:3000`
   - Supabase redirect allow-list: `http://localhost:3000/index.html`
6. Run `npm run dev` and open `http://localhost:3000`.

## Verification

Run `npm run verify`, then confirm `http://localhost:3000/api/health` returns:

```json
{"ok":true,"supabaseConfigured":true}
```

Open `http://localhost:3000/api/readiness` to verify that every required database table exists.

See `docs/TEST_PLAN.md` for the formal test sequence and `docs/PROJECT_REPORT.md` for the presentation summary.

## Security

- The service-role key is server-only and `.env` is ignored by Git.
- Authenticated API routes validate the Supabase access token.
- User-owned tables use row-level security.
- Dynamic HTML values are escaped before rendering.
- API inputs are validated before database writes.

Seeded companies, people, posts, and opportunities are fictional academic demonstration content stored in the database.
