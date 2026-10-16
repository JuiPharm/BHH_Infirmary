import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Run the ACTUAL GAS clinical code against an entirely in-memory Sheets harness.
// These tests must never contact production GAS or write to a live spreadsheet.
const root=resolve(import.meta.dirname,'../..');
const source=['backend/Code.gs','backend/30_Recipients.gs','backend/40_ClinicalP4.gs']
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
 function mockSheet(name){
  return {
   getDataRange(){return {getValues(){return name==='STOCK_LOT'?[lotHeaders,...data.STOCK_LOT.map(x=>[...x])]:[]}};},
   getLastRow(){return name==='STOCK_LOT'?1+data.STOCK_LOT.length:1+(data[name]||[]).length;},
   getLastColumn(){return name==='DISPENSE_HEADER'?ctx.HEADERS.DISPENSE_HEADER.length:10;},
   getRange(){return {getValues(){return [ctx.HEADERS.DISPENSE_HEADER]},
       setValues(){state.writes++;throw Error('UNEXPECTED_WRITE_IN_NEGATIVE_TEST')}};},
   appendRow(){state.writes++;throw Error('UNEXPECTED_WRITE_IN_NEGATIVE_TEST');},
   deleteRows(){state.writes++;throw Error('UNEXPECTED_DELETE_IN_NEGATIVE_TEST');}
  };
 }
 ctx.getSpreadsheet_=()=>({});
 ctx.getSheet_=mockSheet;
 ctx.ensureHeaders_=()=>{state.headers++};
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

