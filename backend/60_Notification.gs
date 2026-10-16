/* P4 — Referral/email outbox. Clinical records commit independently of email.
   MailApp + Sheets cannot offer exactly-once delivery. Ambiguous sends are held
   as SENDING/UNKNOWN and must be reconciled by an authorized operator. */

function notificationConfigForDisposition_(disposition) {
  const d = String(disposition || '').trim().toUpperCase();
  if (d === 'REFER_HOSPITAL') {
    return {type:'REFERRAL',enabledKey:'REFERRAL_EMAIL_ENABLED',
      toKey:'REFERRAL_EMAIL_TO',ccKey:'REFERRAL_EMAIL_CC',
      prefixKey:'REFERRAL_EMAIL_SUBJECT_PREFIX'};
  }
  if (d === 'EMERGENCY_TRANSFER') {
    return {type:'EMERGENCY_TRANSFER',enabledKey:'EMERGENCY_EMAIL_ENABLED',
      toKey:'EMERGENCY_EMAIL_TO',ccKey:'EMERGENCY_EMAIL_CC',
      prefixKey:'EMERGENCY_EMAIL_SUBJECT_PREFIX'};
  }
  return null;
}

function triggerReferralNotificationForVisit_(visitId,s) {
  const visit = getVisitForNotification_(visitId);
  const cfg = notificationConfigForDisposition_(visit.Disposition);
  if (!cfg) return {status:'NOT_REQUIRED'};
  if (!getConfigBoolean_(cfg.enabledKey,false)) return {status:'DISABLED',type:cfg.type};
  const to = normalizeEmailList_(getConfigValue_(cfg.toKey,''));
  const cc = normalizeEmailList_(getConfigValue_(cfg.ccKey,''));
  const message = buildReferralEmail_(visit,cfg.type,cfg.prefixKey);

  // Atomic creation of one log per Visit ID + type; no MailApp call inside lock.
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let notificationId = '';
  let existingResult = null;
  try {
    clearCache_(SHEETS.NOTIFICATION_LOG);
    const existing = rows_(SHEETS.NOTIFICATION_LOG).find(function(x){
      return String(x['Visit ID'] || '') === String(visitId) &&
        String(x['Notification Type'] || '') === cfg.type;
    });
    if (existing) {
      existingResult = {
        notificationId:String(existing['Notification ID'] || ''),
        status:String(existing.Status || ''),
        type:cfg.type,
        duplicatePrevented:true
      };
    } else {
      notificationId = 'NT'+Utilities.getUuid().replace(/-/g,'').slice(0,16);
      getSheet_(SHEETS.NOTIFICATION_LOG).appendRow([
        notificationId,visitId,cfg.type,'EMAIL',to.join(','),cc.join(','),
        message.subject,'PENDING',0,now_(),'','',s && s.staffId ? s.staffId : 'SYSTEM'
      ]);
      clearCache_(SHEETS.NOTIFICATION_LOG);
    }
  } finally {
    lock.releaseLock();
  }
  if (existingResult) return existingResult;
  return sendNotificationById_(notificationId,s);
}

function getNotificationLog_(p,s) {
  requireRole_(s,['NURSE','ADMIN','MANAGER','SUPER_ADMIN']);
  const limit = Math.min(Math.max(Number(p && p.limit) || 100,1),500);
  const visitId = String(p && p.visitId || '').trim();
  const data = rows_(SHEETS.NOTIFICATION_LOG).filter(function(x){
    return !visitId || String(x['Visit ID'] || '') === visitId;
  }).sort(function(a,b){
    return String(b['Created At'] || '').localeCompare(String(a['Created At'] || ''));
  }).slice(0,limit);
  return {success:true,data:data};
}

function retryNotification_(p,s) {
  requireRole_(s,['NURSE','ADMIN','SUPER_ADMIN']);
  const id = String(p && p.notificationId || '').trim();
  if (!id) throw new Error('INVALID_INPUT');
  // sendNotificationById_ uses ScriptLock for the check+claim. Only a
  // definitive failure can be retried, never SENDING, SENT or UNKNOWN.
  return sendNotificationById_(id,s,true);
}

