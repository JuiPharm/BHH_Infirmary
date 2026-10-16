# BHH Infirmary — Production V1 Release Candidate Gate Record
Date: 2026-10-16 (Asia/Bangkok)
Release target: Cloudflare Workers + **single existing GAS/Google Sheets writer**. **NOT D1 cutover**.
**Decision: NO-GO / NOT DEPLOYED TO PRODUCTION.** This is a pre-cutover review document, not authorization to deploy.
Branch: `feature/cloudflare-gateway-precutover-20261016` / Draft PR #10.

## New code and verification in this work session
- `backend/30_Recipients.gs`: medication dispensing to `STAFF_MASTER` (Teacher/Staff) now uses the mandatory visit-level allergy assessment, as for Free Text. No assumption that the Master contains an allergy profile. Student Master empty or explicit UNKNOWN/UNVERIFIED/not-known allergy histories now fail closed as `STUDENT_ALLERGY_STATUS_UNVERIFIED`.
- `frontend/src/features/clinical/VisitPage.tsx`: Teacher/Staff allergy status and known-allergy details are visible and submitted. `frontend/src/api.ts` has Thai user-facing error and Health build ID type.
- `backend/Code.gs`: cached GAS sessions are rechecked against active user and current role; role change or deactivation invalidates the session immediately. The existing source preflight remains read-only and missing allergy registry fails closed.
- `backend/Code.gs`: stock write is considered potentially applied **before** the remote `setValues` request. If that operation writes remotely then throws, the catch attempts snapshot rollback.
- `backend/tests/negativePath.test.mjs`: new tests for student unknown/blank histories, Staff mandatory assessment / known Penicillin reaction, Staff supply-only Visit, and revoked/stale sessions.
- `backend/tests/rollbackFaultInjection.test.mjs`: **4 in-memory post-apply fault-injection tests** exercise `submitVisit_` with failures at Stock Lot, Visit Header, Dispense Items, and Stock Transaction boundaries; snapshots return to baseline under successful rollback. Not a real Google Sheets multi-file transaction guarantee.
- `backend/Code.gs` `doGet`: `buildId=BHHINF-P1-SAFETY-20261016-R2`. `cloudflare/worker/index.js` forwards this read-only GAS fingerprint via Gateway `/api/health`; tests cover no credential leakage.
- `scripts/package-gas-uat.mjs`: the synthetic-only 7-source-file package manifest includes `gasBuildId`, `gitCommit`, and per-file SHA-256 so Sandbox deployment provenance can be checked.

**Latest verified CI:** 53/53 Apps Script tests and 46/46 Cloudflare tests plus frontend Vitest + TS/Vite build passed (workflow run 38921314853, candidate commit `8f2ed39d46eb86e0e10cf5564ecf78bc96f6ffc4`). GAS source package run 38921323682 SUCCESS. Check subsequent commits/workflows for exact latest provenance.

## Live evidence, deliberately limited
- Operator reported: `CLINICAL HARD STOP DRY-RUN PASS · Penicillin/Amoxicillin BLOCKED · Synthetic ACTIVE rule BLOCKED · ORS ALLOWED · no Visit/Stock write`.
- Re-read synthetic Sandbox: `DISPENSE_HEADER=11`, `DISPENSE_ITEMS=3`, `STOCK_TRANSACTION=18`, `NOTIFICATION_LOG=4`; ORS lot 003A=29, 003B=50; Amoxicillin lot 005A=20; aggregate ORS=79, Amoxicillin=20; one ACTIVE synthetic custom rule.
- Referral/Emergency Email both FALSE with all TO/CC blank.
- Cloudflare Preview `bhh-infirmary-p1-gateway-preview` remains `UAT_READ_ONLY`, `GAS_WEB_APP_URL`/`SESSION_KEY_B64` preserved as secrets, no D1 writer binding. No live production write, main merge, or production worker cutover was performed by this session.
- Prior one-shot Visit `Vde2628c7874d4471` and synthetic rule `AR07c10f3cb053440fbc` are COMPLETE and **must not be replayed**.

## Gates to finish before Release
| Gate | Required evidence | As of document |
|---|---|---|
| 0 | New GAS SANDBOX deployment points only to synthetic Sheet, source artifact / commit, `/api/health.buildId` exact match, deployment ID/version and timestamp recorded | **OPEN**: latest code is packaged, not installed/verified at GAS |
| 1 | Controlled real GAS `submitVisit_` negative-path (Penicillin/Amoxicillin, ACTIVE rule, Staff, unknown Student, stale snapshot) with before/after zero-mutation proof | **OPEN**: VM PASS + read-only diagnostic PASS, live submit boundary not tested |
| 2 | Disposable Sandbox rollback fault injection, FEFO/expired/quarantine, concurrent users, duplicate/timeout, stock-ledger reconciliation | **PARTIAL**: 4 VM injection tests PASS; real GAS fault/concurrency OPEN |
| 3 | Clinical & pharmacy formal acceptance of allergy status, named-ingredient semantics, false positives/negations/cross-reactivity, Teacher/Staff/Student/Free Text flow, rule governance, mobile UI | **OPEN** |
| 4 | End-to-end notification HTML (BHH CI, yellow referral, red emergency), safe MailApp recipient tests with no real UAT delivery, retry/UNKNOWN, Dashboard & roles | **OPEN** |
| 5 | Security review: public direct GAS endpoint risks, rate limits/WAF, user-role revocation, recovery/backup/monitoring, signed production config, controlled Cloudflare assets deploy, post-cutover smoke/rollback | **OPEN** |

**Release invariant:** Cloudflare `LEGACY_GAS_SINGLE_WRITER` can only be enabled on a separately authorized Production worker after Gates 0–5. GAS/Sheets is the sole writer. Do **not** activate D1 production writes or simultaneously expose old/new writer paths. Do not merge Draft PR #10 or deploy this package to GAS Production as a shortcut.

## Immediate operator-dependent sequence
1. Open successful [GAS Sandbox UAT Package workflow](https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38921323682), download `BHH_Infirmary_GAS_SANDBOX_UAT` (seven .gs files + MANIFEST). Install only in isolated GAS Sandbox; verify Script Property SHEET_ID. Record deployment/version ID, not credentials.
2. After deploy, check **Gateway preview `/api/health`** for `buildId=BHHINF-P1-SAFETY-20261016-R2`, and rerun read-only Clinical Hard Stop; save response and timestamps.
3. Prepare *separate disposable* synthetic Sandbox for controlled live negative `submitVisit` and rollback UAT. Do not replay used one-shot claims.
4. Conduct clinical/security/operational signoff before Production Gateway deployment and domain/DNS switch. Restore previous working version if post-go-live checks fail. Verify no duplicate Writer.

Tracked in Draft PR #10; any newly discovered blocker is a release stop, not a reason to bypass tests.
