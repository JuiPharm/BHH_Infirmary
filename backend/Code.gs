const SHEETS = {
  CONFIG:'CONFIG', USERS:'USERS', STUDENTS:'STUDENTS', ITEM_MASTER:'ITEM_MASTER',
  STOCK_LOT:'STOCK_LOT', DISPENSE_HEADER:'DISPENSE_HEADER', DISPENSE_ITEMS:'DISPENSE_ITEMS',
  STOCK_TRANSACTION:'STOCK_TRANSACTION', SYMPTOMS:'SYMPTOMS', AUDIT_LOG:'AUDIT_LOG'
};

const HEADERS = {
  CONFIG:['Config Key','Config Value','Data Type','Description','Active','Updated At','Updated By'],
  USERS:['Staff ID','Name','Role','Password Hash','Active','Last Login','Created At','Updated At'],
  STUDENTS:['Student ID','First Name','Last Name','Full Name','Grade','Class','Gender','Status','Updated At'],
  ITEM_MASTER:['Item Code','Item Type','Generic Name','Trade Name','QTY','Unit','Minimum Stock','Maximum Stock','Unit Cost','Active/Inactive'],
  STOCK_LOT:['Stock Lot ID','Item Code','Lot Number','Expiry Date','Received Date','Received Qty','Current Qty','Unit Cost','Supplier','Status'],
  DISPENSE_HEADER:['Visit ID','Student ID','Visit Date','Visit Time','Symptoms','Other Symptom','Note','Staff ID','Status','Created At','Client Transaction ID'],
  DISPENSE_ITEMS:['Dispense Item ID','Visit ID','Item Code','Item Type','Item Name','Qty','Unit','Created At'],
  STOCK_TRANSACTION:['Transaction ID','Transaction Type','Reference ID','Item Code','Stock Lot ID','Qty','Before Qty','After Qty','Unit Cost','Reason','Staff ID','Timestamp'],
  SYMPTOMS:['Symptom ID','Symptom','Category','Active'],
  AUDIT_LOG:['Log ID','Timestamp','Staff ID','Action','Module','Reference ID','Result','Client Info','User Agent']
};

const ROLES = ['NURSE','ADMIN','MANAGER','SUPER_ADMIN'];

