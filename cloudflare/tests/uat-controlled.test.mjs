import test from 'node:test';
import assert from 'node:assert/strict';
import {executeSyntheticUatVisit,UAT_TEST_ID,UAT_TRANSACTION_ID} from '../worker/uat-controlled.js';
const USER={staffId:'UAT-TEST-ADMIN',role:'SUPER_ADMIN'};
const fixture=[
 {'Stock Lot ID':'MOCK-LOT-003A','Item Code':'MOCK-ITEM-003','Current Qty':30,Status:'ACTIVE'},
 {'Stock Lot ID':'MOCK-LOT-003B','Item Code':'MOCK-ITEM-003','Current Qty':50,Status:'ACTIVE'}
];
class Db {
 constructor(){this.state=null;this.history=[];this.forceClaimFailure=false;this.forceUpdateFailure=false;}
 prepare(sql){
  const db=this;
  return {bind(...args){return {async run(){
   if(sql.startsWith('INSERT')){
    if(db.forceClaimFailure)throw Error('D1 down');
    if(db.state)return {meta:{changes:0}};
    db.state={id:args[0],state:'SUBMITTING',beforeQty:args[2],transactionId:args[3]};
    db.history.push('CLAIM');
    return {meta:{changes:1}};
   }
   if(sql.startsWith('UPDATE')){
    if(db.forceUpdateFailure)throw Error('D1 down');
    if(!db.state||db.state.state!=='SUBMITTING')return {meta:{changes:0}};
    db.state.state=args[0];db.state.reason=args[1];db.state.visitId=args[2];db.state.afterQty=args[3];
    db.history.push(args[0]);return {meta:{changes:1}};
   }
   throw Error('Unexpected SQL');}}};}
 }
}
function mockGas({role=USER,mutate=false,mismatch=false,transportFailure=false}={}){
 let submits=0;
 const fn=async(input)=>{
  const action=input.action;
  if(action==='getSession')return {success:true,data:role};
  if(action==='getStockLots')return {success:true,data:(submits&&mismatch?
    [{...fixture[0],'Current Qty':30},fixture[1]]:
    fixture.map((x,i)=>({...x,'Current Qty':i===0&&submits?29:x['Current Qty']})))};
  if(action==='submitVisit'){
   submits++;
   assert.equal(input.payload.recipient.recipientId,'MOCK-STU-002');
   assert.equal(input.payload.clientTransactionId,UAT_TRANSACTION_ID);
   assert.deepEqual(input.payload.items.map(x=>({id:x.itemCode,qty:x.qty})),[{id:'MOCK-ITEM-003',qty:1}]);
   if(transportFailure)throw Error('connection lost after commit');
   return {success:true,data:{visitId:'V_SYNTHETIC_UAT',status:'COMPLETED'}};
  }
  if(action==='getDispenseHistory')return {success:true,data:[{'Visit ID':'V_SYNTHETIC_UAT','Client Transaction ID':UAT_TRANSACTION_ID}]};
  throw Error('Unexpected GAS action '+action);
 };
 fn.submits=()=>submits;return fn;
}
test('one-shot synthetic visit commits only after stock and visit readbacks',async()=>{
 const db=new Db(),gas=mockGas();
 const result=await executeSyntheticUatVisit(gas,{UAT_DB:db},'opaque-test-token');
 assert.equal(result.status,200);assert.equal(result.body.data.beforeQty,30);assert.equal(result.body.data.afterQty,29);
 assert.equal(db.state.id,UAT_TEST_ID);assert.equal(db.state.state,'COMMITTED');assert.equal(gas.submits(),1);
});
test('replaying test ID cannot cause second dispense',async()=>{
 const db=new Db(),gas=mockGas();await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 const second=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(second.status,409);assert.equal(second.body.errorCode,'UAT_ALREADY_ATTEMPTED_NO_RETRY');assert.equal(gas.submits(),1);
});
test('wrong role never claims or sends clinical action',async()=>{
 const db=new Db(),gas=mockGas({role:{staffId:'MOCK-WRONG',role:'ADMIN'}});
 const result=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(result.status,403);assert.equal(db.state,null);assert.equal(gas.submits(),0);
});
test('stock fixture mismatch fails closed before claiming',async()=>{
 const db=new Db();const gas=async x=>x.action==='getSession'?{success:true,data:USER}:
 {success:true,data:[{...fixture[0],'Current Qty':29},fixture[1]]};
 const result=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(result.body.errorCode,'UAT_FIXTURE_CHANGED');assert.equal(db.state,null);
});
test('missing D1 binding blocks all writes',async()=>{
 const gas=mockGas();const result=await executeSyntheticUatVisit(gas,{},'token');
 assert.equal(result.status,503);assert.equal(gas.submits(),0);
});
test('reservation outage prevents GAS commit',async()=>{
 const db=new Db();db.forceClaimFailure=true;const gas=mockGas();
 const r=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(r.body.errorCode,'UAT_RESERVATION_UNAVAILABLE');assert.equal(gas.submits(),0);
});
test('uncertain remote result never retries automatically',async()=>{
 const db=new Db(),gas=mockGas({transportFailure:true});
 const r=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(r.body.errorCode,'UAT_UNKNOWN_RESULT_NO_RETRY');
 assert.equal(db.state.state,'NEEDS_REVIEW');assert.equal(gas.submits(),1);
 const replay=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(replay.status,409);assert.equal(gas.submits(),1);
});
test('stock reconciliation mismatch requires review and no retry',async()=>{
 const db=new Db(),gas=mockGas({mismatch:true});const r=await executeSyntheticUatVisit(gas,{UAT_DB:db},'token');
 assert.equal(r.body.errorCode,'UAT_STOCK_MISMATCH_NEEDS_REVIEW');assert.equal(db.state.state,'NEEDS_REVIEW');
});
test('D1 commit confirmation failure cannot report success',async()=>{
 const db=new Db();db.forceUpdateFailure=true;const r=await executeSyntheticUatVisit(mockGas(),{UAT_DB:db},'token');
 assert.equal(r.status,503);assert.equal(r.body.errorCode,'UAT_LEDGER_NOT_CONFIRMED_NO_RETRY');
});