function sendNotificationById_(notificationId,s,isRetry) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let log, attempt;
  try {
    clearCache_(SHEETS.NOTIFICATION_LOG);
    log = rows_(SHEETS.NOTIFICATION_LOG).find(function(x){
      return String(x['Notification ID'] || '') === notificationId;
    });
    if (!log) throw new Error('NOTIFICATION_NOT_FOUND');
    const status = String(log.Status || '').trim().toUpperCase();
    if (status === 'SENT') {
      if (isRetry) throw new Error('NOTIFICATION_ALREADY_SENT');
      return {notificationId:notificationId,status:'SENT',duplicatePrevented:true};
    }
    if (status === 'SENDING' || status === 'UNKNOWN') {
      if (isRetry) throw new Error('NOTIFICATION_STATUS_UNCERTAIN');
      return {notificationId:notificationId,status:status,duplicatePrevented:true};
    }
    if (isRetry && status !== 'FAILED') throw new Error('NOTIFICATION_RETRY_NOT_ALLOWED');
    if (['PENDING','FAILED'].indexOf(status) < 0) throw new Error('NOTIFICATION_STATUS_INVALID');
    attempt = (Number(log['Attempt Count']) || 0) + 1;
    updateNotificationLog_(notificationId,{
      Status:'SENDING','Attempt Count':attempt,'Error Message':''
    });
  } finally {
    lock.releaseLock();
  }

  let message;
  let to;
  let cc;
  try {
    const visit = getVisitForNotification_(String(log['Visit ID'] || ''));
    const type = String(log['Notification Type'] || '').toUpperCase();
    const cfg = notificationConfigForDisposition_(visit.Disposition);
    if (!cfg || cfg.type !== type) throw new Error('INVALID_NOTIFICATION_VISIT');
    // Manual retries must obey the same active CONFIG switch as first sends.
    if (!getConfigBoolean_(cfg.enabledKey,false)) throw new Error('NOTIFICATION_EMAIL_DISABLED');
    message = buildReferralEmail_(visit,type,cfg.prefixKey);
    to = normalizeEmailList_(String(log.Recipient || ''));
    cc = normalizeEmailList_(String(log.CC || ''));
    if (!to.length && isRetry) {
      // Original failure may have been due to missing CONFIG recipient.
      to = normalizeEmailList_(getConfigValue_(cfg.toKey,''));
      cc = normalizeEmailList_(getConfigValue_(cfg.ccKey,''));
      updateNotificationLog_(notificationId,{Recipient:to.join(','),CC:cc.join(',')});
    }
  } catch (err) {
    const reason = limitedText_(String(err && err.message || err),1000);
    try { updateNotificationLog_(notificationId,{Status:'FAILED','Error Message':reason}); } catch (_) {}
    return {notificationId:notificationId,status:'FAILED',error:reason};
  }

  if (!to.length) {
    updateNotificationLog_(notificationId,{
      Status:'FAILED','Error Message':'NOTIFICATION_RECIPIENT_NOT_CONFIGURED'
    });
    return {notificationId:notificationId,status:'FAILED',error:'NOTIFICATION_RECIPIENT_NOT_CONFIGURED'};
  }

  const options = {
    to:to.join(','),subject:message.subject,body:message.textBody,
    htmlBody:message.htmlBody,name:getConfigValue_('NOTIFICATION_FROM_NAME','BHH Infirmary')
  };
  if (cc.length) options.cc = cc.join(',');
  try {
    MailApp.sendEmail(options);
  } catch (err) {
    // An exception does not prove that delivery did not happen.
    // Safe default: UNKNOWN cannot be automatically resent.
    const reason = limitedText_(String(err && err.message || err || 'MAIL_APP_ERROR'),1000);
    try { updateNotificationLog_(notificationId,{Status:'UNKNOWN','Error Message':reason}); } catch (_) {}
    try { auditSystem_('SEND_NOTIFICATION','NOTIFICATION_LOG',notificationId,'UNKNOWN'); } catch (_) {}
    return {notificationId:notificationId,status:'UNKNOWN',error:reason};
  }

  try {
    updateNotificationLog_(notificationId,{
      Subject:message.subject,Status:'SENT','Sent At':now_(),
      'Error Message':'','Staff ID':s && s.staffId ? s.staffId : String(log['Staff ID'] || 'SYSTEM')
    });
  } catch (err) {
    // Email may already be delivered. Leave SENDING if UNKNOWN cannot be written.
    const reason = 'MAIL_SENT_LOG_UPDATE_FAILED: '+String(err && err.message || err);
    try { updateNotificationLog_(notificationId,{Status:'UNKNOWN','Error Message':reason}); } catch (_) {}
    return {notificationId:notificationId,status:'UNKNOWN',error:reason};
  }
  try { auditSystem_('SEND_NOTIFICATION','NOTIFICATION_LOG',notificationId,'SENT'); } catch (_) {}
  return {notificationId:notificationId,status:'SENT'};
}

