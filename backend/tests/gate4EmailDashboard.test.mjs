import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const source=['backend/40_ClinicalP4.gs','backend/60_Notification.gs','backend/70_DashboardP4.gs']
  .map(p=>readFileSync(resolve(root,p),'utf8')).join('\n');
const iso=(x)=>x.toISOString().slice(0,10);
function fixture(){
 const ctx=vm.createContext({
  Date,console,
  Utilities:{formatDate:(d,tz,pattern)=>pattern==='yyyy-MM'?iso(d).slice(0,7):iso(d)},
  requireRole_:(user,roles)=>{if(!roles.includes(user.role))throw Error('ACCESS_DENIED')},
  getTimeZone_:()=> 'Asia/Bangkok',
  SHEETS:{STUDENTS:'STUDENTS',DISPENSE_HEADER:'DISPENSE_HEADER',DISPENSE_ITEMS:'DISPENSE_ITEMS',NOTIFICATION_LOG:'NOTIFICATION_LOG'},
  now_:()=> '2026-10-16 22:00:00'
 });
 vm.runInContext(source,ctx);
 ctx.getConfigValue_=(_,fallback='')=>fallback;
 ctx.getConfigBoolean_=()=>false;
 ctx.rows_=()=>[];
 return ctx;
}
const doc=(type)=>({
 'Visit ID':'SYNTHETIC-EMAIL-001',
 'Recipient Name':'Mock <script>alert("private")</script>',
 'Recipient Source':'FREE_TEXT',
 'Recipient Type':'OTHER',
 'Recipient ID':'SYNTH',
 'Recipient Department/Class':'UAT',
 'Visit Date':'2026-10-16','Visit Time':'22:00:00',
 'Staff ID':'MOCK-NURSE',
 'Clinical Alert Level':type==='EMERGENCY_TRANSFER'?'EMERGENCY':'NORMAL',
 Disposition:type,
 Symptoms:JSON.stringify(['Fever <img src=x onerror=alert(1)>']),
 'Symptom Categories':'["NON_TRAUMA"]',
 'Derived Visit Category':'NON_TRAUMA',
 Interventions:'["REST","REFERRED"]',
 Assessment:'<iframe src=evil></iframe>',
 Temperature:38.1,
 'BP Systolic':125,'BP Diastolic':80,Pulse:101,SpO2:98,
 'Outcome Note':'<script>danger</script>',
 _items:[{'Item Name':'<svg onload=alert(1)>',Qty:1,Unit:'tablet'}]
});
test('Gate4 referral HTML: BHH navy + yellow banner, details, vitals and safe escaping, without MailApp',()=>{
 const c=fixture();
 const mail=c.buildReferralEmail_(doc('REFER_HOSPITAL'),'REFERRAL','REFERRAL_EMAIL_SUBJECT_PREFIX');
 assert.match(mail.htmlBody,/#0B1F3A/);
 assert.match(mail.htmlBody,/#FFF3CD/);
 assert.match(mail.htmlBody,/REFER HOSPITAL/);
 assert.match(mail.htmlBody,/Vital Signs/);
 assert.match(mail.htmlBody,/38.1/);
 assert.match(mail.htmlBody,/125\/80/);
 assert.match(mail.htmlBody,/&lt;iframe/);
 assert.match(mail.htmlBody,/&lt;svg/);
 assert.match(mail.htmlBody,/&lt;script/);
 assert.doesNotMatch(mail.htmlBody,/<script>|<iframe|<svg|<img/);
 assert.ok(mail.textBody.includes('Mock <script>'));
 assert.match(mail.subject,/\[BHH Infirmary\]/);
});
test('Gate4 emergency HTML uses red escalation, referral yellow remains separate',()=>{
 const c=fixture();
 const emergency=c.buildReferralEmail_(doc('EMERGENCY_TRANSFER'),'EMERGENCY_TRANSFER','EMERGENCY_EMAIL_SUBJECT_PREFIX');
 const referral=c.buildReferralEmail_(doc('REFER_HOSPITAL'),'REFERRAL','REFERRAL_EMAIL_SUBJECT_PREFIX');
 assert.match(emergency.htmlBody,/#FDECEC/);
 assert.match(emergency.htmlBody,/#B91C1C/);
 assert.match(emergency.subject,/URGENT/);
 assert.doesNotMatch(referral.subject,/URGENT/);
});
test('Gate4 HTML escaping and email subject cannot carry HTML or CRLF injection',()=>{
 const c=fixture();
 assert.equal(c.escapeHtml_('<>&"'+String.fromCharCode(39)),'&lt;&gt;&amp;&quot;&#39;');
 const email=c.buildReferralEmail_({...doc('REFER_HOSPITAL'),'Recipient Name':'Mock\r\nBcc: attacker@evil.invalid'},
   'REFERRAL','REFERRAL_EMAIL_SUBJECT_PREFIX');
 assert.doesNotMatch(email.subject,/[\r\n]/);
 assert.equal(c.normalizeEmailList_('TEST@example.org,test@example.org; invalid,ok@example.org').length,2);
});
const visit=(id,type,date='2026-10-16',extras={})=>({
 'Visit ID':id,'Recipient Source':'STUDENT_MASTER','Recipient ID':id,
 'Recipient Name':id,'Recipient Type':type,
 'Recipient Department/Class':'ป.6/1',
 'Visit Date':date,Symptoms:JSON.stringify(['Fever']),
 'Symptom Categories':JSON.stringify(['NON_TRAUMA']),
 'Derived Visit Category':'NON_TRAUMA',
 Status:'COMPLETED',Disposition:'RETURN_TO_CLASS',
 ...extras
});
test('Gate4 Dashboard V2: student teacher staff free-text, referral/emergency, unique and repeat are reconciled',()=>{
 const c=fixture();
 const visits=[
  visit('SYN-STU','STUDENT'),
  visit('SYN-STU-SECOND','STUDENT','2026-10-16',{'Recipient ID':'SYN-STU'}),
  visit('SYN-TCH','TEACHER','2026-10-16',{Disposition:'REFER_HOSPITAL'}),
  visit('SYN-STF','STAFF','2026-10-16',{Disposition:'EMERGENCY_TRANSFER'}),
  visit('SYN-F1','OTHER','2026-10-16',{'Recipient Source':'FREE_TEXT','Recipient ID':'','Recipient Name':'Mock Visitor'}),
  visit('SYN-F2','OTHER','2026-10-16',{'Recipient Source':'FREE_TEXT','Recipient ID':'','Recipient Name':'Mock Visitor'}),
  visit('OUT','STUDENT','2026-09-01'),
  visit('CANCEL','STUDENT','2026-10-16',{Status:'CANCELLED'})
 ];
 c.rows_=n=>n==='DISPENSE_HEADER'?visits:[];
 const r=c.getDashboardV2_({startDate:'2026-10-16',endDate:'2026-10-16'}, {role:'MANAGER'});
 assert.equal(r.data.summary.totalVisits,6);
 assert.equal(r.data.summary.studentVisits,2);
 assert.equal(r.data.summary.teacherVisits,1);
 assert.equal(r.data.summary.staffVisits,1);
 assert.equal(r.data.summary.otherVisits,2);
 assert.equal(r.data.summary.uniqueRecipients,5);
 assert.equal(r.data.summary.repeatVisits,1);
 assert.equal(r.data.summary.referralToHospital,1);
 assert.equal(r.data.summary.emergencyTransfer,1);
 assert.equal(r.data.categoryCounts.NON_TRAUMA,6);
 assert.equal(r.data.trend.length,1);
 assert.equal(r.data.trend[0].count,6);
 const t=c.getDashboardV2_({startDate:'2026-10-16',endDate:'2026-10-16',recipientType:'TEACHER'}, {role:'ADMIN'});
 assert.equal(t.data.summary.totalVisits,1);
 const s=c.getDashboardV2_({startDate:'2026-10-16',endDate:'2026-10-16',recipientType:'STUDENT',gradeClass:'ป.6'}, {role:'MANAGER'});
 assert.equal(s.data.summary.totalVisits,2);
});
test('Gate4/5 Dashboard server-side roles and invalid filters cannot bypass authorization',()=>{
 const c=fixture();
 c.rows_=()=>[];
 for(const role of ['NURSE','VISITOR'])assert.throws(()=>c.getDashboardV2_({}, {role}),/ACCESS_DENIED/);
 assert.throws(()=>c.getDashboardV2_({recipientType:'WRONG'}, {role:'MANAGER'}),/INVALID_RECIPIENT_TYPE/);
 assert.throws(()=>c.getDashboardV2_({startDate:'2026-10-17',endDate:'2026-10-16'}, {role:'MANAGER'}),/INVALID_DATE_RANGE/);
 assert.throws(()=>c.getDashboardV2_({symptomCategory:'HACK'}, {role:'MANAGER'}),/INVALID_SYMPTOM_CATEGORY/);
});
test('Gate4/5 notification actions require appropriate server-side roles',()=>{
 const c=fixture();
 assert.throws(()=>c.getNotificationLog_({}, {role:'VISITOR'}),/ACCESS_DENIED/);
 assert.throws(()=>c.retryNotification_({notificationId:'X'}, {role:'MANAGER'}),/ACCESS_DENIED/);
 assert.throws(()=>c.reconcileNotifications_({}, {role:'NURSE'}),/ACCESS_DENIED/);
 assert.throws(()=>c.resolveUncertainNotification_({confirmation:'CONFIRMED_NOT_DELIVERED'}, {role:'ADMIN'}),/ACCESS_DENIED/);
});
