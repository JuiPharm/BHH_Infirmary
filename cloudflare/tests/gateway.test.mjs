import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handleRequest} from '../worker/index.js';
const ORIGIN='https://bhh-infirmary-p1-preview.example';
const env={GAS_WEB_APP_URL:'https://script.google.com/macros/s/SYNTHETIC/exec',SESSION_KEY_B64:randomBytes(32).toString('base64'),GATEWAY_MODE:'LEGACY_GAS_SINGLE_WRITER'};
const mockFetch=async (url,init)=>{
  const req=JSON.parse(init.body||'{}');
  if(init.method==='GET')return Response.json({success:true,apiVersion:'2.4.1'});
  if(req.action==='login')return Response.json({success:true,data:{token:'INTERNAL_GAS_TOKEN',staffId:'00001',name:'Test Nurse',role:'NURSE'}});
  if(req.action==='getSession')return Response.json({success:true,data:{token:'INTERNAL_GAS_TOKEN',staffId:'00001',name:'Test Nurse',role:'NURSE'}});
  if(req.action==='submitVisit')return Response.json({success:true,data:{visitId:'VISIT_SYNTHETIC',status:'COMPLETED'}});
  return Response.json({success:true,data:[]});
};
function request(action,payload={},cookie='',options={}){
 return new Request(ORIGIN+'/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-BHH-Gateway':'1',...(cookie?{Cookie:cookie}:{}),...(options.headers||{})},body:JSON.stringify({action,payload})});
}
const dep={fetchImpl:mockFetch};
test('health checks GAS version',async()=>{const r=await handleRequest(new Request(ORIGIN+'/api/health'),env,null,dep);assert.equal(r.status,200);assert.equal((await r.json()).writer,'GAS_SHEETS');});
test('login stores GAS token only in encrypted HttpOnly cookie',async()=>{const r=await handleRequest(request('login',{staffId:'00001',password:'fake'}),env,null,dep);assert.equal(r.status,200);const body=await r.json();assert.equal(body.data.token,'gateway-session');const cookie=r.headers.get('Set-Cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.doesNotMatch(cookie,/INTERNAL_GAS_TOKEN/);});
test('getSession returns sanitized session',async()=>{const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),env,null,dep);const cookie=login.headers.get('set-cookie').split(';')[0];const r=await handleRequest(request('getSession',{},cookie),env,null,dep);assert.equal(r.status,200);assert.equal((await r.json()).data.token,'gateway-session');});
test('protect all authenticated routes',async()=>{const r=await handleRequest(request('getUsers'),env,null,dep);assert.equal(r.status,401);});
test('reject bootstrap action even authenticated',async()=>{const r=await handleRequest(request('setupSystem'),env,null,dep);assert.equal(r.status,404);});
test('reject cross-origin requests',async()=>{const r=await handleRequest(request('login',{staffId:'x',password:'x'},'',{headers:{Origin:'https://evil.test'}}),env,null,dep);assert.equal(r.status,403);});
test('reject missing custom anti-CSRF header',async()=>{const r=await handleRequest(new Request(ORIGIN+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',payload:{staffId:'x',password:'x'}})}),env,null,dep);assert.equal(r.status,403);});
test('mutating transport failure returns unknown outcome',async()=>{const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),env,null,dep);const cookie=login.headers.get('set-cookie').split(';')[0];const r=await handleRequest(request('submitVisit',{clientTransactionId:'unique'},cookie),env,null,{fetchImpl:async()=>{throw Error('lost connection')}});assert.equal(r.status,503);assert.equal((await r.json()).errorCode,'OPERATION_STATUS_UNKNOWN');});
test('malformed JSON does not execute upstream',async()=>{const r=await handleRequest(new Request(ORIGIN+'/api/action',{method:'POST',headers:{'X-BHH-Gateway':'1','Content-Type':'application/json'},body:'{' }),env,null,dep);assert.equal(r.status,400);});
test('default gateway mode blocks all POSTs fail-closed',async()=>{
  const noMode={...env,GATEWAY_MODE:undefined};
  const r=await handleRequest(request('login',{staffId:'00001',password:'fake'}),noMode,null,dep);
  assert.equal(r.status,403);assert.equal((await r.json()).errorCode,'PREVIEW_POST_DISABLED');
});
test('UAT auth mode blocks submitVisit before upstream call',async()=>{
  const uatEnv={...env,GATEWAY_MODE:'UAT_AUTH_ONLY'};
  const r=await handleRequest(request('submitVisit',{clientTransactionId:'synthetic'}),uatEnv,null,{
    fetchImpl:async()=>{throw Error('Should never call GAS');}
  });
  assert.equal(r.status,403);assert.equal((await r.json()).errorCode,'PREVIEW_ACTION_DISABLED');
});
test('UAT auth mode allows login but sanitizes upstream session',async()=>{
  const uatEnv={...env,GATEWAY_MODE:'UAT_AUTH_ONLY'};
  const r=await handleRequest(request('login',{staffId:'00001',password:'fake'}),uatEnv,null,dep);
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.data.token,'gateway-session');
});
test('UAT auth mode blocks other mutations and reads',async()=>{
  const uatEnv={...env,GATEWAY_MODE:'UAT_AUTH_ONLY'};
  for(const action of ['getStock','getUsers','resetPassword','receiveStock','getDashboardData']){
    const r=await handleRequest(request(action),uatEnv,null,dep);
    assert.equal(r.status,403,action);
  }
});

test('UAT_READ_ONLY accepts authenticated inventory and symptoms',async()=>{
  const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
  const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
  assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  for(const action of ['getStock','getStockLots','getSymptoms','getInventoryIntegrity','getDispenseHistory','getDashboardV2']){
    const response=await handleRequest(request(action,{},cookie),e,null,dep);
    assert.equal(response.status,200,action);
  }
});
test('UAT_READ_ONLY rejects all writes even with authenticated session',async()=>{
  const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
  const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  let invoked=0;
  for(const action of ['submitVisit','submitDispense','receiveStock','adjustStock','submitStockCount','resetPassword','createUser','updateConfig','importStudents','retryNotification']){
    const response=await handleRequest(request(action,{clientTransactionId:'MOCK-TXN'},cookie),e,null,{fetchImpl:async()=>{invoked++; throw Error('Blocked action reached GAS')}});
    assert.equal(response.status,403,action);
    assert.equal((await response.json()).errorCode,'PREVIEW_ACTION_DISABLED');
  }
  assert.equal(invoked,0);
});
test('UAT_READ_ONLY still requires a signed session for read actions',async()=>{
  const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
  const response=await handleRequest(request('getStock'),e,null,dep);
  assert.equal(response.status,401);
});
test('UAT_READ_ONLY permits reading approved allergy rules without enabling rule edits',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
 const auth=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
 assert.equal(auth.status,200);
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 const read=await handleRequest(request('getDrugAllergyRules',{},cookie),e,null,dep);
 assert.equal(read.status,200);
 for(const action of ['saveDrugAllergyRule','publishDrugAllergyRule']){
  const rejected=await handleRequest(request(action,{allergenTerms:'UAT-ONLY'},cookie),e,null,dep);
  assert.equal(rejected.status,403,action);
  assert.equal((await rejected.json()).errorCode,'PREVIEW_ACTION_DISABLED');
 }
});
test('UAT_READ_ONLY denies actions outside narrow allowlist',async()=>{
  const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
  const r=await handleRequest(request('getUsers'),e,null,dep);
  assert.equal(r.status,403);
});

test('UAT_RULE_SINGLE disallows direct rule mutations and every clinical stock mutation',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_RULE_DRAFT_ONLY'};
 const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const action of ['saveDrugAllergyRule','publishDrugAllergyRule','submitVisit','submitDispense','receiveStock','adjustStock','submitStockCount','submitSyntheticUatVisit','resetPassword','createUser','getUsers']){
  const r=await handleRequest(request(action,{confirmed:true},cookie),e,null,{fetchImpl:async()=>{throw Error('Mutation should not contact upstream')}});
  assert.equal(r.status,403,action);
  assert.equal((await r.json()).errorCode,'PREVIEW_ACTION_DISABLED');
 }
});
test('UAT_RULE_SINGLE refuses synthetic requests without explicit confirmation',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_RULE_DRAFT_ONLY'};
 const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const first=await handleRequest(request('submitSyntheticAllergyDraft',{},cookie),e,null,dep);
 assert.equal(first.status,400);
 assert.equal((await first.json()).errorCode,'UAT_EXPLICIT_CONFIRMATION_REQUIRED');
 const publishBlocked=await handleRequest(request('publishSyntheticAllergyRule',{confirmed:true},cookie),e,null,dep);
 assert.equal(publishBlocked.status,403);
 assert.equal((await publishBlocked.json()).errorCode,'PREVIEW_ACTION_DISABLED');
});
test('UAT_RULE_SINGLE cannot write without bound D1 claim gate',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_RULE_DRAFT_ONLY'};
 const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const r=await handleRequest(request('submitSyntheticAllergyDraft',{confirmed:true},cookie),e,null,dep);
 assert.equal(r.status,503);
 assert.equal((await r.json()).errorCode,'UAT_DB_NOT_CONFIGURED');
});
test('UAT_READ_ONLY remains unable to access new synthetic rule write actions',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_READ_ONLY'};
 for(const action of ['submitSyntheticAllergyDraft','publishSyntheticAllergyRule']){
  const r=await handleRequest(request(action,{confirmed:true}),e,null,dep);
  assert.equal(r.status,403,action);
 }
});
test('UAT_RULE_PUBLISH_ONLY never permits fresh Draft or unrelated writes',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_RULE_PUBLISH_ONLY'};
 const login=await handleRequest(request('login',{staffId:'00001',password:'fake'}),e,null,dep);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 for(const action of ['submitSyntheticAllergyDraft','saveDrugAllergyRule','submitVisit','adjustStock']){
  const r=await handleRequest(request(action,{confirmed:true},cookie),e,null,dep);
  assert.equal(r.status,403,action);
 }
 const publish=await handleRequest(request('publishSyntheticAllergyRule',{},cookie),e,null,dep);
 assert.equal(publish.status,400);
 assert.equal((await publish.json()).errorCode,'UAT_EXPLICIT_CONFIRMATION_REQUIRED');
});
test('old combined UAT_RULE_SINGLE mode is rejected fail closed',async()=>{
 const e={...env,GATEWAY_MODE:'UAT_RULE_SINGLE'};
 const r=await handleRequest(request('submitSyntheticAllergyDraft',{confirmed:true}),e,null,dep);
 assert.equal(r.status,403);
 assert.equal((await r.json()).errorCode,'PREVIEW_POST_DISABLED');
});
