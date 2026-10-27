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

/** A YYYY-MM-DD calendar value in hospital time, not UTC ISO date. */
export function todayInBangkok(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isValidVisitDate(value: string, today: string = todayInBangkok()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number(match[1]) >= 2000 && value <= today &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

export function validRecordOnlyQuantity(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 100000 &&
    Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-7;
}
