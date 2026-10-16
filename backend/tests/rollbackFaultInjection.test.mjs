import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Executes the actual Apps Script submitVisit_ function; ALL writes stay in memory.
// Simulates a remote Sheet applying a mutation and THEN raising a transport error.
const dir=dirname(fileURLToPath(import.meta.url));
const src=['Code.gs','30_Recipients.gs','35_AllergyRules.gs','40_ClinicalP4.gs']
  .map(f=>readFileSync(resolve(dir,'..',f),'utf8')).join('\n');
const copy = x => JSON.parse(JSON.stringify(x));

function createHarness(failurePhase) {
 const state={calls:[],failOnce:true,lock:0,unlock:0,emails:0,audits:0};
 const ctx=vm.createContext({
  console,Date,
  LockService:{getScriptLock:()=>({waitLock:()=>{state.lock++},releaseLock:()=>{state.unlock++}})},
  Utilities:{
   getUuid:()=> '12345678-1234-4321-1234-123456789012',
   formatDate:(_,__,pattern)=>pattern==='yyyy-MM-dd'?'2026-10-16':pattern==='HH:mm:ss'?'14:00:00':'2026-10-16 14:00:00'
  }
 });
 vm.runInContext(src,ctx);
 const H=vm.runInContext('HEADERS',ctx);
 const data={
  STOCK_LOT:[H.STOCK_LOT.slice(),['MOCK-LOT-FI-01','MOCK-ITEM-003','ORS-FI','2027-12-31','2026-10-10',10,10,1,'UAT','ACTIVE']],
  DISPENSE_HEADER:[H.DISPENSE_HEADER.slice()],
  DISPENSE_ITEMS:[H.DISPENSE_ITEMS.slice()],
  STOCK_TRANSACTION:[H.STOCK_TRANSACTION.slice()]
 };
 const original=copy(data);
 const item={'Item Code':'MOCK-ITEM-003','Item Type':'MEDICATION','Generic Name':'Oral Rehydration Salts',
  'Trade Name':'ORS',QTY:10,Unit:'sachet','Unit Cost':1,'Active/Inactive':'ACTIVE'};
 const getSheet=name=>({
  getDataRange:()=>({getValues:()=>copy(data[name])}),
  getLastColumn:()=>data[name][0].length,
  getLastRow:()=>data[name].length,
  getRange:(row,col,nRows=1,nCols=1)=>({
   getValues:()=>copy(data[name].slice(row-1,row-1+nRows).map(r=>r.slice(col-1,col-1+nCols))),
   setValues:values=>{
    state.calls.push(name);
    for(let i=0;i<values.length;i++){
     const idx=row-1+i;
     if(!data[name][idx])data[name][idx]=Array(data[name][0].length).fill('');
     for(let j=0;j<values[i].length;j++)data[name][idx][col-1+j]=values[i][j];
    }
    if(state.failOnce&&name===failurePhase){
     state.failOnce=false;
     throw Error('INJECTED_AFTER_REMOTE_WRITE_'+name);
    }
   }
  })
 });
 ctx.getSheet_=getSheet;
 ctx.getSpreadsheet_=()=>({getSheetByName:()=>({})});
 ctx.rows_=(name)=>{
  if(name==='ITEM_MASTER')return [item];
  if(name==='SYMPTOMS'||name==='STUDENTS'||name==='STAFF_MASTER'||name==='DRUG_ALLERGY_RULES')return [];
  const table=data[name];if(!table)return [];
  return table.slice(1).map(r=>Object.fromEntries(table[0].map((h,i)=>[h,r[i]])));
 };
 ctx.resolveRecipientForVisit_=()=>({
   recipientSource:'FREE_TEXT',recipientType:'OTHER',recipientName:'Synthetic Rollback UAT',recipientId:'',
   departmentClass:'UAT',recipientContact:''
 });
 ctx.resolveVisitSymptoms_=()=>({symptoms:[],symptomIds:[],categories:[],derivedCategory:'',clinicalAlertLevel:'NORMAL'});
 ctx.getTimeZone_=()=> 'Asia/Bangkok';
 ctx.clearCache_=()=>{};
 ctx.invalidateStockCache_=()=>{};
 ctx.truncateAfterRow_=(sheet,index)=>{
  // The real helper is a destructive rollback; ensure a matching in-memory implementation.
  const names=['DISPENSE_HEADER','DISPENSE_ITEMS','STOCK_TRANSACTION'];
  const found=names.find(n=>sheet===sheets[n]);
  if(!found)throw Error('TRUNCATE_SHEET_MISMATCH');
  data[found].splice(index);
 };
 const sheets=Object.fromEntries(Object.keys(data).map(n=>[n,getSheet(n)]));
 ctx.getSheet_=name=>sheets[name];
 ctx.syncItemQty_=lot=>{item.QTY=lot.slice(1).reduce((n,row)=>n+Number(row[6]||0),0);};
 ctx.audit_=()=>{state.audits++;};
 ctx.auditSystem_=()=>{state.audits++;};
 ctx.triggerReferralNotificationForVisit_=()=>{state.emails++;};
 const payload={recipient:{recipientSource:'FREE_TEXT',recipientName:'Synthetic Rollback UAT',recipientType:'OTHER'},
  assessment:'Synthetic fault injection - no real persons',disposition:'RETURN_TO_CLASS',
  clientTransactionId:'ROLLBACK-ONLY-'+failurePhase,
  drugAllergy:{status:'NKDA'},items:[{itemCode:'MOCK-ITEM-003',qty:1}]};
 return {ctx,data,original,item,state,payload};
}
for (const phase of ['STOCK_LOT','DISPENSE_HEADER','DISPENSE_ITEMS','STOCK_TRANSACTION']){
 test('submitVisit rolls back all tables when remote '+phase+' write applies then raises',()=>{
  const h=createHarness(phase);
  assert.throws(()=>h.ctx.submitVisit_(h.payload,{staffId:'UAT',role:'SUPER_ADMIN'}),
   /INJECTED_AFTER_REMOTE_WRITE_/);
  assert.equal(JSON.stringify(h.data),JSON.stringify(h.original),'Header, dispense details, stock lots, transaction ledger must be restored');
  assert.equal(h.item.QTY,10,'Aggregate item stock must be restored');
  assert.equal(h.state.lock,1);
  assert.equal(h.state.unlock,1);
  assert.equal(h.state.emails,0);
  assert.equal(h.state.audits,0);
 });
}
