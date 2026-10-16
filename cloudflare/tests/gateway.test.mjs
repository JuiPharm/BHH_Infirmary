import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {handleRequest} from '../worker/index.js';
const ORIGIN='https://bhh-infirmary-p1-preview.example';
const env={GAS_WEB_APP_URL:'https://script.google.com/macros/s/SYNTHETIC/exec',SESSION_KEY_B64:randomBytes(32).toString('base64')};
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