import { describe, expect, it } from 'vitest';
import { hasVisitClinicalContent } from '../domain/visit';

describe('Visit clinical content validation', () => {
  it('does not treat Vital Signs as required clinical content by themselves', () => {
    expect(hasVisitClinicalContent({
      symptoms: [],
      interventions: [],
      vitals: { temperature: 37.2 }
    })).toBe(false);
  });

  it('accepts optional or partial Vital Signs alongside clinical content', () => {
    expect(hasVisitClinicalContent({
      symptoms: ['Headache'],
      interventions: [],
      vitals: { temperature: 37.2 }
    })).toBe(true);
  });

  it('accepts categorized Free text symptoms as clinical content', () => {
    expect(hasVisitClinicalContent({
      symptoms: [],
      customSymptoms: ['shoulder pain after fall'],
      interventions: [],
      vitals: {}
    })).toBe(true);
  });

  it('accepts an intervention-only visit', () => {
    expect(hasVisitClinicalContent({
      symptoms: [],
      interventions: ['REST'],
      vitals: {}
    })).toBe(true);
  });

  it('accepts assessment or symptom content', () => {
    expect(hasVisitClinicalContent({
      symptoms: ['Headache'],
      interventions: [],
      vitals: {}
    })).toBe(true);
    expect(hasVisitClinicalContent({
      symptoms: [],
      assessment: 'Minor abrasion',
      interventions: [],
      vitals: {}
    })).toBe(true);
  });

  it('rejects a clinically empty visit', () => {
    expect(hasVisitClinicalContent({
      symptoms: [],
      otherSymptom: '   ',
      note: '',
      assessment: '',
      interventions: [],
      vitals: {}
    })).toBe(false);
  });
});
