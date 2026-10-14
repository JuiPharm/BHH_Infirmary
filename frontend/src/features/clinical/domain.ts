import {
  ClinicalAlertLevel,
  FreeTextDrugAllergy,
  SymptomCatalogItem,
  SymptomCategory
} from '../../types';

const ALERT_RANK: Record<ClinicalAlertLevel, number> = {
  NORMAL: 0,
  CAUTION: 1,
  URGENT: 2,
  EMERGENCY: 3
};

export function deriveVisitCategory(
  catalog: SymptomCatalogItem[],
  selectedIds: string[]
): SymptomCategory | '' {
  const categories = new Set(
    catalog
      .filter((item) => selectedIds.includes(item.symptomId))
      .map((item) => item.category)
  );

  if (categories.has('TRAUMA')) return 'TRAUMA';
  if (categories.has('NON_TRAUMA')) return 'NON_TRAUMA';
  if (categories.has('OTHER')) return 'OTHER';
  return '';
}

export function deriveClinicalAlert(
  catalog: SymptomCatalogItem[],
  selectedIds: string[]
): ClinicalAlertLevel {
  return catalog
    .filter((item) => selectedIds.includes(item.symptomId))
    .reduce<ClinicalAlertLevel>((max, item) => {
      return ALERT_RANK[item.clinicalAlertLevel] > ALERT_RANK[max]
        ? item.clinicalAlertLevel
        : max;
    }, 'NORMAL');
}

export function validateFreeTextDrugAllergy(
  allergy: FreeTextDrugAllergy,
  hasDrug: boolean
): string | null {
  if (!hasDrug) return null;
  if (!allergy.status) return 'กรุณาระบุสถานะแพ้ยาก่อนจ่ายยา';
  if (allergy.status === 'KNOWN_ALLERGY') {
    if (!allergy.drugGroup.trim() || !allergy.reaction.trim() || !allergy.note.trim()) {
      return 'กรณีมีประวัติแพ้ยา ต้องระบุยา/กลุ่มยา อาการแพ้ และหมายเหตุให้ครบ';
    }
  }
  return null;
}