// On-demand recovery for visits committed before an outbox row existed.
// Does not resend records already present in the outbox (including UNKNOWN).
function reconcileNotifications_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const limit = Math.min(Math.max(Number(p && p.limit) || 25,1),100);
  clearCache_(SHEETS.NOTIFICATION_LOG);
  const logs = rows_(SHEETS.NOTIFICATION_LOG);
  const known = {};
  logs.forEach(function(x){ known[String(x['Visit ID'] || '')+':'+String(x['Notification Type'] || '')] = true; });
  // Recovery is bounded to an exact 72-hour window; date-only comparison
  // could replay nearly 24 extra hours of historical clinical referral mail.
  // Records without a trustworthy timestamp are held for manual review.
  const cutoff = Utilities.formatDate(new Date(Date.now()-72*3600000),
    getTimeZone_(),'yyyy-MM-dd HH:mm:ss');
  const current = Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd HH:mm:ss');
  const missing = rows_(SHEETS.DISPENSE_HEADER).filter(function(v) {
    const cfg = notificationConfigForDisposition_(v.Disposition);
    const created = String(v['Created At'] || '').trim();
    const combined = String(v['Visit Date'] || '').trim()+' '+String(v['Visit Time'] || '').trim();
    const exact = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(created) ? created :
      (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(combined) ? combined : '');
    return cfg && exact && exact >= cutoff && exact <= current &&
      String(v.Status || '').toUpperCase() === 'COMPLETED' &&
      getConfigBoolean_(cfg.enabledKey,false) &&
      !known[String(v['Visit ID'] || '')+':'+cfg.type];
  }).slice(0,limit);
  const results = [];
  missing.forEach(function(v) {
    try {
      const n = triggerReferralNotificationForVisit_(String(v['Visit ID'] || ''),s);
      results.push({visitId:String(v['Visit ID'] || ''),status:n.status});
    } catch (err) {
      results.push({visitId:String(v['Visit ID'] || ''),status:'FAILED_TO_QUEUE',
        error:String(err && err.message || err)});
    }
  });
  return {success:true,data:{checked:missing.length,results:results}};
}

// If an operator verifies independently that no email was delivered,
// a SUPER_ADMIN can unlock a single uncertain notification for a *manual*
// retry. Such an action is audited; never call this automatically.
function resolveUncertainNotification_(p,s) {
  requireRole_(s,['SUPER_ADMIN']);
  if (String(p && p.confirmation || '') !== 'CONFIRMED_NOT_DELIVERED')
    throw new Error('NOTIFICATION_CONFIRMATION_REQUIRED');
  const id = String(p && p.notificationId || '').trim();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    clearCache_(SHEETS.NOTIFICATION_LOG);
    const row = rows_(SHEETS.NOTIFICATION_LOG).find(function(x){
      return String(x['Notification ID'] || '') === id;
    });
    if (!row || ['SENDING','UNKNOWN'].indexOf(String(row.Status || '').toUpperCase()) < 0)
      throw new Error('NOTIFICATION_STATUS_INVALID');
    updateNotificationLog_(id,{Status:'FAILED',
      'Error Message':'Operator verified NOT delivered; manually unlocked by '+s.staffId});
    audit_(s,'UNLOCK_UNCERTAIN_NOTIFICATION','NOTIFICATION_LOG',id,'SUCCESS');
    return {success:true,data:{notificationId:id,status:'FAILED'}};
  } finally {
    lock.releaseLock();
  }
}

