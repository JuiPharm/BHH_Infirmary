export const UAT_AUTH_PAGE=String.raw`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>BHH Infirmary · UAT Login</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b3151;background:#f1f5fa}
*{box-sizing:border-box}body{margin:0}.brand{background:#102b50;color:#fff;padding:26px max(20px,calc((100vw - 620px)/2))}
main{max-width:620px;margin:28px auto;padding:0 18px}.card{padding:28px;border:1px solid #d8e1ed;border-radius:16px;background:#fff;box-shadow:0 12px 30px #102b5010}
h1{font-size:24px;margin:8px 0 18px}.warning{background:#fff1c8;color:#704807;padding:12px;border-radius:8px;font-weight:600}
label{font-weight:600;display:block;margin:14px 0 7px}input{width:100%;border:1px solid #9ca9bf;border-radius:9px;padding:13px;font:inherit}
button{font:inherit;border:0;border-radius:8px;padding:12px 17px;cursor:pointer;background:#15599c;color:#fff;margin:14px 10px 0 0}
button:disabled{opacity:.55;cursor:wait}.secondary{background:#eef2f8;color:#193754;border:1px solid #bbcce0}
p{line-height:1.7}.small{color:#65718a;font-size:13px}.output{white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f7;padding:12px;border-radius:8px;min-height:40px;font:13px ui-monospace,monospace}
</style></head><body><header class="brand"><strong>BHH Infirmary — Bangkok Hospital Hatyai</strong></header>
<main><section class="card"><div class="warning">SYNTHETIC SANDBOX UAT ONLY — ห้ามใช้บัญชีหรือข้อมูลผู้รับบริการจริง</div>
<h1>ทดสอบเข้าสู่ระบบ GAS Sandbox</h1>
<p>ระบบนี้ใช้ทดสอบ Login / Session / Logout, อ่านข้อมูล และยืนยัน Publish กฎทดสอบสังเคราะห์ที่สร้างไว้แล้วเท่านั้น ไม่อนุญาตให้บันทึก Visit จ่ายยา หรือแก้ Stock</p>
<form id="signin"><label for="staffId">Staff ID ของบัญชีทดสอบ</label><input id="staffId" name="staffId" required autocomplete="off" spellcheck="false" maxlength="80">
<label for="password">รหัสผ่านบัญชีทดสอบ</label><input id="password" name="password" type="password" required autocomplete="off" maxlength="256">
<button id="btnLogin" type="submit">ทดสอบ Login</button></form>
<div><button id="btnSession" class="secondary" type="button">ตรวจ Session</button>
<button id="btnLogout" class="secondary" type="button">Logout</button></div>
<div style="border-top:1px solid #dfe8f2;margin-top:24px;padding-top:20px">
<h2 style="font-size:18px">Controlled Write UAT — Complete</h2>
<p class="small">Synthetic one-shot Visit Vde2628c7874d4471 ผ่านการกระทบยอดแล้ว (MOCK-LOT-003A 30 → 29) และถูกปิดไม่ให้ส่งซ้ำ ขณะนี้หน้า Preview เปิดเฉพาะ Login / Session / Logout และรายการอ่านข้อมูลเท่านั้น</p>
</div>
<div style="border-top:1px solid #dfe8f2;margin-top:24px;padding-top:20px">
<h2 style="font-size:18px">Read-only UAT (ข้อมูลจำลอง)</h2>
<p class="small">หลัง Login ใช้ตรวจว่าระบบดึงข้อมูลจาก GAS Sandbox ได้ ปุ่มเหล่านี้ไม่บันทึก Visit ไม่ตัด Stock และแสดงเฉพาะจำนวนรายการรวมเท่านั้น</p>
<div id="readActions">
<button class="secondary" type="button" data-read="getStock">ตรวจ Stock</button>
<button class="secondary" type="button" data-read="getStockLots">ตรวจ Lots</button>
<button class="secondary" type="button" data-read="getSymptoms">ตรวจ Symptoms</button>
<button class="secondary" type="button" data-read="getDispenseHistory">ตรวจ Visit History</button>
<button class="secondary" type="button" data-read="getDashboardV2">ตรวจ Dashboard</button>
<button class="secondary" type="button" data-read="getInventoryIntegrity">ตรวจ Inventory Integrity</button>
<button class="secondary" type="button" data-read="getDrugAllergyRules">ตรวจ Allergy Rules (LOCKED)</button>
</div>
</div>
<div style="border-top:1px solid #dfe8f2;margin-top:24px;padding-top:20px">
<h2 style="font-size:18px">Clinical Rule Lifecycle UAT (เฉพาะ Sandbox)</h2>
<p class="small">ทดสอบการสร้าง Draft และ Publish กฎปลอมที่ไม่มีชื่อสาร/ยาใน Drug Master:
<strong>BHHUATALLERGEN20261016 → BHHUATGENERIC20261016</strong> ไม่บันทึก Visit ไม่จ่ายยา ไม่แก้ Stock
และไม่อนุญาตให้แก้ชื่อกฎ/ข้อมูลผู้รับบริการผ่านหน้า UAT นี้ · ขั้น Publish จะปลดล็อกหลังตรวจ D1 และ Audit Log</p>
<div class="warning">Draft ID AR07c10f3cb053440fbc ผ่านการกระทบยอดแล้ว ขั้นนี้อนุญาตให้ Publish ชื่อสังเคราะห์เพียง 1 ครั้งเท่านั้น หากแสดง UNKNOWN/NEEDS_REVIEW ห้ามกดซ้ำ</div>
<div><button id="btnRuleDraft" type="button" disabled title="Draft ผ่านแล้ว ห้ามส่งซ้ำ">ขั้นที่ 1 · Draft PASS (ล็อกแล้ว)</button>
<button id="btnRulePublish" class="secondary" type="button">ขั้นที่ 2 · Approve/Publish Synthetic Rule</button></div>
</div>
<p class="small">รหัสผ่านถูกส่งโดย HTTPS ไปยัง Cloudflare Gateway และ GAS Sandbox เท่านั้น ไม่บันทึกไว้ในหน้าเว็บหรือ Local Storage โปรดอย่าส่งรหัสผ่านหรือ Session Cookie ในแชต</p>
<p id="status" role="status" aria-live="polite" class="output">พร้อมทดสอบ · ยังไม่ได้เข้าสู่ระบบ</p>
</section></main>
<script>
const status=document.getElementById('status'),form=document.getElementById('signin'),login=document.getElementById('btnLogin');
async function call(action,payload={}) {
 const response=await fetch('/api/action',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'content-type':'application/json','X-BHH-Gateway':'1'},body:JSON.stringify({action,payload})});
 const body=await response.json();
 if(!response.ok||body.success!==true)throw Error(String(body.errorCode||'AUTH_TEST_FAILED'));
 if(action==='login'||action==='getSession')return 'สำเร็จ: '+String(body.data?.role||'-')+' / '+String(body.data?.staffId||'-');
 return 'Logout สำเร็จ';
}
form.addEventListener('submit',async(e)=>{e.preventDefault();login.disabled=true;status.textContent='กำลังตรวจสอบบัญชี UAT...';
 try{const p={staffId:document.getElementById('staffId').value.trim(),password:document.getElementById('password').value};status.textContent=await call('login',p);}
 catch(e){status.textContent='ไม่สำเร็จ: '+e.message;}finally{document.getElementById('password').value='';login.disabled=false;}});
document.getElementById('btnSession').addEventListener('click',async()=>{try{status.textContent=await call('getSession');}catch(e){status.textContent='Session: '+e.message;}});
document.getElementById('btnLogout').addEventListener('click',async()=>{try{status.textContent=await call('logout');}catch(e){status.textContent='Logout: '+e.message;}});
async function oneShotSyntheticRule(action) {
 const isDraft=action==='submitSyntheticAllergyDraft';
 const title=isDraft?'สร้าง Draft จำลองใน Google Sheets Sandbox 1 รายการ?':'อนุมัติและ Publish กฎจำลอง AR07c10f3cb053440fbc ใน Sandbox 1 รายการ?';
 if(!window.confirm(title+' ไม่มีการบันทึก Visit หรือเปลี่ยน Stock และไม่สามารถส่งคำสั่งนี้ซ้ำอัตโนมัติได้'))return;
 const button=document.getElementById(isDraft?'btnRuleDraft':'btnRulePublish');
 button.disabled=true;status.textContent='กำลังทดสอบ '+(isDraft?'Synthetic Draft':'Synthetic Publish')+'... ห้ามกดซ้ำ';
 try {
  const res=await fetch('/api/action',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'content-type':'application/json','X-BHH-Gateway':'1'},
   body:JSON.stringify({action,payload:{confirmed:true}})});
  const body=await res.json();
  if(!res.ok||body.success!==true)throw Error(String(body.errorCode||'UNKNOWN_UAT_RESULT'));
  status.textContent=(isDraft?'UAT ALLERGY DRAFT PASS: ':'UAT ALLERGY PUBLISH PASS: ')+
   String(body.data?.ruleId||'')+' · '+String(body.data?.status||'')+' · Baseline=LOCKED · no Visit/Stock write';
 }catch(err){
  status.textContent='UAT ALLERGY REQUIRES REVIEW: '+String(err?.message||'UNKNOWN')+
   ' · ห้ามกดส่งซ้ำ ให้แจ้ง Error Code และตรวจ D1/Google Sheets';
 }
}
document.getElementById('btnRuleDraft').addEventListener('click',()=>oneShotSyntheticRule('submitSyntheticAllergyDraft'));
document.getElementById('btnRulePublish').addEventListener('click',()=>oneShotSyntheticRule('publishSyntheticAllergyRule'));
document.querySelectorAll('[data-read]').forEach(button=>button.addEventListener('click',async()=>{
 const action=button.dataset.read;button.disabled=true;status.textContent='กำลังตรวจ '+action+' ...';
 try{
   const res=await fetch('/api/action',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
     headers:{'content-type':'application/json','X-BHH-Gateway':'1'},body:JSON.stringify({action,payload:{}})});
   const v=await res.json();
   if(!res.ok||v.success!==true)throw Error(String(v.errorCode||'UAT_READ_FAILED'));
   const d=v.data;
   if(action==='getDrugAllergyRules') {
     if(!Array.isArray(d)||!d.some(x=>x['Rule ID']==='SYSTEM-PENICILLIN-HARD-STOP'&&x.Status==='LOCKED'))throw Error('ALLERGY_BASELINE_MISSING');
     status.textContent='ALLERGY RULES READ PASS · '+d.length+' กฎ · System Penicillin Hard Stop = LOCKED';
     return;
   }
   const count=Array.isArray(d)?d.length:(Array.isArray(d?.items)?d.items.length: Array.isArray(d?.rows)?d.rows.length:null);
   status.textContent='READ PASS: '+action+(count!==null?' · '+count+' รายการ':' · ระบบตอบรับข้อมูล');
 }catch(err){status.textContent='READ FAIL: '+action+' · '+err.message;}finally{button.disabled=false;}
}));
</script></body></html>`;
