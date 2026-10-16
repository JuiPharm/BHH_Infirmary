# Gate 0 — GAS Sandbox Backend Build Fingerprint (2026-10-16)
**Scope:** Cloudflare Production V1 pre-cutover review only; GAS/Google Sheets remains the sole writer.
**Status:** **BUILD FINGERPRINT VERIFIED (operator-reported)**. Not a release authorization.

## New operator verification at 2026-10-16 22:59:58 Asia/Bangkok
The authorized operator supplied this **direct GAS health** JSON after redeployment:

```json
{"success":true,"service":"School Nurse System API","apiVersion":"2.4.1","buildId":"BHHINF-P1-SAFETY-20261016-R2","timestamp":"2026-10-16 22:59:58"}
```

- `apiVersion` matches Gateway contract `2.4.1`.
- `buildId` matches the source code constant `BHHINF-P1-SAFETY-20261016-R2` and the synthetic-only package manifest's expected `gasBuildId`.
- This is the first operator-provided evidence of the **R2 candidate active at a GAS health URL**.
- **Still outstanding:** independent comparison of deployment ID, GAS project identity, `SHEET_ID` property, package SHA-256 checksums and source commit `737045ac69872fc05262b1618b10610db9f47ed9`. A static buildId alone is not a cryptographic attestation.
- The Cloudflare Preview was independently verified previously as `UAT_READ_ONLY`; a direct GAS `doGet` response alone does not prove the gateway is routing to the same deployment.

## Independent read-only Google Sheets reconciliation immediately afterwards
Source: isolated synthetic workbook `1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs`.
- `DISPENSE_HEADER` 11 data rows.
- `DISPENSE_ITEMS` 3 data rows.
- `STOCK_TRANSACTION` 18 data rows.
- `NOTIFICATION_LOG` 4 data rows.
- `MOCK-LOT-003A` 29, `MOCK-LOT-003B` 50; ORS aggregate 79.
- `MOCK-LOT-005A` 20; Amoxicillin aggregate 20.
- `DRUG_ALLERGY_RULES`: 1 published synthetic ACTIVE rule `AR07c10f3cb053440fbc`.
- Referral and Emergency Email enabled flags both FALSE; TO and CC empty.
- No Sheet changes made by this verification.

## Gate 1 — next
**Objective:** demonstrate real GAS `submitVisit_` rejects Penicillin+Amoxicillin and additional unsafe synthetic cases **before any Visit/Dispense/Stock/Notification/Audit patient write**. Automated VM regression and read-only rule-engine diagnostics do not meet this standard alone.

**Do not use the public Cloudflare Preview in `UAT_READ_ONLY` for an arbitrary `submitVisit`**. That route intentionally returns `PREVIEW_ACTION_DISABLED`. A valid Gate-1 UAT must use a *separately approved, bounded synthetic-only testing mechanism*, with the working-sheet identity independently validated, a fresh unique transaction key, a before/after snapshot and a safe failure/rollback plan.

Do not replay the previously completed ORS one-shot Visit `Vde2628c7874d4471` or the published synthetic rule Draft/Publish operation. Keep Production and `main` untouched.
