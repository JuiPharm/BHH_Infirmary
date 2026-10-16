# Clinical Hard Stop — Zero-write Regression and Next Gate
**Project:** BHH Infirmary · 2026-10-16
**Branch:** `feature/cloudflare-gateway-precutover-20261016` (Draft PR #10)
**Release:** REVIEW ONLY / DO NOT MERGE OR DEPLOY TO PRODUCTION

## Evidence and boundaries
- Operator reported the live GAS Sandbox read-only diagnostic as `CLINICAL HARD STOP DRY-RUN PASS`: penicillin/amoxicillin BLOCK, published synthetic ACTIVE rule BLOCK, unrelated ORS ALLOW, no Visit/Stock writes. This is operator-reported diagnostic evidence; the diagnostic uses hardcoded synthetic plans and returns zero-write metadata. It is **not** an end-to-end `submitVisit` rejection test.
- Independent **read-only** Google Sheets connector check after the report: synthetic `DRUG_ALLERGY_RULES` contains exactly one ACTIVE synthetic row (`AR07c10f3cb053440fbc`); `DISPENSE_HEADER` has 11 data rows, `STOCK_TRANSACTION` 18, `NOTIFICATION_LOG` 4; `MOCK-LOT-003A` 29, `MOCK-LOT-003B` 50 and `MOCK-LOT-005A` 20; ORS aggregate 79 and Amoxicillin 20. These match the prior recorded baseline. No writes were made in this check.
- The Cloudflare Gateway must remain in `UAT_READ_ONLY` with no UAT D1 writer binding; the unique historical one-shot transaction must never be replayed.
- Clinical policy is not generalized: Penicillin baseline is deliberately narrow, synonym/cross-reactivity mapping not exhaustively reviewed, and custom synthetic rule must never be treated as prescribing guidance.

## Fixes on the PR branch
1. `backend/Code.gs`: replaced `ensureHeaders_(DISPENSE_HEADER,...)` inside `submitVisit_` with **read-only** `assertVisitHeaderSchemaReady_` so a rejected Visit cannot alter the sheet header or formatting. Missing schema now fails with `VISIT_SCHEMA_NOT_READY`; migration must happen separately through authorized setup.
2. `backend/35_AllergyRules.gs`: missing `DRUG_ALLERGY_RULES` tab is now a fail-closed `ALLERGY_RULES_UNAVAILABLE` for paths invoking the registry; previously it returned an empty rule set and could silently ignore published custom rules.
3. `backend/tests/negativePath.test.mjs`: regression guards explicitly reject simulated schema writes and count all Sheet/stock/audit mutation attempts; added tests for multi-drug atomic rejection, missing registry, missing schema, published synthetic rule at `submitVisit_` write boundary, DRAFT inert behavior and both API aliases.
4. `backend/tests/p4Safety.test.mjs`: harness updated for an existing, read-only rule registry in the migrated deployment.
5. `frontend/src/api.ts` and GAS `humanError_`: Thai messages for fail-closed configuration/schema errors.

## CHS-01—16 traceability
| ID | Case | Evidence | Gate |
|---|---|---|---|
| 01 | Penicillin allergy / penicillin | Built-in conflict unit logic covers name match; broader naming review pending | Partial |
| 02 | Penicillin allergy / Amoxicillin | Real `submitVisit_` VM hard stop | VM PASS |
| 03 | Published synthetic ACTIVE rule | Real `submitVisit_` VM + operator-reported GAS read-only diagnostic | VM PASS; live submit rejected path pending |
| 04 | ORS unrelated to matched allergy | In-memory matcher and operator-reported dry-run | Partial; no authorized live write now |
| 05 | Inactive rule | DRAFT inert is tested; `INACTIVE` is not a supported registry lifecycle state | Scope gap |
| 06 | Allergy changed after acknowledgement | Stale snapshot at server-side boundary | VM PASS |
| 07 | Acknowledgement true, active conflict | `DRUG_ALLERGY_HARD_STOP` despite acknowledgement | VM PASS |
| 08 | Alias/trade/ingredient equivalence | Only controlled generic-term matching; no full ontology | Open clinical |
| 09 | Multi-medication batch one conflict | Rejected before all stock/visit writes | VM PASS |
| 10 | Concurrent stock/visit conflict | ScriptLock present, but cross-sheet atomicity/concurrency still needs injected live UAT | Open |
| 11 | Repeat/duplicate transaction | Existing client transaction guard, synthetic VM negative test | VM PASS |
| 12 | Rule store unavailable | Missing registry now fails closed before write, VM | VM PASS; other unknown-allergy inputs open |
| 13 | Free-text KNOWN_ALLERGY / Amoxicillin | Real `submitVisit_` VM hard stop | VM PASS |
| 14 | Supply-only Visit | Existing student guard bypasses drug rules; preserve in UAT | Partial |
| 15 | BLOCK zero mutation | Sheet header migration fixed; VM rejects writes/stock/audit on blocked path | VM PASS |
| 16 | Alternate submit route | `submitVisit` and `submitDispense` both pass through guarded `submitVisit_` | VM PASS |

## Open release gates
- Review clinically with pharmacist: false-positive allergy terms/negations, unknown histories, synonyms, ingredients in combination products, and whether fail-closed cases need a separate authorized correction workflow.
- GAS Sandbox must be updated with these **branch** changes by an authorized Apps Script owner. GitHub CI/package success does not deploy GAS.
- Execute an authorized **synthetic-only live negative-path** test without email and independently reconcile snapshots of Visits, Dispense, Stock, Notifications and Audits. Do not reuse completed D1 one-shot claims.
- Inject rollback failures only into a separate disposable sandbox; do not use a production-connected spreadsheet. Demonstrate recovery/reconciliation and manual intervention for uncertain outcomes.
- Do not change Cloudflare `UAT_READ_ONLY`, do not merge Draft PR #10, and do not cut over the Production writer until explicit clinical/security acceptance.
