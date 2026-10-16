# BHH Infirmary — Gate 1 Live Negative-Path UAT Runbook
**Date:** 2026-10-16 · **Target:** isolated synthetic GAS Sandbox only · **No Production deploy**.

## Prerequisite / Gate 0
Operator supplied:
```json
{"success":true,"service":"School Nurse System API","apiVersion":"2.4.1","buildId":"BHHINF-P1-SAFETY-20261016-R2","timestamp":"2026-10-16 22:59:58"}
```
This verifies the displayed GAS build fingerprint matches the R2 source. Deployment provenance, package SHA-256, Script Properties and project ID still require an authorized operator to check. The public Cloudflare Preview is **UAT_READ_ONLY**; this test **does not** change its mode.

## Approved scope
- Run only in the dedicated Apps Script project connected to **synthetic** spreadsheet `1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs`.
- Test uses fixed synthetic students/teacher and `MOCK-ITEM-005` Amoxicillin 250 mg. It cannot accept a real patient, staff, item or quantity from users.
- Explicit `PropertiesService.getScriptProperties().SHEET_ID` equality check, synthetic fixture checks and email switches/recipient checks execute before any `submitVisit_` call.
- The helper is **only** an Apps Script Editor entrypoint, *not* a Web App API action. Unlike the prior rule engine Dry-run, it calls real `submitVisit_` with expected negative inputs. If an undiscovered bug allows a successful submit it **could create a synthetic Visit and change synthetic stock**. Hence a backup and controlled operator are mandatory; do not describe it as guaranteed zero-write ahead of actual result.

## Operator steps
1. Back up the isolated synthetic workbook. Double-check it contains **no real patient data**; confirm the currently opened Apps Script project is the separate Sandbox and `SHEET_ID` equals the workbook above. Do not rerun `setupSystem` or seed accounts.
2. Open the [latest successful GAS Sandbox Package](https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38929359258). Download artifact `BHH_Infirmary_GAS_SANDBOX_UAT`.
3. From the ZIP's `gas-sandbox-uat/` folder, **add only** the helper file `37_Gate1ClinicalNegativeUat.gs` to the already deployed Sandbox Apps Script source. The R2 API health fingerprint is already verified; the helper is invoked directly in the editor, so **no new Web App /exec deployment is required for this editor-only test**. Don't paste a duplicate of the existing backend modules.
4. Save, select `runGate1ClinicalNegativeUat` in the Apps Script Editor function picker and click Run. Authorize Script Editor permissions if requested. Do **not** call `submitVisit` manually through the public Preview.
5. Review Execution Log. Expected one JSON response with `status:"PASS"`, `scope:"REAL_SUBMIT_VISIT_NEGATIVE_PATH"`, four `result:"PASS"` cases, and `visitWrites=stockWrites=notificationWrites=auditWrites=0`.
6. The four expected error results, in order:
   - `PENICILLIN_AMOXICILLIN` → `DRUG_ALLERGY_HARD_STOP`
   - `STUDENT_UNKNOWN_HISTORY` → `STUDENT_ALLERGY_STATUS_UNVERIFIED`
   - `STAFF_KNOWN_PENICILLIN` → `DRUG_ALLERGY_HARD_STOP`
   - `STAFF_ALLERGY_MISSING` → `ALLERGY_STATUS_REQUIRED`
7. Independently reconcile `DISPENSE_HEADER`, `DISPENSE_ITEMS`, `STOCK_TRANSACTION`, `STOCK_LOT`, `ITEM_MASTER`, `NOTIFICATION_LOG` and `AUDIT_LOG` against baseline; a test PASS alone is not sufficient for signoff.