function doGet(e) {
  return out_({success:true,service:'School Nurse System API',timestamp:now_()});
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const req = JSON.parse(body);
    return out_(route_(req));
  } catch (err) {
    return out_(errorResponse_(err));
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function route_(r) {
  r = r || {};
  const action = String(r.action || '');
  if (action === 'setupSystem') return setupSystem();
  if (action === 'seedUser') return seedUser();
  if (action === 'login') return login_(r.payload || {});
  if (action === 'logout') return logout_(r.token);
  const session = requireSession_(r.token);

  switch (action) {
    case 'getSession': return {success:true,data:session};
    case 'searchStudents': return searchStudents_(r.payload || {});
    case 'getStudent': return getStudent_(r.payload || {});
    case 'getStudentHistory': return getStudentHistory_(r.payload || {}, session);
    case 'getItems': return getItems_(r.payload || {});
    case 'submitDispense': return submitDispense_(r.payload || {}, session);
    case 'getDispenseHistory': return getDispenseHistory_(r.payload || {}, session);
    case 'getStock': return getStock_(r.payload || {}, session);
    case 'getStockLots': return getStockLots_(r.payload || {}, session);
    case 'receiveStock': return receiveStock_(r.payload || {}, session);
    case 'adjustStock': return adjustStock_(r.payload || {}, session);
    case 'getStockTransactions': return getStockTransactions_(r.payload || {}, session);
    case 'getDashboardSummary': return getDashboardSummary_(session);
    case 'getVisitTrend': return getVisitTrend_(r.payload || {}, session);
    case 'getTopSymptoms': return getTopSymptoms_(r.payload || {}, session);
    case 'getTopItems': return getTopItems_(r.payload || {}, session);
    case 'getLowStock': return getLowStock_(session);
    case 'getExpiryAlerts': return getExpiryAlerts_(r.payload || {}, session);
    case 'getUsers': return getUsers_(session);
    case 'createUser': return createUser_(r.payload || {}, session);
    case 'updateUser': return updateUser_(r.payload || {}, session);
    case 'deactivateUser': return deactivateUser_(r.payload || {}, session);
    case 'resetPassword': return resetPassword_(r.payload || {}, session);
    case 'importStudents': return importStudents_(r.payload || {}, session);
    case 'importItems': return importItems_(r.payload || {}, session);
    case 'getConfig': return getConfig_(session);
    case 'updateConfig': return updateConfig_(r.payload || {}, session);
    default: throw new Error('UNKNOWN_ACTION');
  }
}

/* =========================
   SETUP / CONFIG
========================= */

function setupSystem() {
  const ss = getSpreadsheet_();
  Object.keys(HEADERS).forEach(function(name) {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    ensureHeaders_(sh, HEADERS[name]);
  });
  setDefaultConfigs_();
  return {success:true,message:'System schema ready',spreadsheetId:ss.getId()};
}

function setDefaultConfigs_() {
  const sh = getSheet_(SHEETS.CONFIG);
  const existing = rows_(SHEETS.CONFIG);
  const keys = {
    LOW_STOCK_EMAIL_ENABLED:'false',
    LOW_STOCK_EMAIL:'',
    EXPIRY_ALERT_DAYS:'90',
    MONTHLY_DRUG_BUDGET:'0',
    MONTHLY_SUPPLY_BUDGET:'0'
  };
  const existingKeys = {};
  existing.forEach(function(r){ existingKeys[String(r['Config Key'])] = true; });
  Object.keys(keys).forEach(function(k){
    if (!existingKeys[k]) {
      sh.appendRow([k,keys[k],k.indexOf('BUDGET')>=0?'NUMBER':(k.indexOf('DAYS')>=0?'NUMBER':'BOOLEAN'),
        '',true,now_(),'SYSTEM']);
    }
  });
}

/*
  Initial admin bootstrap.
  Set Script Properties first:
  INITIAL_ADMIN_ID
  INITIAL_ADMIN_NAME
  INITIAL_ADMIN_PASSWORD
  INITIAL_ADMIN_ROLE   (default ADMIN)
*/
function seedUser() {
  const props = PropertiesService.getScriptProperties();
  const staffId = String(props.getProperty('INITIAL_ADMIN_ID') || '').trim();
  const name = String(props.getProperty('INITIAL_ADMIN_NAME') || '').trim();
  const password = String(props.getProperty('INITIAL_ADMIN_PASSWORD') || '');
  const role = String(props.getProperty('INITIAL_ADMIN_ROLE') || 'ADMIN').trim().toUpperCase();

  if (!staffId) throw new Error('INITIAL_ADMIN_ID_NOT_SET');
  if (!name) throw new Error('INITIAL_ADMIN_NAME_NOT_SET');
  if (!password) throw new Error('INITIAL_ADMIN_PASSWORD_NOT_SET');
  validateRole_(role);

  const sh = getSheet_(SHEETS.USERS);
  formatTextColumns_(sh, HEADERS.USERS);
  const users = rows_(SHEETS.USERS);
  const existing = users.find(function(u){ return String(u['Staff ID']).trim() === staffId; });

  if (existing) {
    throw new Error('USER_ALREADY_EXISTS');
  }

  const salt = Utilities.getUuid().replace(/-/g,'').slice(0,16);
  const passwordHash = salt + '$' + hash_(password,salt);
  const t = now_();

  sh.appendRow([staffId,name,role,passwordHash,true,'',t,t]);
  auditSystem_('CREATE_USER','USERS',staffId,'SUCCESS');
  return {success:true,message:'Initial user created',data:{staffId:staffId,name:name,role:role}};
}

/* =========================
   AUTH
========================= */

function login_(p) {
  const staffId = String(p.staffId || '').trim();
  const password = String(p.password || '');
  if (!staffId || !password) throw new Error('INVALID_CREDENTIALS');

  const users = rows_(SHEETS.USERS);
  const u = users.find(function(x){
    return String(x['Staff ID']).trim() === staffId && isActive_(x.Active);
  });
  if (!u) throw new Error('INVALID_CREDENTIALS');

  const parts = String(u['Password Hash'] || '').split('$');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('INVALID_CREDENTIALS');
  if (hash_(password,parts[0]) !== parts[1]) throw new Error('INVALID_CREDENTIALS');

  const role = String(u.Role || '').trim().toUpperCase();
  if (ROLES.indexOf(role) < 0) throw new Error('INVALID_USER_ROLE');

  const token = Utilities.getUuid()+'.'+Utilities.getUuid();
  const session = {
    token:token,
    staffId:staffId,
    name:String(u.Name || ''),
    role:role
  };
  CacheService.getScriptCache().put('sess:'+token,JSON.stringify(session),21600);

  updateUserLastLogin_(staffId);
  auditSystem_('LOGIN','AUTH',staffId,'SUCCESS');
  return {success:true,data:session};
}

function logout_(token) {
  if (token) CacheService.getScriptCache().remove('sess:'+token);
  return {success:true};
}

function requireSession_(token) {
  const t = String(token || '').trim();
  if (!t) throw new Error('AUTH_REQUIRED');
  const cached = CacheService.getScriptCache().get('sess:'+t);
  if (!cached) throw new Error('INVALID_SESSION');
  return JSON.parse(cached);
}

function hash_(password,salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(password)+String(salt),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes);
}

/* =========================
   STUDENTS / ITEMS
========================= */

function searchStudents_(p) {
  const q = String(p.q || '').trim().toLowerCase();
  if (!q) return {success:true,data:[]};

  const out = rows_(SHEETS.STUDENTS).filter(function(x){
    return ['Student ID','First Name','Last Name','Full Name','Grade','Class'].some(function(k){
      return String(x[k] || '').toLowerCase().indexOf(q) >= 0;
    }) && isActiveStatus_(x.Status);
  }).slice(0,20);

  return {
    success:true,
    data:out.map(function(x){
      return {
        studentId:String(x['Student ID'] || ''),
        firstName:String(x['First Name'] || ''),
        lastName:String(x['Last Name'] || ''),
        fullName:String(x['Full Name'] || ((x['First Name'] || '')+' '+(x['Last Name'] || '')).trim()),
        grade:String(x.Grade || ''),
        className:String(x.Class || ''),
        gender:String(x.Gender || ''),
        status:String(x.Status || '')
      };
    })
  };
}

function getStudent_(p) {
  const id = String(p.studentId || '').trim();
  if (!id) throw new Error('INVALID_INPUT');
  const student = rows_(SHEETS.STUDENTS).find(function(x){
    return String(x['Student ID'] || '').trim() === id;
  });
  if (!student) throw new Error('STUDENT_NOT_FOUND');
  return {success:true,data:student};
}

