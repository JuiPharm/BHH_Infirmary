import { describe, expect, it } from 'vitest';
import {
  deriveClinicalAlert,
  deriveVisitCategory,
  validateFreeTextDrugAllergy
} from '../features/clinical/domain';
import { SymptomCatalogItem } from '../types';

const catalog: SymptomCatalogItem[] = [
  { symptomId: 'N1', symptom: 'ไข้', category: 'NON_TRAUMA', clinicalAlertLevel: 'NORMAL', sortOrder: 1 },
  { symptomId: 'N2', symptom: 'เจ็บหน้าอก', category: 'NON_TRAUMA', clinicalAlertLevel: 'URGENT', sortOrder: 2 },
  { symptomId: 'N3', symptom: 'ชักเกร็ง', category: 'NON_TRAUMA', clinicalAlertLevel: 'EMERGENCY', sortOrder: 3 },
  { symptomId: 'T1', symptom: 'บาดแผล', category: 'TRAUMA', clinicalAlertLevel: 'NORMAL', sortOrder: 4 },
  { symptomId: 'O1', symptom: 'เลือดกำเดาไหล', category: 'OTHER', clinicalAlertLevel: 'NORMAL', sortOrder: 5 }
];

describe('P4 visit classification', () => {
  it('derives TRAUMA when at least one trauma symptom is selected', () => {
    expect(deriveVisitCategory(catalog, ['N1', 'T1', 'O1'])).toBe('TRAUMA');
  });

  it('derives NON_TRAUMA when there is no trauma but a non-trauma symptom exists', () => {
    expect(deriveVisitCategory(catalog, ['N1', 'O1'])).toBe('NON_TRAUMA');
  });

  it('derives OTHER when only other symptoms exist', () => {
    expect(deriveVisitCategory(catalog, ['O1'])).toBe('OTHER');
  });

  it('keeps clinical alert independent from category', () => {
    expect(deriveClinicalAlert(catalog, ['N2'])).toBe('URGENT');
    expect(deriveClinicalAlert(catalog, ['N3', 'T1'])).toBe('EMERGENCY');
  });
});

describe('P4 free-text allergy safety', () => {
  it('requires an explicit allergy status when a drug is dispensed', () => {
    expect(
      validateFreeTextDrugAllergy(
        { status: '', drugGroup: '', reaction: '', note: '' },
        true
      )
    ).toContain('สถานะแพ้ยา');
  });

  it('requires all known-allergy detail fields', () => {
    expect(
      validateFreeTextDrugAllergy(
        { status: 'KNOWN_ALLERGY', drugGroup: 'Penicillin', reaction: '', note: '' },
        true
      )
    ).toContain('ยา/กลุ่มยา');
  });

  it('allows UNKNOWN after UI warning and allows no allergy entry when no drug is dispensed', () => {
    expect(
      validateFreeTextDrugAllergy(
        { status: 'UNKNOWN', drugGroup: '', reaction: '', note: '' },
        true
      )
    ).toBeNull();
    expect(
      validateFreeTextDrugAllergy(
        { status: '', drugGroup: '', reaction: '', note: '' },
        false
      )
    ).toBeNull();
  });
});
