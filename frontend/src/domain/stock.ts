export interface Lot {
  lotId: string;
  expiry: string;
  currentQty: number;
  status?: string;
  unitCost?: number;
}

export function totalStock(lots: Lot[]): number {
  return lots
    .filter(l => (l.status || 'ACTIVE').toUpperCase() !== 'INACTIVE')
    .reduce((s, l) => s + Math.max(0, l.currentQty), 0);
}

export function isLotUsable(lot: Lot, today: Date = new Date()): boolean {
  if (!(lot.currentQty > 0)) return false;
  if ((lot.status || 'ACTIVE').trim().toUpperCase() !== 'ACTIVE') return false;

  const exp = new Date(`${lot.expiry}T23:59:59.999`);
  if (Number.isNaN(exp.getTime())) return false;

  return exp.getTime() >= today.getTime();
}

export function usableStock(lots: Lot[], today: Date = new Date()): number {
  return lots
    .filter(l => isLotUsable(l, today))
    .reduce((sum, l) => sum + Math.max(0, l.currentQty), 0);
}

export function validateDispenseQty(qty: number, available: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('INVALID_QTY');
  if (qty > available) throw new Error('INSUFFICIENT_STOCK');
  return true;
}

export function allocateFEFO(lots: Lot[], qty: number, today: Date = new Date()): { lotId: string; qty: number }[] {
  const eligible = lots.filter(l => isLotUsable(l, today));

  const available = eligible.reduce((s, l) => s + l.currentQty, 0);
  validateDispenseQty(qty, available);

  // FEFO: Earliest expiry first, deterministic lotId tie-breaker
  eligible.sort((a, b) => {
    const dComp = a.expiry.localeCompare(b.expiry);
    if (dComp !== 0) return dComp;
    return a.lotId.localeCompare(b.lotId);
  });

  let left = qty;
  const out: { lotId: string; qty: number }[] = [];

  for (const l of eligible) {
    if (left <= 0) break;
    const n = Math.min(left, l.currentQty);
    if (n > 0) {
      out.push({ lotId: l.lotId, qty: n });
      left -= n;
    }
  }

  if (left !== 0) throw new Error('STOCK_ALLOCATION_FAILED');
  return out;
}

export interface StockMovements {
  opening: number;
  receive: number;
  adjustIn: number;
  dispense: number;
  expired: number;
  damaged: number;
  returnQty: number;
}

export function reconcileStock(m: StockMovements, lotCurrentTotal: number): {
  calculatedClosing: number;
  actualClosing: number;
  balanced: boolean;
} {
  const calculatedClosing =
    m.opening +
    m.receive +
    m.adjustIn -
    m.dispense -
    m.expired -
    m.damaged +
    m.returnQty;

  return {
    calculatedClosing,
    actualClosing: lotCurrentTotal,
    balanced: calculatedClosing === lotCurrentTotal
  };
}

export type StockAlertLevel = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'NORMAL';

export function getStockAlertLevel(currentQty: number, minStock: number): StockAlertLevel {
  if (currentQty <= 0) return 'OUT_OF_STOCK';
  if (currentQty <= minStock) return 'LOW_STOCK';
  return 'NORMAL';
}

export function getDaysUntilExpiry(expiryDateStr: string, today: Date = new Date()): number {
  const exp = new Date(expiryDateStr);
  if (isNaN(exp.getTime())) return 9999;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const e = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate());
  const diffMs = e.getTime() - t.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function normalizeItemType(rawType?: string): 'DRUG' | 'MEDICAL_SUPPLY' {
  const s = String(rawType || '').trim().toUpperCase();
  if (
    s.includes('SUPPLY') ||
    s.includes('เวชภัณฑ์') ||
    s.includes('อุปกรณ์') ||
    s.includes('วัสดุ')
  ) {
    return 'MEDICAL_SUPPLY';
  }
  return 'DRUG';
}

