# Architecture Review — P3 Inventory Operations

Date: 2026-10-05  
Reviewer role: Senior Web App Developer  
Scope: frontend architecture, Google Apps Script backend boundaries, inventory workflows, CI/release structure.

## Executive assessment

The current React + TypeScript + Vite frontend and Google Apps Script + Google Sheets backend remain appropriate for the current low-concurrency infirmary workflow. A platform rewrite is not justified at P3.

However, feature growth has exposed two structural risks:

1. Large page components are accumulating unrelated workflows.
2. `backend/Code.gs` remains a monolith containing routing, authentication, clinical workflow, inventory workflow, dashboard and infrastructure helpers.

P3 therefore introduces a feature boundary for new inventory operations instead of expanding `StockPage.tsx` further.

## Decisions implemented in P3

### Frontend

New business-heavy inventory functionality lives under:

`frontend/src/features/inventory/`

- `InventoryOperationsPage.tsx` — workflow composition/UI.
- `api.ts` — inventory-specific API boundary.
- `domain.ts` — inventory lifecycle/domain helpers.
- `__tests__/inventory.test.ts` — domain behavior tests.

`StockPage.tsx` remains the legacy/basic inventory screen for item master, receiving, manual adjustment and transaction browsing. New Stock Count / Lot Status / Integrity logic must not be added to it.

The obsolete `DispensePage.tsx` was removed because `VisitPage.tsx` is now the canonical clinical workflow.

### Backend

P3 uses explicit operations rather than overloading generic adjustment:

- `updateStockLotStatus`
- `submitStockCount`
- `getStockCounts`
- `getInventoryIntegrity`

The distinction is intentional:

- Quantity correction is not the same event as lifecycle status.
- Quarantine/recall/damaged stock remains physically present but is excluded from usable stock.
- Stock Count creates an auditable count record and only creates adjustment transactions where variance exists.

All P3 inventory mutations use ScriptLock and rollback patterns.

### Data model

Added `STOCK_COUNT` as an append-only audit table.

Controlled lot statuses:

- ACTIVE
- QUARANTINE
- DAMAGED
- RECALL
- EXPIRED
- INACTIVE

Only ACTIVE, non-expired lots with positive quantity are usable.

## Structural findings still open

### 1. Backend monolith

`backend/Code.gs` should be split before substantial P4/P5 growth.

Recommended Apps Script file layout:

- `00_Config.gs`
- `10_Router.gs`
- `20_Auth.gs`
- `30_Students.gs`
- `40_ClinicalVisits.gs`
- `50_Inventory.gs`
- `60_Dashboard.gs`
- `90_Sheets.gs`
- `99_Utils.gs`

Apps Script loads all project `.gs` files into the same global runtime, so this can be a structural refactor without changing public API actions. This should be done as its own PR, not mixed into a clinical/business feature.

### 2. Remaining large React pages

Current large pages such as `StudentsPage.tsx`, `VisitPage.tsx` and legacy `StockPage.tsx` should gradually move to feature folders with hooks/components. Avoid a repository-wide rewrite.

### 3. Generic API client

`frontend/src/api.ts` should remain transport-only. Feature-specific action names and payload shaping should increasingly live in feature-level API modules.

P3 starts this pattern with `features/inventory/api.ts`.

### 4. Routing

The app still uses in-memory tab state instead of URL routing. This is acceptable for the current internal application but limits deep links, refresh restoration and browser navigation. Introduce a router only when workflow requirements justify it; do not add it solely for style.

## Non-negotiable architectural rules going forward

1. New high-risk business rules belong in domain/service functions, not directly inside JSX event handlers.
2. Backend authorization remains authoritative; hiding a button is never considered access control.
3. Every stock mutation must have:
   - server-side validation,
   - role validation,
   - ScriptLock where concurrency matters,
   - audit/ledger evidence,
   - rollback or explicitly documented non-atomic behavior.
4. Inventory lifecycle state must not be represented through free-text adjustment reasons.
5. Usable stock and physical stock must remain distinct concepts.
6. Existing production Sheet columns must never be reordered during migration.
7. New Sheets/columns must be self-migrating or covered by a deployment migration step.
8. Feature PRs should stay stackable and independently reviewable.
9. CI unit tests + production build are minimum merge gates.
10. Live Apps Script / Google Sheets UAT remains mandatory before production release.

## P3 review gate

P3 code can pass structural review when:

- Inventory operations are outside `StockPage.tsx`.
- Stock Count has an explicit persistent audit model.
- Lot status transitions are controlled, not free text.
- Expired lots cannot be reactivated.
- Receiving an already expired/invalid lot is rejected.
- Manager remains read-only for stock mutation.
- CI passes tests and production build.
- Live Sheet UAT is documented as a remaining release gate.
