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
    assert.ok(sheets[name],`Unexpected sheet: ${name}`);
    return sheets[name];
  };
  ctx.rows_ = (name) => sheets[name].grid.slice(1).map((r) =>
    Object.fromEntries(sheets[name].grid[0].map((h,i) => [h,r[i] ?? ''])));
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
  ctx.syncItemQty_ = () => {synced++;};
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

test('backdated Free Text usage writes a record only and leaves every stock balance untouched',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const result = h.submit([{
    itemCode:'',itemType:'MEDICAL_SUPPLY',itemName:'Gauze pad',
    qty:0.5,unit:'pack',recordOnly:true
  }],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(h.get('DISPENSE_HEADER')[0]['Visit Date'],'2025-12-31');
  assert.equal(h.get('DISPENSE_HEADER')[0]['Visit Time'],'');
  assert.ok(h.get('DISPENSE_HEADER')[0]['Created At']);
  const line = h.get('DISPENSE_ITEMS')[0];
  assert.equal(line['Stock Effect'],'RECORD_ONLY');
  assert.equal(line.Qty,0.5);
  assert.equal(line.Unit,'pack');
  assert.equal(h.get('STOCK_TRANSACTION').length,0);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
  assert.equal(h.synced,0);
});

test('existing dispense still deducts FEFO stock and labels the dispense line',() => {
  const h = harness();
  const result = h.submit([{itemCode:'SUP1',qty:2}],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(h.get('STOCK_LOT')[0]['Current Qty'],8);
  assert.equal(h.get('STOCK_TRANSACTION').length,1);
  assert.equal(h.get('DISPENSE_ITEMS')[0]['Stock Effect'],'DEDUCT');
  assert.equal(h.synced,1);
});

test('mixed mode affects only tracked lines; record-only master drug still goes through safety plans',() => {
  const h = harness();
  const result = h.submit([
    {itemCode:'SUP1',qty:2,recordOnly:false},
    {itemCode:'DRUG1',qty:1,unit:'dose',recordOnly:true},
    {itemCode:'',itemName:'Cotton',itemType:'MEDICAL_SUPPLY',qty:1.25,unit:'g',recordOnly:true}
  ],'2025-12-31');
  assert.equal(result.success,true);
  assert.equal(h.get('STOCK_LOT')[0]['Current Qty'],8);
  assert.equal(h.get('STOCK_LOT')[1]['Current Qty'],10);
  assert.equal(h.get('STOCK_TRANSACTION').length,1);
  assert.equal(h.get('DISPENSE_ITEMS').length,3);
  assert.equal(h.get('DISPENSE_ITEMS').filter((r)=>r['Stock Effect']==='RECORD_ONLY').length,2);
  assert.equal(h.plans.some((x) => x.recordOnly && x.master['Item Type'] === 'DRUG'),true);
});

test('backdated referral creates no new email alert for a historical emergency',() => {
  const h = harness();
  const r = h.submit([{itemCode:'',itemName:'Bandage',itemType:'MEDICAL_SUPPLY',
    qty:1,unit:'piece',recordOnly:true}],'2025-12-31','EMERGENCY_TRANSFER');
  assert.equal(r.data.notification.type,'HISTORICAL_VISIT');
  assert.equal(h.notified,0);
});

test('invalid future dates, disguised free-text drugs and bad quantities never change stock',() => {
  const h = harness();
  const before = JSON.stringify(h.sheets.STOCK_LOT.grid);
  const day = vm.runInContext("Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd')",h.ctx);
  const tomorrow = new Date(day+'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
  assert.throws(()=>h.submit([],tomorrow.toISOString().slice(0,10)),/INVALID_VISIT_DATE/);
  assert.throws(()=>h.submit([{
    itemCode:'',itemName:'Unknown medicine',itemType:'DRUG',
    qty:1,unit:'tablet',recordOnly:true
  }],day),/RECORD_ONLY_SUPPLY_REQUIRED/);
  assert.throws(()=>h.submit([{
    itemCode:'',itemName:'Bandage',itemType:'MEDICAL_SUPPLY',
    qty:-1,unit:'piece',recordOnly:true
  }],day),/INVALID_QTY/);
  assert.equal(JSON.stringify(h.sheets.STOCK_LOT.grid),before);
  assert.equal(h.get('DISPENSE_HEADER').length,0);
});

test('free text beginning with a spreadsheet formula is stored as safe text',() => {
  const h = harness();
  h.submit([{itemCode:'',itemName:'=1+1',itemType:'MEDICAL_SUPPLY',
    qty:1,unit:'=CMD()',recordOnly:true}],'2025-12-31');
  const line = h.get('DISPENSE_ITEMS')[0];
  assert.equal(line['Item Name'],"'=1+1");
  assert.equal(line.Unit,"'=CMD()");
});

test('new frontend uses a versioned mutation action absent from the 2.4.1 backend',() => {
  const newClient = readFileSync(resolve(import.meta.dirname,
    '../../frontend/src/features/clinical/api.ts'),'utf8');
  assert.match(source,/case 'submitVisitV250': return submitVisit_\(/);
  assert.match(newClient,/api<VisitSubmitP4Result>\('submitVisitV250'/);
  assert.doesNotMatch(newClient,/api<VisitSubmitP4Result>\('submitVisit',/);
});
