/* P4 — Recipient compatibility layer
   Keeps System Role (USERS.Role) separate from Recipient Type.
*/

const RECIPIENT_TYPES = ['STUDENT','TEACHER','STAFF','OTHER','PARENT','VISITOR'];
const STAFF_MASTER_TYPES = ['TEACHER','STAFF'];

function searchRecipients_(p,s) {
  requireRole_(s,['NURSE','ADMIN','MANAGER','SUPER_ADMIN']);
  const q = String(p && p.q || '').trim().toLowerCase();
  if (!q) return {success:true,data:[]};

  const results = [];
  rows_(SHEETS.STUDENTS).forEach(function(x){
    if (!isActiveStatus_(x.Status)) return;
    const fields = ['Student ID','First Name','Last Name','Full Name','Grade','Class'];
    const matched = fields.some(function(k){
      return String(x[k] || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!matched) return;
    results.push({
      recipientId:String(x['Student ID'] || '').trim(),
      recipientName:String(x['Full Name'] || ((x['First Name'] || '')+' '+(x['Last Name'] || '')).trim()),
      recipientType:'STUDENT',
      departmentClass:studentDepartmentClass_(x),
      recipientSource:'STUDENT_MASTER',
      grade:String(x.Grade || ''),
      className:String(x.Class || '')
    });
  });

  rows_(SHEETS.STAFF_MASTER).forEach(function(x){
    if (!isActiveStatus_(x.Status)) return;
    const type = normalizeStaffRecipientType_(x['Recipient Type']);
    if (!type) return;
    const fields = ['Staff ID','Full Name','Department'];
    const matched = fields.some(function(k){
      return String(x[k] || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!matched) return;
    results.push({
      recipientId:String(x['Staff ID'] || '').trim(),
      recipientName:String(x['Full Name'] || '').trim(),
      recipientType:type,
      departmentClass:String(x.Department || '').trim(),
      recipientSource:'STAFF_MASTER'
    });
  });

  results.sort(function(a,b){
    const aExact = a.recipientId.toLowerCase() === q ? 0 : 1;
    const bExact = b.recipientId.toLowerCase() === q ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return a.recipientName.localeCompare(b.recipientName);
  });

  return {success:true,data:results.slice(0,30)};
}

function resolveRecipientForVisit_(p) {
  const payload = p && p.recipient ? p.recipient : {};
  const requestedSource = String(payload.recipientSource || p.recipientSource || '').trim().toUpperCase();
  const requestedId = String(payload.recipientId || p.recipientId || p.studentId || '').trim();

  if (requestedSource === 'FREE_TEXT') {
    const name = limitedText_(payload.recipientName || p.recipientName,200);
    const type = String(payload.recipientType || p.recipientType || 'OTHER').trim().toUpperCase();
    if (!name) throw new Error('RECIPIENT_NAME_REQUIRED');
    if (RECIPIENT_TYPES.indexOf(type) < 0) throw new Error('INVALID_RECIPIENT_TYPE');
    return {
      recipientId:limitedText_(requestedId,100),
      recipientName:name,
      recipientType:type,
      departmentClass:limitedText_(payload.departmentClass || p.departmentClass,200),
      recipientSource:'FREE_TEXT',
      recipientContact:limitedText_(payload.recipientContact || p.recipientContact,100)
    };
  }

  if (requestedSource === 'STAFF_MASTER') {
    return resolveStaffMasterRecipient_(requestedId);
  }

  // Legacy payloads with studentId remain supported, but recipient type is derived by backend.
  if (requestedSource === 'STUDENT_MASTER' || p.studentId || requestedId) {
    const student = rows_(SHEETS.STUDENTS).find(function(x){
      return String(x['Student ID'] || '').trim() === requestedId && isActiveStatus_(x.Status);
    });
    if (student) {
      return {
        recipientId:String(student['Student ID'] || '').trim(),
        recipientName:String(student['Full Name'] || ((student['First Name'] || '')+' '+(student['Last Name'] || '')).trim()),
        recipientType:'STUDENT',
        departmentClass:studentDepartmentClass_(student),
        recipientSource:'STUDENT_MASTER',
        recipientContact:''
      };
    }

    // If an explicit STAFF_MASTER source was not supplied, allow an exact Staff ID lookup.
    const staff = rows_(SHEETS.STAFF_MASTER).find(function(x){
      return String(x['Staff ID'] || '').trim() === requestedId && isActiveStatus_(x.Status);
    });
    if (staff) return resolveStaffMasterRecipient_(requestedId);
  }

  throw new Error('RECIPIENT_NOT_FOUND');
}

function resolveStaffMasterRecipient_(staffId) {
  const id = String(staffId || '').trim();
  if (!id) throw new Error('RECIPIENT_NOT_FOUND');
  const row = rows_(SHEETS.STAFF_MASTER).find(function(x){
    return String(x['Staff ID'] || '').trim() === id && isActiveStatus_(x.Status);
  });
  if (!row) throw new Error('RECIPIENT_NOT_FOUND');
  const type = normalizeStaffRecipientType_(row['Recipient Type']);
  if (!type) throw new Error('INVALID_RECIPIENT_TYPE');
  return {
    recipientId:id,
    recipientName:String(row['Full Name'] || '').trim(),
    recipientType:type,
    departmentClass:String(row.Department || '').trim(),
    recipientSource:'STAFF_MASTER',
    recipientContact:''
  };
}

function normalizeStaffRecipientType_(value) {
  const type = String(value || '').trim().toUpperCase();
  return STAFF_MASTER_TYPES.indexOf(type) >= 0 ? type : '';
}

function studentDepartmentClass_(row) {
  const grade = String(row && row.Grade || '').trim();
  const cls = String(row && row.Class || '').trim();
  if (grade && cls) return grade + '/' + cls;
  return grade || cls;
}

function validateFreeTextAllergyForDispense_(recipient,p,plans) {
  const result = {
    status:'',
    drugGroup:'',
    reaction:'',
    note:''
  };
  if (!recipient || recipient.recipientSource !== 'FREE_TEXT') return result;

  const hasDrug = (plans || []).some(function(plan){
    return normalizeItemType_(plan && plan.master && plan.master['Item Type']) === 'DRUG';
  });
  if (!hasDrug) return result;

  const allergy = p && p.drugAllergy ? p.drugAllergy : {};
  const status = String(allergy.status || p.drugAllergyStatus || '').trim().toUpperCase();
  if (['NKDA','KNOWN_ALLERGY','UNKNOWN'].indexOf(status) < 0) {
    throw new Error('ALLERGY_STATUS_REQUIRED');
  }
  result.status = status;

  if (status === 'KNOWN_ALLERGY') {
    result.drugGroup = limitedText_(allergy.drugGroup || p.drugAllergyDrugGroup,300);
    result.reaction = limitedText_(allergy.reaction || p.drugAllergyReaction,500);
    result.note = limitedText_(allergy.note || p.drugAllergyNote,1000);
    if (!result.drugGroup || !result.reaction || !result.note) {
      throw new Error('ALLERGY_DETAIL_REQUIRED');
    }
  }
  return result;
}

function importStaffMaster_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const incoming = Array.isArray(p && p.rows) ? p.rows : [];
  if (!incoming.length) throw new Error('INVALID_INPUT');
  if (incoming.length > 2000) throw new Error('IMPORT_TOO_LARGE');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(SHEETS.STAFF_MASTER);
    ensureHeaders_(sh,HEADERS.STAFF_MASTER);
    const current = rows_(SHEETS.STAFF_MASTER);
    const map = {};
    current.forEach(function(r){
      map[String(r['Staff ID'] || '').trim()] = r;
    });

    incoming.forEach(function(raw){
      const id = limitedText_(raw.staffId || raw['Staff ID'],100);
      const name = limitedText_(raw.fullName || raw['Full Name'],200);
      const type = String(raw.recipientType || raw['Recipient Type'] || '').trim().toUpperCase();
      if (!id || !name || STAFF_MASTER_TYPES.indexOf(type) < 0) throw new Error('INVALID_STAFF_MASTER_ROW');
      map[id] = {
        'Staff ID':id,
        'Full Name':name,
        'Recipient Type':type,
        'Department':limitedText_(raw.department || raw.Department,200),
        'Status':String(raw.status || raw.Status || 'ACTIVE').trim().toUpperCase(),
        'Updated At':now_()
      };
    });

    const headers = HEADERS.STAFF_MASTER;
    const rows = Object.keys(map).sort().map(function(id){
      const r = map[id];
      return headers.map(function(h){ return r[h] === undefined ? '' : r[h]; });
    });
    if (sh.getLastRow() > 1) sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).clearContent();
    if (rows.length) sh.getRange(2,1,rows.length,headers.length).setValues(rows);
    clearCache_(SHEETS.STAFF_MASTER);
    audit_(s,'IMPORT_STAFF_MASTER','STAFF_MASTER','ROWS:'+incoming.length,'SUCCESS');
    return {success:true,data:{imported:incoming.length,total:rows.length}};
  } finally {
    lock.releaseLock();
  }
}
