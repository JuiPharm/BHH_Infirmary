# BHH Infirmary — Admin-managed Drug Allergy Hard Stop Rules

**Status:** IMPLEMENTED IN REVIEW BRANCH ONLY · Clinical baseline rule approved by project owner 2026-10-16 · **NOT deployed to live GAS, Cloudflare application, or Production**.

## User workflow

Only `SUPER_ADMIN` can see the **กฎแพ้ยา / Drug Allergy Rules** tab. The administrator can:

1. Click **+ เพิ่มกฎแพ้ยา**.
2. Enter **Allergen Terms** (the text appearing in recorded drug allergy), with alternative names separated by `|`.
3. Enter **Blocked Generic Drug Names** (the generic ingredients in Item Master), with alternative names separated by `|`.
4. Enter a clinical guideline/reference (required) and **บันทึก Draft**. A `DRAFT` does **not** block dispensing.
5. After clinical review, choose **Approve / Publish** and confirm. The rule becomes `ACTIVE` and is enforced on the server before writing Visit/stock.

Example **structure only — NOT pre-approved for activation**:

| Allergy terms | Blocked generic names | Status |
| --- | --- | --- |
| `EXAMPLE_ALLERGEN | EXAMPLE_ALLERGEN_ALIAS` | `EXAMPLE_GENERIC` | DRAFT until reviewed |

The **system rule** `SYSTEM-PENICILLIN-HARD-STOP`, recorded allergy `PENICILLIN | PENICILLINS | AMOXICILLIN | AMPICILLIN`, blocked generic `AMOXICILLIN | AMPICILLIN | PENICILLIN`, is hard-coded and shown as `LOCKED`: a Sheet edit or missing rule tab cannot disable it. The project owner explicitly approved the narrow clinical hard stop. This match does not cover all beta-lactam allergens or cross-reactivity.

## Technical contract

- New Apps Script module: `backend/35_AllergyRules.gs`.
- New sheet: `DRUG_ALLERGY_RULES`, created by `setupSystem()` for fresh deployments. In the **known synthetic GAS Sandbox copy**, the `DRUG_ALLERGY_RULES` tab was already created directly, with 11 exact schema headers, a fixed navy header and zero rule rows; **do not re-run `setupSystem()` on the working UAT copy**. The 13 existing core sheets remain intact; this rule registry is the 14th application sheet (16 tabs including UAT_GUIDE and UAT_TEST_MATRIX) and must be accounted for in future migration planning.
- Actions: `getDrugAllergyRules`, `saveDrugAllergyRule`, `publishDrugAllergyRule`. All require authenticated `SUPER_ADMIN`. Saving/publishing writes audit entries with staff ID, action, and rule ID. Published records cannot be edited through the API; new editions require a new Draft and separate review/retirement workflow.
- `enforceDrugAllergyRules_` runs on the GAS backend during medication dispensing for both master students and free-text visits, using the most recent allergy data for students. It checks only `ACTIVE` rows; malformed active rules **fail closed** with `ALLERGY_RULES_CONFIGURATION_ERROR`.
- `DRAFT` rules never block. Wildcards, injection-like formula values, excessively short terms, missing reference, unauthorized roles, and automatic republication are rejected.
- Browser `frontend/src/features/clinical/AllergyRulesPage.tsx`, Header/App route, localized error. Review-branch Cloudflare allowlist includes the new actions, but **current deployed Cloudflare P1 remains `UAT_READ_ONLY`** and blocks all new management API requests.
- The hard stop recognizes simple clinical terms, not a comprehensive coded allergy terminology. Substring boundary checks do **not** correctly interpret all negations, Thai morphology, synonyms, drug combinations or non-IgE effects. All positive matches block pending clinical assessment. A missing match **is not a guarantee of safety**.

## Acceptance / verification

- GitHub CI at https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38866782992: 33 Apps Script behavior tests and 26 Cloudflare Gateway tests, plus frontend tests/build, passed.
- New coverage: create DRAFT, explicit review + ACTIVE publish, status and audit, match vs unrelated drug, access-denied role, invalid term rejection, malformed ACTIVE fail-closed, immutable baseline.
- Clinical *candidate* accepted by project owner; new rules require authorized pharmacist review and an accurate source. A UI confirmation by Super Admin is a workflow control, not a substitute for the hospital's clinical governance policy.

## Before deploying to GAS Sandbox

1. Copy **all** updated backend `.gs` files including `35_AllergyRules.gs` into the isolated **GAS UAT project**, not the Production script.
2. Confirm that UAT Script Property `SHEET_ID` points only to the synthetic working copy. Backup the UAT Sheet.
3. The **current known UAT working copy already has the new sheet**, so **skip `setupSystem()` entirely**. Reconfirm `DRUG_ALLERGY_RULES!A1:K1` shows 11 expected headers and rows below are blank.
4. Deploy a **new GAS UAT Web App version**, recheck API 2.4.1 (same version string pending release bump) and verify existing Login/Session before enabling testing. **Important:** health API 2.4.1 alone does not prove the new code is active; confirm the new `getDrugAllergyRules` action returns exactly one LOCKED baseline before any rule-writing UAT.
5. Test an added unpublished Draft and then a supervised active hard stop on synthetic allergy/medication profiles. Check zero stock/visit mutations on rejections and review audit.
6. Confirm negative-path and rollback tests, then conduct manual UAT of admin page only on a dedicated Cloudflare application preview; do not point public P1 to real patients.
7. Production cutover requires separate signed clinical, security, stock and data-migration gates. Do not merge draft PR simply because CI is green.

**Do not edit the existing production GAS, deploy this unreviewed registry directly to Production, or change Production writer during this work.**

## Build and installation artifact (verified 2026-10-16)

GitHub Actions generated a synthetic-only ZIP (six `.gs` files, install instructions, SHA-256 manifest):
https://github.com/JuiPharm/BHH_Infirmary/actions/runs/38868559674

Open this successful workflow run and download `BHH_Infirmary_GAS_SANDBOX_UAT` from **Artifacts**. Only replace/add source files inside the **isolated Apps Script Sandbox project**. The connected Google Drive tool does **not** deploy Apps Script source or edit Script Properties, so the actual UAT deployment needs an authorized Apps Script editor or a separately configured clasp/App Script API workflow. No production deployment is implied by a green GitHub CI run.

After deployment, record Apps Script version, deployment URL, project identity, and positive/negative sandbox smoke checks. Never publish a generic edit-to-production deployment during UAT.
