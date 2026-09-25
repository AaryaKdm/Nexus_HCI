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

All responses are JSON except static assets and HTTP 204 delete responses.
