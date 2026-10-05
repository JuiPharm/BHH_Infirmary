export type UserRole = 'NURSE' | 'ADMIN' | 'MANAGER' | 'SUPER_ADMIN';

export interface Session {
  token: string;
  staffId: string;
  name: string;
  role: UserRole;
}

export interface Student {
  studentId: string;
  firstName?: string;
  lastName?: string;
  fullName: string;
  grade: string;
  className: string;
  gender?: string;
  status?: string;
}

export interface Item {
  'Item Code': string;
  'Item Type': 'DRUG' | 'MEDICAL_SUPPLY' | string;
  'Generic Name': string;
  'Trade Name': string;
  QTY: number;
  Unit: string;
  'Minimum Stock': number;
  'Maximum Stock': number;
  'Unit Cost': number;
  'Active/Inactive': boolean | string;
}

export interface StockLot {
  'Stock Lot ID': string;
  'Item Code': string;
  'Lot Number': string;
  'Expiry Date': string;
  'Received Date': string;
  'Received Qty': number;
  'Current Qty': number;
  'Unit Cost': number;
  Supplier: string;
  Status: string;
}

export interface CartItem {
  itemCode: string;
  genericName: string;
  tradeName: string;
  itemType: string;
  unit: string;
  currentStock: number;
  qty: number;
}

export interface DispenseItemRecord {
  'Dispense Item ID': string;
  'Visit ID': string;
  'Item Code': string;
  'Item Type': string;
  'Item Name': string;
  Qty: number;
  Unit: string;
  'Created At': string;
}

export type VisitDisposition =
  | 'RETURN_TO_CLASS'
  | 'OBSERVATION'
  | 'SEND_HOME'
  | 'PARENT_PICKUP'
  | 'REFER_CLINIC'
  | 'REFER_HOSPITAL'
  | 'EMERGENCY_TRANSFER'
  | 'OTHER';

export interface VisitVitals {
  temperature?: number | '';
  bpSystolic?: number | '';
  bpDiastolic?: number | '';
  pulse?: number | '';
  respiratoryRate?: number | '';
  spo2?: number | '';
  weight?: number | '';
}

export interface DispenseHeaderRecord {
  'Visit ID': string;
  'Student ID': string;
  'Visit Date': string;
  'Visit Time': string;
  Symptoms: string;
  'Other Symptom': string;
  Note: string;
  'Staff ID': string;
  Status: string;
  'Created At': string;
  'Client Transaction ID': string;
  Temperature?: number | string;
  'BP Systolic'?: number | string;
  'BP Diastolic'?: number | string;
  Pulse?: number | string;
  'Respiratory Rate'?: number | string;
  SpO2?: number | string;
  Weight?: number | string;
  Assessment?: string;
  Interventions?: string;
  Disposition?: VisitDisposition | string;
  'Outcome Note'?: string;
  'Completed At'?: string;
  items?: DispenseItemRecord[];
}

export interface StockTransactionRecord {
  'Transaction ID': string;
  'Transaction Type': string;
  'Reference ID': string;
  'Item Code': string;
  'Stock Lot ID': string;
  Qty: number;
  'Before Qty': number;
  'After Qty': number;
  'Unit Cost': number;
  Reason: string;
  'Staff ID': string;
  Timestamp: string;
}

export interface DashboardSummaryData {
  items: number;
  lowStock: number;
  visitsToday: number;
  totalVisits: number;
  expiryAlerts: number;
}

export interface VisitTrendData {
  date: string;
  count: number;
}

export interface TopSymptomData {
  symptom: string;
  count: number;
}

export interface TopItemData {
  itemCode: string;
  qty: number;
}

export interface UserRecord {
  staffId: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLogin: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigRecord {
  'Config Key': string;
  'Config Value': string;
  'Data Type': string;
  Description: string;
  Active: boolean;
  'Updated At': string;
  'Updated By': string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  errorCode?: string;
  message?: string;
}
