# Backend contract

Next.js Server Actions are the application interface. There is no separate API service to deploy. Every learning write and assessment submission resolves the student from an HTTP-only session cookie; clients cannot select a user ID.

## Accounts

`signIn(previous, FormData)` accepts mode (`signup` or `login`), email, password and a name for signup. Signup requires a 12–128 character password and a unique normalized email. Passwords use random salts and scrypt (N=32768, r=8, p=3). Random 256-bit session tokens are hashed in the database, expire after 30 days, and are revoked on logout. Cookies are HTTP-only, SameSite=Lax and Secure in production. Next.js Server Actions supply same-origin POST enforcement. Account and global request limits are stored in SQLite.

`signOut()` revokes the current session, deletes its cookie and redirects to `/login`. The course page redirects unauthenticated users to login.

## Learning

`saveLearning(changes)` accepts up to 22 field-level patches: `{lesson, completed?, bookmarked?, note?, last?}`. Lesson IDs and types are validated. Notes are limited to 20,000 characters. Each batch is transactional. Fields not in a patch are preserved, so saving a bookmark cannot overwrite another device's notes or completion state. Concurrent writes to the same field use last-write-wins.

The client serializes and debounces updates and shows saving/saved/failure state. Failed writes remain in memory with a Retry save button. Closing a tab with unsaved changes produces a browser warning. Refresh/sign-in loads the database state; this is not live multi-device collaboration. Old localStorage learning data is never automatically assigned to an account: a student may explicitly import it. Old assessment scores are ignored because they were client-generated. The original local data is retained.

`submitAssessment(module, answers)` accepts a module 1–3 and exactly 12 integer option indexes (0–2). Grading happens exclusively on the server. Every attempt is stored, and the latest score is shown. Correct answers are returned only after a valid submission, for review. These remain learning self-assessments, not proctored examinations.

## Database and hosting

Requires Node.js 24+. The default SQLite database is `data/solo2ceo.sqlite`. It is initialized automatically, uses WAL mode and foreign keys, and is excluded from source control. `DATABASE_PATH` can point to another persistent disk location. Schema version 2 also includes payment records and mode-separated enrollments.

Deploy on one persistent Node server/container with HTTPS and a persistent data volume; back up SQLite using its backup API or a consistent volume snapshot. Do not put this database on ephemeral serverless storage. For multiple application replicas or a Vercel deployment, migrate this storage layer to managed PostgreSQL before deploying. Accounts work across browsers/devices that reach the same server/database.

## Scope

Registration is open but does not grant course access. The course page and learning/assessment actions require a verified active enrollment. Flutterwave test checkout and payment verification are implemented; see PAYMENTS.md for configuration and release limitations. Email verification, self-service password recovery, admin tools and production hosting are not configured. The existing Google Drive media permissions still control video and resource access. Session identity is not a substitute for Drive authorization.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests use an isolated temporary database and verify account authentication, invalid inputs, session hashing/revocation/expiry, user isolation, persistence across process connections, atomic validation, field-level updates, server grading and rate limiting. No real student account is seeded.
