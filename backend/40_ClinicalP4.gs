/* P4 — Controlled symptom catalog and visit classification. */

const SYMPTOM_CATEGORIES = ['TRAUMA','NON_TRAUMA','OTHER'];
const CLINICAL_ALERT_LEVELS = ['NORMAL','CAUTION','URGENT','EMERGENCY'];

function getSymptoms_(p,s) {
  requireRole_(s,['NURSE','ADMIN','MANAGER','SUPER_ADMIN']);
  const rows = rows_(SHEETS.SYMPTOMS).filter(function(x){
    const category = String(x.Category || '').trim().toUpperCase();
    return isActive_(x.Active) && SYMPTOM_CATEGORIES.indexOf(category) >= 0;
  }).map(function(x){
    const category = String(x.Category || '').trim().toUpperCase();
    const alert = String(x['Clinical Alert Level'] || 'NORMAL').trim().toUpperCase();
    return {
      symptomId:String(x['Symptom ID'] || '').trim(),
      symptom:String(x.Symptom || '').trim(),
      category:category,
      clinicalAlertLevel:CLINICAL_ALERT_LEVELS.indexOf(alert) >= 0 ? alert : 'NORMAL',
      sortOrder:Number(x['Sort Order']) || 999
    };
  }).sort(function(a,b){
    return a.sortOrder-b.sortOrder || a.symptom.localeCompare(b.symptom);
  });
  return {success:true,data:rows};
}

function seedDefaultSymptoms_() {
  const sh = getSheet_(SHEETS.SYMPTOMS);
  ensureHeaders_(sh,HEADERS.SYMPTOMS);

  const seed = [
    ['NT001','ไข้','NON_TRAUMA',true,10,'NORMAL'],
    ['NT002','ไข้หวัด มีน้ำมูก คัดจมูก','NON_TRAUMA',true,20,'NORMAL'],
    ['NT003','ปวดศีรษะ','NON_TRAUMA',true,30,'NORMAL'],
    ['NT004','วิงเวียนศีรษะ / วัดความดัน','NON_TRAUMA',true,40,'NORMAL'],
    ['NT005','เป็นลม วูบ เพลีย','NON_TRAUMA',true,50,'NORMAL'],
    ['NT006','ซึมเศร้า วิตกกังวล เครียด','NON_TRAUMA',true,60,'NORMAL'],
    ['NT007','ปวดท้อง ท้องอืด จุกเสียด แน่นท้อง','NON_TRAUMA',true,70,'NORMAL'],
    ['NT008','ท้องเสีย คลื่นไส้อาเจียน','NON_TRAUMA',true,80,'NORMAL'],
    ['NT009','ปวดประจำเดือน','NON_TRAUMA',true,90,'NORMAL'],
    ['NT010','ผื่นคัน ตุ่มน้ำ ตุ่มพอง','NON_TRAUMA',true,100,'NORMAL'],
    ['NT011','ผื่นคัน ผื่นแพ้','NON_TRAUMA',true,110,'NORMAL'],
    ['NT012','หอบหืด','NON_TRAUMA',true,120,'NORMAL'],
    ['NT013','ชักเกร็ง','NON_TRAUMA',true,130,'EMERGENCY'],
    ['NT014','เจ็บหน้าอก','NON_TRAUMA',true,140,'URGENT'],
    ['NT015','อาการแพ้รุนแรง','NON_TRAUMA',true,150,'EMERGENCY'],
    ['TR001','บาดแผล','TRAUMA',true,210,'NORMAL'],
    ['TR002','บาดแผลจากความร้อน','TRAUMA',true,220,'NORMAL'],
    ['TR003','ปวดกล้ามเนื้อ ฟกช้ำ','TRAUMA',true,230,'NORMAL'],
    ['TR004','ข้อเคล็ด','TRAUMA',true,240,'NORMAL'],
    ['TR005','ข้อเคลื่อน','TRAUMA',true,250,'NORMAL'],
    ['TR006','กระดูกหัก','TRAUMA',true,260,'NORMAL'],
    ['TR007','ทำแผลต่อเนื่อง','TRAUMA',true,270,'NORMAL'],
    ['OT001','แมลงกัดต่อย','OTHER',true,310,'NORMAL'],
    ['OT002','ระคายเคืองตา','OTHER',true,320,'NORMAL'],
    ['OT003','ปวดภายในหู','OTHER',true,330,'NORMAL'],
    ['OT004','ปวดฟัน / ฟันหัก','OTHER',true,340,'NORMAL'],
    ['OT005','แผลในปาก','OTHER',true,350,'NORMAL'],
    ['OT006','เลือดกำเดาไหล','OTHER',true,360,'NORMAL']
  ];

  // Production-safe migration: preserve every existing symptom row and append
  // only P4 catalog IDs that are missing. Never overwrite historical/custom rows.
  const existing = rows_(SHEETS.SYMPTOMS);
  const existingIds = {};
  existing.forEach(function(row){
    const id = String(row['Symptom ID'] || '').trim();
    if (id) existingIds[id] = true;
  });

  const t = now_();
  const currentHeaders = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const missingRows = seed.filter(function(x){
    return !existingIds[String(x[0])];
  }).map(function(x){
    const obj = {
      'Symptom ID':x[0],
      'Symptom':x[1],
      'Category':x[2],
      'Active':x[3],
      'Sort Order':x[4],
      'Clinical Alert Level':x[5],
      'Updated At':t,
      'Updated By':'SYSTEM'
    };
    return currentHeaders.map(function(h){
      return Object.prototype.hasOwnProperty.call(obj,h) ? obj[h] : '';
    });
  });

  if (missingRows.length) {
    sh.getRange(sh.getLastRow()+1,1,missingRows.length,currentHeaders.length).setValues(missingRows);
    clearCache_(SHEETS.SYMPTOMS);
  }
}

