import { VisitVitals } from '../types';

export interface VisitClinicalDraft {
  symptoms: string[];
  customSymptoms?: string[];
  otherSymptom?: string;
  note?: string;
  assessment?: string;
  interventions: string[];
  vitals: VisitVitals;
}

export function hasVisitClinicalContent(draft: VisitClinicalDraft): boolean {
  return (
    draft.symptoms.length > 0 ||
    Boolean(draft.customSymptoms?.some((symptom) => symptom.trim())) ||
    Boolean(draft.otherSymptom?.trim()) ||
    Boolean(draft.note?.trim()) ||
    Boolean(draft.assessment?.trim()) ||
    draft.interventions.length > 0
  );
}
