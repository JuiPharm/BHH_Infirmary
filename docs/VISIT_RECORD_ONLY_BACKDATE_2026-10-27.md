# BHH Infirmary — Visit Order Log Only + Backdated Visit

## Final scope (corrected 2026-10-28)

**Visit records medication / medical-supply ordering ONLY. There is no Stock deduction option.**

- User picks an active Item Master item or enters a free-text DRUG / MEDICAL_SUPPLY name.
- User records order quantity (positive, up to three decimal digits) and freely editable unit.
- Frontend shows **no Stock/FEFO toggle**, no available balance, no stock warnings, no inventory calculations and no Lot selection.
- Clicking Save Visit writes the Visit header and clinical order details only. The server ignores any old `recordOnly:false` or legacy `submitDispense` intent: Visit **cannot** mutate `STOCK_LOT`, `ITEM_MASTER.QTY`, `STOCK_TRANSACTION`, or call `syncItemQty_`.
- `DISPENSE_ITEMS` retains its legacy name for compatibility, with an appended `Stock Effect` column. All new Visit order records use **`ORDER_ONLY`**, including medication records. The entry means *ordered/recorded*, not necessarily administered/dispensed.
- The staff member and `Created At` / `Completed At` are recorded as actual audit fields. The selected `Visit Date` is calendar based, default Bangkok Today. Historical dates allowed, future dates rejected. Historical `Visit Time` blank rather than made up.
- User's selected Interventions are preserved; simply recording a medication order does **not** automatically claim administration.
- The pre-existing student safety review and free-text-recipient drug allergy acknowledgement are still enforced when DRUG entries are present. Do not treat this basic check as a complete clinical allergy engine.
- Historical REFERRAL / EMERGENCY Visit records do not emit an urgent notification as if current. Current-day referral behavior remains unchanged.

## Data contract

- Versioned submit action: `submitVisitV250`; GAS `API_VERSION=2.5.0`, frontend `REQUIRED_API_VERSION=2.5.0`. Older GAS refuses `submitVisitV250` instead of silently deducting Stock.
- The 2.5.0 GAS `submitVisit`, `submitDispense` (compatibility alias) and `submitVisitV250` all use the **same order-only server path**.
- Request: `visitDate: YYYY-MM-DD`, `items:[{ itemCode?:string, itemName?:string, itemType:'DRUG'|'MEDICAL_SUPPLY', qty:number, unit:string }]`, `clientTransactionId` plus existing clinical Visit fields.
- `Stock Effect=ORDER_ONLY` on new order lines. Historical rows with blank column are not rewritten. Existing stock modules outside Visit remain intact; this feature does not delete unrelated inventory tools.

## Required verification before production

1. The UI has no Stock toggle and no available-quantity text in the Visit order section.
2. Search/add an Item Master entry with QTY zero; **order must still save**.
3. Add a free-text drug order and a free-text supply order, with quantity and unit.
4. Backdate Visit, preserve selected date and today's audit timestamp, reject future dates.
5. On a synthetic isolated GAS Sandbox, inspect `STOCK_LOT`, `STOCK_TRANSACTION` and `ITEM_MASTER.QTY` before and after; **all unchanged**, including for a request with `recordOnly:false` and legacy compatibility action.
6. Duplicate transaction and failed partial write cannot cause duplicate Visit/order detail records.
7. Clinical student allergy review / free-text allergy validation remains enforced for DRUG orders.
8. Verify referral alert handling and historical notification suppression.
9. Check existing order history and downstream dashboards understand `ORDER_ONLY` is not dispensed stock or clinical administration.

Do not merge or deploy to Production until reviewed and synthetic live GAS integration UAT passes. Existing P1 Cloudflare Gateway PR #10 may reject the versioned new action until its allowlist is explicitly updated and its safety gates are satisfied. No production writer cutover or D1 migration is part of this PR.
