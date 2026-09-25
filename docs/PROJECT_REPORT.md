# Nexus Project Report

## Purpose

Nexus demonstrates an accessible career-networking workflow for students and early-career professionals. It integrates opportunity discovery, application tracking, networking, messaging, profile management, and social interaction in one interface.

## Technology

| Layer | Technology | Responsibility |
|---|---|---|
| Interface | HTML, CSS, JavaScript | Responsive pages, forms, feedback, themes, accessibility |
| Server | Node.js and Express | Validation, authentication enforcement, REST API, static hosting |
| Database | Supabase PostgreSQL | Persistent application and catalog data |
| Authentication | Supabase Auth | Email/password sessions and Google OAuth |
| Security | Supabase RLS | Account-level isolation of user-owned data |

## Database-owned features

| Feature | Source tables |
|---|---|
| Profile and completion | `profiles` |
| Opportunity catalog | `jobs` |
| Applications and saved roles | `applications`, `saved_jobs` |
| Feed, likes, and comments | `feed_posts`, `post_likes`, `post_comments` |
| Trends | `trending_topics` |
| People and requests | `directory_people`, `network_requests` |
| Conversations | `message_templates`, `conversation_messages` |
| Notifications | `notifications` |
| Contact form | `contact_submissions` |

All user-facing counts are calculated from database records. No user activity is stored in hardcoded arrays or browser-local application lists.

## Main workflow

1. A user registers with email/password or Google.
2. Supabase creates the authenticated identity and a trigger creates the profile.
3. The browser attaches the Supabase JWT to protected API calls.
4. Express validates the JWT and uses the user's RLS-protected database context.
5. The interface reloads current database state and displays feedback.

## HCI considerations

- Consistent global navigation and active-page indication
- Responsive mobile navigation
- Empty, loading, success, and error states
- Visible status labels for jobs and connection requests
- Form labels and semantic controls
- Light, dark, and eye-comfort themes
- Confirmation feedback without blocking navigation
- Progressive disclosure through details pages and tabs

## Scope

The project is suitable for an academic demonstration. Seeded catalog records are fictional. A production deployment would additionally require an employer/admin interface, moderation, rate limiting, monitoring, file uploads, and transactional email configuration.
