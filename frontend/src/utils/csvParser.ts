export interface StudentImportRow {
  studentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  grade: string;
  className: string;
  gender: string;
  status: string;
}

export interface ItemImportRow {
  itemCode: string;
  itemType: 'DRUG' | 'MEDICAL_SUPPLY';
  genericName: string;
  tradeName: string;
  unit: string;
  minStock: number;
  maxStock: number;
  unitCost: number;
  active: boolean;
}

/**
 * Parses raw text containing either comma-separated (CSV) or tab-separated (TSV/Excel) data.
 * Properly handles quoted strings and commas inside quotes.
 */
export function parseDelimitedText(rawText: string): string[][] {
  const clean = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!clean) return [];

  const lines = clean.split('\n');
  if (lines.length === 0) return [];

  // Detect delimiter from first non-empty line
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;

  let delimiter = ',';
  if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
  else if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';

  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const row: string[] = [];
    let inQuotes = false;
    let token = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          token += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        row.push(token.trim());
        token = '';
      } else {
        token += char;
      }
    }
    row.push(token.trim());
    rows.push(row);
  }

  return rows;
}

const normalizeHeader = (h: string): string =>
  h.toLowerCase().replace(/[\s_\-/\\]/g, '');

export function parseStudentsInput(rawText: string): { data: StudentImportRow[]; errors: string[] } {
  const rows = parseDelimitedText(rawText);
  const errors: string[] = [];
  const data: StudentImportRow[] = [];

  if (rows.length === 0) {
    return { data, errors: ['ไม่พบข้อมูลในข้อความหรือไฟล์ที่นำเข้า'] };
  }

  const headers = rows[0].map(normalizeHeader);
  const findCol = (...aliases: string[]): number => {
    const normalAliases = aliases.map(normalizeHeader);
    return headers.findIndex((h) => normalAliases.includes(h));
  };

  const idCol = findCol('studentid', 'id', 'รหัสนักเรียน', 'รหัสประจำตัว', 'รหัส');
  const fNameCol = findCol('firstname', 'ชื่อ', 'ชื่อจริง');
  const lNameCol = findCol('lastname', 'นามสกุล');
  const fullNameCol = findCol('fullname', 'name', 'ชื่อสกุล', 'ชื่อนามสกุล');
  const gradeCol = findCol('grade', 'ระดับชั้น', 'ชั้น', 'ชั้นเรียน', 'ชั้นปี');
  const classCol = findCol('classname', 'class', 'ห้อง', 'ห้องเรียน');
  const genderCol = findCol('gender', 'เพศ');
  const statusCol = findCol('status', 'สถานะ');

  if (idCol === -1) {
    return {
      data,
      errors: ['ไม่พบคอลัมน์รหัสนักเรียน (เช่น "studentId" หรือ "รหัสนักเรียน") ในแถวหัวตาราง']
    };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every((c) => !c)) continue;

    const studentId = row[idCol] || '';
    if (!studentId) {
      errors.push(`แถวที่ ${i + 1}: ไม่มีรหัสนักเรียน`);
      continue;
    }

    const firstName = fNameCol !== -1 ? row[fNameCol] || '' : '';
    const lastName = lNameCol !== -1 ? row[lNameCol] || '' : '';
    let fullName = fullNameCol !== -1 ? row[fullNameCol] || '' : '';

    if (!fullName) {
      if (firstName || lastName) {
        fullName = `${firstName} ${lastName}`.trim();
      } else {
        fullName = studentId;
      }
    }

    const grade = gradeCol !== -1 ? row[gradeCol] || '' : '';
    const className = classCol !== -1 ? row[classCol] || '' : '';
    const gender = genderCol !== -1 ? row[genderCol] || '' : '';
    const status = statusCol !== -1 && row[statusCol] ? row[statusCol].toUpperCase() : 'ACTIVE';

    data.push({
      studentId,
      firstName,
      lastName,
      fullName,
      grade,
      className,
      gender,
      status
    });
  }

  return { data, errors };
}

