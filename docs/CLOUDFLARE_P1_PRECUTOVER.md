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
## 2026-10-16 — Controlled Write UAT evidence (SYNTHETIC SANDBOX ONLY)

- Isolated GAS working copy spreadsheet: `1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs`. Authorized operator reported Login/read-only 8/8; this is operator-reported, not independently authenticated browser output.
- One-shot Cloudflare Gateway mode `UAT_WRITE_SINGLE` can submit only the hard-coded fixture `BHH-UAT-WRITE-20261016-001`, not arbitrary Visit/Stock writes; restricted to UAT Test Administrator. D1 records unique claim and prevents repeats. **Do not deploy this UAT mode to Production.**
- Operator-observed successful response: `Vde2628c7874d4471` / `MOCK-LOT-003A` / `30 → 29` / no email triggered by this test.
- Independently confirmed D1 `uat_one_shot_gate` entry: `COMMITTED`, reason `RECONCILED`, stable transaction key `BHH-UAT-20261016-ONE-SHOT-001`, same visit ID and 30→29 readback.
- Independently confirmed native Google Sheets Sandbox: **one** matching `DISPENSE_HEADER` row `COMPLETED` on `MOCK-STU-002`; **one** `DISPENSE_ITEMS` row, `MOCK-ITEM-003` × 1; **one** `STOCK_TRANSACTION` matching visit/lot; current lots `MOCK-LOT-003A = 29`, `MOCK-LOT-003B = 50`; `ITEM_MASTER.QTY = 79`; **one** audit record `DISPENSE / SUCCESS`. No matching `NOTIFICATION_LOG` row; test disposition was `RETURN_TO_CLASS`, not a referral or emergency. This does not independently prove zero external email delivery.
- **Safety finding and remediation:** Despite prior expectation, the synthetic Sandbox `CONFIG` had `REFERRAL_EMAIL_ENABLED = TRUE`, `EMERGENCY_EMAIL_ENABLED = TRUE`, and real external To/CC addresses. After discovery, changed **only this Sandbox**: both switches to boolean `FALSE`, cleared `REFERRAL_EMAIL_TO/CC` and `EMERGENCY_EMAIL_TO/CC`. Re-read `CONFIG!A2:C7` to verify both false and all four address cells blank. No Production records were touched. Avoid any email-case test until sandbox-only delivery can be guaranteed (including potential cached config).
- Current one-shot fixture has been **used**: do not reset its D1 claim or reuse the same transaction ID, and do not automatically retry uncertain outcomes.
- This is **not** proof of full clinical safety, negative-path rollback, real-time multi-user concurrency, all roles, Email HTML, D1 migration/reconciliation, Durable Inbox, or Production Cutover. Draft PR remains unmerged; legacy GAS/Sheets Production writer unchanged.

### Next gates
1. Ensure email UAT can use strictly synthetic recipient addresses / disabled external delivery; audit notification and cache behavior.
2. Add *new, separately keyed* synthetic negative-path fixtures, validate safety warnings, expired/quarantined stock exclusion, insufficient stock, FEFO same-expiry tie-break, network ambiguity, and expected history/audit deltas; never reuse the completed successful fixture.
3. Independent patient/visit/stock ledger migration rehearsal across all 13 Sheets; reconcile balances, backup/restore and rollback; complete clinical/security signoff before considering Production.
