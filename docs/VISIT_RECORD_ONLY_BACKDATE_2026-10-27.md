# BHH Infirmary — Record-only usage + backdated Visit (2026-10-27)

## Change summary
- New Visit displays a calendar date field with Bangkok **Today** as default, and a Today reset button.
- Users with current Visit permissions may select any valid historical date from year 2000 up to Today. Future dates, invalid calendar dates and malformed dates are rejected in the browser **and** backend.
- Each Visit item can be either:
  - `DEDUCT`: existing Item Master/FEFO stock-deduction path. Quantities are positive integers no greater than usable stock.
  - `RECORD_ONLY`: writes quantity (up to three decimals), editable unit, name and item type in `DISPENSE_ITEMS`, but **does not change STOCK_LOT, ITEM_MASTER.QTY or STOCK_TRANSACTION**.
- Both modes can be combined in one Visit. Existing historical dispense rows with a blank `Stock Effect` should be interpreted as legacy `DEDUCT` for display/reporting.
- Record-only supports selected active Item Master entries even with stock zero. Free-text record-only lines may be **medical supplies only**. Drugs must be selected from Item Master so backend student allergy/safety review still runs; stock-recording mode is **not** a drug safety bypass.
- Record-only item names/units beginning with spreadsheet-formula characters are escaped before Sheets writes.

## Data contracts
- `submitVisit` request gains optional `visitDate` in YYYY-MM-DD; omitted dates remain Today for legacy clients.
- Each `items[]` can pass `recordOnly: true`. Unspecified/false continues stock-deducting.
- The appended `DISPENSE_ITEMS` field is `Stock Effect`, with explicit `RECORD_ONLY` or `DEDUCT`; existing data must not be rewritten.
- `Visit Date` is the selected service date. For historical entries `Visit Time` remains empty rather than falsely reporting current clock time. `Created At`, `Completed At` and `Staff ID` continue tracking actual submit time/user. A Date update is **not** a replacement for the audit timestamp.
- Historical `REFER_HOSPITAL` or `EMERGENCY_TRANSFER` records **do not trigger new referral/emergency emails**; returned `notification.type = HISTORICAL_VISIT`. Today's existing email behavior is preserved.
- Idempotency and rollback remain part of the normal Visit transaction; no automatic retry after uncertain response.

## Deployment constraints
- **Review branch only**: do not auto-merge into `main`, deploy GAS Production or migrate D1 as part of this change.
- Coordinate against open P1 Cloudflare Gateway draft PR #10 before integration; P1/UAT_READ_ONLY deliberately blocks direct Visit writes. Never relax that gate to test this feature.
- Before release: backup real Sheets; create isolated synthetic copy; deploy updated GAS source to dedicated GAS Sandbox and point only isolated preview to it. Run the app's read-only/backend version gates as defined by its current branch. Do not call `setupSystem()` against live Sheets.
- On GAS Sandbox ensure only `DISPENSE_ITEMS` has the new `Stock Effect` column appended, preserving all existing columns and rows.
- Test one stock-only Visit, one free-text record-only Visit, one master-linked record-only medicine with allergy review, one mixed Visit, one backdated referral and rejected future date.
- For each test reconcile Visit Header, Dispense Items, Stock Transaction, Stock Lot and Item Master before/after, and notification log. Also test duplicate transaction and forced write failure/rollback before production change.
- Review governance of historical entries (authorization, maximum backdating window, reporting criteria, addendum/corrections) before enabling production writes.
- Do not treat passing CI/in-memory mock tests as end-to-end live GAS UAT.

## Known reporting implication
- Dashboard totals keyed on `Visit Date` include backdated visits in that historical period. Reporting must not treat `RECORD_ONLY` usage as a stock transaction or infer stock depletion from `DISPENSE_ITEMS` aggregates. For Stock consumption only sum `STOCK_TRANSACTION` rows with `Transaction Type=DISPENSE`.

## Acceptance criteria
1. Default Visit Date equals Bangkok Today; calendar can choose yesterday; tomorrow rejected.
2. Existing FEFO dispensing still deducts stock and writes matching transaction(s).
3. Record-only free text supply with 0.5 pack persists with correct date/unit and **zero** stock movement.
4. Master-linked drug in record-only mode is validated for existing drug safety and allergy review before submission.
5. Mixed-mode Visit deducts only DEDUCT lines; all usage lines appear in Visit history.
6. Historical Referral/Emergency Visit does not send an urgent message as if the event occurred now.
7. Schema append never truncates or rearranges old data; failed or duplicate write cannot create a second Visit.

## Version compatibility hard stop
- GAS `API_VERSION` and frontend `REQUIRED_API_VERSION` must **both be 2.5.0**. Never deploy this UI against a 2.4.1 GAS writer: that older writer may **deduct inventory** from an Item Master line even if the browser sends `recordOnly:true`.
- Deploy only to a synthetic isolated environment after API-version gate verification. Do not point the current Production browser at an incompatible writer, or change its version string without deploying the matching code.
