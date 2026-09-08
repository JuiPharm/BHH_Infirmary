import { describe, it, expect } from 'vitest';
import {
  allocateFEFO,
  validateDispenseQty,
  totalStock,
  reconcileStock,
  getStockAlertLevel,
  getDaysUntilExpiry,
  normalizeItemType,
  Lot
} from '../domain/stock';

describe('FEFO Stock Engine', () => {
  it('allocates lots by earliest expiry date first', () => {
    const lots: Lot[] = [
      { lotId: 'LOT-C', expiry: '2027-05-01', currentQty: 50 },
      { lotId: 'LOT-A', expiry: '2026-10-01', currentQty: 10 },
      { lotId: 'LOT-B', expiry: '2026-12-01', currentQty: 20 }
    ];

    const allocation = allocateFEFO(lots, 25, new Date('2026-09-01'));
    expect(allocation).toEqual([
      { lotId: 'LOT-A', qty: 10 },
      { lotId: 'LOT-B', qty: 15 }
    ]);
  });

  it('uses deterministic lotId tie-breaker when expiry dates are identical', () => {
    const lots: Lot[] = [
      { lotId: 'LOT-Z', expiry: '2026-12-31', currentQty: 10 },
      { lotId: 'LOT-A', expiry: '2026-12-31', currentQty: 10 }
    ];

    const allocation = allocateFEFO(lots, 5, new Date('2026-09-01'));
    // LOT-A should come before LOT-Z lexicographically
    expect(allocation).toEqual([{ lotId: 'LOT-A', qty: 5 }]);
  });

  it('spans across multiple lots to fulfill order exactly', () => {
    const lots: Lot[] = [
      { lotId: 'L1', expiry: '2027-01-01', currentQty: 3 },
      { lotId: 'L2', expiry: '2027-02-01', currentQty: 4 },
      { lotId: 'L3', expiry: '2027-03-01', currentQty: 5 }
    ];

    const allocation = allocateFEFO(lots, 9, new Date('2026-01-01'));
    expect(allocation).toEqual([
      { lotId: 'L1', qty: 3 },
      { lotId: 'L2', qty: 4 },
      { lotId: 'L3', qty: 2 }
    ]);
  });

  it('ignores expired lots completely', () => {
    const lots: Lot[] = [
      { lotId: 'EXP-1', expiry: '2025-01-01', currentQty: 100 },
      { lotId: 'VALID-1', expiry: '2027-01-01', currentQty: 5 }
    ];

    // Today is 2026-09-08 -> EXP-1 is expired
    const allocation = allocateFEFO(lots, 4, new Date('2026-09-08'));
    expect(allocation).toEqual([{ lotId: 'VALID-1', qty: 4 }]);

    // If requesting more than valid non-expired stock, rejects entire transaction
    expect(() => allocateFEFO(lots, 6, new Date('2026-09-08'))).toThrow('INSUFFICIENT_STOCK');
  });

  it('ignores inactive lots completely', () => {
    const lots: Lot[] = [
      { lotId: 'INACT', expiry: '2027-01-01', currentQty: 50, status: 'INACTIVE' },
      { lotId: 'ACT', expiry: '2027-01-01', currentQty: 10, status: 'ACTIVE' }
    ];

    expect(totalStock(lots)).toBe(10);
    expect(() => allocateFEFO(lots, 15, new Date('2026-09-01'))).toThrow('INSUFFICIENT_STOCK');
    expect(allocateFEFO(lots, 5, new Date('2026-09-01'))).toEqual([{ lotId: 'ACT', qty: 5 }]);
  });
});

