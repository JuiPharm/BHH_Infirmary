// Synthetic-data-only UAT. No user-supplied visit, recipient, drug, quantity or disposition is accepted.
export const UAT_TEST_ID='BHH-UAT-WRITE-20261016-001';
export const UAT_TRANSACTION_ID='BHH-UAT-20261016-ONE-SHOT-001';
const UAT_STAFF_ID='UAT-TEST-ADMIN',UAT_ITEM='MOCK-ITEM-003',UAT_LOT='MOCK-LOT-003A';
const UAT_NEXT_LOT='MOCK-LOT-003B',UAT_STUDENT='MOCK-STU-002';
const FIXTURE_BEFORE=30,FIXTURE_SECOND_LOT=50;
const SAFE_JSON={success:false,errorCode:'UAT_WRITE_NOT_COMPLETED'};
function failure(errorCode,status=409,extra={}){return {status,body:{success:false,errorCode,...extra}};}
function qtyFrom(rows,id){const row=rows.find(x=>String(x['Stock Lot ID'])===id);return row&&Number(row['Current Qty']);}
export const FIXED_SYNTHETIC_VISIT=Object.freeze({
 recipient:{recipientSource:'STUDENT_MASTER',recipientId:UAT_STUDENT},
 studentId:UAT_STUDENT,symptomIds:['NT001'],
 otherSymptom:'',note:'Synthetic UAT test only — no real patient',
 assessment:'One-shot synthetic clinical and FEFO inventory UAT. No treatment administered.',
 interventions:['ORAL_HYDRATION','MEDICATION'],
 disposition:'RETURN_TO_CLASS',outcomeNote:'Synthetic UAT only',
 studentSafetyAcknowledged:true,studentDrugAllergySnapshot:'NKDA',
 items:[{itemCode:UAT_ITEM,qty:1,itemName:'UAT ORS TEST ONLY',itemType:'MEDICATION',unit:'sachet'}],
 clientTransactionId:UAT_TRANSACTION_ID
});
export async function executeSyntheticUatVisit(gas,env,token){
 if(!env?.UAT_DB)return failure('UAT_DB_NOT_CONFIGURED',503);
 let user,rows;
 try{
  const auth=await gas({action:'getSession',payload:{},token},{timeoutMs:12000});
  user=auth?.data;
  if(!auth?.success||user?.staffId!==UAT_STAFF_ID||user?.role!=='SUPER_ADMIN')
    return failure('UAT_ROLE_DENIED',403);
  const stock=await gas({action:'getStockLots',payload:{itemCode:UAT_ITEM},token},{timeoutMs:12000});
  if(!stock?.success||!Array.isArray(stock.data))return failure('UAT_STOCK_PRECHECK_FAILED',503);
  rows=stock.data;
  if(qtyFrom(rows,UAT_LOT)!==FIXTURE_BEFORE||qtyFrom(rows,UAT_NEXT_LOT)!==FIXTURE_SECOND_LOT)
    return failure('UAT_FIXTURE_CHANGED',409);
  if(rows.find(x=>x['Stock Lot ID']===UAT_LOT)?.Status!=='ACTIVE')
    return failure('UAT_LOT_INELIGIBLE',409);
 }catch{return failure('UAT_PRECHECK_UNAVAILABLE',503);}
 let reservation;
 try {
  reservation=await env.UAT_DB.prepare(
   "INSERT OR IGNORE INTO uat_one_shot_gate (test_id,state,expected_lot_id,before_qty,transaction_id,attempted_by,attempted_at) VALUES (?,'SUBMITTING',?,?,?,?,?)"
  ).bind(UAT_TEST_ID,UAT_LOT,FIXTURE_BEFORE,UAT_TRANSACTION_ID,UAT_STAFF_ID,new Date().toISOString()).run();
  if(reservation?.meta?.changes!==1)
   return failure('UAT_ALREADY_ATTEMPTED_NO_RETRY',409,{testId:UAT_TEST_ID});
 }catch{return failure('UAT_RESERVATION_UNAVAILABLE',503);}
 const setStatus=async (state,code,visitId=null,afterQty=null)=>{
  try{const result=await env.UAT_DB.prepare("UPDATE uat_one_shot_gate SET state=?,reason_code=?,visit_id=?,after_qty=?,completed_at=? WHERE test_id=? AND state='SUBMITTING'")
   .bind(state,code,visitId,afterQty,new Date().toISOString(),UAT_TEST_ID).run();return result?.meta?.changes===1;}catch{return false;}
 };
 try{
  const result=await gas({action:'submitVisit',payload:FIXED_SYNTHETIC_VISIT,token},{timeoutMs:35000});
  if(!result?.success||!result.data?.visitId){
   await setStatus('NEEDS_REVIEW','UPSTREAM_RESULT_NOT_COMMITTED');
   return failure('UAT_UNKNOWN_RESULT_NO_RETRY',503,{testId:UAT_TEST_ID});
  }
  const visitId=String(result.data.visitId);
  const after=await gas({action:'getStockLots',payload:{itemCode:UAT_ITEM},token},{timeoutMs:12000});
  if(!after?.success||!Array.isArray(after.data)||qtyFrom(after.data,UAT_LOT)!==FIXTURE_BEFORE-1||
      qtyFrom(after.data,UAT_NEXT_LOT)!==FIXTURE_SECOND_LOT){
   await setStatus('NEEDS_REVIEW','STOCK_RECONCILIATION_MISMATCH',visitId);
   return failure('UAT_STOCK_MISMATCH_NEEDS_REVIEW',503,{testId:UAT_TEST_ID,visitId});
  }
  const history=await gas({action:'getDispenseHistory',payload:{limit:200},token},{timeoutMs:12000});
  const rowsHistory=history?.success&&Array.isArray(history.data)?history.data:[];
  const exact=rowsHistory.filter(x=>String(x['Client Transaction ID']||'')===UAT_TRANSACTION_ID);
  if(exact.length!==1||String(exact[0]['Visit ID'])!==visitId){
   await setStatus('NEEDS_REVIEW','VISIT_LEDGER_RECONCILIATION_MISMATCH',visitId,FIXTURE_BEFORE-1);
   return failure('UAT_VISIT_MISMATCH_NEEDS_REVIEW',503,{testId:UAT_TEST_ID,visitId});
  }
  if(!await setStatus('COMMITTED','RECONCILED',visitId,FIXTURE_BEFORE-1))
   return failure('UAT_LEDGER_NOT_CONFIRMED_NO_RETRY',503,{testId:UAT_TEST_ID,visitId});
  return {status:200,body:{success:true,data:{testId:UAT_TEST_ID,visitId,clientTransactionId:UAT_TRANSACTION_ID,stockLotId:UAT_LOT,beforeQty:FIXTURE_BEFORE,afterQty:FIXTURE_BEFORE-1,otherLotUnchanged:true,writer:'GAS_SHEETS',testOnly:true}}};
 }catch{
  await setStatus('NEEDS_REVIEW','NETWORK_OR_UNKNOWN_RESULT');
  return failure('UAT_UNKNOWN_RESULT_NO_RETRY',503,{testId:UAT_TEST_ID});
 }
}
