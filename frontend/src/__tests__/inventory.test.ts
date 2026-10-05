import { describe, expect, it } from 'vitest';
import {
  LOT_STATUS_OPTIONS,
  isPhysicalLot,
  statusBadgeClass,
  summarizeVariance
} from '../features/inventory/domain';
import { StockLot } from '../types';

const lot = (status: string): StockLot => ({
  'Stock Lot ID': 'L1',
  'Item Code': 'ITEM1',
  'Lot Number': 'A',
  'Expiry Date': '2027-01-01',
  'Received Date': '2026-01-01',
  'Received Qty': 10,
  'Current Qty': 8,
  'Unit Cost': 1,
  Supplier: '',
  Status: status
});

describe('inventory domain', () => {
  it('treats inactive lots as non-physical for cycle count', () => {
    expect(isPhysicalLot(lot('INACTIVE'))).toBe(false);
    expect(isPhysicalLot(lot('QUARANTINE'))).toBe(true);
    expect(isPhysicalLot(lot('ACTIVE'))).toBe(true);
  });

  it('calculates stock count variance from counted minus system quantity', () => {
    expect(summarizeVariance(10, 8)).toBe(-2);
    expect(summarizeVariance(10, 12)).toBe(2);
    expect(summarizeVariance(10, 10)).toBe(0);
  });

  it('defines one controlled option for every supported lifecycle state', () => {
    expect(LOT_STATUS_OPTIONS.map((x) => x.value)).toEqual([
      'ACTIVE',
      'QUARANTINE',
      'DAMAGED',
      'RECALL',
      'EXPIRED',
      'INACTIVE'
    ]);
  });

  it('uses warning and danger badges for non-usable safety states', () => {
    expect(statusBadgeClass('QUARANTINE')).toBe('badge-warning');
    expect(statusBadgeClass('RECALL')).toBe('badge-warning');
    expect(statusBadgeClass('DAMAGED')).toBe('badge-danger');
    expect(statusBadgeClass('EXPIRED')).toBe('badge-danger');
  });
});
