import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(resolve(root,'scripts/gas-uat-helper/37_Gate1ClinicalNegativeUat.gs'),'utf8');
const allowedId='1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs';
const config={
 REFERRAL_EMAIL_ENABLED:'FALSE',EMERGENCY_EMAIL_ENABLED:'FALSE',
 REFERRAL_EMAIL_TO:'',REFERRAL_EMAIL_CC:'',EMERGENCY_EMAIL_TO:'',EMERGENCY_EMAIL_CC:''
};
const records={
 CONFIG:Object.entries(config).map(([key,value])=>({'Config Key':key,'Config Value':value})),
 STUDENTS:[{'Student ID':'MOCK-STU-003','Drug Allergy':'PENICILLIN'},{'Student ID':'MOCK-STU-001','Drug Allergy':'UNKNOWN'}],
 STAFF_MASTER:[{'Staff ID':'MOCK-TCH-001','Recipient Type':'TEACHER',Status:'ACTIVE'}],
 ITEM_MASTER:[{'Item Code':'MOCK-ITEM-005','Item Type':'MEDICATION','Generic Name':'Amoxicillin 250 mg'}],
 STOCK_LOT:[{'Stock Lot ID':'MOCK-LOT-005A','Item Code':'MOCK-ITEM-005','Current Qty':20}]
};
const expected=['DRUG_ALLERGY_HARD_STOP','STUDENT_ALLERGY_STATUS_UNVERIFIED','DRUG_ALLERGY_HARD_STOP','ALLERGY_STATUS_REQUIRED'];
function harness() {
 const state={calls:[],sheetWrites:0,mutation:false,emailEnabled:false,workbook:allowedId};
 const data=JSON.parse(JSON.stringify(records));
 const ctx=vm.createContext({
  Logger:{log:()=>{}},
  PropertiesService:{getScriptProperties:()=>({getProperty:(key)=>key==='SHEET_ID'?allowedId:''})},
  GAS_SOURCE_BUILD_ID:'BHHINF-P1-SAFETY-20261016-R2',
  SHEETS:Object.fromEntries(Object.keys(records).map(x=>[x,x])),
  getSpreadsheet_:()=>({getId:()=>state.workbook}),
  rows_:(name)=>data[name]||[],
  getSheet_:(name)=>({getDataRange:()=>({getValues:()=>[[name+' header'],...[1,2,3].map(x=>[x,name])].concat(state.mutation&&name==='DISPENSE_HEADER'?[['UNEXPECTED']]:[])})}),
  normalizeItemType_:(x)=>x==='MEDICATION'?'DRUG':x,
  isActiveStatus_:(x)=>x==='ACTIVE',
  submitVisit_:(payload,session)=>{
   const ix=state.calls.length;
   state.calls.push({payload,session});
   if(state.mutation)throw Error(expected[ix]||'INVALID');
   throw Error(expected[ix]||'INVALID');
  }
 });
 vm.runInContext(source,ctx);
 return {ctx,state,data};
}
test('Gate1 sandbox-only verifier executes 4 fixed real submitVisit entry calls and expects zero-mutation results',()=>{
 const {ctx,state}=harness();
 const res=ctx.runGate1ClinicalNegativeUat();
 assert.equal(res.status,'PASS');
 assert.equal(res.cases.length,4);
 assert.equal(state.calls.length,4);
 assert.equal(res.visitWrites,0);
 assert.equal(res.stockWrites,0);
 assert.equal(res.notificationWrites,0);
 assert.equal(res.auditWrites,0);
 for(let i=0;i<state.calls.length;i++){
  assert.equal(state.calls[i].session.role,'SUPER_ADMIN');
  assert.equal(state.calls[i].payload.items[0].itemCode,'MOCK-ITEM-005');
  assert.equal(res.cases[i].code,expected[i]);
 }
});
test('Gate1 refuses a non-sandbox workbook before reaching submitVisit',()=>{
 const {ctx,state}=harness();state.workbook='PRODUCTION-WORKBOOK';
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_SANDBOX_ONLY/);
 assert.equal(state.calls.length,0);
});
test('Gate1 refuses any enabled referral email or nonempty email recipient before submitVisit',()=>{
 const {ctx,state,data}=harness();
 data.CONFIG[0]['Config Value']='TRUE';
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_EMAIL_NOT_DISABLED/);
 assert.equal(state.calls.length,0);
 data.CONFIG[0]['Config Value']='FALSE';
 data.CONFIG.find(x=>x['Config Key']==='EMERGENCY_EMAIL_CC')['Config Value']='live@example.org';
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_EMAIL_RECIPIENTS_NOT_EMPTY/);
 assert.equal(state.calls.length,0);
});
test('Gate1 refuses missing synthetic test Master or changed drug name',()=>{
 const {ctx,state,data}=harness();
 data.ITEM_MASTER[0]['Generic Name']='Cefalexin';
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_DRUG_FIXTURE_CHANGED/);
 assert.equal(state.calls.length,0);
});
test('Gate1 aborts immediately if the submitVisit call leaves a changed Sheet, even after expected rejection',()=>{
 const {ctx,state}=harness();
 ctx.submitVisit_=()=>{state.calls.push({});state.mutation=true;throw Error('DRUG_ALLERGY_HARD_STOP');};
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_GATE1_UNEXPECTED_WRITE_STOP/);
 assert.equal(state.calls.length,1);
});
test('Gate1 rejects an unexpected success response; never marks as PASS',()=>{
 const {ctx,state}=harness();
 ctx.submitVisit_=()=>{state.calls.push({});return {success:true}};
 assert.throws(()=>ctx.runGate1ClinicalNegativeUat(),/UAT_GATE1_WRONG_RESULT/);
 assert.equal(state.calls.length,1);
});
