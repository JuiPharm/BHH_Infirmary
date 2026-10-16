/*
 * BHH Infirmary — GATE 1 SYNTHETIC SANDBOX TEST HELPER (Apps Script Editor only).
 * DO NOT COPY INTO PRODUCTION GAS.
 * Not wired into route_(), and therefore inaccessible through GAS doPost.
 *
 * IMPORTANT: Invokes real submitVisit_ with fixed negative fixtures. A broken
 * implementation could unexpectedly commit a *synthetic* Visit/Stock row.
 * Only run against the exact dedicated synthetic workbook after backup.
 * Never run on Production or a workbook containing real patient data.
 */
const GATE1_SYNTHETIC_WORKBOOK_ID = '1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs';
const GATE1_SYNTHETIC_STAFF = 'UAT-TEST-ADMIN';
const GATE1_SYNTHETIC_DRUG = 'MOCK-ITEM-005';
const GATE1_SYNTHETIC_STOCK_LOT = 'MOCK-LOT-005A';
const GATE1_CHECK_TABLES = [
  'DISPENSE_HEADER','DISPENSE_ITEMS','STOCK_TRANSACTION',
  'STOCK_LOT','ITEM_MASTER','NOTIFICATION_LOG','AUDIT_LOG'
];

function gate1Snapshot_() {
  const snapshot = {};
  GATE1_CHECK_TABLES.forEach(function(name) {
    // stringify stabilizes dates and 2D cells without needing to write anything.
    snapshot[name] = JSON.stringify(getSheet_(name).getDataRange().getValues());
  });
  return snapshot;
}

function gate1NoMutation_(before) {
  const after = gate1Snapshot_();
  const changed = GATE1_CHECK_TABLES.filter(function(name){
    return before[name] !== after[name];
  });
  if (changed.length) {
    // Do not undo or auto-retry an unexpected commit; preserve investigation evidence.
    throw new Error('UAT_GATE1_UNEXPECTED_WRITE_STOP:' + changed.join(','));
  }
}

function gate1AssertSyntheticFixture_() {
  if (String(getSpreadsheet_().getId()) !== GATE1_SYNTHETIC_WORKBOOK_ID)
    throw new Error('UAT_SANDBOX_ONLY');
  const props = PropertiesService.getScriptProperties();
  if (String(props.getProperty('SHEET_ID') || '') !== GATE1_SYNTHETIC_WORKBOOK_ID)
    throw new Error('UAT_SHEET_ID_MISMATCH');
  const config = rows_(SHEETS.CONFIG);
  ['REFERRAL_EMAIL_ENABLED','EMERGENCY_EMAIL_ENABLED'].forEach(function(key){
    const r = config.find(function(x){ return String(x['Config Key'] || '') === key; });
    if (!r || String(r['Config Value']).toUpperCase() !== 'FALSE')
      throw new Error('UAT_EMAIL_NOT_DISABLED:' + key);
  });
  ['REFERRAL_EMAIL_TO','REFERRAL_EMAIL_CC','EMERGENCY_EMAIL_TO','EMERGENCY_EMAIL_CC'].forEach(function(key){
    const r = config.find(function(x){return String(x['Config Key'] || '') === key;});
    if (!r || String(r['Config Value'] || '').trim() !== '')
      throw new Error('UAT_EMAIL_RECIPIENTS_NOT_EMPTY:' + key);
  });
  const students = rows_(SHEETS.STUDENTS);
  const studentAllergy = function(id) {
    const v=students.find(function(s){return String(s['Student ID'] || '')===id;});
    return v && String(v['Drug Allergy'] || '').trim();
  };
  if (studentAllergy('MOCK-STU-003') !== 'PENICILLIN' ||
      studentAllergy('MOCK-STU-001') !== 'UNKNOWN')
    throw new Error('UAT_STUDENT_FIXTURE_CHANGED');
  const staff = rows_(SHEETS.STAFF_MASTER);
  if (!staff.some(function(r){
    return String(r['Staff ID'])==='MOCK-TCH-001' &&
      String(r['Recipient Type'])==='TEACHER' && isActiveStatus_(r.Status);
  })) throw new Error('UAT_STAFF_FIXTURE_CHANGED');
  const item=rows_(SHEETS.ITEM_MASTER).find(function(i){
    return String(i['Item Code'])===GATE1_SYNTHETIC_DRUG;
  });
  if (!item || normalizeItemType_(item['Item Type'])!=='DRUG' ||
      !/\bAMOXICILLIN\b/i.test(String(item['Generic Name'] || '')))
    throw new Error('UAT_DRUG_FIXTURE_CHANGED');
  const lots=rows_(SHEETS.STOCK_LOT);
  if (!lots.some(function(l){
    return String(l['Stock Lot ID'])===GATE1_SYNTHETIC_STOCK_LOT &&
      String(l['Item Code'])===GATE1_SYNTHETIC_DRUG &&
      Number(l['Current Qty'])===20;
  })) throw new Error('UAT_STOCK_FIXTURE_CHANGED');
}