function getStudentHistory_(p,s) {
  if (!['NURSE','ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  const id = String(p.studentId || '').trim();
  if (!id) throw new Error('INVALID_INPUT');
  const headers = rows_(SHEETS.DISPENSE_HEADER).filter(function(x){
    return String(x['Student ID'] || '') === id;
  }).sort(function(a,b){
    return String(b['Created At']).localeCompare(String(a['Created At']));
  });
  const details = rows_(SHEETS.DISPENSE_ITEMS);
  return {
    success:true,
    data:headers.map(function(h){
      return Object.assign({},h,{
        items:details.filter(function(d){return String(d['Visit ID'])===String(h['Visit ID']);})
      });
    })
  };
}

function getItems_(p) {
  const q = String(p.q || '').trim().toLowerCase();
  const data = rows_(SHEETS.ITEM_MASTER).filter(function(x){
    return isActive_(x['Active/Inactive']) &&
      (!q || ['Item Code','Generic Name','Trade Name'].some(function(k){
        return String(x[k] || '').toLowerCase().indexOf(q) >= 0;
      }));
  }).slice(0,50);

  return {success:true,data:data};
}

/* =========================
   DISPENSING
========================= */

function submitDispense_(p,s) {
  if (!['NURSE','ADMIN','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');

  const studentId = String(p.studentId || '').trim();
  const clientTx = String(p.clientTransactionId || '').trim();
  if (!studentId || !Array.isArray(p.items) || !p.items.length || !clientTx) {
    throw new Error('INVALID_INPUT');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = getSpreadsheet_();
    const header = getSheet_(SHEETS.DISPENSE_HEADER);
    const detail = getSheet_(SHEETS.DISPENSE_ITEMS);
    const txn = getSheet_(SHEETS.STOCK_TRANSACTION);
    const lotSheet = getSheet_(SHEETS.STOCK_LOT);

    if (rows_(SHEETS.DISPENSE_HEADER).some(function(x){
      return String(x['Client Transaction ID'] || '') === clientTx;
    })) {
      throw new Error('DUPLICATE_TRANSACTION');
    }

    if (!studentExists_(studentId)) throw new Error('STUDENT_NOT_FOUND');

    const masterRows = rows_(SHEETS.ITEM_MASTER);
    const lotData = lotSheet.getDataRange().getValues();
    if (!lotData.length) throw new Error('STOCK_SCHEMA_ERROR');

    const lh = headerMap_(lotData[0]);
    const plans = [];
    const requestedByItem = {};

    p.items.forEach(function(raw) {
      const itemCode = String(raw.itemCode || '').trim();
      const qty = Number(raw.qty);
      if (!itemCode || !Number.isInteger(qty) || qty <= 0) throw new Error('INVALID_QTY');

      requestedByItem[itemCode] = (requestedByItem[itemCode] || 0) + qty;

      const master = masterRows.find(function(m){
        return String(m['Item Code'] || '') === itemCode && isActive_(m['Active/Inactive']);
      });
      if (!master) throw new Error('ITEM_NOT_FOUND');

      const eligible = [];
      for (let i=1;i<lotData.length;i++) {
        const r = lotData[i];
        if (String(r[lh['Item Code']] || '') !== itemCode) continue;
        if (String(r[lh['Status']] || '').toUpperCase() === 'INACTIVE') continue;

        const current = Number(r[lh['Current Qty']]) || 0;
        const expiry = parseDate_(r[lh['Expiry Date']]);
        if (current > 0 && expiry && !isNaN(expiry.getTime()) && expiry >= new Date()) {
          eligible.push({
            row:i,
            lotId:String(r[lh['Stock Lot ID']] || ''),
            expiryDate:expiry,
            expiry:String(r[lh['Expiry Date']] || ''),
            current:current,
            unitCost:Number(r[lh['Unit Cost']]) || Number(master['Unit Cost']) || 0
          });
        }
      }

      eligible.sort(function(a,b){
        return a.expiryDate.getTime()-b.expiryDate.getTime() ||
               a.lotId.localeCompare(b.lotId);
      });

      const available = eligible.reduce(function(sum,x){return sum+x.current;},0);
      if (qty > available) throw new Error('INSUFFICIENT_STOCK');

      let left = qty;
      const allocations = [];
      eligible.forEach(function(lot){
        if (left <= 0) return;
        const n = Math.min(left,lot.current);
        allocations.push(Object.assign({},lot,{qty:n}));
        left -= n;
      });

      if (left !== 0) throw new Error('STOCK_ALLOCATION_FAILED');
      plans.push({raw:raw,master:master,allocations:allocations});
    });

    const lotSnapshot = lotData.map(function(r){return r.slice();});
    const visitId = 'V'+Utilities.getUuid().replace(/-/g,'').slice(0,16);
    const t = now_();
    const drows = [];
    const trows = [];

    plans.forEach(function(plan){
      plan.allocations.forEach(function(a){
        const r = lotData[a.row];
        const before = Number(r[lh['Current Qty']]) || 0;
        const after = before - a.qty;
        if (after < 0) throw new Error('STOCK_CHANGED');

        r[lh['Current Qty']] = after;

        const itemName = (plan.master['Trade Name'] && plan.master['Generic Name'])
          ? (plan.master['Trade Name'] + ' (' + plan.master['Generic Name'] + ')')
          : (plan.master['Trade Name'] || plan.master['Generic Name'] || plan.raw.itemName || plan.raw.itemCode || '');

        drows.push([
          'DI'+Utilities.getUuid().replace(/-/g,'').slice(0,12),
          visitId,
          String(plan.raw.itemCode),
          String(plan.master['Item Type'] || plan.raw.itemType || ''),
          itemName,
          a.qty,
          String(plan.master.Unit || plan.raw.unit || ''),
          t
        ]);

        trows.push([
          'ST'+Utilities.getUuid().replace(/-/g,'').slice(0,12),
          'DISPENSE',
          visitId,
          String(plan.raw.itemCode),
          a.lotId,
          a.qty,
          before,
          after,
          a.unitCost,
          'Dispense',
          s.staffId,
          t
        ]);
      });
    });

    const hrow = [
      visitId,
      studentId,
      Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd'),
      Utilities.formatDate(new Date(),getTimeZone_(),'HH:mm:ss'),
      JSON.stringify(p.symptoms || []),
      String(p.otherSymptom || ''),
      String(p.note || ''),
      s.staffId,
      'COMPLETED',
      t,
      clientTx
    ];

    // Write stock first, then records. Rollback is attempted on any error.
    lotSheet.getRange(1,1,lotData.length,lotData[0].length).setValues(lotData);
    formatTextColumns_(header, HEADERS.DISPENSE_HEADER);
    header.getRange(header.getLastRow()+1,1,1,hrow.length).setValues([hrow]);
    if (drows.length) {
      formatTextColumns_(detail, HEADERS.DISPENSE_ITEMS);
      detail.getRange(detail.getLastRow()+1,1,drows.length,drows[0].length).setValues(drows);
    }
    if (trows.length) {
      formatTextColumns_(txn, HEADERS.STOCK_TRANSACTION);
      txn.getRange(txn.getLastRow()+1,1,trows.length,trows[0].length).setValues(trows);
    }

    syncItemQty_();
    audit_(s,'DISPENSE','DISPENSE',visitId,'SUCCESS');

    const resultItems = Object.keys(requestedByItem).map(function(code){
      return {itemCode:code,dispensedQty:requestedByItem[code]};
    });

    return {success:true,data:{visitId,items:resultItems}};
  } catch (err) {
    // The entire operation is protected by LockService. Any exception occurs before
    // returning success; no partial business transaction is intentionally reported.
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/* =========================
   DISPENSE HISTORY
========================= */

function getDispenseHistory_(p,s) {
  if (!['NURSE','ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');

  const limit = Math.min(Math.max(Number(p.limit)||50,1),200);
  let data = rows_(SHEETS.DISPENSE_HEADER).sort(function(a,b){
    return String(b['Created At']).localeCompare(String(a['Created At']));
  });
  return {success:true,data:data.slice(0,limit)};
}

/* =========================
   STOCK
========================= */

function getStock_(p,s) {
  if (!['NURSE','ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  let data = rows_(SHEETS.ITEM_MASTER).filter(function(x){return isActive_(x['Active/Inactive']);});
  const q = String(p.q || '').trim().toLowerCase();
  if (q) {
    data = data.filter(function(x){
      return ['Item Code','Generic Name','Trade Name'].some(function(k){
        return String(x[k] || '').toLowerCase().indexOf(q)>=0;
      });
    });
  }
  return {success:true,data:data};
}

function getStockLots_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  let data = rows_(SHEETS.STOCK_LOT);
  if (p.itemCode) data = data.filter(function(x){return String(x['Item Code'])===String(p.itemCode);});
  return {success:true,data:data};
}

function receiveStock_(p,s) {
  if (!['ADMIN','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');

  const itemCode = String(p.itemCode || '').trim();
  const expiry = String(p.expiry || '').trim();
  const qty = Number(p.qty);
  if (!itemCode || !expiry || !Number.isInteger(qty) || qty <= 0) throw new Error('INVALID_INPUT');

  if (!itemExists_(itemCode)) throw new Error('ITEM_NOT_FOUND');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(SHEETS.STOCK_LOT);
    const id = 'L'+Utilities.getUuid().replace(/-/g,'').slice(0,14);
    const t = now_();
    sh.appendRow([
      id,itemCode,String(p.lotNumber || ''),expiry,t,qty,qty,
      Number(p.unitCost)||0,String(p.supplier || ''),'ACTIVE'
    ]);
    syncItemQty_();
    audit_(s,'RECEIVE','STOCK',id,'SUCCESS');
    return {success:true,data:{stockLotId:id}};
  } finally {
    lock.releaseLock();
  }
}

function adjustStock_(p,s) {
  if (!['ADMIN','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');

  const lotId = String(p.stockLotId || '').trim();
  const delta = Number(p.delta);
  const reason = String(p.reason || '').trim();
  if (!lotId || !Number.isInteger(delta) || delta === 0 || !reason) throw new Error('INVALID_INPUT');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sh = getSheet_(SHEETS.STOCK_LOT);
    const data = sh.getDataRange().getValues();
    const h = headerMap_(data[0]);
    const idx = data.findIndex(function(r,n){
      return n>0 && String(r[h['Stock Lot ID']] || '') === lotId;
    });
    if (idx < 1) throw new Error('STOCK_LOT_NOT_FOUND');

    const before = Number(data[idx][h['Current Qty']]) || 0;
    const after = before + delta;
    if (after < 0) throw new Error('INSUFFICIENT_STOCK');

    data[idx][h['Current Qty']] = after;
    sh.getRange(1,1,data.length,data[0].length).setValues(data);

    getSheet_(SHEETS.STOCK_TRANSACTION).appendRow([
      'ST'+Utilities.getUuid().replace(/-/g,'').slice(0,12),
      'ADJUST',
      reason,
      String(p.itemCode || data[idx][h['Item Code']] || ''),
      lotId,
      Math.abs(delta),
      before,
      after,
      Number(data[idx][h['Unit Cost']]) || 0,
      reason,
      s.staffId,
      now_()
    ]);

    syncItemQty_();
    audit_(s,'ADJUST','STOCK',lotId,'SUCCESS');
    return {success:true,data:{before:before,after:after}};
  } finally {
    lock.releaseLock();
  }
}

function syncItemQty_() {
  const masterSh = getSheet_(SHEETS.ITEM_MASTER);
  const lotSh = getSheet_(SHEETS.STOCK_LOT);
  const masterData = masterSh.getDataRange().getValues();
  const lotData = lotSh.getDataRange().getValues();

  if (!masterData.length || !lotData.length) return;

  const mh = headerMap_(masterData[0]);
  const lh = headerMap_(lotData[0]);
  const totals = {};

  for (let i=1;i<lotData.length;i++) {
    const item = String(lotData[i][lh['Item Code']] || '');
    const qty = Number(lotData[i][lh['Current Qty']]) || 0;
    const status = String(lotData[i][lh['Status']] || '').toUpperCase();
    if (item && status !== 'INACTIVE') totals[item] = (totals[item] || 0) + qty;
  }

  for (let i=1;i<masterData.length;i++) {
    const code = String(masterData[i][mh['Item Code']] || '');
    masterData[i][mh['QTY']] = totals[code] || 0;
  }

  masterSh.getRange(1,1,masterData.length,masterData[0].length).setValues(masterData);
}

function getStockTransactions_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  let data = rows_(SHEETS.STOCK_TRANSACTION).sort(function(a,b){
    return String(b.Timestamp).localeCompare(String(a.Timestamp));
  });
  if (p.itemCode) data = data.filter(function(x){return String(x['Item Code'])===String(p.itemCode);});
  return {success:true,data:data.slice(0,Math.min(Number(p.limit)||200,500))};
}

/* =========================
   DASHBOARD
========================= */

function getDashboardSummary_(s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');

  const items = rows_(SHEETS.ITEM_MASTER).filter(function(x){return isActive_(x['Active/Inactive']);});
  const visits = rows_(SHEETS.DISPENSE_HEADER);
  const low = items.filter(function(r){
    return Number(r.QTY||0) <= Number(r['Minimum Stock']||0);
  });

  const today = Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd');
  const todayVisits = visits.filter(function(v){return String(v['Visit Date'])===today;});

  return {
    success:true,
    data:{
      items:items.length,
      lowStock:low.length,
      visitsToday:todayVisits.length,
      totalVisits:visits.length,
      expiryAlerts:getExpiryData_(90).length
    }
  };
}

function getVisitTrend_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  const days = Math.min(Math.max(Number(p.days)||30,1),365);
  const visits = rows_(SHEETS.DISPENSE_HEADER);
  const map = {};

  visits.forEach(function(v){
    const d = String(v['Visit Date'] || '');
    if (d) map[d] = (map[d] || 0) + 1;
  });

  const out = [];
  const base = new Date();
  for (let i=days-1;i>=0;i--) {
    const d = new Date(base.getFullYear(),base.getMonth(),base.getDate()-i);
    const key = Utilities.formatDate(d,getTimeZone_(),'yyyy-MM-dd');
    out.push({date:key,count:map[key]||0});
  }
  return {success:true,data:out};
}

function getTopSymptoms_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  const headers = rows_(SHEETS.DISPENSE_HEADER);
  const counts = {};
  headers.forEach(function(v){
    let symptoms = [];
    try { symptoms = JSON.parse(String(v.Symptoms || '[]')); } catch(e) {}
    if (!Array.isArray(symptoms)) symptoms = [symptoms];
    symptoms.forEach(function(x){
      const k = String(x || '').trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    const other = String(v['Other Symptom'] || '').trim();
    if (other) counts[other] = (counts[other] || 0) + 1;
  });
  return {success:true,data:Object.keys(counts).map(function(k){
    return {symptom:k,count:counts[k]};
  }).sort(function(a,b){return b.count-a.count;}).slice(0,20)};
}

function getTopItems_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  const data = rows_(SHEETS.DISPENSE_ITEMS);
  const counts = {};
  data.forEach(function(x){
    const code = String(x['Item Code'] || '');
    counts[code] = (counts[code] || 0) + (Number(x.Qty)||0);
  });
  return {success:true,data:Object.keys(counts).map(function(k){
    return {itemCode:k,qty:counts[k]};
  }).sort(function(a,b){return b.qty-a.qty;}).slice(0,20)};
}

function getLowStock_(s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  return {success:true,data:rows_(SHEETS.ITEM_MASTER).filter(function(x){
    return isActive_(x['Active/Inactive']) &&
      Number(x.QTY||0) <= Number(x['Minimum Stock']||0);
  })};
}

function getExpiryAlerts_(p,s) {
  if (!['ADMIN','MANAGER','SUPER_ADMIN'].includes(s.role)) throw new Error('ACCESS_DENIED');
  const days = Math.min(Math.max(Number(p.days)||getConfigNumber_('EXPIRY_ALERT_DAYS',90),1),3650);
  return {success:true,data:getExpiryData_(days)};
}

function getExpiryData_(days) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const end = new Date(today.getTime());
  end.setDate(end.getDate()+Number(days));

  return rows_(SHEETS.STOCK_LOT).filter(function(x){
    if (String(x.Status || '').toUpperCase() === 'INACTIVE') return false;
    const qty = Number(x['Current Qty']) || 0;
    const exp = parseDate_(x['Expiry Date']);
    return qty > 0 && exp && exp >= today && exp <= end;
  }).sort(function(a,b){
    return parseDate_(a['Expiry Date']).getTime()-parseDate_(b['Expiry Date']).getTime();
  });
}

/* =========================
   USER MANAGEMENT
========================= */

function getUsers_(s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  return {success:true,data:rows_(SHEETS.USERS).map(function(u){
    return {
      staffId:String(u['Staff ID'] || ''),
      name:String(u.Name || ''),
      role:String(u.Role || ''),
      active:isActive_(u.Active),
      lastLogin:String(u['Last Login'] || ''),
      createdAt:String(u['Created At'] || ''),
      updatedAt:String(u['Updated At'] || '')
    };
  })};
}

function createUser_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const staffId = String(p.staffId || '').trim();
  const name = String(p.name || '').trim();
  const password = String(p.password || '');
  const role = String(p.role || '').trim().toUpperCase();

  if (!staffId || !name || !password) throw new Error('INVALID_INPUT');
  validateRole_(role);

  if (rows_(SHEETS.USERS).some(function(x){return String(x['Staff ID']).trim()===staffId;})) {
    throw new Error('USER_ALREADY_EXISTS');
  }

  const salt = Utilities.getUuid().replace(/-/g,'').slice(0,16);
  const t = now_();
  const userSh = getSheet_(SHEETS.USERS);
  formatTextColumns_(userSh, HEADERS.USERS);
  userSh.appendRow([
    staffId,name,role,salt+'$'+hash_(password,salt),true,'',t,t
  ]);
  audit_(s,'CREATE_USER','USERS',staffId,'SUCCESS');
  return {success:true};
}

function updateUser_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const staffId = String(p.staffId || '').trim();
  if (!staffId) throw new Error('INVALID_INPUT');

  const sh = getSheet_(SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const h = headerMap_(data[0]);
  const idx = data.findIndex(function(r,n){
    return n>0 && String(r[h['Staff ID']] || '').trim()===staffId;
  });
  if (idx<1) throw new Error('USER_NOT_FOUND');

  if (p.name !== undefined) data[idx][h['Name']] = String(p.name || '').trim();
  if (p.role !== undefined) {
    const role = String(p.role || '').trim().toUpperCase();
    validateRole_(role);
    data[idx][h['Role']] = role;
  }
  if (p.active !== undefined) data[idx][h['Active']] = Boolean(p.active);
  data[idx][h['Updated At']] = now_();

  sh.getRange(1,1,data.length,data[0].length).setValues(data);
  audit_(s,'UPDATE_USER','USERS',staffId,'SUCCESS');
  return {success:true};
}

function deactivateUser_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  return updateUser_({staffId:p.staffId,active:false},s);
}

function resetPassword_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const staffId = String(p.staffId || '').trim();
  const password = String(p.password || '');
  if (!staffId || !password) throw new Error('INVALID_INPUT');

  const sh = getSheet_(SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  const h = headerMap_(data[0]);
  const idx = data.findIndex(function(r,n){
    return n>0 && String(r[h['Staff ID']] || '').trim()===staffId;
  });
  if (idx<1) throw new Error('USER_NOT_FOUND');

  const salt = Utilities.getUuid().replace(/-/g,'').slice(0,16);
  data[idx][h['Password Hash']] = salt+'$'+hash_(password,salt);
  data[idx][h['Updated At']] = now_();
  sh.getRange(1,1,data.length,data[0].length).setValues(data);

  audit_(s,'RESET_PASSWORD','USERS',staffId,'SUCCESS');
  return {success:true};
}

function importStudents_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const list = p.students;
  if (!Array.isArray(list) || !list.length) throw new Error('INVALID_INPUT');

  const sh = getSheet_(SHEETS.STUDENTS);
  formatTextColumns_(sh, HEADERS.STUDENTS);
  const data = sh.getDataRange().getValues();
  const displayData = sh.getDataRange().getDisplayValues();
  const h = headerMap_(data[0]);
  const t = now_();
  let added = 0;
  let updated = 0;

  const rowMap = {};
  for (let i = 1; i < data.length; i++) {
    const dispId = displayData[i] ? displayData[i][h['Student ID']] : '';
    const id = String(dispId || data[i][h['Student ID']] || '').trim();
    if (id) rowMap[id] = i;
  }

  const newRows = [];
  list.forEach(function(item) {
    const id = String(item.studentId || item['Student ID'] || '').trim();
    if (!id) return;
    const fName = String(item.firstName || item['First Name'] || '').trim();
    const lName = String(item.lastName || item['Last Name'] || '').trim();
    const fullName = String(item.fullName || item['Full Name'] || (fName + ' ' + lName).trim() || id);
    const grade = String(item.grade || item['Grade'] || '').trim();
    const className = String(item.className || item.class || item['Class'] || '').trim();
    const gender = String(item.gender || item['Gender'] || '').trim();
    const status = String(item.status || item['Status'] || 'ACTIVE').trim().toUpperCase();

    if (rowMap[id] !== undefined) {
      const r = rowMap[id];
      data[r][h['First Name']] = fName;
      data[r][h['Last Name']] = lName;
      data[r][h['Full Name']] = fullName;
      data[r][h['Grade']] = grade;
      data[r][h['Class']] = className;
      data[r][h['Gender']] = gender;
      data[r][h['Status']] = status;
      data[r][h['Updated At']] = t;
      updated++;
    } else {
      newRows.push([id, fName, lName, fullName, grade, className, gender, status, t]);
      rowMap[id] = data.length + newRows.length - 1;
      added++;
    }
  });

  if (updated > 0) {
    sh.getRange(1, h['Student ID'] + 1, data.length, 1).setNumberFormat('@');
    sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
  if (newRows.length > 0) {
    const startRow = sh.getLastRow() + 1;
    sh.getRange(startRow, h['Student ID'] + 1, newRows.length, 1).setNumberFormat('@');
    sh.getRange(startRow, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  audit_(s, 'IMPORT_STUDENTS', 'STUDENTS', 'Count:' + (added + updated), 'SUCCESS');
  return { success: true, data: { added: added, updated: updated, total: added + updated } };
}

function importItems_(p,s) {
  requireRole_(s,['ADMIN','SUPER_ADMIN']);
  const list = p.items;
  if (!Array.isArray(list) || !list.length) throw new Error('INVALID_INPUT');

  const sh = getSheet_(SHEETS.ITEM_MASTER);
  const data = sh.getDataRange().getValues();
  const h = headerMap_(data[0]);
  let added = 0;
  let updated = 0;

  const rowMap = {};
  for (let i = 1; i < data.length; i++) {
    const code = String(data[i][h['Item Code']] || '').trim();
    if (code) rowMap[code] = i;
  }

  const newRows = [];
  list.forEach(function(item) {
    const code = String(item.itemCode || item['Item Code'] || '').trim();
    if (!code) return;
    const type = String(item.itemType || item['Item Type'] || 'DRUG').trim().toUpperCase();
    const gName = String(item.genericName || item['Generic Name'] || '').trim();
    const tName = String(item.tradeName || item['Trade Name'] || '').trim();
    const unit = String(item.unit || item['Unit'] || 'ชิ้น').trim();
    const minStock = Number(item.minStock || item['Minimum Stock']) || 0;
    const maxStock = Number(item.maxStock || item['Maximum Stock']) || 0;
    const cost = Number(item.unitCost || item['Unit Cost']) || 0;
    const active = item.active !== undefined ? (item.active ? 'TRUE' : 'FALSE') : 'TRUE';

    if (rowMap[code] !== undefined) {
      const r = rowMap[code];
      data[r][h['Item Type']] = type;
      data[r][h['Generic Name']] = gName;
      data[r][h['Trade Name']] = tName;
      data[r][h['Unit']] = unit;
      data[r][h['Minimum Stock']] = minStock;
      data[r][h['Maximum Stock']] = maxStock;
      data[r][h['Unit Cost']] = cost;
      data[r][h['Active/Inactive']] = active;
      updated++;
    } else {
      newRows.push([code, type, gName, tName, 0, unit, minStock, maxStock, cost, active]);
      rowMap[code] = data.length + newRows.length - 1;
      added++;
    }
  });

  if (updated > 0) {
    sh.getRange(1, 1, data.length, data[0].length).setValues(data);
  }
  if (newRows.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }

  syncItemQty_();
  audit_(s, 'IMPORT_ITEMS', 'ITEM_MASTER', 'Count:' + (added + updated), 'SUCCESS');
  return { success: true, data: { added: added, updated: updated, total: added + updated } };
}

/* =========================
   CONFIG
========================= */

function getConfig_(s) {
  requireRole_(s,['SUPER_ADMIN']);
  return {success:true,data:rows_(SHEETS.CONFIG)};
}

function updateConfig_(p,s) {
  requireRole_(s,['SUPER_ADMIN']);
  const key = String(p.key || '').trim();
  if (!key) throw new Error('INVALID_INPUT');

  const sh = getSheet_(SHEETS.CONFIG);
  const data = sh.getDataRange().getValues();
  const h = headerMap_(data[0]);
  const idx = data.findIndex(function(r,n){
    return n>0 && String(r[h['Config Key']] || '')===key;
  });
  if (idx<1) throw new Error('CONFIG_NOT_FOUND');

  data[idx][h['Config Value']] = p.value === undefined ? '' : String(p.value);
  data[idx][h['Updated At']] = now_();
  data[idx][h['Updated By']] = s.staffId;
  sh.getRange(1,1,data.length,data[0].length).setValues(data);
  audit_(s,'UPDATE_CONFIG','CONFIG',key,'SUCCESS');
  return {success:true};
}

/* =========================
   AUDIT / HELPERS
========================= */

function audit_(s,action,module,referenceId,result) {
  getSheet_(SHEETS.AUDIT_LOG).appendRow([
    'AL'+Utilities.getUuid().replace(/-/g,'').slice(0,14),
    now_(),
    s.staffId,
    action,
    module,
    referenceId,
    result,
    '',
    ''
  ]);
}

function auditSystem_(action,module,referenceId,result) {
  getSheet_(SHEETS.AUDIT_LOG).appendRow([
    'AL'+Utilities.getUuid().replace(/-/g,'').slice(0,14),
    now_(),
    'SYSTEM',
    action,
    module,
    referenceId,
    result,
    '',
    ''
  ]);
}

function errorResponse_(err) {
  const message = String(err && err.message || err || 'SERVER_ERROR');
  return {
    success:false,
    errorCode:message,
    message:humanError_(message)
  };
}

function humanError_(code) {
  const map = {
    AUTH_REQUIRED:'กรุณาเข้าสู่ระบบ',
    INVALID_SESSION:'Session หมดอายุ กรุณาเข้าสู่ระบบใหม่',
    INVALID_CREDENTIALS:'Staff ID หรือ Password ไม่ถูกต้อง',
    ACCESS_DENIED:'ไม่มีสิทธิ์ดำเนินการนี้',
    INVALID_INPUT:'ข้อมูลที่ส่งมาไม่ถูกต้อง',
    STUDENT_NOT_FOUND:'ไม่พบข้อมูลนักเรียน',
    ITEM_NOT_FOUND:'ไม่พบรายการยา/เวชภัณฑ์',
    INSUFFICIENT_STOCK:'จำนวน Stock ไม่เพียงพอ',
    DUPLICATE_TRANSACTION:'รายการนี้ถูกบันทึกไปแล้ว',
    INVALID_QTY:'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0',
    STOCK_LOT_NOT_FOUND:'ไม่พบ Stock Lot',
    USER_ALREADY_EXISTS:'มี Staff ID นี้อยู่แล้ว',
    USER_NOT_FOUND:'ไม่พบผู้ใช้งาน',
    INITIAL_ADMIN_ID_NOT_SET:'ยังไม่ได้ตั้ง INITIAL_ADMIN_ID ใน Script Properties',
    INITIAL_ADMIN_NAME_NOT_SET:'ยังไม่ได้ตั้ง INITIAL_ADMIN_NAME ใน Script Properties',
    INITIAL_ADMIN_PASSWORD_NOT_SET:'ยังไม่ได้ตั้ง INITIAL_ADMIN_PASSWORD ใน Script Properties',
    INITIAL_ADMIN_ROLE_NOT_SET:'ยังไม่ได้ตั้ง Role ของ Initial Admin',
    INVALID_USER_ROLE:'Role ไม่ถูกต้อง'
  };
  return map[code] || code;
}

function getSpreadsheet_() {
  const id = String(PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '').trim();
  if (id) return SpreadsheetApp.openById(id);
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('SHEET_NOT_FOUND:'+name);
  return sh;
}

function rows_(name) {
  const sh = getSheet_(name);
  const range = sh.getDataRange();
  const values = range.getValues();
  if (!values.length || values.length < 2) return [];
  const displayValues = range.getDisplayValues();
  const headers = values[0].map(String);
  const textCols = [
    'Staff ID', 'Student ID', 'Item Code', 'Lot Number', 'Stock Lot ID',
    'Visit ID', 'Dispense Item ID', 'Transaction ID', 'Log ID', 'Reference ID', 'Client Transaction ID'
  ];
  return values.slice(1).map(function(row, rIdx){
    const obj = {};
    headers.forEach(function(h, i){
      if (textCols.indexOf(h) >= 0) {
        const disp = displayValues[rIdx + 1] ? displayValues[rIdx + 1][i] : undefined;
        obj[h] = String(disp !== undefined && disp !== '' ? disp : (row[i] !== undefined && row[i] !== null ? row[i] : '')).trim();
      } else {
        obj[h] = row[i];
      }
    });
    return obj;
  });
}

function formatTextColumns_(sh, headers) {
  const textCols = [
    'Staff ID', 'Student ID', 'Item Code', 'Lot Number', 'Stock Lot ID',
    'Visit ID', 'Dispense Item ID', 'Transaction ID', 'Log ID', 'Reference ID', 'Client Transaction ID'
  ];
  headers.forEach(function(h, i) {
    if (textCols.indexOf(h) >= 0) {
      try {
        sh.getRange(1, i + 1, Math.max(sh.getMaxRows(), 500), 1).setNumberFormat('@');
      } catch (e) {}
    }
  });
}

function ensureHeaders_(sh,headers) {
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    formatTextColumns_(sh, headers);
    return;
  }
  const existing = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),headers.length)).getValues()[0];
  const missing = headers.some(function(h,i){return String(existing[i] || '') !== h;});
  if (missing && sh.getLastRow() <= 1) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  formatTextColumns_(sh, headers);
}

