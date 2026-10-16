import { ApiResponse } from './types';

// Same-origin P1 Gateway. Do not expose GAS endpoint to browser.
export const DEFAULT_GAS_URL = '/api/action';
export const DEFAULT_HEALTH_URL = '/api/health';

export const REQUIRED_API_VERSION = '2.4.1';

export interface BackendHealth {
  success: boolean;
  service?: string;
  apiVersion?: string;
  timestamp?: string;
}

export async function getBackendHealth(
  url: string = DEFAULT_HEALTH_URL,
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
  OPERATION_STATUS_UNKNOWN: 'ยังยืนยันผลการบันทึกไม่ได้ กรุณาตรวจสอบ Visit History ก่อนทำรายการซ้ำ',
  GATEWAY_NOT_CONFIGURED: 'ระบบ Gateway ยังไม่ได้ตั้งค่า ห้ามทำรายการจนกว่าผู้ดูแลจะแก้ไข',
  UPSTREAM_UNAVAILABLE: 'ไม่สามารถเชื่อมต่อระบบข้อมูลได้',
  API_VERSION_MISMATCH: 'เวอร์ชันของระบบฐานข้อมูลไม่ตรงกับที่รองรับ',
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
  TOO_MANY_COUNT_LINES: 'จำนวนรายการตรวจนับมากเกินขีดจำกัดต่อครั้ง',
  RECIPIENT_NOT_FOUND: 'ไม่พบผู้มารับบริการใน Master กรุณาค้นหาใหม่หรือใช้ Free Text Visit',
  RECIPIENT_NAME_REQUIRED: 'กรุณาระบุชื่อผู้มารับบริการ',
  INVALID_RECIPIENT_TYPE: 'ประเภทผู้มารับบริการไม่ถูกต้อง',
  INVALID_SYMPTOM: 'อาการที่เลือกไม่อยู่ใน Symptom Master หรือถูกปิดใช้งาน',
  INVALID_SYMPTOM_CATEGORY: 'หมวดอาการไม่ถูกต้อง',
  ALLERGY_STATUS_REQUIRED: 'ก่อนจ่ายยาใน Free Text Visit ต้องระบุสถานะแพ้ยา',
  ALLERGY_DETAIL_REQUIRED: 'กรณีมีประวัติแพ้ยา กรุณาระบุยา/กลุ่มยา อาการแพ้ และหมายเหตุ',
  DRUG_ALLERGY_HARD_STOP: 'ระบบหยุดการจ่ายยา: พบความเสี่ยงแพ้ยาที่บันทึกไว้ กรุณาทบทวนรายการยาและปรึกษาเภสัชกรก่อนดำเนินการ',
  ALLERGY_RULES_UNAVAILABLE: 'ไม่สามารถอ่านฐานข้อมูลกฎแพ้ยาได้ ระบบระงับการจ่ายยาจนกว่าผู้ดูแลจะตรวจสอบ',
  VISIT_SCHEMA_NOT_READY: 'โครงสร้างข้อมูล Visit ไม่พร้อม กรุณาติดต่อผู้ดูแลเพื่อตรวจสอบการปรับปรุงฐานข้อมูล',
  ALLERGY_RULES_CONFIGURATION_ERROR: 'กฎแพ้ยาที่ Publish มีข้อมูลผิดพลาด ระบบหยุดจ่ายยาเพื่อความปลอดภัย กรุณาติดต่อผู้ดูแล',
  INVALID_ALLERGY_RULE: 'รูปแบบชื่อสารที่แพ้หรือชื่อสามัญยาไม่ถูกต้อง (ใช้ | แยกชื่อ)',
  ALLERGY_RULE_REFERENCE_REQUIRED: 'กรุณาระบุแหล่งอ้างอิงทางคลินิกของกฎ',
  ALLERGY_RULE_REVIEW_REQUIRED: 'ต้องยืนยันการทบทวนทางคลินิกก่อน Publish',
  ACTIVE_RULE_IMMUTABLE_CREATE_NEW: 'กฎที่ Publish แล้วแก้ไขโดยตรงไม่ได้ โปรดสร้าง Draft ฉบับใหม่',
  ALLERGY_RULE_NOT_DRAFT: 'สามารถ Publish ได้เฉพาะกฎ Draft',
  LOCKED_ALLERGY_RULE: 'กฎแพ้ยาพื้นฐานถูกล็อกและไม่อนุญาตให้แก้ไข',
  NOTIFICATION_ALREADY_SENT: 'Notification นี้ส่งสำเร็จแล้ว ไม่อนุญาตให้ส่งซ้ำ',
  NOTIFICATION_NOT_FOUND: 'ไม่พบ Notification ID นี้ใน Log ของ API ที่กำลังใช้งาน',
  NOTIFICATION_EMAIL_DISABLED: 'Retry ไม่ได้ เพราะ CONFIG ปิดการส่ง Email หรือรายการ CONFIG ไม่ Active',
  NOTIFICATION_RECIPIENT_NOT_CONFIGURED: 'Retry ไม่ได้: ไม่พบผู้รับใน Log หรือ CONFIG กรุณาตั้งค่าอีเมลและเปิด Active ของรายการผู้รับ',
  INVALID_NOTIFICATION_VISIT: 'Retry ไม่ได้: Disposition ของ Visit ไม่ตรงกับชนิด Notification',
  VISIT_NOT_FOUND: 'Retry ไม่ได้: ไม่พบ Visit ที่เชื่อมกับ Notification นี้',
  INVALID_DATE_RANGE: 'ช่วงวันที่ไม่ถูกต้อง',
  STUDENT_SAFETY_REVIEW_REQUIRED: 'กรุณาตรวจสอบข้อมูลแพ้ยานักเรียนอีกครั้ง เพราะข้อมูลล่าสุดอาจมีการเปลี่ยนแปลง',
  NOTIFICATION_STATUS_UNCERTAIN: 'สถานะ Email ไม่แน่นอน ต้องตรวจสอบผู้รับก่อนส่งซ้ำ',
  NOTIFICATION_RETRY_NOT_ALLOWED: 'Retry ได้เฉพาะรายการสถานะ FAILED เท่านั้น',
  NOTIFICATION_STATUS_INVALID: 'สถานะ Notification ไม่รองรับการ Retry',
  NOTIFICATION_CONFIRMATION_REQUIRED: 'กรุณายืนยันว่าได้ตรวจสอบและไม่มี Email ส่งถึงผู้รับจริง',
  DUPLICATE_STAFF_ID_IN_IMPORT: 'มี Staff ID ซ้ำในไฟล์ Import',
  STAFF_MASTER_IMPORT_ROLLBACK_FAILED: 'ไม่สามารถย้อนคืน Staff Master ได้ครบ กรุณาตรวจสอบข้อมูลและติดต่อผู้ดูแลระบบ'
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
  'getDrugAllergyRules',
  'getUsers',
  'getInventoryIntegrity',
  'getStockCounts',
  'getSymptoms',
  'getDashboardV2'
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
  'saveDrugAllergyRule',
  'publishDrugAllergyRule',
  'updateStockLotStatus',
  'submitStockCount',
  'importStaffMaster',
  'retryNotification',
  'reconcileNotifications',
  'resolveUncertainNotification',
  'submitVisit'
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
    // The HttpOnly session cookie is the credential; browser token is an inert compatibility marker.
    response = await fetch(url, {
      method: 'POST',
      mode: 'same-origin',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', 'X-BHH-Gateway': '1' },
      body: JSON.stringify({action,payload,token: token ? 'gateway-session' : undefined}),
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
    let payload: ApiResponse<T> | null = null;
    try { payload = (await response.clone().json()) as ApiResponse<T>; } catch {}
    const code = payload?.errorCode || 'SERVER_ERROR';
    const err = new Error(getErrorMessage(code));
    (err as any).errorCode = code;
    throw err;
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
