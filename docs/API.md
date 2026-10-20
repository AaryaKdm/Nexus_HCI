# Nexus API Reference

Public endpoints:

- `GET /api/health` — process and configuration status
- `GET /api/readiness` — required database-table status
- `GET /api/jobs` and `GET /api/jobs/:id` — opportunity catalog
- `GET /api/feed` — feed records and aggregate counts
- `GET /api/trends` — trending topics
- `POST /api/contact` — validated contact submission

Authenticated endpoints require `Authorization: Bearer <Supabase access token>`:

- `GET /api/me`, `GET /api/dashboard`, `PUT /api/me/profile`
- `GET|POST /api/me/applications`
- `GET /api/me/saved`, `POST|DELETE /api/me/saved/:jobId`
- `POST /api/feed`, `POST /api/feed/:postId/like`, `POST /api/feed/:postId/comments`
- `GET /api/people`, `GET|POST /api/connections`
- `GET /api/threads`, `POST /api/messages`
- `GET /api/notifications`

Member routes:

- `GET /api/profiles/:id` — public member profile without email or private activity
- `GET /api/people` — registered member directory, excluding the caller
- `GET|POST /api/connections`, `PATCH /api/connections/:id` — requests and accept/decline
- `GET /api/threads`, `POST /api/messages`, `PATCH /api/threads/:id/read` — direct messages between auth users

`GET /api/feed` includes comment records with author names and links to profile IDs. Legacy seed posts are excluded.

All responses are JSON except static assets and HTTP 204 delete responses.

The jobs endpoint refreshes approved external feeds at most once every six hours per server instance. External job fields include `source`, `source_job_id`, `apply_url`, `external_created_at`, and `last_synced_at`; records are deduplicated by `(source, source_job_id)`.