function updateNotificationLog_(notificationId,changes) {
  const sh = getSheet_(SHEETS.NOTIFICATION_LOG);
  const data = sh.getDataRange().getValues();
  if (!data.length) throw new Error('NOTIFICATION_NOT_FOUND');
  const h = headerMap_(data[0]);
  const idx = data.findIndex(function(r,n){
    return n > 0 && String(r[h['Notification ID']] || '') === notificationId;
  });
  if (idx < 1) throw new Error('NOTIFICATION_NOT_FOUND');

  Object.keys(changes || {}).forEach(function(key){
    if (h[key] !== undefined) data[idx][h[key]] = changes[key];
  });
  sh.getRange(idx+1,1,1,data[0].length).setValues([data[idx]]);
  clearCache_(SHEETS.NOTIFICATION_LOG);
}

function getVisitForNotification_(visitId) {
  clearCache_(SHEETS.DISPENSE_HEADER);
  clearCache_(SHEETS.DISPENSE_ITEMS);
  const visit = rows_(SHEETS.DISPENSE_HEADER).find(function(x){
    return String(x['Visit ID'] || '') === String(visitId || '');
  });
  if (!visit) throw new Error('VISIT_NOT_FOUND');
  visit._items = rows_(SHEETS.DISPENSE_ITEMS).filter(function(x){
    return String(x['Visit ID'] || '') === String(visitId || '');
  });
  return visit;
}

