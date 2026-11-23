# Course payments

## Current checkout: Paystack (23 November 2026)

New enrollment purchases use Paystack hosted checkout. The sections below this new section describe the retained Flutterwave integration and its historical checks, not the active Pay button.

Set private Vercel variables `PAYSTACK_SECRET_KEY` (test restricted key with transactions:write), `PAYSTACK_WEBHOOK_SECRET` (whole test signing secret, including whsec_), `PAYMENTS_MODE=test`, and `APP_URL` to the deployed site's HTTPS origin. Redeploy after changes. Never put secrets in NEXT_PUBLIC_ variables. The public key is not needed for this server-created redirect flow.

Add a separate test-mode Paystack webhook for `charge.success` at `https://YOUR-DOMAIN/api/payments/paystack/webhook`. Preserve other apps' endpoints and legacy keys. Use an existing signing secret without rotation, or generate one if absent; Paystack documents that legacy signatures continue while the legacy secret key exists. The new handler verifies `Paystack-Signature` over raw bytes with HMAC-SHA512 and a 300-second timestamp tolerance. It does not use the restricted API key to verify signatures.

The callback is `/payments/paystack/return` and is passed per transaction, so no account-wide callback change is needed. A callback never grants access based on browser status. The server verifies reference, successful status, NGN currency, exact 3,000,000-kobo amount and test/live domain. The authenticated student owns the locally recorded purchase. Duplicate transaction IDs and concurrent notifications cannot grant duplicate access. Unknown references (including other applications' payments) are ignored. Provider failures return a retryable webhook response and leave access locked. Verification has a 15-second provider timeout; durable enrollment writes finish before webhook acknowledgment because this app has no durable background queue.

An additive `paystack_payments` table separates new purchases from the unchanged Flutterwave `payments` table. Accounts, progress and the shared enrollment table remain intact. Existing Flutterwave callback/webhook routes remain available for previously initiated payments. New checkout reuses pending Paystack links for 30 minutes. Orders persist before provider calls so ambiguous failures can be checked by reference; if initialization is accepted but its response is lost, check payment status before starting another attempt.

Validation: `npm test` includes Paystack security and enrollment tests. Run `postman simulation run postman/simulations/paystack.sim.yaml --port 4016 --output ndjson --no-history`, then set `PAYSTACK_TEST_API_URL=http://127.0.0.1:4016/paystack` for the test command to include HTTP integration scenarios. This override only applies under NODE_ENV=test; the test fixture supplies an isolated embedded database and dummy keys. Local tests do not prove Vercel credentials or actual Paystack delivery. Before live activation, complete a sandbox checkout and confirm return, webhook, and one-time access grant. Then use matching live API/signing credentials and live webhook settings. Refund/dispute automation remains unimplemented.

Sources: https://paystack.com/docs/api/transaction/ ; https://paystack.com/docs/v2/api/authentication ; https://paystack.com/docs/v2/developer-tools/integration/webhooks

## Historical Flutterwave configuration

One purchase costs NGN 30,000 and grants three calendar months from the first successful server verification. Month ends are clamped (31 January becomes 30 April). Access expires automatically; progress remains. No automatic renewal. No existing account is granted enrollment automatically.

## Local configuration

Store credentials in `.env.local` (already ignored by Git):

```env
FLUTTERWAVE_SECRET_KEY=<test secret key>
FLUTTERWAVE_PUBLIC_KEY=<test public key>
FLUTTERWAVE_WEBHOOK_SECRET=<random private value>
PAYMENTS_MODE=test
APP_URL=http://127.0.0.1:3000
```

The hosted checkout uses the secret key on the server; the public key is not needed by this flow. Never prefix secrets with NEXT_PUBLIC_. A random webhook secret has been added locally without changing existing keys. Restart the server after editing configuration. APP_URL must match the origin used in your browser, including the port, to preserve the login cookie on return.

Run `npm run dev`, visit `/login`, create an account, and choose Pay on `/enroll`. Test mode is displayed on the enrollment and course pages. Use only Flutterwave test payment details. Test enrollments are stored separately from live enrollments.

## Payment interface

- `checkout` Server Action: authenticated, rate limited, price/currency/customer chosen on the server. Creates a pending order before calling Flutterwave v3 POST /payments. Reuses a pending checkout for 30 minutes. Provider calls time out after 45 seconds, within a 60-second payment route/action budget and return safe errors. Hosted redirects require HTTPS and an exact allowed host: checkout.flutterwave.com, or checkout-v2.dev-flutterwave.com in test mode only. Cached links are validated too.
- `GET /payments/return`: requires the same signed-in account; ignores browser payment status and transaction ID. Verifies the stored reference through Flutterwave. Returns to the course only after confirmation; otherwise shows the enrollment page.
- `checkPayment` Server Action: owner-only verification of a stored reference. Provides recovery when a browser closes, the callback fails, or notifications are delayed. Recent pending attempts are shown separately. Provider errors do not mark a payment failed or grant access.
- `POST /api/payments/flutterwave/webhook`: authenticates the v3 `verif-hash` header using constant-time comparison. Only charge.completed successful events for known orders are verified. Missing/incorrect hash returns 401, malformed JSON 400, unrelated events 200, provider verification failure 503 so the sender retries. No enrollment is granted based only on webhook contents.
- Verification requires successful status, exact reference, NGN currency, exact purchase amount, positive integer transaction ID. Enrollment belongs to the account on the server-created order; payer email can differ. Payment and enrollment writes are atomic. A transaction ID cannot be reused across purchases within the same mode. Duplicate confirmations do not extend access again. A genuinely separate paid order extends any remaining access rather than discarding it.
- The course page and every learning/assessment write require active enrollment. Course media metadata is passed from the server only after authorization, not imported into a public browser bundle. The browser redirects after expiry; server checks remain authoritative for requests.

## Notifications and production

Flutterwave cannot call a localhost URL. On an HTTPS deployment, set APP_URL to that site's origin and configure this URL under Flutterwave Settings → Webhooks:

`https://YOUR-DOMAIN/api/payments/flutterwave/webhook`

Copy the private FLUTTERWAVE_WEBHOOK_SECRET value into Flutterwave's Secret Hash field and enable webhook retries. Test and live dashboard settings must be configured separately. For local provider notification testing, use an authenticated Postman webhook forwarding session or another approved HTTPS tunnel. No public webhook/tunnel was configured in this change.

Only after testing and account approval, set PAYMENTS_MODE=live and install live credentials in the hosting provider's private settings. Live checkout requires HTTPS and a webhook secret; these configuration checks do not prove delivery is working. Run a real sandbox payment and actual callback/webhook delivery checks before launch. Add scheduled reconciliation of pending payments for production reliability; the current fallback is student-triggered status checks. Refunds/disputes currently require manual investigation and enrollment management; automatic revocation and an admin interface are not implemented.

Google Drive is still the media host. Site enrollment does not revoke copied Drive links or control Drive permissions. Private video delivery and protected resource storage remain a paid-launch dependency. SQLite still requires a single persistent server with backups; use managed storage for serverless/multiple replicas.

## Repeatable verification

- `npm test`: account/payment rules, duplicate transactions, ownership, expiry, month boundaries, test/live isolation and webhook rejection. HTTP provider simulation test is skipped unless configured below.
- `postman simulation run postman/simulations/course-payments.sim.yaml --port 4015 --output ndjson --no-history`
- In a second PowerShell terminal, set `$env:NODE_ENV='test'` and `$env:PAYMENT_TEST_API_URL='http://127.0.0.1:4015/flutterwave/v3'`, then `npm test`. These tests use dummy credentials and an isolated database. The alternative API URL is ignored outside NODE_ENV=test. Clear these two variables afterward before starting Next.js.
- With the dev server running: `node tests/http-auth.mjs`. Creates and removes its own account and uses a clearly synthetic enrollment fixture to test paid/unpaid/expired access over HTTP. No payment is represented as real.
- `node --env-file=.env.local --experimental-strip-types tests/flutterwave-smoke.ts`: creates an actual Flutterwave test checkout using a temporary embedded PostgreSQL test account/database. It does not charge money or grant access. A hosted checkout may remain in the Flutterwave test dashboard after the local fixture is removed.
- `npm run typecheck` and `npm run build`.

On 6 November 2026, the real Flutterwave verification endpoint accepted the test credentials but POST /v3/payments returned an HTML Cloudflare 403 block from this machine, so a real hosted checkout/payment remains unverified. Local simulation passed creation, pending recovery, amount mismatch, provider outage, verified webhook and duplicate webhook cases. Postman owner discovery was skipped because the CLI was signed out; the local stand-in is derived from official docs, not a provider-owned mock.

Sources: https://developer.flutterwave.com/docs/flutterwave-standard-1 ; https://developer.flutterwave.com/reference/verify-transaction-with-tx_ref ; https://developer.flutterwave.com/docs/webhooks . Orbit search returned unrelated APIs, so no Orbit result was adopted.
