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

export function validateDispenseQty(qty: number, available: number): boolean {
  if (!Number.isInteger(qty) || qty <= 0) throw new Error('INVALID_QTY');
  if (qty > available) throw new Error('INSUFFICIENT_STOCK');
  return true;
}

export function allocateFEFO(lots: Lot[], qty: number, today: Date = new Date()): { lotId: string; qty: number }[] {
  // Normalize today to start of day for comparison
  const checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const eligible = lots.filter(l => {
    if (l.currentQty <= 0) return false;
    if ((l.status || 'ACTIVE').toUpperCase() === 'INACTIVE') return false;
    const exp = new Date(l.expiry + 'T23:59:59');
    return !isNaN(exp.getTime()) && exp >= checkDate;
  });

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
