# BHH Infirmary — Negative-path Clinical & Inventory UAT

**Date:** 2026-10-16  
**Environment:** GitHub Review Branch / Node.js VM executing original Apps Script source  
**Production:** Unchanged, `main` untouched, GAS production unchanged  
**Cloudflare Writer:** Existing successful one-shot UAT is closed and must never be replayed

## Automated evidence

CI workflow run: https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38865446320

GAS tests use `backend/tests/negativePath.test.mjs` and load the **real** `backend/Code.gs`, `backend/30_Recipients.gs`, and `backend/40_ClinicalP4.gs` into an isolated in-memory JavaScript VM. All mocks throw if any Sheet write, stock sync, rollback write, or audit write is attempted unexpectedly. No external GAS endpoint or Google Sheet is modified by the negative-path test suite.

Cases verified:

| Case | Expected result | Scope |
| --- | --- | --- |
| Existing `clientTransactionId` | `DUPLICATE_TRANSACTION`; no writes | VM |
| Requested 80 ORS with only 79 available after one-shot success | `INSUFFICIENT_STOCK`; no writes | VM |
| Expired + Quarantine + Recall + Damaged stock only | `INSUFFICIENT_STOCK`; no writes | VM |
| Allergy acknowledgement missing | `STUDENT_SAFETY_REVIEW_REQUIRED`; no writes | VM |
| Stale allergy snapshot | `STUDENT_SAFETY_REVIEW_REQUIRED`; no writes | VM |
| Invalid/nonpositive quantity | `INVALID_QTY`; no writes | VM |
| Invalid disposition | `INVALID_DISPOSITION`; no writes | VM |
| Free-text recipient drug with missing allergy status | `ALLERGY_STATUS_REQUIRED`; no writes | VM |
| Unknown medication code | `ITEM_NOT_FOUND`; no writes | VM |
| Documented Penicillin allergy + Amoxicillin, even if acknowledged | `DRUG_ALLERGY_HARD_STOP`; no writes | VM, new **review-only** backend patch |
| Free-text Penicillin allergy + Amoxicillin | `DRUG_ALLERGY_HARD_STOP`; no writes | VM, new **review-only** backend patch |
| Penicillin allergy + unrelated ORS | No blanket class mismatch stop (acknowledgement still required) | VM, review-only backend patch |

## Clinical safety defect and contained fix

The GAS production baseline previously checked whether the user acknowledged the current allergy text but **did not cross-check it against the proposed drug's generic ingredient**. This could permit Amoxicillin for a person with a recorded Penicillin allergy.

The review branch adds a **narrow hard stop** for Penicillin/Amoxicillin/Ampicillin documented name matches against the medication's **Generic Name**, before any stock or visit record is committed. The new error code is `DRUG_ALLERGY_HARD_STOP`. This is a carefully scoped *candidate rule*, not a complete clinical allergy engine. It must undergo a pharmacist's review before GAS Sandbox deployment and Production consideration. There is no override route through the client for this narrow case.

Clinical reference: U.S. FDA AMOXIL prescribing information, Section 4 contraindications, revised May 2024: https://www.accessdata.fda.gov/drugsatfda_docs/label/2024/050542s032,050754s022,050760s023,050761s019lbl.pdf

**Limitations:** Allergy text is not normalized to a comprehensive coded ingredient/drug-class ontology; generic-name matching cannot reliably assess other documented drugs or severity, class cross-reactivity, ambiguous allergy histories, drug synonyms, combination formulations or future catalog entries. This is a targeted safety improvement, *not* grounds to mark the overall Clinical Safety Gate passed.

## Live evidence distinction

The prior synthetic GAS Sandbox **positive** test was independently reconciled (`Vde2628c7874d4471`, `MOCK-ITEM-003` ORS ×1, `MOCK-LOT-003A` 30→29, `MOCK-LOT-003B` unchanged 50, D1 one-shot `COMMITTED/RECONCILED`). These negative-path tests are **in-memory** and do not yet establish rejection behavior by the deployed GAS Sandbox URL. Do not claim negative-path live UAT complete.

The **one-shot test must not be reset or replayed**. D1 historical migration, multi-Sheet rollback injected failures under real Apps Script runtime, concurrent users, real Cloudflare errors, and outbox/email negative cases still require independent UAT and rollback evidence.

## Signoff gate

- [x] Negative-path automated Apps Script tests pass without any Sheet mutations
- [x] New Penicillin/Amoxicillin hard-stop candidate passes tests in review branch
- [x] UAT email configuration disabled and recipients cleared (synthetic Sandbox only)
- [ ] Oncology/clinical pharmacist signs off complete allergy rule and limitations
- [ ] GAS **Sandbox** deployed with candidate fix and independent restricted UAT
- [ ] Documented real GAS negative-path verification and controlled rollback fault injection
- [ ] Reconcile all 13 Sheets → D1 and historical stock ledger
- [ ] Production cutover authorized separately
