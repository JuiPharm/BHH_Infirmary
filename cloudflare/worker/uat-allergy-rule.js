// Single-use, fixed-fixture GAS Sandbox allergy rule test. NO patient / Visit / Stock writes.
// All UAT activity is guarded by D1's compare-and-swap ledger and GAS SUPER_ADMIN session.
export const ALLERGY_UAT_ID='BHH-UAT-ALLERGY-20261016-001';
export const SYNTHETIC_RULE=Object.freeze({
 allergenTerms:'BHHUATALLERGEN20261016',
 blockedGenericTerms:'BHHUATGENERIC20261016',
 reference:'Synthetic-only BHH Infirmary validation of draft and publish lifecycle, 2026-10-16. Not a clinical rule.'
});
const SYSTEM_ID='SYSTEM-PENICILLIN-HARD-STOP';
const TEST_STAFF='UAT-TEST-ADMIN';
function reject(code,status=409,data){return{status,body:{success:false,errorCode:code,...(data?{data}:{})}};}
function matchesRule(rule){return String(rule?.['Allergen Terms']||'').trim()===SYNTHETIC_RULE.allergenTerms
 &&String(rule?.['Blocked Generic Terms']||'').trim()===SYNTHETIC_RULE.blockedGenericTerms;}
async function readRules(gas,token){
 const res=await gas({action:'getDrugAllergyRules',payload:{},token},{timeoutMs:15000});
 if(!res?.success||!Array.isArray(res.data))throw Error('UAT_RULE_READ_FAILED');
 if(!res.data.some(x=>x['Rule ID']===SYSTEM_ID&&x.Status==='LOCKED'))throw Error('UAT_BASELINE_MISSING');
 return res.data;
}
async function verifyActor(gas,token){
 const r=await gas({action:'getSession',payload:{},token},{timeoutMs:15000});
 if(!r?.success||r.data?.staffId!==TEST_STAFF||r.data?.role!=='SUPER_ADMIN')return false;
 return true;
}
async function setState(db,state,reason,expected,ruleId=null){
 try{
  const r=await db.prepare('UPDATE uat_allergy_rule_gate SET state=?,last_reason=?,rule_id=COALESCE(?,rule_id),changed_at=? WHERE test_id=? AND state=?')
   .bind(state,reason,ruleId,new Date().toISOString(),ALLERGY_UAT_ID,expected).run();
  return r?.meta?.changes===1;
 }catch{return false;}
}
export async function executeRuleDraftUat(gas,env,token){
 if(!env?.UAT_DB)return reject('UAT_DB_NOT_CONFIGURED',503);
 try{
  if(!await verifyActor(gas,token))return reject('UAT_ROLE_DENIED',403);
  const rules=await readRules(gas,token);
  if(rules.length!==1)return reject('UAT_RULE_FIXTURE_CHANGED',409);
 }catch{return reject('UAT_RULE_PRECHECK_UNAVAILABLE',503);}
 try{
  const claim=await env.UAT_DB.prepare(
   "INSERT OR IGNORE INTO uat_allergy_rule_gate(test_id,state,requested_by,created_at,changed_at,last_reason) VALUES(?,'DRAFT_SUBMITTING',?,?,?,'CLAIMED')")
    .bind(ALLERGY_UAT_ID,TEST_STAFF,new Date().toISOString(),new Date().toISOString()).run();
  if(claim?.meta?.changes!==1)return reject('UAT_RULE_DRAFT_ALREADY_ATTEMPTED',409);
 }catch{return reject('UAT_RULE_DRAFT_CLAIM_FAILED',503);}
 try{
  const out=await gas({action:'saveDrugAllergyRule',payload:SYNTHETIC_RULE,token},{timeoutMs:25000});
  if(!out?.success||out.data?.status!=='DRAFT'||!out.data?.ruleId)throw Error('UAT_DRAFT_UNCONFIRMED');
  const ruleId=String(out.data.ruleId);
  const rules=await readRules(gas,token);
  const hits=rules.filter(x=>x['Rule ID']===ruleId&&x.Status==='DRAFT'&&matchesRule(x));
  if(hits.length!==1||rules.length!==2)throw Error('UAT_DRAFT_READBACK_MISMATCH');
  if(!await setState(env.UAT_DB,'DRAFT_CONFIRMED','READBACK_CONFIRMED','DRAFT_SUBMITTING',ruleId))
   return reject('UAT_RULE_LEDGER_NOT_CONFIRMED_NO_RETRY',503);
  return {status:200,body:{success:true,data:{testId:ALLERGY_UAT_ID,ruleId,status:'DRAFT',baselineLocked:true,syntheticOnly:true}}};
 }catch{
  await setState(env.UAT_DB,'NEEDS_REVIEW','DRAFT_AMBIGUOUS_NO_RETRY','DRAFT_SUBMITTING');
  return reject('UAT_RULE_DRAFT_UNKNOWN_NO_RETRY',503);
 }
}
export async function executeRulePublishUat(gas,env,token){
 if(!env?.UAT_DB)return reject('UAT_DB_NOT_CONFIGURED',503);
 try{if(!await verifyActor(gas,token))return reject('UAT_ROLE_DENIED',403);}
 catch{return reject('UAT_AUTH_UNAVAILABLE',503);}
 let stored;
 try{
  stored=await env.UAT_DB.prepare('SELECT state,rule_id FROM uat_allergy_rule_gate WHERE test_id=?')
   .bind(ALLERGY_UAT_ID).first();
  if(!stored||stored.state!=='DRAFT_CONFIRMED'||!stored.rule_id)
   return reject('UAT_RULE_PUBLISH_NOT_READY_OR_ALREADY_ATTEMPTED',409);
  const before=await readRules(gas,token);
  if(before.length!==2||before.filter(x=>x['Rule ID']===stored.rule_id&&x.Status==='DRAFT'&&matchesRule(x)).length!==1)
   return reject('UAT_RULE_FIXTURE_CHANGED',409);
 }catch{return reject('UAT_RULE_PUBLISH_PRECHECK_UNAVAILABLE',503);}
 try{
  const claim=await env.UAT_DB.prepare("UPDATE uat_allergy_rule_gate SET state='PUBLISH_SUBMITTING',last_reason='CLAIMED',changed_at=? WHERE test_id=? AND state='DRAFT_CONFIRMED'")
   .bind(new Date().toISOString(),ALLERGY_UAT_ID).run();
  if(claim?.meta?.changes!==1)return reject('UAT_RULE_PUBLISH_ALREADY_ATTEMPTED',409);
 }catch{return reject('UAT_RULE_PUBLISH_CLAIM_FAILED',503);}
 try{
  const r=await gas({action:'publishDrugAllergyRule',payload:{ruleId:stored.rule_id,clinicalReviewed:true},token},{timeoutMs:25000});
  if(!r?.success||r.data?.status!=='ACTIVE'||String(r.data?.ruleId)!==stored.rule_id)throw Error('UAT_PUBLISH_UNCONFIRMED');
  const read=await readRules(gas,token);
  const active=read.filter(x=>x['Rule ID']===stored.rule_id&&x.Status==='ACTIVE'&&matchesRule(x));
  if(active.length!==1||read.length!==2||active[0]['Approved By']!==TEST_STAFF)
   throw Error('UAT_ACTIVE_READBACK_MISMATCH');
  if(!await setState(env.UAT_DB,'ACTIVE_CONFIRMED','READBACK_CONFIRMED','PUBLISH_SUBMITTING'))
   return reject('UAT_RULE_LEDGER_NOT_CONFIRMED_NO_RETRY',503);
  return {status:200,body:{success:true,data:{testId:ALLERGY_UAT_ID,ruleId:stored.rule_id,status:'ACTIVE',baselineLocked:true,syntheticOnly:true}}};
 }catch{
  await setState(env.UAT_DB,'NEEDS_REVIEW','PUBLISH_AMBIGUOUS_NO_RETRY','PUBLISH_SUBMITTING');
  return reject('UAT_RULE_PUBLISH_UNKNOWN_NO_RETRY',503);
 }
}
