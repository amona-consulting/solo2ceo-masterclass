# Backend contract

Next.js Server Actions are the application interface. There is no separate API service to deploy. Every learning write and assessment submission resolves the student from an HTTP-only session cookie; clients cannot select a user ID.

## Accounts

`signIn(previous, FormData)` accepts mode (`signup` or `login`), email, password and a name for signup. Signup requires a 12–128 character password and a unique normalized email. Passwords use random salts and scrypt (N=32768, r=8, p=3). Random 256-bit session tokens are hashed in the database, expire after 30 days, and are revoked on logout. Cookies are HTTP-only, SameSite=Lax and Secure in production. Next.js Server Actions supply same-origin POST enforcement. Account and global request limits are stored in PostgreSQL.

`signOut()` revokes the current session, deletes its cookie and redirects to `/login`. The course page redirects unauthenticated users to login.

## Learning

`saveLearning(changes)` accepts up to 22 field-level patches: `{lesson, completed?, bookmarked?, note?, last?}`. Lesson IDs and types are validated. Notes are limited to 20,000 characters. Each batch is transactional. Fields not in a patch are preserved, so saving a bookmark cannot overwrite another device's notes or completion state. Concurrent writes to the same field use last-write-wins.

The client serializes and debounces updates and shows saving/saved/failure state. Failed writes remain in memory with a Retry save button. Closing a tab with unsaved changes produces a browser warning. Refresh/sign-in loads the database state; this is not live multi-device collaboration. Old localStorage learning data is never automatically assigned to an account: a student may explicitly import it. Old assessment scores are ignored because they were client-generated. The original local data is retained.

`submitAssessment(module, answers)` accepts a module 1–3 and exactly 12 integer option indexes (0–2). Grading happens exclusively on the server. Every attempt is stored, and the latest score is shown. Correct answers are returned only after a valid submission, for review. These remain learning self-assessments, not proctored examinations.

## Database and hosting

Requires Node.js 24+ and a PostgreSQL database. Set the server-only `DATABASE_URL` environment variable locally and in Vercel. The runtime no longer uses SQLite or `DATABASE_PATH`.

For Supabase + Vercel, use **Connect → Transaction pooler** (port 6543), including the real database password, URL-encoded if it contains special characters. Use the provider's TLS connection settings; certificate verification is not disabled in code. Never prefix this variable with NEXT_PUBLIC_. Apply it to the intended Vercel environments, then deploy this code.

Tables and indexes are initialized automatically on the first database request, inside a transaction protected by a PostgreSQL advisory lock. The connection role must be allowed to create schemas and tables (Supabase's project postgres connection supports this). Tables live in the private `solo2ceo` schema, outside Supabase's default public Data API schema. Do not add it to exposed schemas or grant access to anon/authenticated roles. Authentication remains the course's existing password/session system; it does not use Supabase Auth.

The connection pool is reused per process, limited to three connections, and uses unnamed parameterized queries compatible with transaction pooling. Each transaction uses a single checked-out connection with a transaction-local search path. Payment writes lock the account row to serialize simultaneous verification and avoid duplicate enrollment extensions. PostgreSQL BIGINT timestamps are converted back to JavaScript numbers.

Existing SQLite data is **not automatically imported**. Preserve any old database before switching an installation with real student records; those records require a separate migration. A new Supabase project starts empty.

Deployment check: after deployment, create an account, sign out and in, and confirm the same account works in another browser. Complete a Flutterwave test purchase before switching payments to live. Local tests do not establish that Vercel's DATABASE_URL, network connection, or provider credentials work.

## Scope

Registration is open but does not grant course access. The course page and learning/assessment actions require a verified active enrollment. Flutterwave test checkout and payment verification are implemented; see PAYMENTS.md for configuration and release limitations. Email verification, self-service password recovery, admin tools and live production payment validation are not completed. The existing Google Drive media permissions still control video and resource access. Session identity is not a substitute for Drive authorization.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests use isolated embedded PostgreSQL (PGlite) databases and verify account authentication, invalid inputs, session hashing/revocation/expiry, user isolation, database writes and transaction rollback, atomic validation, field-level updates, server grading and rate limiting. No real student account is seeded.

The optional HTTP suite (`tests/http-auth.mjs`) requires a local development server and the same disposable PostgreSQL DATABASE_URL in both processes. It removes only its own generated student. Never run it against a live student database.