function headerMap_(headers) {
  const h = {};
  headers.forEach(function(x,i){h[String(x)] = i;});
  return h;
}

function now_() {
  return Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd HH:mm:ss');
}

function getTimeZone_() {
  return Session.getScriptTimeZone() || 'Asia/Bangkok';
}

function parseDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const s = String(value || '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  const m = s.match(/^(\\d{4})[-\\/]?(\\d{1,2})[-\\/]?(\\d{1,2})$/);
  if (m) return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),23,59,59);
  return null;
}

function isActive_(value) {
  const s = String(value === undefined || value === null ? '' : value).trim().toUpperCase();
  return !(s === 'FALSE' || s === 'INACTIVE' || s === '0' || s === 'NO');
}

function isActiveStatus_(value) {
  const s = String(value || '').trim().toUpperCase();
  return !s || s === 'ACTIVE' || s === 'TRUE' || s === '1';
}

function studentExists_(id) {
  return rows_(SHEETS.STUDENTS).some(function(x){
    return String(x['Student ID'] || '').trim()===String(id).trim() && isActiveStatus_(x.Status);
  });
}

function itemExists_(code) {
  return rows_(SHEETS.ITEM_MASTER).some(function(x){
    return String(x['Item Code'] || '').trim()===String(code).trim() && isActive_(x['Active/Inactive']);
  });
}

function validateRole_(role) {
  if (ROLES.indexOf(String(role || '').toUpperCase()) < 0) throw new Error('INVALID_USER_ROLE');
}

function requireRole_(s,allowed) {
  if (!allowed.includes(String(s.role || '').toUpperCase())) throw new Error('ACCESS_DENIED');
}

function updateUserLastLogin_(staffId) {
  const sh = getSheet_(SHEETS.USERS);
  const data = sh.getDataRange().getValues();
  if (!data.length) return;
  const h = headerMap_(data[0]);
  const idx = data.findIndex(function(r,n){
    return n>0 && String(r[h['Staff ID']] || '').trim()===staffId;
  });
  if (idx>0) {
    data[idx][h['Last Login']] = now_();
    data[idx][h['Updated At']] = now_();
    sh.getRange(1,1,data.length,data[0].length).setValues(data);
  }
}

function getConfigNumber_(key,fallback) {
  const row = rows_(SHEETS.CONFIG).find(function(x){return String(x['Config Key'])===key;});
  const n = row ? Number(row['Config Value']) : NaN;
  return isNaN(n) ? fallback : n;
}
