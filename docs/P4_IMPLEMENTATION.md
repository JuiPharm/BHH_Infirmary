# P4 Implementation Notes

Branch: `feature/p4-recipient-notification-dashboard`

## Implemented scope

- Universal search across `STUDENTS` and `STAFF_MASTER`.
- Backend-derived Recipient Type for master records.
- Free Text Visit with recipient snapshot.
- Free Text allergy safety before drug dispensing.
- Controlled symptom catalog with multi-symptom selection.
- Derived Visit Category precedence: TRAUMA → NON_TRAUMA → OTHER.
- Clinical Alert Level independent from category.
- Backend referral/emergency notification trigger after a successful visit transaction.
- HTML email with BHH navy header, recipient card, vital-sign table, referral yellow/orange banner and emergency red banner.
- Plain-text email fallback and HTML escaping.
- `NOTIFICATION_LOG` with idempotency and retry action.
- Dashboard V2 with one shared visit filter context.
- API contract bump to `2.4.0`.

## Compatibility

Historical visits remain readable. New P4 columns are appended to `DISPENSE_HEADER`; existing column positions are preserved. Legacy Student visits without P4 recipient fields are interpreted as STUDENT for dashboard counting. Historical symptom data that cannot be matched to the controlled catalog is kept as `UNCLASSIFIED` rather than guessed.

## Remaining live-UAT items

- Populate `STAFF_MASTER` with real Teacher/Staff data.
- Configure authorized referral/emergency recipients.
- Verify HTML email in Gmail and the organization's actual email client.
- Verify email failure does not roll back Visit or stock.
- Verify retry idempotency.
- Verify Dashboard V2 counts against production Sheet samples.
- Verify Student / Teacher / Staff / Free Text visits from the deployed Apps Script Web App.

Do not merge to production until the release gate in `docs/DEPLOYMENT.md` is complete.
