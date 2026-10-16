import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Run the ACTUAL GAS clinical code against an entirely in-memory Sheets harness.
// These tests must never contact production GAS or write to a live spreadsheet.
const root=resolve(import.meta.dirname,'../..');
const source=['backend/Code.gs','backend/30_Recipients.gs','backend/35_AllergyRules.gs','backend/40_ClinicalP4.gs']
  .map(x=>readFileSync(resolve(root,x),'utf8')).join('\n');
const lotHeaders=['Stock Lot ID','Item Code','Lot Number','Expiry Date','Received Date','Received Qty','Current Qty','Unit Cost','Supplier','Status'];
const item=(code,type,name)=>({'Item Code':code,'Item Type':type,'Generic Name':name,'Trade Name':'UAT '+name,
  QTY:0,Unit:'sachet','Minimum Stock':1,'Maximum Stock':100,'Unit Cost':1,'Active/Inactive':'ACTIVE'});
function harness(){
 const state={writes:0,lockCount:0,unlockCount:0,headers:0};
 const data={
  STUDENTS:[
   {'Student ID':'MOCK-STU-002',Status:'ACTIVE','Drug Allergy':'NKDA','Full Name':'Mock Student 2'},
   {'Student ID':'MOCK-STU-003',Status:'ACTIVE','Drug Allergy':'PENICILLIN','Full Name':'Mock Student 3'}
  ],
  STAFF_MASTER:[],
  SYMPTOMS:[{'Symptom ID':'NT001',Symptom:'ไข้',Category:'NON_TRAUMA',Active:true,'Clinical Alert Level':'NORMAL'}],
  ITEM_MASTER:[
   item('MOCK-ITEM-003','MEDICATION','Oral Rehydration Salts'),
   item('MOCK-ITEM-005','MEDICATION','Amoxicillin 250 mg'),
   item('MOCK-ITEM-007','MEDICATION','Integrity Check Dummy')
  ],
  STOCK_LOT:[
   ['MOCK-LOT-003A','MOCK-ITEM-003','ORS-1','2026-11-15','2026-10-15',30,29,3,'UAT','ACTIVE'],
   ['MOCK-LOT-003B','MOCK-ITEM-003','ORS-2','2027-12-31','2026-10-15',50,50,3,'UAT','ACTIVE'],
   ['MOCK-LOT-005A','MOCK-ITEM-005','AMOX','2027-06-30','2026-10-15',20,20,4,'UAT','ACTIVE'],
   ['MOCK-LOT-007E','MOCK-ITEM-007','EXPIRED','2026-09-30','2026-08-01',2,2,0,'UAT','ACTIVE'],
   ['MOCK-LOT-007Q','MOCK-ITEM-007','QUARANTINE','2027-12-31','2026-08-01',3,3,0,'UAT','QUARANTINE'],
   ['MOCK-LOT-007R','MOCK-ITEM-007','RECALL','2027-12-31','2026-08-01',4,4,0,'UAT','RECALL'],
   ['MOCK-LOT-007D','MOCK-ITEM-007','DAMAGED','2027-12-31','2026-08-01',5,5,0,'UAT','DAMAGED']
  ],
  DISPENSE_HEADER:[],DISPENSE_ITEMS:[],STOCK_TRANSACTION:[]
 };
 const ctx=vm.createContext({console,Date,LockService:{getScriptLock:()=>({
  waitLock:()=>{state.lockCount++},releaseLock:()=>{state.unlockCount++}
 })},Utilities:{getUuid:()=> '12345678-1234-4321-1234-123456789012',
   formatDate:()=> '2026-10-16 13:45:00'}});
 vm.runInContext(source,ctx);
 const visitHeaders=vm.runInContext('HEADERS.DISPENSE_HEADER',ctx);
 function mockSheet(name){
  return {
   getDataRange(){return {getValues(){return name==='STOCK_LOT'?[lotHeaders,...data.STOCK_LOT.map(x=>[...x])]:[]}};},
   getLastRow(){return name==='STOCK_LOT'?1+data.STOCK_LOT.length:1+(data[name]||[]).length;},
   getLastColumn(){return name==='DISPENSE_HEADER'?visitHeaders.length:10;},
   getRange(){return {getValues(){return [visitHeaders]},
       setValues(){state.writes++;throw Error('UNEXPECTED_WRITE_IN_NEGATIVE_TEST')}};},
   appendRow(){state.writes++;throw Error('UNEXPECTED_WRITE_IN_NEGATIVE_TEST');},
   deleteRows(){state.writes++;throw Error('UNEXPECTED_DELETE_IN_NEGATIVE_TEST');}
  };
 }
 ctx.getSpreadsheet_=()=>({getSheetByName:(name)=>name==='DRUG_ALLERGY_RULES'?{}:null});
 ctx.getSheet_=mockSheet;
 ctx.ensureHeaders_=()=>{state.headers++;state.writes++;throw Error('UNEXPECTED_SCHEMA_MIGRATION_WRITE');};
 ctx.rows_=(table)=>(data[table]||[]).map(x=>Array.isArray(x)?[...x]:{...x});
 ctx.clearCache_=()=>{};
 ctx.truncateAfterRow_=()=>{state.writes++;throw Error('UNEXPECTED_ROLLBACK_WRITE')};
 ctx.syncItemQty_=()=>{state.writes++;throw Error('UNEXPECTED_STOCK_SYNC')};
 ctx.audit_=()=>{state.writes++;throw Error('UNEXPECTED_AUDIT_WRITE')};
 ctx.auditSystem_=()=>{state.writes++;throw Error('UNEXPECTED_AUDIT_WRITE')};
 return {ctx,data,state};
}
const person={recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-002'};
const base=()=>({
 recipient:person,studentId:'MOCK-STU-002',
 symptomIds:['NT001'],disposition:'RETURN_TO_CLASS',
 assessment:'In-memory Negative UAT — no clinical treatment',
 items:[{itemCode:'MOCK-ITEM-003',qty:1}],
 studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'NKDA',
 clientTransactionId:'BHH-UAT-NEGATIVE-NO-WRITE'
});
const user={staffId:'UAT-TEST-ADMIN',role:'SUPER_ADMIN'};
function expectRejected(makePayload,expected,customize){
 const h=harness();if(customize)customize(h.data);
 const before=JSON.stringify(h.data);
 const payload=makePayload(base());
 assert.throws(()=>h.ctx.submitVisit_(payload,user),new RegExp(expected));
 assert.equal(JSON.stringify(h.data),before,'Synthetic tables must not change');
 assert.equal(h.state.writes,0,'No write to mock Sheets');
 assert.equal(h.state.lockCount,h.state.unlockCount,'ScriptLock must release');
}
test('reject duplicate transaction before any clinical/inventory write',()=>{
 expectRejected(x=>x,'DUPLICATE_TRANSACTION',d=>d.DISPENSE_HEADER.push({'Client Transaction ID':'BHH-UAT-NEGATIVE-NO-WRITE'}));
});
test('reject requested quantity exceeding all eligible FEFO lots',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-003',qty:80}]}),'INSUFFICIENT_STOCK');
});
test('reject expired, quarantined, recalled and damaged lots',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-007',qty:1}]}),'INSUFFICIENT_STOCK');
});
test('reject student drug without server-checked allergy acknowledgement',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},studentId:'MOCK-STU-003',
  studentSafetyAcknowledged:false,studentDrugAllergySnapshot:'PENICILLIN'}),'STUDENT_SAFETY_REVIEW_REQUIRED');
});
test('reject a stale allergy snapshot even when acknowledgement is true',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},studentId:'MOCK-STU-003',
  studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'NKDA'}),'STUDENT_SAFETY_REVIEW_REQUIRED');
});
test('reject zero quantity and invalid disposition with zero writes',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-003',qty:0}]}),'INVALID_QTY');
 expectRejected(x=>({...x,disposition:'REFER_UNKNOWN'}),'INVALID_DISPOSITION');
});
test('reject free-text medication without allergy status',()=>{
 expectRejected(x=>({...x,recipient:{recipientSource:'FREE_TEXT',recipientName:'Mock UAT',recipientType:'OTHER'},
  studentId:'',studentSafetyAcknowledged:false,studentDrugAllergySnapshot:''}),'ALLERGY_STATUS_REQUIRED');
});
test('reject unknown drug code without a stock write',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'DOES-NOT-EXIST',qty:1}]}),'ITEM_NOT_FOUND');
});
test('hard stop: acknowledged Penicillin allergy cannot dispense Amoxicillin',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],
   recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},
   studentId:'MOCK-STU-003',studentSafetyAcknowledged:true,
   studentDrugAllergySnapshot:'PENICILLIN'}),'DRUG_ALLERGY_HARD_STOP');
});
test('hard stop: free-text Penicillin allergy cannot dispense Amoxicillin',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],
   recipient:{recipientSource:'FREE_TEXT',recipientName:'Mock UAT',recipientType:'OTHER'},
   studentId:'',drugAllergy:{status:'KNOWN_ALLERGY',drugGroup:'Penicillin',
      reaction:'Rash',note:'Synthetic allergy only'}}),'DRUG_ALLERGY_HARD_STOP');
});
test('Penicillin allergy alone does not block unrelated ORS after verified acknowledgement',()=>{
 const h=harness(),r={recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'};
 assert.doesNotThrow(()=>h.ctx.validateStudentDrugSafetyForDispense_(r,
   {studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'PENICILLIN'},
   [{master:{'Item Type':'MEDICATION','Generic Name':'Oral Rehydration Salts'}}]));
 assert.equal(h.state.writes,0);
});
test('stale allergy acknowledgement is rejected before checking conflict',()=>{
 const h=harness(),r={recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'};
 assert.throws(()=>h.ctx.validateStudentDrugSafetyForDispense_(r,
   {studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'NKDA'},
   [{master:{'Item Type':'MEDICATION','Generic Name':'Amoxicillin 250 mg'}}]),
   /STUDENT_SAFETY_REVIEW_REQUIRED/);
});


test('hard stop: multi-drug batch is atomic when one medication conflicts',()=>{
 expectRejected(x=>({...x,items:[
  {itemCode:'MOCK-ITEM-003',qty:1},{itemCode:'MOCK-ITEM-005',qty:1}
 ],recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},
 studentId:'MOCK-STU-003',studentSafetyAcknowledged:true,
 studentDrugAllergySnapshot:'PENICILLIN'}),'DRUG_ALLERGY_HARD_STOP');
});
test('missing clinical rule registry blocks unrelated medication rather than silently bypassing active rules',()=>{
 const h=harness();
 h.ctx.getSpreadsheet_=()=>({getSheetByName:()=>null});
 const before=JSON.stringify(h.data);
 assert.throws(()=>h.ctx.submitVisit_(base(),user),/ALLERGY_RULES_UNAVAILABLE/);
 assert.equal(JSON.stringify(h.data),before);
 assert.equal(h.state.writes,0);
 assert.equal(h.state.headers,0);
 assert.equal(h.state.lockCount,h.state.unlockCount);
});
test('missing visit schema is an explicit read-only preflight failure',()=>{
 const h=harness(),original=h.ctx.getSheet_;
 h.ctx.getSheet_=(name)=>{
   const sheet=original(name);
   return name==='DISPENSE_HEADER'?{...sheet,getLastColumn:()=>2}:sheet;
 };
 assert.throws(()=>h.ctx.submitVisit_(base(),user),/VISIT_SCHEMA_NOT_READY/);
 assert.equal(h.state.writes,0);
 assert.equal(h.state.headers,0);
 assert.equal(h.state.lockCount,h.state.unlockCount);
});
test('published synthetic rule blocks at the real submitVisit boundary with zero writes',()=>{
 const h=harness();
 h.data.STUDENTS[0]['Drug Allergy']='BHHUATALLERGEN20261016';
 h.data.DRUG_ALLERGY_RULES=[{
  'Rule ID':'AR-SYNTHETIC',Status:'ACTIVE',
  'Allergen Terms':'BHHUATALLERGEN20261016',
  'Blocked Generic Terms':'ORAL REHYDRATION SALTS',
  Reference:'Synthetic test rule only - no clinical use',
  'Approved By':'UAT-TEST-ADMIN'
 }];
 const payload={...base(),studentDrugAllergySnapshot:'BHHUATALLERGEN20261016'};
 assert.throws(()=>h.ctx.submitVisit_(payload,user),/DRUG_ALLERGY_HARD_STOP/);
 assert.equal(h.state.writes,0);
 assert.equal(h.state.headers,0);
 assert.equal(h.state.lockCount,h.state.unlockCount);
});
test('draft synthetic rule does not block clinically unrelated ORS by itself',()=>{
 const h=harness();
 h.data.DRUG_ALLERGY_RULES=[{
  'Rule ID':'AR-DRAFT',Status:'DRAFT',
  'Allergen Terms':'NKDA','Blocked Generic Terms':'ORAL REHYDRATION SALTS',
  Reference:'Synthetic rule pending review', 'Approved By':''
 }];
 const plan=[{master:{'Item Type':'MEDICATION','Generic Name':'Oral Rehydration Salts'}}];
 assert.doesNotThrow(()=>h.ctx.enforceDrugAllergyRules_('NKDA',plan));
 assert.equal(h.state.writes,0);
});
test('two public mutation aliases converge on one guarded backend path',()=>{
 const h=harness();
 h.ctx.requireSession_=()=>user;
 for(const action of ['submitVisit','submitDispense']) {
  const before=JSON.stringify(h.data);
  assert.throws(()=>h.ctx.route_({action,token:'synthetic',payload:{
    ...base(),items:[{itemCode:'MOCK-ITEM-005',qty:1}],
    recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-003'},
    studentId:'MOCK-STU-003',studentSafetyAcknowledged:true,
    studentDrugAllergySnapshot:'PENICILLIN'
  }}),/DRUG_ALLERGY_HARD_STOP/);
  assert.equal(JSON.stringify(h.data),before);
  assert.equal(h.state.writes,0);
 }
});

test('STUDENT_MASTER: blank or unknown allergy history cannot be treated as NKDA',()=>{
 for (const allergyValue of ['', 'UNKNOWN', 'ไม่ทราบ']) {
  expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],
    recipient:{recipientSource:'STUDENT_MASTER',recipientId:'MOCK-STU-002'},
    studentId:'MOCK-STU-002',studentSafetyAcknowledged:true,
    studentDrugAllergySnapshot:allergyValue}),
    'STUDENT_ALLERGY_STATUS_UNVERIFIED',
    d=>{d.STUDENTS[0]['Drug Allergy']=allergyValue;});
 }
});
test('STAFF_MASTER: master identity is not an allergy assessment; unknown status is rejected',()=>{
 const setup=d=>d.STAFF_MASTER.push({'Staff ID':'MOCK-STAFF-001','Full Name':'Mock Teacher',
     'Recipient Type':'TEACHER',Department:'UAT',Status:'ACTIVE'});
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],
   recipient:{recipientSource:'STAFF_MASTER',recipientId:'MOCK-STAFF-001'},studentId:''}),
   'ALLERGY_STATUS_REQUIRED',setup);
});
test('STAFF_MASTER: confirmed Penicillin allergy hard-stops Amoxicillin with zero writes',()=>{
 expectRejected(x=>({...x,items:[{itemCode:'MOCK-ITEM-005',qty:1}],
   recipient:{recipientSource:'STAFF_MASTER',recipientId:'MOCK-STAFF-001'},studentId:'',
   drugAllergy:{status:'KNOWN_ALLERGY',drugGroup:'PENICILLIN',reaction:'Rash',note:'Synthetic only'}}),
   'DRUG_ALLERGY_HARD_STOP',d=>d.STAFF_MASTER.push({'Staff ID':'MOCK-STAFF-001',
   'Full Name':'Mock Teacher','Recipient Type':'TEACHER',Department:'UAT',Status:'ACTIVE'}));
});
test('STAFF_MASTER: supply-only visit does not require drug allergy assessment',()=>{
 const h=harness();
 const recipient={recipientSource:'STAFF_MASTER',recipientId:'MOCK-STAFF-001'};
 assert.doesNotThrow(()=>h.ctx.validateFreeTextAllergyForDispense_(recipient,{},
  [{master:{'Item Type':'MEDICAL_SUPPLY','Generic Name':'Gauze'}}]));
 assert.equal(h.state.writes,0);
});
