import { describe, expect, it } from 'vitest';
import { isValidVisitDate, todayInBangkok, validRecordOnlyQuantity } from '../domain/visit';

describe('Visit historical calendar and quantity validation', () => {
  it('uses Bangkok calendar date even when UTC is still yesterday', () => {
    expect(todayInBangkok(new Date('2026-10-26T18:15:00Z'))).toBe('2026-10-27');
  });

  it('allows yesterday and Today but rejects future, malformed and nonexistent dates', () => {
    expect(isValidVisitDate('2026-10-27', '2026-10-27')).toBe(true);
    expect(isValidVisitDate('2026-10-26', '2026-10-27')).toBe(true);
    expect(isValidVisitDate('2026-10-28', '2026-10-27')).toBe(false);
    expect(isValidVisitDate('2026-02-30', '2026-10-27')).toBe(false);
    expect(isValidVisitDate('2024-02-29', '2026-10-27')).toBe(true);
    expect(isValidVisitDate('2026-1-2', '2026-10-27')).toBe(false);
  });

  it('supports fractional usage but rejects nonpositive, invalid and excessive precision', () => {
    for (const qty of [1, 0.5, 1.005, 100000]) {
      expect(validRecordOnlyQuantity(qty)).toBe(true);
    }
    for (const qty of [0, -1, 0.0001, 100001, NaN, Infinity]) {
      expect(validRecordOnlyQuantity(qty)).toBe(false);
    }
  });
});
