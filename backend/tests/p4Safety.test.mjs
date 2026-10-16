import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '../..');
const source = ['backend/30_Recipients.gs','backend/35_AllergyRules.gs','backend/60_Notification.gs','backend/70_DashboardP4.gs']
  .map(x => readFileSync(resolve(root,x),'utf8')).join('\n');

function makeContext() {
  const ctx = vm.createContext({
    console,
    SHEETS:{STUDENTS:'STUDENTS',STAFF_MASTER:'STAFF_MASTER',
      DISPENSE_HEADER:'DISPENSE_HEADER',NOTIFICATION_LOG:'NOTIFICATION_LOG'},
    HEADERS:{STAFF_MASTER:['Staff ID','Full Name','Recipient Type','Department','Status','Updated At']},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
    limitedText_:(v,max)=> String(v || '').trim().slice(0,max),
    headerMap_:(names)=>Object.fromEntries(names.map((name,i)=>[name,i])),
    clearCache_:()=>{},audit_:()=>{},auditSystem_:()=>{},
    requireRole_:(session,roles)=>{if(!roles.includes(session.role))throw Error('ACCESS_DENIED');},
    now_:()=> '2026-10-14 10:00:00',
    normalizeItemType_:(v)=>v === 'MEDICAL_SUPPLY' ? 'MEDICAL_SUPPLY' : 'DRUG',
    isActiveStatus_:(v)=>!v || v === 'ACTIVE',
    truncateAfterRow_:()=>{},
  });
  vm.runInContext(source,ctx);
  // The read-only registry sheet exists in a correctly migrated clinical deployment.
  ctx.getSpreadsheet_=()=>({getSheetByName:(name)=>name==='DRUG_ALLERGY_RULES'?{}:null});
  return ctx;
}

test('Student medication review is checked against current server-side allergy',()=>{
  const c = makeContext();
  c.rows_ = (sheet)=> sheet === 'STUDENTS'
    ? [{'Student ID':'S001',Status:'ACTIVE','Drug Allergy':'Penicillin'}] : [];
  const recipient = {recipientSource:'STUDENT_MASTER',recipientId:'S001'};
  const drugs = [{master:{'Item Type':'DRUG'}}];
  assert.throws(()=>c.validateStudentDrugSafetyForDispense_(recipient,{},drugs),
    /STUDENT_SAFETY_REVIEW_REQUIRED/);
  assert.throws(()=>c.validateStudentDrugSafetyForDispense_(
    recipient,{studentSafetyAcknowledged:true,studentDrugAllergySnapshot:''},drugs),
    /STUDENT_SAFETY_REVIEW_REQUIRED/);
  assert.doesNotThrow(()=>c.validateStudentDrugSafetyForDispense_(
    recipient,{studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'Penicillin'},drugs));
  assert.doesNotThrow(()=>c.validateStudentDrugSafetyForDispense_(recipient,{},[]));
});

test('Free-text names without stable IDs do not collapse two people into one KPI',()=>{
  const c = makeContext();
  const a = {'Recipient Source':'FREE_TEXT','Recipient Name':'สมชาย','Visit ID':'V1'};
  const b = {'Recipient Source':'FREE_TEXT','Recipient Name':'สมชาย','Visit ID':'V2'};
  assert.notEqual(c.dashboardRecipientKey_(a),c.dashboardRecipientKey_(b));
});

function mailHarness({throwOnSend=false,to='nurse@example.org'}={}) {
  const c = makeContext();
  const logs=[];
  const sent=[];
  const config={
    REFERRAL_EMAIL_ENABLED:'true',REFERRAL_EMAIL_TO:to,
    REFERRAL_EMAIL_CC:'',REFERRAL_EMAIL_SUBJECT_PREFIX:'',
    NOTIFICATION_FROM_NAME:'BHH Infirmary'
  };
  c.getConfigValue_ = (key,fallback='')=> config[key] ?? fallback;
  c.getConfigBoolean_ = (key)=>config[key] === 'true';
  c.getVisitForNotification_ = ()=>({Disposition:'REFER_HOSPITAL'});
  c.buildReferralEmail_ = ()=>({subject:'Referral',textBody:'test',htmlBody:'<b>test</b>'});
  c.rows_ = (name)=> name === 'NOTIFICATION_LOG' ? logs.map(x=>({...x})) : [];
  c.updateNotificationLog_ = (id,changes)=>{
    const record=logs.find(x=>x['Notification ID'] === id);
    if(!record)throw Error('NOTIFICATION_NOT_FOUND');
    Object.assign(record,changes);
  };
  c.getSheet_ = ()=>({appendRow:(r)=>{
    const keys=['Notification ID','Visit ID','Notification Type','Channel','Recipient','CC',
      'Subject','Status','Attempt Count','Created At','Sent At','Error Message','Staff ID'];
    logs.push(Object.fromEntries(keys.map((key,i)=>[key,r[i]])));
  }});
  c.MailApp = {sendEmail:(options)=>{if(throwOnSend)throw Error('ambiguous mail failure');sent.push(options);}};
  return {c,logs,sent,config};
}

