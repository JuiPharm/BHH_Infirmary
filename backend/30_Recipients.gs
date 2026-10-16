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

// Must be verified again on the backend; a loaded frontend profile alone
// cannot authorize medication dispensing for a master-backed student.
// Narrow rule, subject to oncology/clinical pharmacist review before GAS Production deployment.
// Source: FDA AMOXIL prescribing information Section 4 (2024).
// This rule does NOT constitute a general allergen-drug terminology engine.
function knownPenicillinDrugConflict_(recordedAllergy,plans) {
  const allergy = String(recordedAllergy || '').toUpperCase();
  const penicillinAllergy = /\\b(PENICILLIN|PENICILLINS|AMOXICILLIN|AMPICILLIN)\\b/.test(allergy);
  if (!penicillinAllergy) return false;
  return (plans || []).some(function(plan) {
    const master = plan && plan.master || {};
    if (normalizeItemType_(master['Item Type'] || '') !== 'DRUG') return false;
    // Match generic only to avoid misleading brand-name substring collisions.
    const generic = String(master['Generic Name'] || '').toUpperCase();
    return /\\b(AMOXICILLIN|AMPICILLIN|PENICILLIN)\\b/.test(generic);
  });
}

function validateStudentDrugSafetyForDispense_(recipient,p,plans) {
  if (!recipient || recipient.recipientSource !== 'STUDENT_MASTER') return;
  const hasDrug = (plans || []).some(function(plan){
    return normalizeItemType_(plan && plan.master && plan.master['Item Type']) === 'DRUG';
  });
  if (!hasDrug) return;

  const student = rows_(SHEETS.STUDENTS).find(function(x) {
    return String(x['Student ID'] || '').trim() === recipient.recipientId &&
      isActiveStatus_(x.Status);
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  const latestAllergy = String(student['Drug Allergy'] || '').trim();
  const reviewedSnapshot = String(p.studentDrugAllergySnapshot || '').trim();
  if (p.studentSafetyAcknowledged !== true || reviewedSnapshot !== latestAllergy)
    throw new Error('STUDENT_SAFETY_REVIEW_REQUIRED');
  // Acknowledgement of a matching allergy does not authorize dispensing.
  if (knownPenicillinDrugConflict_(latestAllergy,plans))
    throw new Error('DRUG_ALLERGY_HARD_STOP');
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
    if (knownPenicillinDrugConflict_(result.drugGroup,plans))
      throw new Error('DRUG_ALLERGY_HARD_STOP');
  }
  return result;
}

// Prevent formula evaluation if a CSV/JSON import contains spreadsheet commands.
function safeImportedSheetText_(value) {
  const text = String(value || '');
  return /^[=+@-]/.test(text) ? "'"+text : text;
}

// Spreadsheet has no atomic multi-row upsert. All rows are validated first and
// old rows are kept untouched except the matching ID; any partial write is
// reversed from the in-memory snapshot before the lock is released.
function importStaffMaster_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const incoming = Array.isArray(p && p.rows) ? p.rows : [];
  if (!incoming.length) throw new Error('INVALID_INPUT');
  if (incoming.length > 2000) throw new Error('IMPORT_TOO_LARGE');

  const seen = {};
  const validated = incoming.map(function(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('INVALID_STAFF_MASTER_ROW');
    const id = limitedText_(raw.staffId || raw['Staff ID'],100);
    const name = limitedText_(raw.fullName || raw['Full Name'],200);
    const type = String(raw.recipientType || raw['Recipient Type'] || '').trim().toUpperCase();
    const status = String(raw.status || raw.Status || 'ACTIVE').trim().toUpperCase();
    // Never let an imported ID turn into a spreadsheet formula.
    if (/^[=+@-]/.test(id)) throw new Error('INVALID_STAFF_MASTER_ROW');
    if (!id || !name || STAFF_MASTER_TYPES.indexOf(type) < 0 ||
        ['ACTIVE','INACTIVE'].indexOf(status) < 0) {
      throw new Error('INVALID_STAFF_MASTER_ROW');
    }
    if (seen[id]) throw new Error('DUPLICATE_STAFF_ID_IN_IMPORT');
    seen[id] = true;
    return {
      id:id,
      name:safeImportedSheetText_(name),
      type:type,
      department:safeImportedSheetText_(limitedText_(raw.department || raw.Department,200)),
      status:status
    };
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(SHEETS.STAFF_MASTER);
    ensureHeaders_(sh,HEADERS.STAFF_MASTER);
    const data = sh.getDataRange().getValues();
    const display = sh.getDataRange().getDisplayValues();
    const header = data[0].map(String);
    const h = headerMap_(header);
    const originalLastRow = sh.getLastRow();
    const existingById = {};
    for (let i=1;i<data.length;i++) {
      const id = String(display[i][h['Staff ID']] || data[i][h['Staff ID']] || '').trim();
      if (!id) continue;
      if (existingById[id] !== undefined) throw new Error('DUPLICATE_EXISTING_STAFF_ID');
      existingById[id] = i+1;
    }

    const updates = [];
    const additions = [];
    const timestamp = now_();
    validated.forEach(function(entry) {
      const rowNum = existingById[entry.id];
      const row = rowNum ? data[rowNum-1].slice() : Array(header.length).fill('');
      row[h['Staff ID']] = entry.id;
      row[h['Full Name']] = entry.name;
      row[h['Recipient Type']] = entry.type;
      row[h.Department] = entry.department;
      row[h.Status] = entry.status;
      row[h['Updated At']] = timestamp;
      if (rowNum) {
        updates.push({rowNum:rowNum,before:data[rowNum-1].slice(),after:row});
      } else {
        additions.push(row);
      }
    });

    const written = [];
    try {
      updates.forEach(function(x) {
        sh.getRange(x.rowNum,1,1,header.length).setValues([x.after]);
        written.push(x);
      });
      if (additions.length) {
        sh.getRange(originalLastRow+1,1,additions.length,header.length).setValues(additions);
      }
    } catch (writeErr) {
      let rollbackFailed = false;
      try {
        if (sh.getLastRow() > originalLastRow) truncateAfterRow_(sh,originalLastRow);
        written.reverse().forEach(function(x) {
          sh.getRange(x.rowNum,1,1,header.length).setValues([x.before]);
        });
      } catch (rollbackErr) {
        rollbackFailed = true;
      }
      clearCache_(SHEETS.STAFF_MASTER);
      if (rollbackFailed) throw new Error('STAFF_MASTER_IMPORT_ROLLBACK_FAILED');
      throw writeErr;
    }

    clearCache_(SHEETS.STAFF_MASTER);
    audit_(s,'IMPORT_STAFF_MASTER','STAFF_MASTER','ROWS:'+incoming.length,'SUCCESS');
    return {success:true,data:{
      imported:incoming.length,updated:updates.length,created:additions.length,
      total:originalLastRow-1+additions.length
    }};
  } finally {
    lock.releaseLock();
  }
}
