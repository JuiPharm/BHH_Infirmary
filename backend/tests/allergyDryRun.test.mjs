import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';
const root=resolve(import.meta.dirname,'..');
const src=['30_Recipients.gs','35_AllergyRules.gs','36_AllergySafetyDryRun.gs']
 .map(x=>readFileSync(resolve(root,x),'utf8')).join('\n');
function harness({sheetId='1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs',status='ACTIVE',generic='BHHUATGENERIC20261016',role='SUPER_ADMIN'}={}){
 const rules=[{'Rule ID':'AR07c10f3cb053440fbc','Allergen Terms':'BHHUATALLERGEN20261016',
  'Blocked Generic Terms':generic,Status:status,Reference:'Synthetic UAT only','Approved By':'UAT-TEST-ADMIN'}];
 const writes=[];
 const ctx=vm.createContext({console});
 vm.runInContext(src,ctx);
 ctx.SHEETS={ALLERGY_RULES:'DRUG_ALLERGY_RULES'};
 ctx.getSpreadsheet_=()=>({getId:()=>sheetId,getSheetByName:()=>({})});
 ctx.rows_=name=>name==='DRUG_ALLERGY_RULES'?rules:[];ctx.normalizeItemType_=t=>t==='MEDICATION'?'DRUG':t;
 ctx.requireRole_=(s,allowed)=>{if(!allowed.includes(s.role))throw Error('ACCESS_DENIED');};
 for(const method of ['appendRow','setValues','syncItemQty_','audit_','submitVisit_']){
  ctx[method]=()=>{writes.push(method);throw Error('UNEXPECTED_WRITE');};
 }
 return {ctx,writes,session:{staffId:'UAT-TEST-ADMIN',role}};
}
test('dry-run checks baseline and published synthetic hard stops without any write',()=>{
 const {ctx,writes,session}=harness();
 const result=ctx.runSyntheticAllergySafetyCheck_(session);
 assert.equal(result.success,true);assert.equal(result.data.penicillinAmoxicillinBlocked,true);
 assert.equal(result.data.syntheticActiveRuleBlocked,true);assert.equal(result.data.unrelatedOrsAllowed,true);
 assert.equal(result.data.stockWrites,0);assert.equal(result.data.visitWrites,0);assert.deepEqual(writes,[]);
});
test('dry-run cannot execute if sheet is not the exact synthetic working copy',()=>{
 const h=harness({sheetId:'PRODUCTION-SHEET-ID'});
 assert.throws(()=>h.ctx.runSyntheticAllergySafetyCheck_(h.session),/UAT_SANDBOX_ONLY/);
 assert.equal(h.writes.length,0);
});
test('dry-run denies unauthorized role',()=>{
 const h=harness({role:'NURSE'});
 assert.throws(()=>h.ctx.runSyntheticAllergySafetyCheck_(h.session),/ACCESS_DENIED/);
 assert.equal(h.writes.length,0);
});
test('dry-run refuses missing or unapproved published synthetic rule',()=>{
 const h=harness({status:'DRAFT'});
 assert.throws(()=>h.ctx.runSyntheticAllergySafetyCheck_(h.session),/UAT_RULE_FIXTURE_CHANGED/);
 assert.equal(h.writes.length,0);
});
test('dry-run fails when expected synthetic blocker does not fire',()=>{
 const h=harness({generic:'SOMEOTHERRULE'});
 assert.throws(()=>h.ctx.runSyntheticAllergySafetyCheck_(h.session),/UAT_RULE_FIXTURE_CHANGED/);
 assert.equal(h.writes.length,0);
});
