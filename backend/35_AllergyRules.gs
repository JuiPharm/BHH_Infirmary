/* BHH Infirmary — Drug Allergy Hard Stop Registry (candidate).
 * Rules are admin-maintained and stored in a separate Google Sheets tab.
 * The built-in Penicillin → Amoxicillin/Ampicillin guard remains independent
 * and cannot be disabled by changing a row or deleting the tab.
 */
const BASELINE_ALLERGY_RULE_ID = 'SYSTEM-PENICILLIN-HARD-STOP';
const ALLERGY_RULE_STATUSES = ['DRAFT','ACTIVE'];
function allergyRuleSheet_() {
  return getSpreadsheet_().getSheetByName(SHEETS.ALLERGY_RULES);
}
function allergyRuleRows_() {
  // Published custom rules must not silently vanish if the registry tab is missing.
  // A missing rule sheet is a clinical configuration failure, never a green light.
  if (!allergyRuleSheet_()) throw new Error('ALLERGY_RULES_UNAVAILABLE');
  const rows = rows_(SHEETS.ALLERGY_RULES);
  if (rows.length > 500) throw new Error('ALLERGY_RULES_LIMIT_EXCEEDED');
  return rows;
}
function assertRuleTerms_(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 900 || /^[=+@-]/.test(text)) throw new Error('INVALID_ALLERGY_RULE');
  const terms = text.split('|').map(function(t){ return t.trim().replace(/\s+/g,' '); }).filter(Boolean);
  if (!terms.length || terms.length > 12) throw new Error('INVALID_ALLERGY_RULE');
  terms.forEach(function(t){
    // Both English and Thai generic names are allowed; no user-authored regex.
    if (t.length < 4 || t.length > 80 || /[|*?\\{}[\]();:]/.test(t) || /^[=+@-]/.test(t) ||
        !/^[A-Za-z0-9\u0e00-\u0e7f]/.test(t)) throw new Error('INVALID_ALLERGY_RULE');
  });
  const unique = [];
  terms.forEach(function(t){if(!unique.some(function(x){return x.toUpperCase()===t.toUpperCase();}))unique.push(t);});
  return unique;
}
function allergyTokenMatch_(text,term) {
  const source = String(text || '').toUpperCase();
  const needle = String(term || '').toUpperCase();
  if (!source || !needle) return false;
  let i=0;
  while ((i=source.indexOf(needle,i))>=0) {
    const before = i > 0 ? source[i-1] : '';
    const after = i+needle.length < source.length ? source[i+needle.length] : '';
    const letter = function(x){return !!x && /[A-Z0-9\u0E00-\u0E7F]/.test(x);};
    if (!letter(before) && !letter(after)) return true;
    i++;
  }
  return false;
}
function allergyRuleMatches_(allergenTerms,genericTerms,recordedAllergy,plans) {
  if (!allergenTerms.some(function(t){return allergyTokenMatch_(recordedAllergy,t);})) return false;
  return (plans || []).some(function(p){
    const m=p && p.master || {};
    if (normalizeItemType_(m['Item Type'] || '') !== 'DRUG') return false;
    const generic=String(m['Generic Name'] || '');
    return genericTerms.some(function(t){return allergyTokenMatch_(generic,t);});
  });
}
function enforceDrugAllergyRules_(recordedAllergy,plans) {
  // The immutable baseline guard is always enforced, even when the registry is absent.
  if (knownPenicillinDrugConflict_(recordedAllergy,plans))
    throw new Error('DRUG_ALLERGY_HARD_STOP');
  const saved=allergyRuleRows_();
  saved.forEach(function(rule){
    const state=String(rule.Status || '').trim().toUpperCase();
    if(state==='DRAFT')return;
    if(state!=='ACTIVE')throw new Error('ALLERGY_RULES_CONFIGURATION_ERROR');
    let allergens,generics;
    try {
      allergens=assertRuleTerms_(rule['Allergen Terms']);
      generics=assertRuleTerms_(rule['Blocked Generic Terms']);
      if(!String(rule.Reference || '').trim() || !String(rule['Approved By']||'').trim())
        throw new Error('INCOMPLETE_RULE');
    }catch {throw new Error('ALLERGY_RULES_CONFIGURATION_ERROR');}
    if(allergyRuleMatches_(allergens,generics,recordedAllergy,plans))
      throw new Error('DRUG_ALLERGY_HARD_STOP');
  });
}
function getDrugAllergyRules_(session) {
  requireRole_(session,['SUPER_ADMIN']);
  const rows=allergyRuleRows_();
  return {success:true,data:[{
    'Rule ID':BASELINE_ALLERGY_RULE_ID,
    'Allergen Terms':'PENICILLIN | PENICILLINS | AMOXICILLIN | AMPICILLIN',
    'Blocked Generic Terms':'AMOXICILLIN | AMPICILLIN | PENICILLIN',
    Reference:'FDA AMOXIL labeling, Section 4 (2024)',
    Status:'LOCKED','Created By':'SYSTEM', 'Approved By':'CLINICAL_APPROVED_2026-10-16'
  }].concat(rows)};
}
function saveDrugAllergyRule_(payload,session) {
  requireRole_(session,['SUPER_ADMIN']);
  const allergens=assertRuleTerms_(payload.allergenTerms).join(' | ');
  const generics=assertRuleTerms_(payload.blockedGenericTerms).join(' | ');
  const reference=String(payload.reference || '').trim();
  if (reference.length < 8 || reference.length > 500 || /^[=+@-]/.test(reference))
    throw new Error('ALLERGY_RULE_REFERENCE_REQUIRED');
  const ruleId=String(payload.ruleId || '').trim();
  if (ruleId===BASELINE_ALLERGY_RULE_ID) throw new Error('LOCKED_ALLERGY_RULE');
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try{
    const sh=ensureSheet_(SHEETS.ALLERGY_RULES,HEADERS.DRUG_ALLERGY_RULES);
    const data=sh.getDataRange().getValues();
    const header=data[0].map(String),map=headerMap_(header);
    const now=now_();
    const existing=ruleId?data.findIndex(function(row,i){return i>0 && String(row[map['Rule ID']])===ruleId;}):-1;
    if(ruleId && existing<1)throw new Error('ALLERGY_RULE_NOT_FOUND');
    if(existing>0 && String(data[existing][map.Status])!=='DRAFT')
      throw new Error('ACTIVE_RULE_IMMUTABLE_CREATE_NEW');
    if(existing<1 && data.length>500)throw new Error('ALLERGY_RULES_LIMIT_EXCEEDED');
    const id=existing>0?ruleId:('AR'+Utilities.getUuid().replace(/-/g,'').slice(0,18));
    const fields={
      'Rule ID':id,'Allergen Terms':allergens,'Blocked Generic Terms':generics,
      Reference:reference,Status:'DRAFT',
      'Created By':existing>0?data[existing][map['Created By']]:session.staffId,
      'Created At':existing>0?data[existing][map['Created At']]:now,
      'Updated By':session.staffId,'Updated At':now,
      'Approved By':'','Approved At':''
    };
    const row=header.map(function(k){return Object.prototype.hasOwnProperty.call(fields,k)?fields[k]:'';});
    if(existing>0)sh.getRange(existing+1,1,1,row.length).setValues([row]);
    else sh.appendRow(row);
    clearCache_(SHEETS.ALLERGY_RULES);
    audit_(session,'ALLERGY_RULE_DRAFT','DRUG_ALLERGY_RULES',id,'SUCCESS');
    return {success:true,data:{ruleId:id,status:'DRAFT'}};
  }finally{lock.releaseLock();}
}
function publishDrugAllergyRule_(payload,session) {
  requireRole_(session,['SUPER_ADMIN']);
  if (payload.clinicalReviewed !== true) throw new Error('ALLERGY_RULE_REVIEW_REQUIRED');
  const ruleId=String(payload.ruleId || '').trim();
  if (!ruleId || ruleId===BASELINE_ALLERGY_RULE_ID)throw new Error('LOCKED_ALLERGY_RULE');
  const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh=getSheet_(SHEETS.ALLERGY_RULES);
    const data=sh.getDataRange().getValues();
    const h=headerMap_(data[0].map(String));
    const idx=data.findIndex(function(x,i){return i>0 && String(x[h['Rule ID']])===ruleId;});
    if(idx<1)throw new Error('ALLERGY_RULE_NOT_FOUND');
    const row=data[idx].slice();
    if(String(row[h.Status])!=='DRAFT')throw new Error('ALLERGY_RULE_NOT_DRAFT');
    assertRuleTerms_(row[h['Allergen Terms']]);
    assertRuleTerms_(row[h['Blocked Generic Terms']]);
    if(!String(row[h.Reference] || '').trim())throw new Error('ALLERGY_RULE_REFERENCE_REQUIRED');
    row[h.Status]='ACTIVE';row[h['Approved By']]=session.staffId;row[h['Approved At']]=now_();
    row[h['Updated By']]=session.staffId;row[h['Updated At']]=now_();
    sh.getRange(idx+1,1,1,row.length).setValues([row]);
    clearCache_(SHEETS.ALLERGY_RULES);
    audit_(session,'ALLERGY_RULE_PUBLISH','DRUG_ALLERGY_RULES',ruleId,'SUCCESS');
    return {success:true,data:{ruleId:ruleId,status:'ACTIVE'}};
  }finally{lock.releaseLock();}
}
