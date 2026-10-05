import { StockLot, StockLotStatus } from '../../types';

export const LOT_STATUS_OPTIONS: Array<{ value: StockLotStatus; label: string; usable: boolean }> = [
  { value: 'ACTIVE', label: 'Active / ใช้งานได้', usable: true },
  { value: 'QUARANTINE', label: 'Quarantine / กักกัน', usable: false },
  { value: 'DAMAGED', label: 'Damaged / ชำรุด', usable: false },
  { value: 'RECALL', label: 'Recall / เรียกคืน', usable: false },
  { value: 'EXPIRED', label: 'Expired / หมดอายุ', usable: false },
  { value: 'INACTIVE', label: 'Inactive / ไม่ใช้งาน', usable: false }
];

export function isPhysicalLot(lot: StockLot): boolean {
  return String(lot.Status || '').toUpperCase() !== 'INACTIVE';
}

export function statusBadgeClass(status: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'ACTIVE':
      return 'badge-success';
    case 'QUARANTINE':
    case 'RECALL':
      return 'badge-warning';
    case 'DAMAGED':
    case 'EXPIRED':
      return 'badge-danger';
    default:
      return 'badge-gray';
  }
}

export function summarizeVariance(systemQty: number, countedQty: number): number {
  return Number(countedQty) - Number(systemQty);
}
