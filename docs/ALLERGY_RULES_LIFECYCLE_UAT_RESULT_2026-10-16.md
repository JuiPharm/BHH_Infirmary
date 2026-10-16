# BHH Infirmary — Completed Synthetic Allergy Rule Lifecycle UAT

**Date:** 2026-10-16, local time Asia/Bangkok (UTC+07:00)  
**Environment:** isolated GAS/Google Sheets Sandbox + Cloudflare P1 Preview + sandbox D1 one-shot gate  
**Status:** **PASS** for registry read → Draft → Publish and readback. **NOT** equivalent to clinical allergy hard-stop UAT.

## Proven read and lifecycle results

1. **User-observed read probe:** `ALLERGY RULES READ PASS · 1 กฎ · System Penicillin Hard Stop = LOCKED`.
2. **User-observed Draft:** `UAT ALLERGY DRAFT PASS: AR07c10f3cb053440fbc · DRAFT · Baseline=LOCKED · no Visit/Stock write`.
3. **Independent Draft reconciliation:** exactly one candidate rule row in `DRUG_ALLERGY_RULES`; D1 `DRAFT_CONFIRMED`; one `ALLERGY_RULE_DRAFT / SUCCESS` audit log.
4. **User-observed Publish:** `UAT ALLERGY PUBLISH PASS: AR07c10f3cb053440fbc · ACTIVE · Baseline=LOCKED · no Visit/Stock write`.
5. **Independent Publish reconciliation:** D1 `ACTIVE_CONFIRMED` with `READBACK_CONFIRMED`, rule ID and staff ID `UAT-TEST-ADMIN`. The Google Sheet has **one** rule row with `ACTIVE`, `Approved By=UAT-TEST-ADMIN`, `Approved At=2026-10-16 16:42:23`. The audit has exactly **one** `ALLERGY_RULE_DRAFT / SUCCESS` and **one** `ALLERGY_RULE_PUBLISH / SUCCESS` referencing that same rule. No duplicates found.
6. **Synthetic-only terms**: allergen `BHHUATALLERGEN20261016`, blocked generic `BHHUATGENERIC20261016`. The reference explicitly says *Not a clinical rule*. Never use these terms to authorize real clinical decisions.
7. **Unchanged relevant fixtures:** ORS `MOCK-LOT-003A = 29`, `MOCK-LOT-003B = 50`, `MOCK-ITEM-003 QTY = 79`; Amoxicillin `MOCK-LOT-005A = 20`, `MOCK-ITEM-005 QTY = 20`. No additional Visit/Dispense/Stock transactions identified at the rule Publish timestamp; existing last `DISPENSE` transaction for `Vde2628c7874d4471` remains the October 16 earlier one-shot test. Existing `NOTIFICATION_LOG` had four fixture entries, no new lifecycle entry. Referral/Emergency Email switches stayed `FALSE`, with recipients blank.
8. **Clean shutdown:** Cloudflare Worker P1 Preview version `7b2bde32-17df-4f41-87b2-3a478cae5bd8` deployed successfully with **100% traffic**. Latest verified settings: `GATEWAY_MODE=UAT_READ_ONLY`, `GAS_WEB_APP_URL` and `SESSION_KEY_B64` remain `secret_text`; **`UAT_DB` binding removed**. UAT page Draft/Publish action buttons were removed. The D1 one-shot ledger entry was preserved for audit and must not be reset or replayed.
9. CI for page removal and UAT-related tests passed at https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38882529128.

## Safety boundaries and remaining work

- The registry lifecycle **PASS** validates ability to create and activate a synthetic rule. It does **not** prove the deployed GAS blocks a penicillin-allergic student from receiving Amoxicillin or that all drug allergy rules and synonyms are complete.
- Current published synthetic `ACTIVE` rule is retained solely as UAT evidence in the **Sandbox**; it has no clinical content but remains eligible for the matching engine if test terms are deliberately supplied. Any subsequent cleanup/retirement must preserve the audit trail and must be separately designed, not manually delete the row.
- No Production deployment, patient data, notification sender activation, D1 Production cutover or Draft PR merge occurred.
- Next clinical gate: implement a **read-only dry-run GAS validation action** that accepts only an approved synthetic fixture, evaluates the existing server-side allergy hard stop, returns `DRUG_ALLERGY_HARD_STOP` without writing Visit, Stock or Audit patient events; add a distinct negative-case and unrelated-ORS control, then install a new GAS **Sandbox-only** version after clinical review. Include no false PASS if the action is absent or legacy backend still serving old version.
- The next migration gates remain FEFO/rollback fault injection and full D1 historical ledger reconciliation under synthetic data only.

**Do not replay** the completed `AR07c10f3cb053440fbc` Draft/Publish or prior Visit `Vde2628c7874d4471` one-shot tests.