describe('Validation & Insufficient Stock Engine', () => {
  it('rejects requested quantity exceeding available stock (All-or-Nothing)', () => {
    expect(() => validateDispenseQty(25, 20)).toThrow('INSUFFICIENT_STOCK');
  });

  it('rejects zero or negative quantities', () => {
    expect(() => validateDispenseQty(0, 10)).toThrow('INVALID_QTY');
    expect(() => validateDispenseQty(-5, 10)).toThrow('INVALID_QTY');
  });

  it('rejects non-integer / floating-point quantities', () => {
    expect(() => validateDispenseQty(1.5, 10)).toThrow('INVALID_QTY');
  });

  it('accepts exact stock match', () => {
    expect(validateDispenseQty(10, 10)).toBe(true);
  });
});

describe('Concurrency Simulation (ScriptLock Simulation)', () => {
  it('ensures only one concurrent transaction succeeds when aggregate requests exceed stock', () => {
    let availableStock = 10;
    const requestA = 7;
    const requestB = 7;

    const executeTransaction = (qty: number): boolean => {
      // Simulate backend lock + re-validation
      if (qty > availableStock) {
        return false;
      }
      availableStock -= qty;
      return true;
    };

    const resultA = executeTransaction(requestA);
    const resultB = executeTransaction(requestB);

    // Exactly one transaction succeeds, one fails
    expect(resultA).toBe(true);
    expect(resultB).toBe(false);
    expect(availableStock).toBe(3);
    expect(availableStock).toBeGreaterThanOrEqual(0);
  });
});

describe('Duplicate Transaction Protection', () => {
  it('rejects transactions with duplicate clientTransactionId', () => {
    const existingIds = new Set<string>(['TX-1001', 'TX-1002']);

    const processTransaction = (clientTransactionId: string) => {
      if (existingIds.has(clientTransactionId)) {
        throw new Error('DUPLICATE_TRANSACTION');
      }
      existingIds.add(clientTransactionId);
      return true;
    };

    expect(processTransaction('TX-1003')).toBe(true);
    expect(() => processTransaction('TX-1001')).toThrow('DUPLICATE_TRANSACTION');
  });
});

describe('Stock Reconciliation Equation', () => {
  it('validates Opening + Receive + AdjustIn - Dispense - Expired - Damaged + Return = Closing', () => {
    const movements = {
      opening: 100,
      receive: 50,
      adjustIn: 10,
      dispense: 40,
      expired: 5,
      damaged: 2,
      returnQty: 3
    };

    // 100 + 50 + 10 - 40 - 5 - 2 + 3 = 116
    const lotCurrentTotal = 116;

    const result = reconcileStock(movements, lotCurrentTotal);
    expect(result.calculatedClosing).toBe(116);
    expect(result.actualClosing).toBe(116);
    expect(result.balanced).toBe(true);
  });

  it('detects discrepancy if lot current total does not balance with movements', () => {
    const movements = {
      opening: 50,
      receive: 20,
      adjustIn: 0,
      dispense: 10,
      expired: 0,
      damaged: 0,
      returnQty: 0
    };

    // Expected 60, but lot table reports 58 (unreconciled loss of 2)
    const result = reconcileStock(movements, 58);
    expect(result.calculatedClosing).toBe(60);
    expect(result.actualClosing).toBe(58);
    expect(result.balanced).toBe(false);
  });
});

describe('Stock & Expiry Alert Calculations', () => {
  it('categorizes stock alert levels accurately', () => {
    expect(getStockAlertLevel(0, 10)).toBe('OUT_OF_STOCK');
    expect(getStockAlertLevel(5, 10)).toBe('LOW_STOCK');
    expect(getStockAlertLevel(10, 10)).toBe('LOW_STOCK');
    expect(getStockAlertLevel(11, 10)).toBe('NORMAL');
  });

  it('calculates days until expiry correctly', () => {
    const today = new Date('2026-09-08');
    expect(getDaysUntilExpiry('2026-09-18', today)).toBe(10);
    expect(getDaysUntilExpiry('2026-09-08', today)).toBe(0);
    expect(getDaysUntilExpiry('2026-09-01', today)).toBeLessThan(0);
  });
});

