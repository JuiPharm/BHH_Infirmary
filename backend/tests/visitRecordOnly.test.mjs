import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const source = readFileSync(resolve(import.meta.dirname,'../Code.gs'),'utf8');

function makeSheet(headers, data = []) {
  const grid = [headers.slice(), ...data.map((row) => row.slice())];
  return {
    grid,
    getLastRow: () => grid.length,
    getLastColumn: () => grid[0].length,
    getDataRange: () => ({getValues: () => grid.map((r) => r.slice())}),
    getRange: (row,col,nRows,nCols) => ({
      getValues: () => Array.from({length:nRows},(_,i) =>
        Array.from({length:nCols},(_,j) => grid[row-1+i]?.[col-1+j] ?? '')),
      setValues: (matrix) => {
        assert.equal(matrix.length,nRows);
        matrix.forEach((r,i) => {
          assert.equal(r.length,nCols);
          if (!grid[row-1+i]) grid[row-1+i] = Array(grid[0].length).fill('');
          r.forEach((value,j) => {grid[row-1+i][col-1+j] = value;});
        });
      },
      setNumberFormat: () => {}
    })
  };
}

function harness() {
  let serial = 0;
  const ctx = vm.createContext({
    console,
    LockService: {getScriptLock: () => ({waitLock() {},releaseLock() {}})},
    Session: {getScriptTimeZone: () => 'Asia/Bangkok'},
    Utilities: {
      getUuid: () => `11111111-1111-1111-1111-${String(++serial).padStart(12,'0')}`,
      formatDate: (date,tz,fmt) => {
        const parts = new Intl.DateTimeFormat('en-GB', {
          timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
          hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
        }).formatToParts(date);
        const get = (field) => parts.find((p) => p.type === field)?.value || '';
        const day = `${get('year')}-${get('month')}-${get('day')}`;
        const time = `${get('hour')}:${get('minute')}:${get('second')}`;
        return fmt === 'yyyy-MM-dd' ? day : fmt === 'HH:mm:ss' ? time : `${day} ${time}`;
      }
    }
  });
  vm.runInContext(source,ctx);
  const headers = vm.runInContext('HEADERS',ctx);
  const sheets = {
    ITEM_MASTER:makeSheet(headers.ITEM_MASTER,[
      ['SUP1','MEDICAL_SUPPLY','Gauze','','10','piece',0,0,0,true],
      ['DRUG1','DRUG','Paracetamol','','10','tablet',0,0,0,true]
    ]),
    STOCK_LOT:makeSheet(headers.STOCK_LOT,[
      ['LOT1','SUP1','A','2099-12-31','2026-01-01',10,10,0,'','ACTIVE'],
      ['LOT2','DRUG1','B','2099-12-31','2026-01-01',10,10,0,'','ACTIVE']
    ]),
    DISPENSE_HEADER:makeSheet(headers.DISPENSE_HEADER),
    DISPENSE_ITEMS:makeSheet(headers.DISPENSE_ITEMS.slice(0,8)), // existing sheet, without new column
    STOCK_TRANSACTION:makeSheet(headers.STOCK_TRANSACTION)
  };
  let synced = 0, notified = 0;
  let seenPlans = [];
  ctx.getSpreadsheet_ = () => ({});
  ctx.getSheet_ = (name) => {
    if (name === 'STOCK_LOT' || name === 'STOCK_TRANSACTION') {
      throw Error('INVENTORY_ACCESS_FORBIDDEN');
    }
    assert.ok(sheets[name],`Unexpected sheet: ${name}`);
    return sheets[name];
  };
  ctx.rows_ = (name) => {
    if (name === 'STOCK_LOT' || name === 'STOCK_TRANSACTION') {
      throw Error('INVENTORY_ACCESS_FORBIDDEN');
    }
    return sheets[name].grid.slice(1).map((r) =>
    Object.fromEntries(sheets[name].grid[0].map((h,i) => [h,r[i] ?? ''])));
  };
  ctx.ensureHeaders_ = (sh,expected) => {
    const missing = expected.filter((h) => !sh.grid[0].includes(h));
    sh.grid[0].push(...missing);
    sh.grid.slice(1).forEach((row) => row.push(...missing.map(() => '')));
  };
  ctx.resolveRecipientForVisit_ = (p) => p.recipient;
  ctx.resolveVisitSymptoms_ = () => ({
    symptomIds:[],symptoms:[],categories:[],
    derivedCategory:'',clinicalAlertLevel:'NORMAL'
  });
  ctx.validateStudentDrugSafetyForDispense_ = (_recipient,_payload,plans) => {
    seenPlans = plans;
  };
  ctx.validateFreeTextAllergyForDispense_ = () => ({
    status:'',drugGroup:'',reaction:'',note:''
  });
  ctx.audit_ = () => {};
  ctx.clearCache_ = () => {};
  ctx.syncItemQty_ = () => {throw Error('INVENTORY_SYNC_FORBIDDEN');};
  ctx.invalidateStockCache_ = () => {};
  ctx.truncateAfterRow_ = (sh,last) => {sh.grid.length = last;};
  ctx.triggerReferralNotificationForVisit_ = () => {notified++;return {status:'SENT'};};

  let transaction = 0;
  const submit = (items,date,disposition='RETURN_TO_CLASS') =>
    ctx.submitVisit_({
      clientTransactionId:`TX-${++transaction}`,
      recipient:{
        recipientSource:'FREE_TEXT',recipientId:'',recipientName:'Synthetic Test Only',
        recipientType:'OTHER',departmentClass:'',recipientContact:''
      },
      visitDate:date,disposition,items,interventions:[]
    },{staffId:'N1',role:'NURSE'});
  const get = (name) => ctx.rows_(name);
  return {ctx,sheets,submit,get,get synced(){return synced;},get notified(){return notified;},
    get plans(){return seenPlans;}};
}


