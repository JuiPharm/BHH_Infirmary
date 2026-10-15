# Deployment — BHH Infirmary P4

## Release gate

P4 must not be released directly to production until:

1. Frontend CI tests pass.
2. Apps Script syntax gate passes.
3. Senior review is complete.
4. Apps Script is updated to API `2.4.2` and `backend/tests/p4Safety.test.mjs` passes.
5. `setupSystem()` has been run against the target Google Sheet.
6. Live UAT confirms visit, stock, referral notification and dashboard behavior.
7. Only then merge the P4 PR to `main`.

## Google Apps Script update

The backend is now a multi-file Apps Script project. In **Extensions → Apps Script**, copy/update every `.gs` file from the repository `backend/` folder, not only `Code.gs`.

Current P4 modules include:

- `Code.gs` — compatibility core, router, auth, legacy clinical/inventory services and shared helpers.
- `30_Recipients.gs` — universal recipient search and STAFF_MASTER compatibility layer.
- `40_ClinicalP4.gs` — controlled symptom catalog, visit category and clinical alert derivation.
- `60_Notification.gs` — referral/emergency email, audit log, idempotency and retry.
- `70_DashboardP4.gs` — Dashboard V2 filter/aggregation service.

Apps Script loads all `.gs` files into the same global runtime.

## Sheet migration

After all P4 backend files are present, run:

```text
setupSystem()
```

Migration is append-only:

- New sheet: `STAFF_MASTER`
- New sheet: `NOTIFICATION_LOG`
- Existing `SYMPTOMS`: missing P4 columns are appended.
- Existing `DISPENSE_HEADER`: recipient snapshot, allergy safety, classification, and `Custom Symptoms` columns are appended without reordering existing columns.
- `Custom Symptoms` stores JSON `{category, symptom}` snapshots for categorized free-text symptoms; historical rows remain blank.
- Existing production columns are not reordered or deleted.
- Existing `STOCK_LOT.Current Qty` remains the inventory source of truth.

If `SYMPTOMS` is empty, P4 seeds the approved controlled symptom list. Existing symptom rows are never overwritten automatically.

## STAFF_MASTER

Required columns are created by `setupSystem()`:

```text
Staff ID | Full Name | Recipient Type | Department | Status | Updated At
```

Allowed master Recipient Type values:

```text
TEACHER
STAFF
```

Do not reuse `USERS.Role` as Recipient Type. System authorization and recipient identity are separate models.

Staff data may be loaded directly into the sheet or through the backend `importStaffMaster` action by ADMIN / SUPER_ADMIN.

## Referral / emergency email CONFIG

P4 adds these CONFIG keys with email delivery disabled by default:

```text
REFERRAL_EMAIL_ENABLED
REFERRAL_EMAIL_TO
REFERRAL_EMAIL_CC
EMERGENCY_EMAIL_ENABLED
EMERGENCY_EMAIL_TO
EMERGENCY_EMAIL_CC
NOTIFICATION_FROM_NAME
REFERRAL_EMAIL_SUBJECT_PREFIX
EMERGENCY_EMAIL_SUBJECT_PREFIX
```

Recommended rollout:

1. Set authorized TO/CC recipients first.
2. Send UAT visits to confirm HTML rendering in Gmail and the organization's real email client.
3. Verify `NOTIFICATION_LOG` shows `SENT`, `Attempt Count` and `Sent At`.
4. Verify a missing recipient leaves Visit = `COMPLETED` and Notification = `FAILED`, without stock rollback.
5. Configure the missing recipient, retry the definitively `FAILED` entry and confirm no duplicate send after `SENT`. If MailApp throws or success logging fails, `UNKNOWN` / `SENDING` must NOT be retried without independent operator verification.
6. Test authorized notification outbox page and manual reconciliation restricted to 72 hours; do not send historical referrals.
7. Enable production delivery only after those checks.

Never hard-code email recipients in Apps Script.

## Web app deployment

After backend migration:

1. Deploy Apps Script as a new Web App version using the same production execution/access policy.
2. Confirm GET health reports `apiVersion: "2.4.2"`.
3. Confirm the existing Web App URL remains the value used by `VITE_GAS_URL`.
4. Run live UAT before merging frontend to `main`.

The P4 frontend intentionally requires API `2.4.2`; it will block clinical use when an older backend is detected.

## Frontend

GitHub Pages deploys only after merge to `main`. Before merge, CI runs:

- Apps Script syntax check
- Node Apps Script behavior regression tests
- `npm ci`
- Vitest
- TypeScript + Vite production build

Do not publish the Google Sheet, credentials, tokens, or confidential recipient lists.