function resolveVisitSymptoms_(p) {
  const catalog = rows_(SHEETS.SYMPTOMS).filter(function(x){ return isActive_(x.Active); });
  const byId = {};
  const byName = {};
  catalog.forEach(function(x){
    byId[String(x['Symptom ID'] || '').trim()] = x;
    byName[String(x.Symptom || '').trim()] = x;
  });

  const requestedIds = (Array.isArray(p && p.symptomIds) ? p.symptomIds : [])
    .map(function(x){ return String(x || '').trim(); }).filter(Boolean);
  const legacyNames = (Array.isArray(p && p.symptoms) ? p.symptoms : [])
    .map(function(x){ return String(x || '').trim(); }).filter(Boolean);

  const selected = [];
  if (requestedIds.length) {
    requestedIds.forEach(function(id){
      const row = byId[id];
      if (!row) throw new Error('INVALID_SYMPTOM');
      selected.push(row);
    });
  } else if (legacyNames.length) {
    legacyNames.forEach(function(name){
      const row = byName[name];
      if (!row) throw new Error('INVALID_SYMPTOM');
      selected.push(row);
    });
  }

  const ids = [];
  const names = [];
  const categories = [];
  let alert = 'NORMAL';
  selected.forEach(function(row){
    const id = String(row['Symptom ID'] || '').trim();
    const name = String(row.Symptom || '').trim();
    const category = String(row.Category || '').trim().toUpperCase();
    const level = String(row['Clinical Alert Level'] || 'NORMAL').trim().toUpperCase();
    if (id && ids.indexOf(id) < 0) ids.push(id);
    if (name && names.indexOf(name) < 0) names.push(name);
    if (SYMPTOM_CATEGORIES.indexOf(category) < 0) throw new Error('INVALID_SYMPTOM_CATEGORY');
    if (categories.indexOf(category) < 0) categories.push(category);
    if (clinicalAlertRank_(level) > clinicalAlertRank_(alert)) alert = level;
  });

  return {
    symptomIds:ids,
    symptoms:names,
    categories:categories,
    derivedCategory:deriveVisitCategory_(categories),
    clinicalAlertLevel:alert
  };
}

function deriveVisitCategory_(categories) {
  if (categories.indexOf('TRAUMA') >= 0) return 'TRAUMA';
  if (categories.indexOf('NON_TRAUMA') >= 0) return 'NON_TRAUMA';
  if (categories.indexOf('OTHER') >= 0) return 'OTHER';
  return '';
}

function clinicalAlertRank_(level) {
  const idx = CLINICAL_ALERT_LEVELS.indexOf(String(level || '').trim().toUpperCase());
  return idx < 0 ? 0 : idx;
}

function categoryForLegacySymptoms_(visit) {
  const categories = [];
  let names = [];
  try { names = JSON.parse(String(visit && visit.Symptoms || '[]')); } catch(e) {}
  if (!Array.isArray(names)) names = [names];
  const catalog = rows_(SHEETS.SYMPTOMS);
  names.forEach(function(name){
    const row = catalog.find(function(x){ return String(x.Symptom || '').trim() === String(name || '').trim(); });
    if (!row) return;
    const category = String(row.Category || '').trim().toUpperCase();
    if (SYMPTOM_CATEGORIES.indexOf(category) >= 0 && categories.indexOf(category) < 0) categories.push(category);
  });
  return categories;
}
