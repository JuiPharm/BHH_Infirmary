import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {handleRequest} from '../worker/index.js';

const ORIGIN='https://bhh-infirmary-security-review.example';
const env={GAS_WEB_APP_URL:'https://script.google.com/macros/s/SYNTHETIC/exec',
 SESSION_KEY_B64:randomBytes(32).toString('base64'),GATEWAY_MODE:'UAT_READ_ONLY'};
function req(action,body={},headers={}){
 return new Request(ORIGIN+'/api/action',{method:'POST',
  headers:{'Content-Type':'application/json','X-BHH-Gateway':'1',...headers},
  body:JSON.stringify({action,payload:body})});
}
const upstream=async(url,options)=>{
 if(options.method==='GET')return Response.json({success:true,apiVersion:'2.4.1',buildId:'SYNTHETIC'});
 const request=JSON.parse(options.body);
 if(request.action==='login')return Response.json({success:true,data:{token:'GAS-PRIVATE-SESSION',
  staffId:'MOCK-STAFF',name:'Mock User',role:'NURSE'}});
 if(request.action==='getSession')return Response.json({success:true,data:{token:'GAS-PRIVATE-SESSION',
  staffId:'MOCK-STAFF',name:'Mock User',role:'NURSE'}});
 return Response.json({success:true,data:[]});
};
test('Gate5 preview UAT_READ_ONLY denies all write categories before upstream',async()=>{
 let called=0;
 const actions=['submitVisit','submitDispense','receiveStock','adjustStock','submitStockCount',
 'importItems','importStudents','importStaffMaster','resetPassword','updateUser','createUser',
 'saveDrugAllergyRule','publishDrugAllergyRule','retryNotification','reconcileNotifications',
 'resolveUncertainNotification','submitSyntheticUatVisit','submitSyntheticAllergyDraft','publishSyntheticAllergyRule'];
 for(const action of actions){
  const out=await handleRequest(req(action,{confirmed:true}),env,null,{fetchImpl:async()=>{called++;throw Error('UNEXPECTED_UPSTREAM')}});
  assert.equal(out.status,403,action);
  assert.equal((await out.json()).errorCode,'PREVIEW_ACTION_DISABLED',action);
 }
 assert.equal(called,0);
});
test('Gate5 same-origin denial and csrf header work independently of upstream and cookies',async()=>{
 for(const headers of [{Origin:'https://attacker.invalid'},{'Sec-Fetch-Site':'cross-site'}]){
  let called=false;
  const resp=await handleRequest(req('login',{staffId:'X',password:'X'},headers),env,null,{
   fetchImpl:async()=>{called=true;throw Error('UNEXPECTED_UPSTREAM')}
  });
  assert.equal(resp.status,403);
  assert.equal(called,false);
 }
 const r=new Request(ORIGIN+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'login',payload:{staffId:'X',password:'X'}})});
 assert.equal((await handleRequest(r,env,null,{fetchImpl:upstream})).status,403);
});
test('Gate5 unknown/unapproved action and wrong method fail closed',async()=>{
 const unknown=await handleRequest(req('setupSystem'),env,null,{fetchImpl:upstream});
 assert.equal(unknown.status,404);
 const wrongMethod=await handleRequest(new Request(ORIGIN+'/api/action',{method:'GET'}),env,null,{fetchImpl:upstream});
 assert.notEqual(wrongMethod.status,200);
});
test('Gate5 no upstream configuration exposes secrets through health response',async()=>{
 const response=await handleRequest(new Request(ORIGIN+'/api/health'),{...env,GAS_WEB_APP_URL:''},null,{fetchImpl:upstream});
 assert.equal(response.status,503);
 const body=await response.json();
 assert.equal(body.errorCode,'GATEWAY_NOT_CONFIGURED');
 assert.ok(!JSON.stringify(body).includes(env.SESSION_KEY_B64));
});
test('Gate5 frontend and Worker config use same-origin /api and do not initialize a second writer',()=>{
 const root=resolve(import.meta.dirname,'../..');
 const api=readFileSync(resolve(root,'frontend/src/api.ts'),'utf8');
 const worker=readFileSync(resolve(root,'cloudflare/worker/index.js'),'utf8');
 const config=readFileSync(resolve(root,'wrangler.jsonc'),'utf8');
 assert.match(api,/DEFAULT_GAS_URL\s*=\s*'\/api\/action'/);
 assert.match(api,/credentials:\s*'same-origin'/);
 assert.match(worker,/GATEWAY_MODE/);
 assert.match(worker,/UAT_READ_ONLY/);
 assert.match(worker,/OPERATION_STATUS_UNKNOWN/);
 assert.ok(!config.includes('d1_databases'),'no D1 writer binding in P1 preview config');
 assert.ok(!config.includes('LEGACY_GAS_SINGLE_WRITER'),'no production writer setting in preview config');
 assert.ok(!worker.includes('env.UAT_DB.prepare('),'no direct production D1 database writes on generic API');
});