export function parseItemsInput(rawText: string): { data: ItemImportRow[]; errors: string[] } {
  const rows = parseDelimitedText(rawText);
  const errors: string[] = [];
  const data: ItemImportRow[] = [];

  if (rows.length === 0) {
    return { data, errors: ['ไม่พบข้อมูลในข้อความหรือไฟล์ที่นำเข้า'] };
  }

  const headers = rows[0].map(normalizeHeader);
  const findCol = (...aliases: string[]): number => {
    const normalAliases = aliases.map(normalizeHeader);
    return headers.findIndex((h) => normalAliases.includes(h));
  };

  const codeCol = findCol('itemcode', 'code', 'รหัส', 'รหัสยา', 'รหัสเวชภัณฑ์');
  const typeCol = findCol('itemtype', 'type', 'ประเภท', 'หมวด', 'หมวดหมู่');
  const gNameCol = findCol('genericname', 'generic', 'ชื่อสามัญ', 'ชื่อยา', 'ชื่อเวชภัณฑ์');
  const tNameCol = findCol('tradename', 'trade', 'ชื่อการค้า');
  const unitCol = findCol('unit', 'หน่วย', 'หน่วยนับ');
  const minCol = findCol('minstock', 'minimumstock', 'min', 'เกณฑ์ขั้นต่ำ', 'ขั้นต่ำ');
  const maxCol = findCol('maxstock', 'maximumstock', 'max', 'เกณฑ์สูงสุด', 'สูงสุด');
  const costCol = findCol('unitcost', 'cost', 'ราคาต่อหน่วย', 'ราคา');
  const activeCol = findCol('active', 'active/inactive', 'status', 'สถานะ');

  if (codeCol === -1) {
    return {
      data,
      errors: ['ไม่พบคอลัมน์รหัสเวชภัณฑ์ (เช่น "itemCode" หรือ "รหัสยา") ในแถวหัวตาราง']
    };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || row.every((c) => !c)) continue;

    const itemCode = (row[codeCol] || '').trim().toUpperCase();
    if (!itemCode) {
      errors.push(`แถวที่ ${i + 1}: ไม่มีรหัสเวชภัณฑ์`);
      continue;
    }

    // Determine type
    let itemType: 'DRUG' | 'MEDICAL_SUPPLY' = 'DRUG';
    if (typeCol !== -1 && row[typeCol]) {
      const rawType = row[typeCol].toUpperCase();
      if (rawType.includes('SUPPLY') || rawType.includes('เวชภัณฑ์') || rawType.includes('อุปกรณ์')) {
        itemType = 'MEDICAL_SUPPLY';
      }
    }

    const genericName = gNameCol !== -1 ? row[gNameCol] || '' : '';
    const tradeName = tNameCol !== -1 ? row[tNameCol] || '' : '';
    const unit = unitCol !== -1 && row[unitCol] ? row[unitCol] : (itemType === 'DRUG' ? 'เม็ด' : 'ชิ้น');

    const minStock = minCol !== -1 ? parseFloat(row[minCol]) || 0 : 0;
    const maxStock = maxCol !== -1 ? parseFloat(row[maxCol]) || 0 : 0;
    const unitCost = costCol !== -1 ? parseFloat(row[costCol]) || 0 : 0;

    let active = true;
    if (activeCol !== -1 && row[activeCol]) {
      const a = row[activeCol].trim().toLowerCase();
      if (a === 'false' || a === 'inactive' || a === '0' || a === 'ระงับ' || a === 'ปิด') {
        active = false;
      }
    }

    data.push({
      itemCode,
      itemType,
      genericName: genericName || tradeName || itemCode,
      tradeName,
      unit,
      minStock,
      maxStock,
      unitCost,
      active
    });
  }

  return { data, errors };
}