test('Duplicate outbox trigger sends one email only',()=>{
  const {c,logs,sent}=mailHarness();
  const user={role:'NURSE',staffId:'N1'};
  assert.equal(c.triggerReferralNotificationForVisit_('V1',user).status,'SENT');
  assert.equal(c.triggerReferralNotificationForVisit_('V1',user).duplicatePrevented,true);
  assert.equal(logs.length,1);
  assert.equal(sent.length,1);
  assert.equal(logs[0].Status,'SENT');
});

test('Ambiguous delivery is UNKNOWN and cannot be automatically retried',()=>{
  const {c,logs,sent}=mailHarness({throwOnSend:true});
  const user={role:'NURSE',staffId:'N1'};
  const res=c.triggerReferralNotificationForVisit_('V2',user);
  assert.equal(res.status,'UNKNOWN');
  assert.equal(logs[0].Status,'UNKNOWN');
  assert.throws(()=>c.retryNotification_({notificationId:res.notificationId},user),
    /NOTIFICATION_STATUS_UNCERTAIN/);
  assert.equal(sent.length,0);
});

test('Definitive failure for missing recipient can be retried after CONFIG repair',()=>{
  const {c,logs,sent,config}=mailHarness({to:''});
  const user={role:'NURSE',staffId:'N1'};
  const res=c.triggerReferralNotificationForVisit_('V3',user);
  assert.equal(res.status,'FAILED');
  assert.equal(logs[0].Status,'FAILED');
  config.REFERRAL_EMAIL_TO='pharmacist@example.org';
  const retry=c.retryNotification_({notificationId:res.notificationId},user);
  assert.equal(retry.status,'SENT');
  assert.equal(sent.length,1);
  assert.equal(logs[0].Recipient,'pharmacist@example.org');
});

test('Staff import preserves original rows, extra columns and can add staff IDs',()=>{
  const c=makeContext();
  const header=[...c.HEADERS.STAFF_MASTER,'External Note'];
  const grid=[
    header,
    ['001','Old Name','STAFF','A','ACTIVE','Yesterday','keep me'],
    ['002','Second','TEACHER','B','ACTIVE','Yesterday','another note']
  ];
  const sheet={
    getDataRange:()=>({
      getValues:()=>grid.map(x=>x.slice()),
      getDisplayValues:()=>grid.map(x=>x.map(String))
    }),
    getLastRow:()=>grid.length,
    getRange:(row,col,height,width)=>({
      setValues:(values)=>{
        for(let i=0;i<height;i++)grid[row-1+i]=values[i].slice();
      }
    })
  };
  c.getSheet_=()=>sheet;
  c.ensureHeaders_=()=>{};
  c.truncateAfterRow_=(sh,last)=>{grid.splice(last);};
  const out=c.importStaffMaster_({rows:[
    {staffId:'001',fullName:'Updated',recipientType:'STAFF',department:'C'},
    {staffId:'003',fullName:'Third',recipientType:'TEACHER',department:'D'}
  ]},{role:'ADMIN',staffId:'A1'});
  assert.equal(out.data.updated,1);
  assert.equal(out.data.created,1);
  assert.equal(grid[1][1],'Updated');
  assert.equal(grid[1][6],'keep me');
  assert.equal(grid[2][1],'Second');
  assert.equal(grid[2][6],'another note');
  assert.equal(grid[3][0],'003');
  assert.equal(grid[3].length,header.length);
});

test('Invalid import cannot alter existing STAFF_MASTER data',()=>{
  const c=makeContext();
  let wrote=false;
  c.getSheet_=()=>({getRange:()=>({setValues:()=>{wrote=true;}})});
  assert.throws(()=>c.importStaffMaster_({rows:[
    {staffId:'001',fullName:'Good',recipientType:'STAFF'},
    {staffId:'002',fullName:'Bad',recipientType:'STUDENT'}
  ]},{role:'ADMIN'}),/INVALID_STAFF_MASTER_ROW/);
  assert.equal(wrote,false);
});

