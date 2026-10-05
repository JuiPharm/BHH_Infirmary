import { api } from '../../api';
import {
  InventoryIntegrityData,
  StockCountRecord,
  StockCountSubmitResult,
  StockLot,
  StockLotStatus
} from '../../types';

export interface StockCountLineInput {
  stockLotId: string;
  countedQty: number;
  reason?: string;
}

export const inventoryApi = {
  getLots(token: string): Promise<StockLot[]> {
    return api<StockLot[]>('getStockLots', {}, token);
  },

  getIntegrity(token: string, bypassCache = false): Promise<InventoryIntegrityData> {
    return api<InventoryIntegrityData>('getInventoryIntegrity', {}, token, undefined, 20000, bypassCache);
  },

  getCounts(token: string, limit = 200, bypassCache = false): Promise<StockCountRecord[]> {
    return api<StockCountRecord[]>('getStockCounts', { limit }, token, undefined, 20000, bypassCache);
  },

  updateLotStatus(
    token: string,
    stockLotId: string,
    status: StockLotStatus,
    reason: string
  ): Promise<{ stockLotId: string; beforeStatus: string; status: string; currentQty: number }> {
    return api('updateStockLotStatus', { stockLotId, status, reason }, token);
  },

  submitStockCount(
    token: string,
    lines: StockCountLineInput[],
    reason: string
  ): Promise<StockCountSubmitResult> {
    return api<StockCountSubmitResult>('submitStockCount', { lines, reason }, token, undefined, 30000);
  }
};
