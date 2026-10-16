import {ALLOWED_ACTIONS,MUTATING_ACTIONS,REQUIRED_API_VERSION} from './contracts.js';
import {seal,unseal,getCookie,setCookie,clearCookie,redactSession} from './session.js';
import {callGas} from './upstream.js';
const MAX_BODY_BYTES=256*1024;
const HEADERS={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const HTTP={AUTH_REQUIRED:401,INVALID_SESSION:401,INVALID_CREDENTIALS:401,ACCESS_DENIED:403,UNKNOWN_ACTION:404,UPSTREAM_UNAVAILABLE:502,UPSTREAM_INVALID_RESPONSE:502,UPSTREAM_REDIRECT_BLOCKED:502,GATEWAY_NOT_CONFIGURED:503,API_VERSION_MISMATCH:503,OPERATION_STATUS_UNKNOWN:503};
function json(value,status=200,cookie){const headers=new Headers(HEADERS);if(cookie)headers.set('Set-Cookie',cookie);return new Response(JSON.stringify(value),{status,headers});}
function error(code,status=HTTP[code]||400,cookie){return json({success:false,errorCode:code,message:code},status,cookie);}
function sameOrigin(req){const origin=req.headers.get('Origin');const u=new URL(req.url);if(origin&&origin!==u.origin)return false;const site=req.headers.get('Sec-Fetch-Site');return !site||['same-origin','none'].includes(site);}
function failUpstream(action,exception){if(exception?.code==='GATEWAY_NOT_CONFIGURED')return error('GATEWAY_NOT_CONFIGURED');if(MUTATING_ACTIONS.has(action))return error('OPERATION_STATUS_UNKNOWN');return error(['UPSTREAM_INVALID_RESPONSE','UPSTREAM_REDIRECT_BLOCKED'].includes(exception?.code)?exception.code:'UPSTREAM_UNAVAILABLE');}
export async function handleRequest(request,env,ctx,dependencies={}){
 const pathname=new URL(request.url).pathname;
 const gas=(body,opts)=>callGas(env,body,{fetchImpl:dependencies.fetchImpl||fetch,...opts});
 if(pathname==='/api/health'&&request.method==='GET'){
  try{const health=await gas(null,{timeoutMs:8000});const version=String(health.apiVersion||'');if(!health.success||version!==REQUIRED_API_VERSION)return json({success:false,apiVersion:version,writer:'GAS_SHEETS',errorCode:'API_VERSION_MISMATCH'},503);return json({success:true,apiVersion:version,service:'BHH Infirmary Cloudflare Gateway',writer:'GAS_SHEETS'});}
  catch(ex){return failUpstream('',ex);}
 }
 if(pathname==='/api/action'&&request.method==='POST'){
  if(!sameOrigin(request)||request.headers.get('X-BHH-Gateway')!=='1')return error('ACCESS_DENIED',403);
  if(Number(request.headers.get('Content-Length')||0)>MAX_BODY_BYTES)return error('PAYLOAD_TOO_LARGE',413);
  let input;
  try{const raw=await request.text();if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)return error('PAYLOAD_TOO_LARGE',413);input=JSON.parse(raw);}catch{return error('INVALID_INPUT',400);}
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.action!=='string'||!ALLOWED_ACTIONS.has(input.action))return error('UNKNOWN_ACTION',404);
  const action=input.action,payload=input.payload&&typeof input.payload==='object'&&!Array.isArray(input.payload)?input.payload:{};
  if(action==='login'){
   if(typeof payload.staffId!=='string'||typeof payload.password!=='string'||!payload.staffId.trim()||!payload.password)return error('INVALID_CREDENTIALS',401);
   let result;try{result=await gas({action,payload,token:null},{timeoutMs:20000});}catch(ex){return failUpstream(action,ex);}
   if(!result.success)return json(result);
   try{const publicSession=redactSession(result.data);const encrypted=await seal(result.data.token,env);return json({success:true,data:publicSession},200,setCookie(encrypted));}catch{return error('GATEWAY_NOT_CONFIGURED',503);}
  }
  const cookie=getCookie(request);if(!cookie)return error('AUTH_REQUIRED',401);
  let token;try{token=await unseal(cookie,env);}catch(ex){return error(ex?.message==='GATEWAY_NOT_CONFIGURED'?'GATEWAY_NOT_CONFIGURED':'INVALID_SESSION',undefined,clearCookie());}
  if(action==='logout'){
   try{await gas({action,payload:{},token},{timeoutMs:10000});}catch{}
   return json({success:true,data:null},200,clearCookie());
  }
  try{
   const result=await gas({action,payload,token},{timeoutMs:action==='submitVisit'||action==='submitDispense'?35000:25000});
   if(!result.success&&['AUTH_REQUIRED','INVALID_SESSION'].includes(String(result.errorCode||'')))return json(result,401,clearCookie());
   if(result.success&&action==='getSession'){try{return json({...result,data:redactSession(result.data)});}catch{return error('UPSTREAM_INVALID_RESPONSE',502);}}
   return json(result);
  }catch(ex){return failUpstream(action,ex);}
 }
 if(pathname.startsWith('/api/'))return error('UNKNOWN_ACTION',404);
 if(env.ASSETS&&['GET','HEAD'].includes(request.method))return env.ASSETS.fetch(request);
 return new Response('Static assets not configured',{status:404});
}
export default {fetch:handleRequest};