describe('Role-Based Access Control (RBAC) Matrix', () => {
  const RBAC_PERMISSIONS: Record<string, string[]> = {
    NURSE: ['dispense', 'searchStudents', 'getStudent', 'getStudentHistory', 'getItems', 'getStock'],
    ADMIN: ['dispense', 'searchStudents', 'getStudent', 'getStudentHistory', 'getItems', 'getStock', 'getStockLots', 'receiveStock', 'adjustStock', 'getStockTransactions', 'getDashboardSummary'],
    MANAGER: ['searchStudents', 'getStudent', 'getStudentHistory', 'getItems', 'getStock', 'getStockLots', 'getStockTransactions', 'getDashboardSummary'],
    SUPER_ADMIN: ['dispense', 'searchStudents', 'getStudent', 'getStudentHistory', 'getItems', 'getStock', 'getStockLots', 'receiveStock', 'adjustStock', 'getStockTransactions', 'getDashboardSummary', 'getUsers', 'createUser', 'updateUser', 'deactivateUser', 'resetPassword', 'getConfig', 'updateConfig']
  };

  const checkPermission = (role: string, action: string): boolean => {
    return (RBAC_PERMISSIONS[role] || []).includes(action);
  };

  it('enforces NURSE cannot receive or adjust stock', () => {
    expect(checkPermission('NURSE', 'dispense')).toBe(true);
    expect(checkPermission('NURSE', 'receiveStock')).toBe(false);
    expect(checkPermission('NURSE', 'adjustStock')).toBe(false);
    expect(checkPermission('NURSE', 'getUsers')).toBe(false);
  });

  it('enforces MANAGER is read-only and cannot dispense', () => {
    expect(checkPermission('MANAGER', 'dispense')).toBe(false);
    expect(checkPermission('MANAGER', 'receiveStock')).toBe(false);
    expect(checkPermission('MANAGER', 'getDashboardSummary')).toBe(true);
  });

  it('enforces ADMIN can manage stock but not users/config', () => {
    expect(checkPermission('ADMIN', 'dispense')).toBe(true);
    expect(checkPermission('ADMIN', 'receiveStock')).toBe(true);
    expect(checkPermission('ADMIN', 'adjustStock')).toBe(true);
    expect(checkPermission('ADMIN', 'getUsers')).toBe(false);
    expect(checkPermission('ADMIN', 'updateConfig')).toBe(false);
  });

  it('enforces SUPER_ADMIN has full access', () => {
    expect(checkPermission('SUPER_ADMIN', 'dispense')).toBe(true);
    expect(checkPermission('SUPER_ADMIN', 'receiveStock')).toBe(true);
    expect(checkPermission('SUPER_ADMIN', 'getUsers')).toBe(true);
    expect(checkPermission('SUPER_ADMIN', 'updateConfig')).toBe(true);
  });
});

describe('normalizeItemType', () => {
  it('identifies drug types from various inputs', () => {
    expect(normalizeItemType('DRUG')).toBe('DRUG');
    expect(normalizeItemType('drug')).toBe('DRUG');
    expect(normalizeItemType('ยา')).toBe('DRUG');
    expect(normalizeItemType('ยาเม็ด')).toBe('DRUG');
    expect(normalizeItemType('MEDICINE')).toBe('DRUG');
    expect(normalizeItemType('')).toBe('DRUG');
    expect(normalizeItemType(undefined)).toBe('DRUG');
  });

  it('identifies medical supply types from various inputs', () => {
    expect(normalizeItemType('MEDICAL_SUPPLY')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('MEDICAL SUPPLY')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('medical_supply')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('SUPPLY')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('เวชภัณฑ์')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('เวชภัณฑ์การแพทย์')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('อุปกรณ์')).toBe('MEDICAL_SUPPLY');
    expect(normalizeItemType('วัสดุการแพทย์')).toBe('MEDICAL_SUPPLY');
  });
});

