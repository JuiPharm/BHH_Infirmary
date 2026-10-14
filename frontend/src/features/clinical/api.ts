import { api } from '../../api';
import {
  DashboardV2Data,
  Recipient,
  SymptomCatalogItem,
  VisitSubmitP4Result
} from '../../types';

export function searchRecipients(query: string, token: string) {
  return api<Recipient[]>('searchRecipients', { q: query }, token, undefined, 15000, true);
}

export function getSymptomCatalog(token: string) {
  return api<SymptomCatalogItem[]>('getSymptoms', {}, token);
}

export function submitVisitP4(payload: unknown, token: string) {
  return api<VisitSubmitP4Result>('submitVisit', payload, token, undefined, 30000, true);
}

export function getDashboardV2(
  filters: {
    startDate: string;
    endDate: string;
    recipientType: string;
    symptomCategory: string;
    gradeClass: string;
  },
  token: string,
  forceRefresh = false
) {
  return api<DashboardV2Data>('getDashboardV2', filters, token, undefined, 25000, forceRefresh);
}
