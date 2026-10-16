# BHH Infirmary — Gate 2 Controlled Stock / Rollback / Concurrency UAT Plan
**Date:** 2026-10-16 (Asia/Bangkok)
**Target:** Cloudflare Gateway Production V1 with **GAS/Google Sheets as the sole clinical and inventory writer**.
**Current:** preparation + VM regression PASS; **real GAS Gate 2 NOT YET PASS**.

## Evidence already achieved
1. Original one-shot synthetic dispensing wrote exactly one Visit, one Dispense Item and one Stock Transaction. ORS lot `MOCK-LOT-003A` fell from 30→29, other ORS lot stayed at 50; no test referral/email sent. The unique transaction must never be rerun.
2. Clinical Gate 1 real GAS `submitVisit_` rejected four fixed cases with reported 0 Visit/Stock/Audit/Notification write; independent read-only ledger was unchanged.
3. At code commit `01e2767c8866893c87328f3266976f0831b6aa0b`, CI run [38931271650](https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38931271650) passes **62 GAS tests and 46 Gateway tests**. Cases include **4 post-remote-apply fault-injection rollback simulations** at `STOCK_LOT`, `DISPENSE_HEADER`, `DISPENSE_ITEMS` and `STOCK_TRANSACTION`, plus successful Visit/ledger, same-expiry FEFO lot-ID tie and duplicate client transaction handling. **These are in-memory VM tests, not proof of Google Sheets atomicity.**

## Hard precondition for *live* Gate 2
Use a **new, isolated disposable copy** of the synthetic Google Sheet and a **separate GAS Sandbox script project**, never the working Gate 1 workbook and never Production. Explicitly validate both GAS project identity and `SHEET_ID` before any write. Copy all required schema and mock data, but **no real personal information**. Disable referral/emergency mail and keep all recipient TO/CC blank. Back up this throwaway copy and preserve a ledger snapshot.

Do not reset or replay `Vde2628c7874d4471`, `BHH-UAT-20261016-ONE-SHOT-001` or synthetic allergy Rule ID `AR07c10f3cb053440fbc`. Do not enable a general-purpose Cloudflare Preview writer for this test. Prepare new unique transaction keys only on disposable data.

## Controlled Gate 2 acceptance matrix
| ID | Scenario | Expected result | Verified now |
|---|---|---|---|
| STK-01 | FEFO: earlier-expiring ACTIVE lot consumed before later expiry | Correct lot allocated, 1 ledger line and aggregate reconciled | VM partial / live pending |
| STK-02 | Same expiry dates, two different lot IDs | Deterministic smaller lot ID chosen | VM PASS / live pending |
| STK-03 | EXPIRED, QUARANTINE, RECALL, DAMAGED stock | No usable stock and no Visit/Stock writes | VM PASS negative / live pending |
| STK-04 | Insufficient stock at commit boundary | Explicit error, no partial Visit, no quantity change | VM PASS / live pending |
| STK-05 | Same clientTransactionId repeated or retried after known commit | Exactly 1 logical transaction, second rejected with `DUPLICATE_TRANSACTION` | VM PASS / live pending |
| STK-06 | `STOCK_LOT` write applies but remote call throws | Either full rollback to previous snapshot or explicit `TRANSACTION_ROLLBACK_FAILED` requiring intervention; never silent partial success | VM PASS injected / live pending |
| STK-07 | Failure after Visit Header write | All touched sheets rolled back or STOP/RECONCILE | VM PASS injected / live pending |
| STK-08 | Failure after Dispense Items or Stock Transaction write | All touched sheets rolled back or STOP/RECONCILE | VM PASS injected / live pending |
| STK-09 | Two simultaneous requests compete for same remaining lot quantity | Lock serializes, at most allowed stock is dispensed; no negative quantity or duplicate Visit | **LIVE PENDING**, cannot be proven by sequential VM |
| STK-10 | Ambiguous network failure after possible commit | `OPERATION_STATUS_UNKNOWN`, operator reconciles by client transaction ID; **no automatic retry** | Gateway mocked PASS / live pending |
| STK-11 | Stock ledger vs Lot vs Item Master QTY | All balances explainable by transactions, no negative/phantom stock | Read-only baseline PASS / live pending after mutations |
| STK-12 | Audit and notification isolation | Rejected transaction: no clinical audit/email; completed referral: notification independent of stock rollback | Clinical Gate 1 PASS; referral UAT remains Gate 4 |

## Runtime protocol (operator + clinical/IT reviewer)
1. Before a controlled case: record workbook ID, GAS project ID/deployment URL, current commit, user role, transaction ID, timestamp; capture full read-only snapshots of `STOCK_LOT`, `ITEM_MASTER`, `DISPENSE_HEADER`, `DISPENSE_ITEMS`, `STOCK_TRANSACTION`, `NOTIFICATION_LOG`, `AUDIT_LOG`.
2. For STK-06..08, instrument failure **only** in the disposable GAS clone, under explicit source review; the production code must not contain enabled fault injection. Document precise injection step and expected rollback after partial remote write.
3. Execute each controlled test *once* using fresh fixture and transaction ID. For concurrent requests require two authorized test operators and an agreed coordination protocol; capture both outcomes.
4. After each: independently read every touched sheet, count rows by Visit/clientTransactionId, compare lot before/after/ledger, run `getInventoryIntegrity`, review audit, and ensure email was not sent.
5. On any `TRANSACTION_ROLLBACK_FAILED`, ambiguous timeout, partial commit, negative inventory, duplicate ledger, or unexpected real-recipient notification: **STOP testing immediately**, preserve evidence, isolate writer, and perform manual reconciliation. **Never** auto-retry.
6. Mark Gate 2 PASS only when all required STK checks are evidenced and clinical/operations reviewer signs off. Attach before/after reconciliation and fault-injection records to Draft PR #10.

## Production invariant
- A successful CI run is **necessary but not sufficient** for real GAS concurrency and rollback safety.
- Cloudflare Preview must remain `UAT_READ_ONLY` while tests are pending.
- No D1 Production writer/parallel writer during V1.
- Do not merge Draft PR #10 or deploy Production until Gate 2–5 evidence and formal approvals are recorded.
