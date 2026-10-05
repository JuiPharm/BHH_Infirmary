import { VisitVitals } from '../types';

export interface VisitClinicalDraft {
  symptoms: string[];
  otherSymptom?: string;
  note?: string;
  assessment?: string;
  interventions: string[];
  vitals: VisitVitals;
}

export function hasVisitClinicalContent(draft: VisitClinicalDraft): boolean {
  const hasVitals = Object.values(draft.vitals || {}).some(
    (value) => value !== undefined && value !== null && String(value).trim() !== ''
  );

  return (
    draft.symptoms.length > 0 ||
    Boolean(draft.otherSymptom?.trim()) ||
    Boolean(draft.note?.trim()) ||
    Boolean(draft.assessment?.trim()) ||
    draft.interventions.length > 0 ||
    hasVitals
  );
}