function buildReferralEmail_(visit,type,prefixKey) {
  const emergency = type === 'EMERGENCY_TRANSFER';
  const name = String(visit['Recipient Name'] || '').trim() || recipientNameFromLegacyVisit_(visit);
  const timestamp = formatVisitDateForEmail_(visit);
  const configuredPrefix = emailSubjectText_(getConfigValue_(prefixKey,''));
  const defaultPrefix = emergency ? '[URGENT][BHH Infirmary] Emergency Transfer' : '[BHH Infirmary] Refer Hospital';
  const prefix = configuredPrefix || defaultPrefix;
  const subject = prefix + ' | ' + emailSubjectText_(name || 'Unknown recipient') + ' | ' + emailSubjectText_(timestamp);

  const statusTitle = emergency ? 'EMERGENCY TRANSFER' : 'ส่งต่อโรงพยาบาล — REFER HOSPITAL';
  const statusDetail = emergency
    ? 'การส่งต่อฉุกเฉิน — กรุณาตรวจสอบข้อมูลและดำเนินการตาม Emergency Referral Workflow'
    : 'ผู้รับบริการได้รับการประเมินและมีแผนส่งต่อเพื่อรับการดูแลต่อที่โรงพยาบาล';
  const bannerBg = emergency ? '#FDECEC' : '#FFF3CD';
  const bannerText = emergency ? '#B91C1C' : '#B45309';

  const symptoms = parseJsonArray_(visit.Symptoms);
  const categories = parseJsonArray_(visit['Symptom Categories']);
  const alert = String(visit['Clinical Alert Level'] || '').trim().toUpperCase();
  const interventions = parseJsonArray_(visit.Interventions).map(interventionLabel_);
  const items = Array.isArray(visit._items) ? visit._items : [];

  const recipientType = String(visit['Recipient Type'] || (visit['Student ID'] ? 'STUDENT' : 'OTHER')).trim().toUpperCase();
  const recipientId = String(visit['Recipient ID'] || visit['Student ID'] || '').trim();
  const departmentClass = String(visit['Recipient Department/Class'] || '').trim();

  const vitalRows = [];
  pushVitalRow_(vitalRows,'Temperature',visit.Temperature,'°C');
  const bpSys = String(visit['BP Systolic'] === undefined ? '' : visit['BP Systolic']).trim();
  const bpDia = String(visit['BP Diastolic'] === undefined ? '' : visit['BP Diastolic']).trim();
  if (bpSys || bpDia) vitalRows.push(['Blood Pressure',(bpSys || '—')+'/'+(bpDia || '—')+' mmHg']);
  pushVitalRow_(vitalRows,'Pulse',visit.Pulse,'bpm');
  pushVitalRow_(vitalRows,'Respiratory Rate',visit['Respiratory Rate'],'/min');
  pushVitalRow_(vitalRows,'SpO₂',visit.SpO2,'%');
  pushVitalRow_(vitalRows,'Weight',visit.Weight,'kg');

  const symptomHtml = symptoms.length
    ? '<ul style="margin:6px 0 0 20px;padding:0;">'+symptoms.map(function(x){return '<li>'+escapeHtml_(x)+'</li>';}).join('')+'</ul>'
    : '<div style="color:#64748b;">—</div>';

  const interventionHtml = interventions.length
    ? '<ul style="margin:6px 0 0 20px;padding:0;">'+interventions.map(function(x){return '<li>'+escapeHtml_(x)+'</li>';}).join('')+'</ul>'
    : '<div style="color:#64748b;">—</div>';

  const medicationHtml = items.length
    ? '<ul style="margin:6px 0 0 20px;padding:0;">'+items.map(function(x){
        return '<li>'+escapeHtml_(String(x['Item Name'] || x['Item Code'] || ''))+
          ' — '+escapeHtml_(String(x.Qty || ''))+' '+escapeHtml_(String(x.Unit || ''))+'</li>';
      }).join('')+'</ul>'
    : '<div style="color:#64748b;">ไม่มีการจ่ายยา/เวชภัณฑ์</div>';

  const vitalHtml = vitalRows.length
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">'+
      vitalRows.map(function(r){
        return '<tr><td style="padding:8px;border-bottom:1px solid #D9E2EC;color:#475569;width:45%;">'+escapeHtml_(r[0])+
          '</td><td style="padding:8px;border-bottom:1px solid #D9E2EC;font-weight:700;color:#243447;">'+escapeHtml_(r[1])+'</td></tr>';
      }).join('')+'</table>'
    : '<div style="color:#64748b;">—</div>';

  const htmlBody =
    '<!doctype html><html><body style="margin:0;padding:0;background:#F4F7FA;font-family:Arial,Tahoma,sans-serif;color:#243447;">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:20px 8px;"><tr><td align="center">'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-collapse:collapse;border:1px solid #D9E2EC;">'+
    '<tr><td style="background:#0B1F3A;color:#fff;padding:20px 24px;"><div style="font-size:22px;font-weight:700;">BHH INFIRMARY</div><div style="font-size:14px;margin-top:4px;">'+
      (emergency ? 'Emergency Transfer Notification' : 'Clinical Referral Notification')+'</div></td></tr>'+
    '<tr><td style="padding:16px 20px;"><div style="background:'+bannerBg+';color:'+bannerText+';border:1px solid '+bannerText+';border-radius:8px;padding:14px 16px;">'+
      '<div style="font-size:18px;font-weight:700;">'+escapeHtml_(statusTitle)+'</div><div style="font-size:13px;margin-top:6px;line-height:1.5;">'+escapeHtml_(statusDetail)+'</div></div></td></tr>'+
    '<tr><td style="padding:0 20px 16px;"><div style="border:1px solid #D9E2EC;border-radius:8px;padding:16px;background:#fff;">'+
      '<div style="font-weight:700;color:#0B1F3A;margin-bottom:10px;">ผู้มารับบริการ</div>'+
      infoRowHtml_('ชื่อ-นามสกุล',name)+infoRowHtml_('ประเภท',recipientType)+
      infoRowHtml_(recipientType === 'STUDENT' ? 'Student ID' : 'Staff/Reference ID',recipientId || '—')+
      infoRowHtml_(recipientType === 'STUDENT' ? 'ชั้น' : 'Department',departmentClass || '—')+
      infoRowHtml_('Visit ID',String(visit['Visit ID'] || ''))+infoRowHtml_('วันที่/เวลา',timestamp)+
    '</div></td></tr>'+
    emailSectionHtml_('อาการสำคัญ',symptomHtml)+
    (alert && alert !== 'NORMAL' ? emailSectionHtml_('Clinical Alert','<div style="font-weight:700;color:'+(alert === 'EMERGENCY' ? '#B91C1C' : '#B45309')+';">'+escapeHtml_(alert)+'</div>') : '')+
    emailSectionHtml_('Vital Signs',vitalHtml)+
    emailSectionHtml_('Assessment','<div style="white-space:pre-wrap;">'+escapeHtml_(String(visit.Assessment || '—'))+'</div>')+
    emailSectionHtml_('Interventions',interventionHtml)+
    emailSectionHtml_('Medication / Medical Supply',medicationHtml)+
    '<tr><td style="padding:0 20px 16px;"><div style="border:1px solid '+bannerText+';border-radius:8px;padding:14px 16px;background:'+bannerBg+';">'+
      '<div style="font-weight:700;margin-bottom:6px;">'+(emergency ? 'Emergency Transfer Note' : 'Referral / Transfer Note')+'</div>'+
      '<div style="white-space:pre-wrap;">'+escapeHtml_(String(visit['Outcome Note'] || '—'))+'</div></div></td></tr>'+
    '<tr><td style="padding:0 20px 18px;font-size:13px;color:#475569;">'+
      '<div>Recorded by: '+escapeHtml_(String(visit['Staff ID'] || ''))+'</div>'+
      '<div>Disposition: '+escapeHtml_(String(visit.Disposition || ''))+'</div>'+
      (categories.length ? '<div>Visit category: '+escapeHtml_(String(visit['Derived Visit Category'] || categories.join(', ')))+'</div>' : '')+
    '</td></tr>'+
    '<tr><td style="background:#F4F7FA;border-top:1px solid #D9E2EC;padding:16px 20px;font-size:12px;line-height:1.5;color:#64748b;">'+
      'อีเมลฉบับนี้สร้างอัตโนมัติจากระบบ BHH Infirmary<br>กรุณาตรวจสอบข้อมูลในระบบหากต้องการรายละเอียดเพิ่มเติม'+
    '</td></tr></table></td></tr></table></body></html>';

  const textLines = [
    'BHH INFIRMARY',
    emergency ? 'EMERGENCY TRANSFER NOTIFICATION' : 'Clinical Referral Notification',
    statusTitle,
    '',
    'ชื่อ-นามสกุล: '+name,
    'ประเภท: '+recipientType,
    'ID: '+recipientId,
    'Department/Class: '+departmentClass,
    'Visit ID: '+String(visit['Visit ID'] || ''),
    'วันที่/เวลา: '+timestamp,
    '',
    'อาการสำคัญ: '+(symptoms.join(', ') || '—'),
    'Clinical Alert: '+(alert || 'NORMAL'),
    'Vital Signs: '+(vitalRows.map(function(r){return r[0]+' '+r[1];}).join(' | ') || '—'),
    'Assessment: '+String(visit.Assessment || '—'),
    'Interventions: '+(interventions.join(', ') || '—'),
    'Medication / Supply: '+(items.map(function(x){return String(x['Item Name'] || x['Item Code'] || '')+' '+String(x.Qty || '')+' '+String(x.Unit || '');}).join(', ') || 'ไม่มีการจ่ายยา/เวชภัณฑ์'),
    'Referral / Transfer Note: '+String(visit['Outcome Note'] || '—'),
    '',
    'Recorded by: '+String(visit['Staff ID'] || ''),
    'อีเมลฉบับนี้สร้างอัตโนมัติจากระบบ BHH Infirmary'
  ];

  return {subject:subject,htmlBody:htmlBody,textBody:textLines.join('\n')};
}

