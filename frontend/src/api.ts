import { ApiResponse } from './types';

export const DEFAULT_GAS_URL =
  import.meta.env.VITE_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbwC7zeux5tDqr_C-2AwtllHIFDXkXyvVQ0J7BoI-3u55xQ6vSslP5VxwZCxFKjZmB_h/exec';

export const REQUIRED_API_VERSION = '2.3.0';

export interface BackendHealth {
  success: boolean;
  service?: string;
  apiVersion?: string;
  timestamp?: string;
}

export async function getBackendHealth(
  url: string = DEFAULT_GAS_URL,
  timeoutMs: number = 8000
): Promise<BackendHealth> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as BackendHealth;
  } finally {
    clearTimeout(timeoutId);
  }
}

const ERROR_MESSAGES_TH: Record<string, string> = {
  AUTH_REQUIRED: 'กรุณาเข้าสู่ระบบก่อนดำเนินการ',
  INVALID_SESSION: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',
  INVALID_CREDENTIALS: 'Staff ID หรือ Password ไม่ถูกต้อง',
  ACCESS_DENIED: 'คุณไม่มีสิทธิ์ในการดำเนินการนี้',
  STUDENT_NOT_FOUND: 'ไม่พบข้อมูลนักเรียนในระบบ',
  ITEM_NOT_FOUND: 'ไม่พบรายการยาหรือเวชภัณฑ์',
  INVALID_QTY: 'จำนวนต้องเป็นจำนวนเต็มที่มากกว่า 0',
  INSUFFICIENT_STOCK: 'จำนวนสต็อกคงเหลือไม่เพียงพอ',
  DUPLICATE_TRANSACTION: 'รายการเบิกนี้ถูกประมวลผลไปแล้ว (Duplicate)',
  STOCK_CHANGED: 'สต็อกมีการเปลี่ยนแปลง กรุณาตรวจสอบอีกครั้ง',
  STOCK_LOT_NOT_FOUND: 'ไม่พบข้อมูล Lot ในระบบ',
  USER_ALREADY_EXISTS: 'มี Staff ID นี้ในระบบแล้ว',
  USER_NOT_FOUND: 'ไม่พบข้อมูลผู้ใช้นี้',
  SERVER_ERROR: 'เกิดข้อผิดพลาดในการประมวลผลของเซิร์ฟเวอร์',
  NETWORK_ERROR: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ต',
  TIMEOUT_ERROR: 'การเชื่อมต่อเซิร์ฟเวอร์ใช้เวลานานเกินไป กรุณากดลองใหม่อีกครั้ง',
  ROLE_ESCALATION_DENIED: 'คุณไม่มีสิทธิ์กำหนดหรือจัดการ Role ระดับนี้',
  CANNOT_DEACTIVATE_SELF: 'ไม่สามารถระงับบัญชีของตนเองได้',
  TRANSACTION_ROLLBACK_FAILED: 'เกิดข้อผิดพลาดระหว่างย้อนคืนรายการ กรุณาหยุดทำรายการและติดต่อผู้ดูแลระบบ',
  INVALID_PHONE: 'รูปแบบหมายเลขโทรศัพท์ไม่ถูกต้อง',
  INVALID_BOOLEAN: 'ค่าตัวเลือก Yes/No ไม่ถูกต้อง',
  INPUT_TOO_LONG: 'ข้อมูลที่กรอกยาวเกินขนาดที่ระบบกำหนด',
  INVALID_LOT_STATUS: 'สถานะ Stock Lot ไม่ถูกต้อง',
  LOT_EXPIRED_CANNOT_ACTIVATE: 'ไม่สามารถเปลี่ยน Lot ที่หมดอายุแล้วกลับเป็น ACTIVE ได้',
  INVALID_EXPIRY_DATE: 'วันหมดอายุไม่ถูกต้องหรือหมดอายุแล้ว',
  LOT_WITH_QTY_CANNOT_INACTIVATE: 'ไม่สามารถตั้ง Lot เป็น INACTIVE ขณะที่ยังมีคงเหลือ ต้องจัดการยอดให้เป็น 0 ก่อน',
  LOT_NOT_YET_EXPIRED: 'ไม่สามารถตั้งสถานะ EXPIRED ก่อนวันหมดอายุจริงได้',
  INVALID_LOT_STATUS_TRANSITION: 'ไม่อนุญาตให้เปลี่ยนสถานะ Lot ตามเส้นทางนี้',
  LOT_STATUS_UNCHANGED: 'Stock Lot อยู่ในสถานะนี้อยู่แล้ว',
  INVALID_COUNT_QTY: 'จำนวนตรวจนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป',
  DUPLICATE_COUNT_LINE: 'มี Stock Lot ซ้ำในรายการตรวจนับ',
  TOO_MANY_COUNT_LINES: 'จำนวนรายการตรวจนับมากเกินขีดจำกัดต่อครั้ง'
};

export function getErrorMessage(codeOrMsg?: string): string {
  if (!codeOrMsg) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  return ERROR_MESSAGES_TH[codeOrMsg] || codeOrMsg;
}

// In-memory client-side cache for high-frequency read requests
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const clientCache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30000; // 30 seconds

const CACHEABLE_ACTIONS = new Set([
  'getItems',
  'getStock',
  'getStockLots',
  'getDashboardData',
  'getDashboardSummary',
  'getConfig',
  'getUsers',
  'getInventoryIntegrity',
  'getStockCounts'
]);

const MUTATION_ACTIONS = new Set([
  'submitDispense',
  'receiveStock',
  'adjustStock',
  'importStudents',
  'importItems',
  'createUser',
  'updateUser',
  'resetPassword',
  'deactivateUser',
  'updateConfig',
  'updateStockLotStatus',
  'submitStockCount'
]);

export function clearClientCache(actionPrefix?: string): void {
  if (!actionPrefix) {
    clientCache.clear();
    return;
  }
  for (const key of clientCache.keys()) {
    if (key.startsWith(actionPrefix)) {
      clientCache.delete(key);
    }
  }
}

export async function api<T>(
  action: string,
  payload: unknown = {},
  token?: string,
  url: string = DEFAULT_GAS_URL,
  timeoutMs: number = 20000,
  bypassCache: boolean = false
): Promise<T> {
  // Check client-side cache for read queries
  const cacheKey = `${action}:${token || ''}:${JSON.stringify(payload || {})}`;
  if (!bypassCache && CACHEABLE_ACTIONS.has(action)) {
    const cached = clientCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T;
    }
  }

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Google Apps Script requires text/plain and redirect follow
    response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        payload,
        token
      }),
      signal: controller.signal
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(getErrorMessage('TIMEOUT_ERROR'));
    }
    console.error('Fetch error:', err);
    throw new Error(getErrorMessage('NETWORK_ERROR'));
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
  }

  let json: ApiResponse<T>;
  try {
    json = (await response.json()) as ApiResponse<T>;
  } catch (err) {
    console.error('JSON parse error:', err);
    throw new Error('การตอบกลับจากเซิร์ฟเวอร์ไม่ใช่รูปแบบ JSON ที่ถูกต้อง');
  }

  if (!json.success) {
    const code = json.errorCode || 'SERVER_ERROR';
    const msg = json.message || getErrorMessage(code);
    const err = new Error(msg);
    (err as any).errorCode = code;
    throw err;
  }

  // Clear client cache when a mutating action succeeds
  if (MUTATION_ACTIONS.has(action)) {
    clearClientCache();
  } else if (CACHEABLE_ACTIONS.has(action)) {
    clientCache.set(cacheKey, {
      data: json.data,
      timestamp: Date.now()
    });
  }

  return json.data as T;
}