function gate1FixturePayload_(id, recipient, allergy) {
  return {
    recipient:recipient,
    studentId:recipient.recipientSource==='STUDENT_MASTER'?recipient.recipientId:'',
    symptomIds:['NT001'],
    assessment:'GATE1 SYNTHETIC NEGATIVE PATH - NO REAL PATIENT OR TREATMENT',
    disposition:'RETURN_TO_CLASS',
    clientTransactionId:id,
    items:[{itemCode:GATE1_SYNTHETIC_DRUG,qty:1}],
    studentSafetyAcknowledged:true,
    studentDrugAllergySnapshot:allergy || '',
    drugAllergy: recipient.recipientSource==='STAFF_MASTER'
      ? {status:'KNOWN_ALLERGY',drugGroup:'PENICILLIN',reaction:'Synthetic rash',note:'UAT only'}
      : undefined
  };
}

/**
 * RUN MANUALLY IN DEDICATED GAS SANDBOX SCRIPT EDITOR:
 * 1. Backup synthetic Sheet and verify SHEET_ID property first.
 * 2. Run exactly this function as an authorized Apps Script editor.
 * 3. Expect a JSON text with overall: PASS and 4 cases.
 * 4. If error says UNEXPECTED_WRITE_STOP or ROLLBACK_FAILED, STOP UAT and
 *    preserve data for incident reconciliation. Never blindly retry.
 */
function runGate1ClinicalNegativeUat() {
  gate1AssertSyntheticFixture_();
  const checks=[
    {id:'PENICILLIN_AMOXICILLIN',
     recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},
     allergy:'PENICILLIN',expected:'DRUG_ALLERGY_HARD_STOP'},
    {id:'STUDENT_UNKNOWN_HISTORY',
     recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-001'},
     allergy:'UNKNOWN',expected:'STUDENT_ALLERGY_STATUS_UNVERIFIED'},
    {id:'STAFF_KNOWN_PENICILLIN',
     recipient:{recipientSource:'STAFF_MASTER',recipientId:'MOCK-TCH-001'},
     expected:'DRUG_ALLERGY_HARD_STOP'},
    {id:'STAFF_ALLERGY_MISSING',
     recipient:{recipientSource:'STAFF_MASTER',recipientId:'MOCK-TCH-001'},
     expected:'ALLERGY_STATUS_REQUIRED',withoutAllergy:true}
  ];
  const overallBefore=gate1Snapshot_(),results=[];
  for (let i=0;i<checks.length;i++){
    const check=checks[i];
    const before=gate1Snapshot_();
    const payload=gate1FixturePayload_(
      'BHH-G1-20261016-'+(i+1)+'-NEGATIVE-SYNTHETIC',check.recipient,check.allergy
    );
    if (check.withoutAllergy) delete payload.drugAllergy;
    let observed='';
    try{
      submitVisit_(payload,{staffId:GATE1_SYNTHETIC_STAFF,role:'SUPER_ADMIN'});
      observed='UNEXPECTED_SUCCESS';
    }catch(err){
      observed=String(err && err.message || err);
    }
    // Reconcile BEFORE accepting any exception as a normal hard stop.
    gate1NoMutation_(before);
    if (observed!==check.expected)
      throw new Error('UAT_GATE1_WRONG_RESULT:'+check.id+':'+observed);
    results.push({case:check.id,result:'PASS',code:observed,visitWrites:0,stockWrites:0});
  }
  gate1NoMutation_(overallBefore);
  const result={status:'PASS',environment:'SYNTHETIC_GAS_SANDBOX',
    scope:'REAL_SUBMIT_VISIT_NEGATIVE_PATH',buildId:GAS_SOURCE_BUILD_ID,
    cases:results,visitWrites:0,stockWrites:0,notificationWrites:0,auditWrites:0};
  Logger.log(JSON.stringify(result));
  return result;
}