function emailSectionHtml_(title,contentHtml) {
  return '<tr><td style="padding:0 20px 16px;"><div style="font-weight:700;color:#0B1F3A;margin-bottom:6px;">'+
    escapeHtml_(title)+'</div><div style="border-top:1px solid #D9E2EC;padding-top:8px;line-height:1.6;">'+contentHtml+'</div></td></tr>';
}

function infoRowHtml_(label,value) {
  return '<div style="display:block;padding:4px 0;"><span style="display:inline-block;min-width:145px;color:#64748b;">'+
    escapeHtml_(label)+'</span><strong>'+escapeHtml_(String(value || '—'))+'</strong></div>';
}

function pushVitalRow_(rows,label,value,unit) {
  const s = String(value === undefined || value === null ? '' : value).trim();
  if (!s) return;
  rows.push([label,s+(unit ? ' '+unit : '')]);
}

function parseJsonArray_(value) {
  let out = [];
  try { out = JSON.parse(String(value || '[]')); } catch(e) {}
  return Array.isArray(out) ? out : [];
}

function interventionLabel_(code) {
  const map = {
    REST:'Rest / พักสังเกตอาการ',
    WOUND_CARE:'Wound care / ทำแผล',
    COLD_COMPRESS:'Cold compress / ประคบเย็น',
    WARM_COMPRESS:'Warm compress / ประคบอุ่น',
    ORAL_HYDRATION:'Oral hydration / ให้ดื่มน้ำ',
    FIRST_AID:'First aid / ปฐมพยาบาล',
    MEDICATION:'Medication',
    MEDICAL_SUPPLY:'Medical supply',
    PARENT_CONTACTED:'Parent contacted / ติดต่อผู้ปกครอง',
    REFERRED:'Referred / ส่งต่อ'
  };
  return map[String(code || '').toUpperCase()] || String(code || '');
}