test('backdated Free Text supply order logs qty/unit without reading or writing any stock sheet',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const result = h.submit([{
    itemCode:'',itemType:'MEDICAL_SUPPLY',itemName:'Gauze pad',
    qty:0.5,unit:'pack'
  }],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(h.get('DISPENSE_HEADER')[0]['Visit Date'],'2025-12-31');
  assert.equal(h.get('DISPENSE_HEADER')[0]['Visit Time'],'');
  assert.ok(h.get('DISPENSE_HEADER')[0]['Created At']);
  const line = h.get('DISPENSE_ITEMS')[0];
  assert.equal(line['Stock Effect'],'ORDER_ONLY');
  assert.equal(line.Qty,0.5);
  assert.equal(line.Unit,'pack');
  assert.equal(h.sheets.STOCK_TRANSACTION.grid.length,1);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
});

test('legacy dispense intent and recordOnly:false can NEVER deduct stock from Visit',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const result = h.submit([{itemCode:'SUP1',qty:2,recordOnly:false}],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
  assert.equal(h.sheets.STOCK_TRANSACTION.grid.length,1);
  assert.equal(h.get('DISPENSE_ITEMS')[0]['Stock Effect'],'ORDER_ONLY');
  assert.equal(h.get('DISPENSE_ITEMS')[0].Qty,2);
});

test('master drug and free text drug are both logged without inventory movement but pass through allergy safety checks',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const result = h.submit([
    {itemCode:'SUP1',qty:2},
    {itemCode:'DRUG1',qty:1,unit:'dose',recordOnly:false},
    {itemCode:'',itemName:'Unlisted medication',itemType:'DRUG',qty:1.25,unit:'mL'},
    {itemCode:'',itemName:'Cotton',itemType:'MEDICAL_SUPPLY',qty:1.5,unit:'g'}
  ],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
  assert.equal(h.sheets.STOCK_TRANSACTION.grid.length,1);
  assert.equal(h.get('DISPENSE_ITEMS').length,4);
  assert.ok(h.get('DISPENSE_ITEMS').every((line)=>line['Stock Effect']==='ORDER_ONLY'));
  assert.equal(h.plans.filter((plan) => plan.master['Item Type'] === 'DRUG').length,2);
});

test('historical referral records do not issue fresh emergency email',() => {
  const h = harness();
  const r = h.submit([{itemCode:'',itemName:'Bandage',itemType:'MEDICAL_SUPPLY',
    qty:1,unit:'piece'}],'2025-12-31','EMERGENCY_TRANSFER');
  assert.equal(r.data.notification.type,'HISTORICAL_VISIT');
  assert.equal(h.notified,0);
});

test('invalid future dates and invalid quantity/type do not write Visit or access stock',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const day = vm.runInContext("Utilities.formatDate(new Date(),'Asia/Bangkok','yyyy-MM-dd')",h.ctx);
  const tomorrow = new Date(day+'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  assert.throws(()=>h.submit([],tomorrow.toISOString().slice(0,10)),/INVALID_VISIT_DATE/);
  assert.throws(()=>h.submit([{
    itemCode:'',itemName:'Bandage',itemType:'MEDICAL_SUPPLY',
    qty:-1,unit:'piece'
  }],day),/INVALID_QTY/);
  assert.throws(()=>h.submit([{
    itemCode:'',itemName:'Unknown',itemType:'UNKNOWN',
    qty:1,unit:'piece'
  }],day),/INVALID_INPUT/);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
  assert.equal(h.get('DISPENSE_HEADER').length,0);
  assert.equal(h.get('DISPENSE_ITEMS').length,0);
});

test('Free Text order names and units beginning with formula characters are stored safely',() => {
  const h = harness();
  h.submit([{itemCode:'',itemName:'=1+1',itemType:'DRUG',
    qty:1,unit:'=CMD()'}],'2025-12-31');
  const line = h.get('DISPENSE_ITEMS')[0];
  assert.equal(line['Item Name'],"'=1+1");
  assert.equal(line.Unit,"'=CMD()");
});

test('versioned Visit write action cannot accidentally hit the legacy stock-deducting GAS',() => {
  const newClient = readFileSync(resolve(import.meta.dirname,
    '../../frontend/src/features/clinical/api.ts'),'utf8');
  assert.match(source,/case 'submitVisitV250': return submitVisit_\(/);
  assert.match(newClient,/api<VisitSubmitP4Result>\('submitVisitV250'/);
  assert.doesNotMatch(newClient,/api<VisitSubmitP4Result>\('submitVisit',/);
});

test('every Visit submission including compatibility alias is implemented with NO stock mutation calls',() => {
  const submitSource = source.slice(source.indexOf('function submitVisit_(p,s) {'),
    source.indexOf('/* =========================\n   DISPENSE HISTORY'));
  assert.doesNotMatch(submitSource, /getSheet_\(SHEETS\.STOCK_LOT\)/);
  assert.doesNotMatch(submitSource, /getSheet_\(SHEETS\.STOCK_TRANSACTION\)/);
  assert.doesNotMatch(submitSource, /syncItemQty_\(/);
  assert.doesNotMatch(submitSource, /lotSheet\.getRange/);
  assert.match(submitSource, /'Stock Effect':'ORDER_ONLY'/);
  assert.match(source,/function submitDispense_\(p,s\)\s*{\s*return submitVisit_\(p,s\)/);
});
