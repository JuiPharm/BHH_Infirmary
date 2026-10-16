# BHH Infirmary — Cloudflare Gateway P1 (pre-cutover candidate)
Source: `main` commit `25328d8f3bd927777fc2a9acd30aec597ac8d89c`.
**This is a review branch. Do not merge/deploy against Production until Clinical and Security Gates pass.**

## Behavior
- React frontend calls same-origin `/api/health` and `/api/action`.
- Worker routes to existing GAS **only after** configuring server-side `GAS_WEB_APP_URL`.
- Encrypted `__Host-bhh_gw` HttpOnly Secure SameSite=Strict cookie carries legacy GAS session token; React only sees inert `gateway-session`.
- Rejects bootstrap commands, unknown actions, cross-origin submissions and missing `X-BHH-Gateway: 1`.
- An ambiguous response to stock/visit mutation is `OPERATION_STATUS_UNKNOWN`; never retry with a fresh transaction ID.
- P1 keeps GAS/Sheets as the *only* clinical and inventory writer. No D1/DO writer activated.

## Unmet Pre-Cutover Gates
- Supply a separate **synthetic-data-only** GAS Sandbox URL and verify backend version `2.4.1`. Do **not** configure an existing live GAS endpoint in preview.
- Configure `GAS_WEB_APP_URL` and `SESSION_KEY_B64` as Cloudflare secrets. Generate 32 bytes with a cryptographic RNG. Never commit secrets.
- Verify real GAS redirects/runtime behavior, staff-role access, View/Visit/Stock/Email UAT, idempotency, and uncertain outcomes.
- Add throttling/WAF and ratify access control for legacy GAS URL, which remains externally reachable.
- Reconcile all 13 Sheets and inventory balances against D1 using approved secure pathway.
- Durable Inbox foundation is not yet a production-proven, authenticated writer.
- Don't merge to `main` until all gates pass. **Cutover requires separate authorization and old-writer fencing.**

## Verification
Branch CI: `node --test cloudflare/tests/*.test.mjs`, `npm --prefix frontend ci`, `npm --prefix frontend run build`, legacy Apps Script tests. Github Pages deployment continues from `main` and remains unchanged.