function recipientNameFromLegacyVisit_(visit) {
  const studentId = String(visit && visit['Student ID'] || '').trim();
  if (!studentId) return '';
  const student = rows_(SHEETS.STUDENTS).find(function(x){
    return String(x['Student ID'] || '').trim() === studentId;
  });
  return student ? String(student['Full Name'] || ((student['First Name'] || '')+' '+(student['Last Name'] || '')).trim()) : '';
}

function normalizeEmailList_(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  const seen = {};
  return raw.split(/[;,\s]+/).map(function(x){return x.trim();}).filter(function(x){
    if (!x || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) return false;
    const key = x.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function getConfigValue_(key,fallback) {
  const row = rows_(SHEETS.CONFIG).find(function(x){
    return String(x['Config Key'] || '') === String(key || '') && isActive_(x.Active);
  });
  return row ? String(row['Config Value'] === undefined ? '' : row['Config Value']) : String(fallback === undefined ? '' : fallback);
}

function getConfigBoolean_(key,fallback) {
  const value = getConfigValue_(key,fallback ? 'true' : 'false').trim().toUpperCase();
  return ['TRUE','1','YES','Y','ON'].indexOf(value) >= 0;
}

function formatVisitDateForEmail_(visit) {
  const date = String(visit && visit['Visit Date'] || '').trim();
  const time = String(visit && visit['Visit Time'] || '').trim().slice(0,5);
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return (date+' '+time).trim();
  const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
  return Number(m[3])+' '+months[Number(m[2])-1]+' '+(Number(m[1])+543)+' '+time;
}

function escapeHtml_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}


function emailSubjectText_(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s{2,}/g,' ')
    .trim()
    .slice(0,300);
}
