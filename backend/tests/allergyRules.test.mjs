import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src=readFileSync(resolve(import.meta.dirname,'../35_AllergyRules.gs'),'utf8');
const headers=['Rule ID','Allergen Terms','Blocked Generic Terms','Reference','Status','Created By','Created At','Updated By','Updated At','Approved By','Approved At'];
function env(){
 const rows=[headers],audit=[],state={lock:0,unlock:0},sheet={
  getDataRange:()=>({getValues:()=>rows.map(x=>[...x])}),
  getLastRow:()=>rows.length,
  getRange(row,col,height,width){return {setValues(vals){for(let j=0;j<height;j++)rows[row-1+j]=vals[j].slice();}}},
  appendRow:(values)=>rows.push([...values])
 };
 const ctx=vm.createContext({
  SHEETS:{ALLERGY_RULES:'DRUG_ALLERGY_RULES'},
  HEADERS:{DRUG_ALLERGY_RULES:headers},
  Utilities:{getUuid:()=> '7e1cace1-8dc4-4edb-83c7-a31ee9d02966'},
  LockService:{getScriptLock:()=>({waitLock(){state.lock++},releaseLock(){state.unlock++}})}
 });
 vm.runInContext(src,ctx);
 ctx.getSpreadsheet_=()=>({getSheetByName:()=>sheet});
 ctx.ensureSheet_=()=>sheet;
 ctx.getSheet_=()=>sheet;
 ctx.rows_=()=>rows.slice(1).map(r=>Object.fromEntries(headers.map((k,i)=>[k,r[i]])));
 ctx.now_=()=> '2026-10-16 14:15:00';
 ctx.audit_=(...args)=>audit.push(args);
 ctx.clearCache_=()=>{};
 ctx.headerMap_=(keys)=>Object.fromEntries(keys.map((key,i)=>[key,i]));
 ctx.requireRole_=(session,roles)=>{if(!roles.includes(session?.role))throw Error('ACCESS_DENIED');};
 ctx.normalizeItemType_=()=> 'DRUG';
 ctx.knownPenicillinDrugConflict_=()=>false;
 const admin={role:'SUPER_ADMIN',staffId:'UAT-TEST-ADMIN'};
 return {ctx,rows,audit,state,admin};
}
const fixture={allergenTerms:'SULFONAMIDE | SULFA',blockedGenericTerms:'SULFAMETHOXAZOLE | CO-TRIMOXAZOLE',
 reference:'Synthetic UAT reviewed guideline 2026-10-16'};
test('system baseline appears as LOCKED with empty custom registry',()=>{
 const h=env(),list=h.ctx.getDrugAllergyRules_(h.admin).data;
 assert.equal(list.length,1);assert.equal(list[0].Status,'LOCKED');
 assert.equal(h.rows.length,1);
});
test('SUPER_ADMIN can create DRAFT, then explicitly review and publish it',()=>{
 const h=env();
 const result=h.ctx.saveDrugAllergyRule_(fixture,h.admin);
 assert.equal(result.data.status,'DRAFT');assert.equal(h.rows.length,2);assert.equal(h.rows[1][4],'DRAFT');
 const list=h.ctx.getDrugAllergyRules_(h.admin).data;
 assert.equal(list.length,2);
 assert.equal(h.ctx.publishDrugAllergyRule_({ruleId:result.data.ruleId,clinicalReviewed:true},h.admin).data.status,'ACTIVE');
 assert.equal(h.rows[1][4],'ACTIVE');assert.equal(h.rows[1][9],h.admin.staffId);
 assert.deepEqual(h.audit.map(x=>x[1]),['ALLERGY_RULE_DRAFT','ALLERGY_RULE_PUBLISH']);
 assert.equal(h.state.lock,h.state.unlock);
});
test('DRAFT does not block medication; ACTIVE hard-stops specific generic drug',()=>{
 const h=env();const out=h.ctx.saveDrugAllergyRule_(fixture,h.admin);
 const plan=[{master:{'Item Type':'MEDICATION','Generic Name':'Sulfamethoxazole 400 mg'}}];
 assert.doesNotThrow(()=>h.ctx.enforceDrugAllergyRules_('Allergy to sulfa',plan));
 h.ctx.publishDrugAllergyRule_({ruleId:out.data.ruleId,clinicalReviewed:true},h.admin);
 assert.throws(()=>h.ctx.enforceDrugAllergyRules_('Allergy to sulfa',plan),/DRUG_ALLERGY_HARD_STOP/);
 assert.doesNotThrow(()=>h.ctx.enforceDrugAllergyRules_('No reported allergens',plan));
 assert.doesNotThrow(()=>h.ctx.enforceDrugAllergyRules_('Allergy to sulfa',
 [{master:{'Item Type':'MEDICATION','Generic Name':'Paracetamol 500 mg'}}]));
});
test('publish requires clinical review confirmation and cannot republish',()=>{
 const h=env(),id=h.ctx.saveDrugAllergyRule_(fixture,h.admin).data.ruleId;
 assert.throws(()=>h.ctx.publishDrugAllergyRule_({ruleId:id},h.admin),/ALLERGY_RULE_REVIEW_REQUIRED/);
 h.ctx.publishDrugAllergyRule_({ruleId:id,clinicalReviewed:true},h.admin);
 assert.throws(()=>h.ctx.publishDrugAllergyRule_({ruleId:id,clinicalReviewed:true},h.admin),/ALLERGY_RULE_NOT_DRAFT/);
 assert.throws(()=>h.ctx.saveDrugAllergyRule_({...fixture,ruleId:id},h.admin),/ACTIVE_RULE_IMMUTABLE_CREATE_NEW/);
});
test('NURSE or ADMIN cannot author or approve clinical rule',()=>{
 const h=env();const user={role:'ADMIN',staffId:'MOCK'};
 assert.throws(()=>h.ctx.saveDrugAllergyRule_(fixture,user),/ACCESS_DENIED/);
 assert.throws(()=>h.ctx.getDrugAllergyRules_(user),/ACCESS_DENIED/);
 const id=h.ctx.saveDrugAllergyRule_(fixture,h.admin).data.ruleId;
 assert.throws(()=>h.ctx.publishDrugAllergyRule_({ruleId:id,clinicalReviewed:true},user),/ACCESS_DENIED/);
 assert.equal(h.rows[1][4],'DRAFT');
});
test('formula injection and unbounded wildcard terms cannot be persisted',()=>{
 const h=env();for(const term of ['=HYPERLINK("test")','*','PEN','PENICILLIN|=CMD','X'.repeat(81)]){
  assert.throws(()=>h.ctx.saveDrugAllergyRule_({...fixture,allergenTerms:term},h.admin),/INVALID_ALLERGY_RULE/);
 }
 assert.equal(h.rows.length,1);
});
test('malformed published registry fails closed instead of silently ignoring it',()=>{
 const h=env();h.rows.push(['AR_BAD','SULFA','*','ref','ACTIVE','A','date','A','date','A','date']);
 assert.throws(()=>h.ctx.enforceDrugAllergyRules_('SULFA',
 [{master:{'Item Type':'MEDICATION','Generic Name':'Sulfamethoxazole'}}]),/ALLERGY_RULES_CONFIGURATION_ERROR/);
});
test('baseline hard stop operates independently of admin-maintained rule sheet',()=>{
 const h=env();
 h.ctx.knownPenicillinDrugConflict_=()=>true;
 assert.throws(()=>h.ctx.enforceDrugAllergyRules_('PENICILLIN',[]),/DRUG_ALLERGY_HARD_STOP/);
});
