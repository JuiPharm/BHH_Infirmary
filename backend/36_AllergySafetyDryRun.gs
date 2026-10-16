// Read-only GAS Sandbox clinical-rule diagnostic.
// No patient IDs, no caller supplied drug names, no Visit/Stock/Audit writes.
// Hard-bound to the synthetic UAT working copy to avoid accidental Production use.
const ALLERGY_UAT_SHEET_ID='1rA46CbGETOJrbKiuXdBrdAVtQFEIhCzfUInCXeIiFbs';
const ALLERGY_UAT_ACTIVE_RULE='AR07c10f3cb053440fbc';
function expectedAllergyUatBlock_(allergy,plan) {
  try{enforceDrugAllergyRules_(allergy,[plan]);}
  catch(e){
    if(String(e && e.message || e)==='DRUG_ALLERGY_HARD_STOP')return true;
    throw e;
  }
  return false;
}
function runSyntheticAllergySafetyCheck_(session){
  requireRole_(session,['SUPER_ADMIN']);
  if(String(getSpreadsheet_().getId())!==ALLERGY_UAT_SHEET_ID)
    throw new Error('UAT_SANDBOX_ONLY');
  const rows=getDrugAllergyRules_(session).data;
  const baseline=rows.filter(function(r){
    return r['Rule ID']==='SYSTEM-PENICILLIN-HARD-STOP'&&r.Status==='LOCKED';
  });
  const synthetic=rows.filter(function(r){
    return r['Rule ID']===ALLERGY_UAT_ACTIVE_RULE &&
     r.Status==='ACTIVE' &&
     r['Allergen Terms']==='BHHUATALLERGEN20261016' &&
     r['Blocked Generic Terms']==='BHHUATGENERIC20261016';
  });
  if(rows.length!==2||baseline.length!==1||synthetic.length!==1)
    throw new Error('UAT_RULE_FIXTURE_CHANGED');
  function plan(name) {return {master:{'Item Type':'MEDICATION','Generic Name':name}};}
  const a=expectedAllergyUatBlock_('PENICILLIN',plan('Amoxicillin 250 mg'));
  const b=expectedAllergyUatBlock_('BHHUATALLERGEN20261016',plan('BHHUATGENERIC20261016'));
  const c=expectedAllergyUatBlock_('PENICILLIN',plan('Oral Rehydration Salts'));
  if(!a||!b||c)throw new Error('UAT_CLINICAL_RULE_CHECK_FAILED');
  return {success:true,data:{
    mode:'READ_ONLY',fixture:'SYNTHETIC_ONLY',baselineLocked:true,
    penicillinAmoxicillinBlocked:true,syntheticActiveRuleBlocked:true,
    unrelatedOrsAllowed:true,visitWrites:0,stockWrites:0
  }};
}