test('Visit confirmation never puts recipient or symptoms directly in SweetAlert HTML',()=>{
  const source=readFileSync(resolve(root,'frontend/src/features/clinical/VisitPage.tsx'),'utf8');
  assert.match(source,/Untrusted fields are rendered via text/);
  assert.doesNotMatch(source,/html:\s*\[\s*`<b>ผู้รับบริการ/);
  assert.match(source,/aria-pressed=/);
});

test('GAS / React API versions remain synchronized',()=>{
  const backend=readFileSync(resolve(root,'backend/Code.gs'),'utf8');
  const frontend=readFileSync(resolve(root,'frontend/src/api.ts'),'utf8');
  const version=backend.match(/const API_VERSION = '([^']+)'/)[1];
  assert.ok(frontend.includes(`REQUIRED_API_VERSION = '${version}'`));
});

test('Staff Master rejects spreadsheet formula IDs and escapes text formulas',()=>{
  const c=makeContext();
  assert.equal(c.safeImportedSheetText_('=HYPERLINK("x")'), '\'=HYPERLINK("x")');
  assert.equal(c.safeImportedSheetText_('พยาบาล'), 'พยาบาล');
  assert.throws(()=>c.importStaffMaster_({rows:[
    {staffId:'=2+2',fullName:'Unsafe',recipientType:'STAFF'}
  ]},{role:'ADMIN'}),/INVALID_STAFF_MASTER_ROW/);
});

test('Staff Master import rolls back preceding updates if a subsequent update fails',()=>{
  const c=makeContext();
  const grid=[
    [...c.HEADERS.STAFF_MASTER],
    ['001','First','STAFF','A','ACTIVE','old'],
    ['002','Second','TEACHER','B','ACTIVE','old']
  ];
  let failOnce=true;
  c.getSheet_=()=>({
    getDataRange:()=>({
      getValues:()=>grid.map(row=>row.slice()),
      getDisplayValues:()=>grid.map(row=>row.map(String))
    }),
    getLastRow:()=>grid.length,
    getRange:(row,col,height,width)=>({
      setValues:(values)=>{
        if(row === 3 && failOnce){failOnce=false;throw Error('SIMULATED_SHEET_WRITE_FAILURE');}
        for(let i=0;i<height;i++)grid[row+i-1]=values[i].slice();
      }
    })
  });
  c.ensureHeaders_=()=>{};
  c.truncateAfterRow_=(sheet,last)=>{grid.splice(last);};
  assert.throws(()=>c.importStaffMaster_({rows:[
    {staffId:'001',fullName:'Changed',recipientType:'STAFF'},
    {staffId:'002',fullName:'Changed again',recipientType:'TEACHER'}
  ]},{role:'ADMIN',staffId:'A1'}),/SIMULATED_SHEET_WRITE_FAILURE/);
  assert.equal(grid[1][1],'First');
  assert.equal(grid[2][1],'Second');
});

test('Reconciliation never re-sends historical or future-dated visits',()=>{
  const c=makeContext();
  const now=new Date().toISOString().slice(0,10);
  const sent=[];
  c.Utilities.formatDate=(value)=>value.toISOString().slice(0,10);
  c.getTimeZone_=()=> 'UTC';
  c.getConfigBoolean_=()=>true;
  c.rows_=(name)=>name==='NOTIFICATION_LOG' ? [] : [
    {'Visit ID':'Vold',Status:'COMPLETED',Disposition:'REFER_HOSPITAL','Visit Date':'2020-01-01'},
    {'Visit ID':'Vnew',Status:'COMPLETED',Disposition:'REFER_HOSPITAL','Visit Date':now},
    {'Visit ID':'Vfuture',Status:'COMPLETED',Disposition:'REFER_HOSPITAL','Visit Date':'2099-01-01'}
  ];
  c.triggerReferralNotificationForVisit_=(id)=>{sent.push(id);return {status:'SENT'};};
  const out=c.reconcileNotifications_({limit:10},{role:'ADMIN',staffId:'A1'});
  assert.equal(out.data.checked,1);
  assert.deepEqual(sent,['Vnew']);
});

test('Retry API follows the success/data contract expected by the frontend',()=>{
  const source=readFileSync(resolve(root,'backend/Code.gs'),'utf8');
  assert.match(source,/case 'retryNotification': return \{success:true,data:retryNotification_/);
});
