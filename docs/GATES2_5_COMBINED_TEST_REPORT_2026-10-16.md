# Gates 2–5 combined review — 2026-10-16

**Release decision: NO-GO.** P1 architecture: Cloudflare Gateway, GAS/Google Sheets the sole writer, no D1 writer. Draft PR #10 remains unmerged.

## Source-driven CI results
At code SHA cc6cc1c416976dc138d8a5e7f0623349ea1d1a1:
- GitHub Actions CI run 38933479126 SUCCESS: 69/69 Apps Script tests, 51/51 Gateway tests; frontend tests and production build PASS.
- GAS synthetic package workflow 38933479101 SUCCESS (artifact exists, not GAS deployment).
- Gate 2: FEFO, tie-break, expired/quarantine, duplicate transaction and five in-memory post-apply rollback failures, including ITEM_MASTER.QTY, PASS. Real concurrent GAS and fault injection remain OPEN.
- Gate 3: Gate 1 previously operator-reported real GAS negative-path 4/4 PASS and independent seven-sheet reconciliation. Formal clinical pharmacist vocabulary, ingredient, negation, UNKNOWN and cross-reactivity signoff remains OPEN.
- Gate 4: New email HTML CI checks BHH navy, referral yellow/orange, emergency red, vitals, text fallback, escaping, subject CRLF handling; Dashboard V2 synthetic counts and role restrictions PASS. Notification recovery fixed to exact 72h and tested. No real email delivered; live synthetic MailApp/browser UAT remains OPEN.
- Gate 5: Preview mutation deny, CSRF/origin, bootstrap blocking, same-origin frontend, HttpOnly encrypted sessions, no D1 writer checks PASS. Cloudflare Preview was inspected read-only and remains UAT_READ_ONLY with GAS URL and session encryption secrets and no D1 binding. Direct GAS bypass controls, WAF/rate limits, new Worker deployment, production backup/rollback and security acceptance remain OPEN.

## Production stop conditions
1. No isolated disposable GAS/Sheets live concurrency and remote-post-write failure injection with complete reconciliation.
2. No clinical decision-maker's signed review of drug allergy coverage; built-in Penicillin/Amoxicillin rule does not replace complete clinical decision support.
3. No authorized recipient-only synthetic email / complete workflow and dashboard E2E UAT.
4. Direct legacy GAS endpoint still requires an approved ingress restriction and security review; production single-writer cutover and rollback untested.
5. Revised notification source code is NOT established as deployed by the earlier GAS buildId R2 health response. Verify source archive/checksum after changes.

## No unauthorized live changes
Do not replay prior synthetic one-shot transactions; do not merge Draft PR #10 or deploy to Production; do not send email to real recipients; do not use patient data; do not activate D1 writer. CI passing is not a Production signoff.

## Links
- Draft PR: https://github.com/JuiPharm/BHH_Infirmary/pull/10
- CI: https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38933479126
- Synthetic GAS package: https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38933479101
- Gate 2 runbook: https://github.com/JuiPharm/BHH_Infirmary/blob/feature/cloudflare-gateway-precutover-20261016/docs/GATE2_STOCK_ROLLBACK_CONCURRENCY_UAT_RUNBOOK_2026-10-16.md

**Bottom line:** All executable non-destructive CI and read-only security checks in this combined batch passed. Gates 2–5 are still NOT fully passed; release stays NO-GO pending genuine controlled live GAS, clinical and security acceptance.
