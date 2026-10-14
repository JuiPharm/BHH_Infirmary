# P4 Implementation Notes

Branch: `feature/p4-recipient-notification-dashboard`

## Implemented scope

- Universal search across `STUDENTS` and `STAFF_MASTER`.
- Backend-derived Recipient Type for master records.
- Free Text Visit with recipient snapshot.
- Free Text allergy safety before drug dispensing.
- Controlled symptom catalog with multi-symptom selection.
- Derived Visit Category precedence: TRAUMA → NON_TRAUMA → OTHER.
- Clinical Alert Level independent from category.
- Backend referral/emergency notification trigger after a successful visit transaction.
- HTML email with BHH navy header, recipient card, vital-sign table, referral yellow/orange banner and emergency red banner.
- Plain-text email fallback and HTML escaping.
- `NOTIFICATION_LOG` as a ScriptLock-claimed outbox with safe states (`PENDING`, `SENDING`, `SENT`, `FAILED`, `UNKNOWN`), constrained retry, supervisor reconciliation, and recovery UI.
- Independent server-side student allergy review with a checked Master snapshot when dispensing drugs.
- Non-destructive Staff Master upsert with validation and rollback on write failure.
- Safe text-only Visit confirmation instead of unescaped SweetAlert HTML.
- Request-cancellation logic to prevent stale master search results.
- Regression test suite `backend/tests/p4Safety.test.mjs` executed in CI.
- Dashboard V2 with one shared visit filter context.
- API contract bump to `2.4.1`.

## Compatibility

Historical visits remain readable. New P4 columns are appended to `DISPENSE_HEADER`; existing column positions are preserved. Legacy Student visits without P4 recipient fields are interpreted as STUDENT for dashboard counting. Historical symptom data that cannot be matched to the controlled catalog is kept as `UNCLASSIFIED` rather than guessed.

## Known trade-off and safety policy

Google Sheets and MailApp are not transactional together: even after ScriptLock claims, exactly-once email delivery cannot be guaranteed. A mail exception or failure to persist `SENT` produces `UNKNOWN` (or remains `SENDING`) to prevent blind resend. A SUPER_ADMIN may unlock an ambiguous entry **only after independent proof that no email was delivered**; reconciliation only picks up completed visits within the last **72 hours** that lack any notification log. `FAILED` retry is for definite failures only, e.g. recipient not configured.

Free Text recipients without a stable ID count as distinct visits in Unique Recipients, rather than merging people with identical names. This is conservative and repeat-visit metrics for name-only Free Text are inherently limited.

## Remaining live-UAT items

- Populate `STAFF_MASTER` with real Teacher/Staff data.
- Configure authorized referral/emergency recipients.
- Verify HTML email in Gmail and the organization's actual email client.
- Verify email failure does not roll back Visit or stock.
- Verify failed-recipient retry idempotency and UNKNOWN/SENDING no-retry policy.
- Confirm manual outbox recovery never sends referrals older than 72 hours.
- Perform responsive and keyboard UX testing on Desktop, Tablet and Mobile, including long Thai names.
- Verify Dashboard V2 counts against production Sheet samples.
- Verify Student / Teacher / Staff / Free Text visits from the deployed Apps Script Web App.

Do not merge to production until the release gate in `docs/DEPLOYMENT.md` is complete.