## Baseline before UAT (independently checked)
| Table / Stock | Expected |
|---|---:|
| `DISPENSE_HEADER` rows | 11 |
| `DISPENSE_ITEMS` rows | 3 |
| `STOCK_TRANSACTION` rows | 18 |
| `NOTIFICATION_LOG` rows | 4 |
| `MOCK-LOT-003A` | 29 |
| `MOCK-LOT-003B` | 50 |
| `MOCK-LOT-005A` | 20 |
| Aggregate ORS | 79 |
| Aggregate Amoxicillin | 20 |

Audit row count can include unrelated session/login entries from an operator; the helper verifies unchanged Audit rows within its execution. No new negative-path Visit/Dispense/Stock or Notification is permitted.

## Stop conditions
- Wrong workbook, enabled external email, wrong fixture, unknown result or mutation: **stop immediately**.
- `UAT_GATE1_UNEXPECTED_WRITE_STOP`: Unexpected synthetic sheet change. Preserve evidence; do not retry or delete data.
- `TRANSACTION_ROLLBACK_FAILED`: rollback uncertain; manual reconciliation required.
- `UAT_GATE1_WRONG_RESULT`: a clinical rule did not return expected error; do not proceed to Production.
- No actual real-world medications may be administered as part of UAT.

## Post Gate 1
Gate 1 success establishes a controlled **real GAS function negative-path test**, not a production cutover. It does not supersede Gate 2 (disposable sandbox multi-write rollback/concurrency), Gate 3 (clinical approval), Gate 4 (notification/dashboard & roles), Gate 5 (security and cutover). Keep Draft PR #10 unmerged and `GATEWAY_MODE=UAT_READ_ONLY`.


## Gate 1 operator evidence — 2026-10-16

**Status: PASS for the four controlled, fixed-fixture tests of real GAS `submitVisit_`** — operator-supplied Apps Script Editor result:

```json
{
  "status": "PASS",
  "environment": "SYNTHETIC_GAS_SANDBOX",
  "scope": "REAL_SUBMIT_VISIT_NEGATIVE_PATH",
  "buildId": "BHHINF-P1-SAFETY-20261016-R2",
  "cases": [
    {"case":"PENICILLIN_AMOXICILLIN","result":"PASS","code":"DRUG_ALLERGY_HARD_STOP","visitWrites":0,"stockWrites":0},
    {"case":"STUDENT_UNKNOWN_HISTORY","result":"PASS","code":"STUDENT_ALLERGY_STATUS_UNVERIFIED","visitWrites":0,"stockWrites":0},
    {"case":"STAFF_KNOWN_PENICILLIN","result":"PASS","code":"DRUG_ALLERGY_HARD_STOP","visitWrites":0,"stockWrites":0},
    {"case":"STAFF_ALLERGY_MISSING","result":"PASS","code":"ALLERGY_STATUS_REQUIRED","visitWrites":0,"stockWrites":0}
  ],
  "visitWrites":0,
  "stockWrites":0,
  "notificationWrites":0,
  "auditWrites":0
}
```

Independent read-only Google Sheets reconciliation after receiving the result:
- DISPENSE_HEADER **11**, DISPENSE_ITEMS **3**, STOCK_TRANSACTION **18**, NOTIFICATION_LOG **4**.
- MOCK-LOT-003A **29**, MOCK-LOT-003B **50**, MOCK-LOT-005A **20**; aggregate ORS **79**, Amoxicillin **20**.
- DRUG_ALLERGY_RULES one synthetic ACTIVE rule `AR07c10f3cb053440fbc`.
- Referral and emergency email toggles `FALSE`, all four TO/CC fields blank.
- AUDIT_LOG currently **23**; newest entry `LOGIN / SUCCESS` (one additional login compared with earlier baseline 22). No observed new Dispense/Clinical UAT audit. This reconciles independently with zero clinical transaction writes, but is not proof against unrelated concurrent activity.

This meets **Gate 1 for the four scoped live negative cases**, not an exhaustive clinical safety or end-to-end Production release. Further testing of broader allergy terminology, rollback/concurrency, notifications, and security remains open. Preserve the original operator result and snapshot as evidence.
