# BHH Infirmary — One-shot Synthetic Allergy Rule UAT

## Status at deployment (2026-10-16)
- **User-confirmed** `ALLERGY RULES READ PASS · 1 กฎ · System Penicillin Hard Stop = LOCKED` through the signed GAS Sandbox session and Cloudflare.
- Cloudflare Worker `bhh-infirmary-p1-gateway-preview` **initial version `337badcb-6373-466f-9527-aceb72661f37`** was deployed then superseded by separate Draft-only and Publish-only modes; do not use the combined mode.
- The first stage permits **only** `submitSyntheticAllergyDraft` in `GATEWAY_MODE=UAT_RULE_DRAFT_ONLY`. The separate, later `GATEWAY_MODE=UAT_RULE_PUBLISH_ONLY` permits **only** `publishSyntheticAllergyRule`. Both require `payload.confirmed === true`. The combined write mode is rejected. Direct `saveDrugAllergyRule`, `publishDrugAllergyRule`, Visit, Stock and user-management writes stay blocked at the gateway.
- Both actions independently verify the signed GAS session has `staffId=UAT-TEST-ADMIN` and `role=SUPER_ADMIN`; no request-supplied allergen, generic, rule ID, recipient, drug or quantity is accepted.
- Fixed synthetic rule: allergen `BHHUATALLERGEN20261016`, generic `BHHUATGENERIC20261016`, reference states explicitly that it is a test and is NOT a clinical rule.
- D1 SQL table `uat_allergy_rule_gate` is created in dedicated *sandbox* database `bhh-infirmary-p2-sandbox`. Unique test ID `BHH-UAT-ALLERGY-20261016-001` ensures one Draft attempt and one Publish attempt only. On uncertain GAS outcomes, D1 records `NEEDS_REVIEW`; there is **no automatic retry**.
- Before any operator submission, an independent read showed D1 `uat_allergy_rule_gate` has **0 rows** and Google Sheets `DRUG_ALLERGY_RULES` has **0 custom rules**. Two pre-existing Cloudflare secrets were verified preserved.
- GitHub security test run https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38876197318 passed, covering D1 claim, duplicate/uncertain conditions, wrong role, disallowed arbitrary writes and requiring explicit confirmation.

## Browser flow — staged, evidence-driven

1. Login to https://bhh-infirmary-p1-gateway-preview.bhh-infirmary-sandbox.workers.dev/ with the synthetic sandbox `UAT-TEST-ADMIN` account.
2. Click **ขั้นที่ 1 · บันทึก Synthetic Draft** exactly once, then confirm in browser. Expected `UAT ALLERGY DRAFT PASS: AR... · DRAFT · Baseline=LOCKED`.
3. **STOP** before clicking Publish. Independently verify one and only one `DRAFT` rule is present in `DRUG_ALLERGY_RULES`, D1 claim `DRAFT_CONFIRMED`, `AUDIT_LOG` has `ALLERGY_RULE_DRAFT / SUCCESS`, and no changes occurred to Visit/Stock. If any result is uncertain, DO NOT RETRY.
4. After independent Draft reconciliation and user confirmation, **the operator must first deploy/enable Publish-only mode and unlock the Publish button**. Only then click **ขั้นที่ 2 · Approve/Publish Synthetic Rule** exactly once. Expected `UAT ALLERGY PUBLISH PASS: same AR... · ACTIVE · Baseline=LOCKED`.
5. Independently read back D1 `ACTIVE_CONFIRMED`; `DRUG_ALLERGY_RULES` row `ACTIVE` with `Approved By=UAT-TEST-ADMIN`; one `ALLERGY_RULE_PUBLISH / SUCCESS` audit entry; no Visit/Stock mutations or notification emissions. **Do not click either action twice**.
6. After completion, set Cloudflare `GATEWAY_MODE=UAT_READ_ONLY` and remove `UAT_DB` binding; remove buttons from active deployed page. Preserve the D1 claim for audit.

## Scope and explicit exclusions
- This tests Registry Draft and Publish *without creating any Visit*. It does not independently prove that the new ACTIVE rule blocks a live GAS medication order or that all possible allergy terms are handled correctly. VM regressions cover matching. A separate *controlled, synthetic-only*, clinically reviewed negative-path Visit trial is required for a live GAS Hard Stop acceptance gate.
- Do not merge Draft PR #10, turn on real email notifications, or cut over Production.
