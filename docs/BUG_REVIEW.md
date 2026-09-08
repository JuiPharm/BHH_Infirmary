# Bug Review
## Findings fixed
- Salted password hash and session token handling.
- GAS-compatible `text/plain` POST body.
- Backend RBAC and session validation.
- Backend quantity validation under LockService.
- Expired lots excluded from availability.
- Duplicate client transaction is rejected.
- `ITEM_MASTER.QTY` remains an aggregate, not frontend authority.

## Release gate
The package is a foundation and is **not live-data production-ready** until the dispense commit engine, inventory receive/adjustment, low-stock notification, full dashboard, rollback/atomicity tests, and live Google Workspace UAT are completed. This report deliberately does not claim those features are complete.
