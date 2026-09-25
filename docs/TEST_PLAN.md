# Nexus Verification Plan

## Automated checks

Run `npm run verify`. It checks JavaScript syntax, inline browser-script syntax, and prohibited prototype constants/localStorage datasets.

## Environment checks

1. Start with `npm run dev`.
2. Confirm `/api/health` returns HTTP 200 and `supabaseConfigured: true`.
3. Confirm `/api/jobs`, `/api/feed`, and `/api/trends` return JSON arrays.
4. Confirm protected endpoints return HTTP 401 without a valid session.

## Authentication

1. Register a new email/password account.
2. Confirm the email if confirmation is enabled.
3. Verify a matching row is created in `profiles`.
4. Log out and log back in.
5. Complete a Google OAuth login.
6. Verify unauthenticated account pages redirect to login.

## Functional tests

- Edit the profile and confirm its database row and completion percentage update.
- Search/filter jobs and open a UUID-based details page.
- Save/remove a role and verify `saved_jobs`.
- Apply once and verify `applications`, confirmation, and duplicate prevention.
- Create a feed post, like/unlike it, and add a comment.
- Search people and send a connection request.
- Send a message, reload, and confirm persistence.
- Submit the contact form and verify `contact_submissions`.
- Confirm a notification appears after an application.

## Expected result

After a hard refresh, all dynamic records and counts must match Supabase. The only browser-local preference is the selected visual theme; authentication persistence is managed by Supabase Auth.
