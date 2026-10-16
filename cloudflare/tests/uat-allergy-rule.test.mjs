import test from 'node:test';
import assert from 'node:assert/strict';
import {executeRuleDraftUat,executeRulePublishUat,ALLERGY_UAT_ID,SYNTHETIC_RULE} from '../worker/uat-allergy-rule.js';
const baseline={'Rule ID':'SYSTEM-PENICILLIN-HARD-STOP',Status:'LOCKED'};
class DB{
 constructor(){this.row=null;this.failClaim=false;this.failUpdate=false;}
 prepare(sql){
  const db=this;
  return {
   bind(...args){
    return {
     async run(){
      if(db.failClaim&&sql.startsWith('INSERT'))throw Error('D1 failed before request');
      if(sql.startsWith('INSERT')){
       if(db.row)return {meta:{changes:0}};
       db.row={state:'DRAFT_SUBMITTING',rule_id:null};
       return {meta:{changes:1}};
      }
      if(db.failUpdate)throw Error('D1 update unavailable');
      if(sql.startsWith("UPDATE uat_allergy_rule_gate SET state='PUBLISH_SUBMITTING'")){
       if(db.row?.state!=='DRAFT_CONFIRMED')return {meta:{changes:0}};
       db.row.state='PUBLISH_SUBMITTING';return {meta:{changes:1}};
      }
      if(sql.startsWith('UPDATE')){
       const [state,reason,id,changed,testId,expected]=args;
       assert.equal(testId,ALLERGY_UAT_ID);
       if(db.row?.state!==expected)return {meta:{changes:0}};
       db.row.state=state;db.row.reason=reason;if(id)db.row.rule_id=id;
       return {meta:{changes:1}};
      }
      throw Error('Unexpected query '+sql);
     },
     async first(){return db.row&&{...db.row};}
    };
   }
  };
 }
}
function mockGas({role='SUPER_ADMIN',failDraft=false,failPublish=false,incorrectBaseline=false}={}){
 const rules=[incorrectBaseline?{'Rule ID':'SYSTEM-PENICILLIN-HARD-STOP',Status:'ACTIVE'}:baseline];
 const calls=[];
 const gas=async({action,payload})=>{
  calls.push(action);
  if(action==='getSession')return {success:true,data:{staffId:'UAT-TEST-ADMIN',role}};
  if(action==='getDrugAllergyRules')return {success:true,data:rules.map(x=>({...x}))};
  if(action==='saveDrugAllergyRule'){
   assert.deepEqual(payload,SYNTHETIC_RULE);
   if(failDraft)throw Error('Unknown result after upstream accepted it');
   rules.push({'Rule ID':'AR-ONLY-UAT','Allergen Terms':payload.allergenTerms,
    'Blocked Generic Terms':payload.blockedGenericTerms,Status:'DRAFT'});
   return {success:true,data:{ruleId:'AR-ONLY-UAT',status:'DRAFT'}};
  }
  if(action==='publishDrugAllergyRule'){
   assert.deepEqual(payload,{ruleId:'AR-ONLY-UAT',clinicalReviewed:true});
   if(failPublish)throw Error('Unknown result');
   rules[1].Status='ACTIVE';rules[1]['Approved By']='UAT-TEST-ADMIN';
   return {success:true,data:{ruleId:'AR-ONLY-UAT',status:'ACTIVE'}};
  }
  throw Error('Unexpected upstream action: '+action);
 };
 return {gas,calls,rules};
}
test('one-shot draft and publish reach ACTIVE only after authenticated readback',async()=>{
 const db=new DB(),mock=mockGas(),env={UAT_DB:db};
 const d=await executeRuleDraftUat(mock.gas,env,'opaque');
 assert.equal(d.status,200);assert.equal(d.body.data.status,'DRAFT');
 assert.equal(db.row.state,'DRAFT_CONFIRMED');
 const p=await executeRulePublishUat(mock.gas,env,'opaque');
 assert.equal(p.status,200);assert.equal(p.body.data.status,'ACTIVE');
 assert.equal(db.row.state,'ACTIVE_CONFIRMED');
 assert.equal(mock.rules.length,2);
});
test('replaying draft and publish does not resend either operation',async()=>{
 const db=new DB(),m=mockGas(),env={UAT_DB:db};
 await executeRuleDraftUat(m.gas,env,'opaque');
 assert.equal((await executeRuleDraftUat(m.gas,env,'opaque')).status,409);
 await executeRulePublishUat(m.gas,env,'opaque');
 assert.equal((await executeRulePublishUat(m.gas,env,'opaque')).status,409);
 assert.equal(m.calls.filter(x=>x==='saveDrugAllergyRule').length,1);
 assert.equal(m.calls.filter(x=>x==='publishDrugAllergyRule').length,1);
});
test('unauthorized session may not create a draft',async()=>{
 const db=new DB(),m=mockGas({role:'NURSE'});
 const r=await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(r.status,403);assert.equal(db.row,null);
 assert.equal(m.calls.includes('saveDrugAllergyRule'),false);
});
test('publish refused until explicitly confirmed draft',async()=>{
 const db=new DB(),m=mockGas();
 const result=await executeRulePublishUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(result.status,409);assert.equal(m.calls.includes('publishDrugAllergyRule'),false);
});
test('D1 failure prevents writing any rule',async()=>{
 const db=new DB();db.failClaim=true;const m=mockGas();
 const r=await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(r.status,503);assert.equal(m.calls.includes('saveDrugAllergyRule'),false);
});
test('no UAT_DB fails before any upstream action',async()=>{
 const m=mockGas();
 const r=await executeRuleDraftUat(m.gas,{},'opaque');
 assert.equal(r.status,503);assert.equal(m.calls.length,0);
});
test('ambiguous draft result quarantines claim without retry',async()=>{
 const db=new DB(),m=mockGas({failDraft:true});
 const first=await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(first.body.errorCode,'UAT_RULE_DRAFT_UNKNOWN_NO_RETRY');
 assert.equal(db.row.state,'NEEDS_REVIEW');
 const second=await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(second.status,409);
 assert.equal(m.calls.filter(x=>x==='saveDrugAllergyRule').length,1);
});
test('ambiguous publish result quarantines claim without retry',async()=>{
 const db=new DB(),m=mockGas({failPublish:true});
 assert.equal((await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque')).status,200);
 const r=await executeRulePublishUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(r.body.errorCode,'UAT_RULE_PUBLISH_UNKNOWN_NO_RETRY');
 assert.equal(db.row.state,'NEEDS_REVIEW');
 assert.equal((await executeRulePublishUat(m.gas,{UAT_DB:db},'opaque')).status,409);
 assert.equal(m.calls.filter(x=>x==='publishDrugAllergyRule').length,1);
});
test('invalid baseline prevents rule writes',async()=>{
 const db=new DB(),m=mockGas({incorrectBaseline:true});
 const r=await executeRuleDraftUat(m.gas,{UAT_DB:db},'opaque');
 assert.equal(r.status,503);assert.equal(db.row,null);
});
