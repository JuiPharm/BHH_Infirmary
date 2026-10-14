/* P4 — Visit dashboard V2. All visit KPIs/charts share the same filter set. */

function getDashboardV2_(p,s) {
  requireRole_(s,['ADMIN','MANAGER','SUPER_ADMIN']);
  p = p || {};

  const range = normalizeDashboardDateRange_(p.startDate,p.endDate);
  const recipientFilter = String(p.recipientType || '').trim().toUpperCase();
  const symptomFilter = String(p.symptomCategory || '').trim().toUpperCase();
  const gradeFilter = String(p.gradeClass || '').trim().toLowerCase();

  if (recipientFilter && ['STUDENT','TEACHER','STAFF','OTHER'].indexOf(recipientFilter) < 0) {
    throw new Error('INVALID_RECIPIENT_TYPE');
  }
  if (symptomFilter && SYMPTOM_CATEGORIES.indexOf(symptomFilter) < 0) {
    throw new Error('INVALID_SYMPTOM_CATEGORY');
  }

  const allVisits = rows_(SHEETS.DISPENSE_HEADER).filter(function(v){
    return String(v.Status || '').trim().toUpperCase() !== 'CANCELLED';
  });

  const dateScoped = allVisits.filter(function(v){
    const d = String(v['Visit Date'] || '').trim();
    return d && d >= range.startDate && d <= range.endDate;
  });

  const visits = dateScoped.filter(function(v){
    const type = dashboardRecipientType_(v);
    if (recipientFilter && type !== recipientFilter) return false;

    const cats = normalizedVisitCategories_(v);
    const derived = String(v['Derived Visit Category'] || deriveVisitCategory_(cats) || '').trim().toUpperCase();
    if (symptomFilter && derived !== symptomFilter && cats.indexOf(symptomFilter) < 0) return false;

    if (gradeFilter && recipientFilter === 'STUDENT') {
      const gc = String(v['Recipient Department/Class'] || '').trim().toLowerCase();
      if (gc.indexOf(gradeFilter) < 0) return false;
    }
    return true;
  });

  const recipientCounts = {STUDENT:0,TEACHER:0,STAFF:0,OTHER:0};
  const categoryCounts = {TRAUMA:0,NON_TRAUMA:0,OTHER:0,UNCLASSIFIED:0};
  const unique = {};
  const visitPerRecipient = {};
  let referral = 0;
  let emergency = 0;

  visits.forEach(function(v){
    const type = dashboardRecipientType_(v);
    recipientCounts[type] = (recipientCounts[type] || 0) + 1;

    const key = dashboardRecipientKey_(v);
    if (key) {
      unique[key] = true;
      visitPerRecipient[key] = (visitPerRecipient[key] || 0) + 1;
    }

    const cats = normalizedVisitCategories_(v);
    const derived = String(v['Derived Visit Category'] || deriveVisitCategory_(cats) || '').trim().toUpperCase();
    if (categoryCounts[derived] !== undefined) categoryCounts[derived] += 1;
    else categoryCounts.UNCLASSIFIED += 1;

    const disposition = String(v.Disposition || '').trim().toUpperCase();
    if (disposition === 'REFER_HOSPITAL') referral += 1;
    if (disposition === 'EMERGENCY_TRANSFER') emergency += 1;
  });

  const repeatVisits = Object.keys(visitPerRecipient).reduce(function(sum,key){
    return sum + Math.max(visitPerRecipient[key]-1,0);
  },0);

  const symptomCounts = {};
  visits.forEach(function(v){
    parseJsonArray_(v.Symptoms).forEach(function(symptom){
      const k = String(symptom || '').trim();
      if (k) symptomCounts[k] = (symptomCounts[k] || 0) + 1;
    });
  });
  const topSymptoms = Object.keys(symptomCounts).map(function(k){
    return {symptom:k,count:symptomCounts[k]};
  }).sort(function(a,b){return b.count-a.count;}).slice(0,12);

  const trend = buildDashboardTrend_(visits,range.startDate,range.endDate);
  const gradeClassOptions = {};
  dateScoped.forEach(function(v){
    if (dashboardRecipientType_(v) !== 'STUDENT') return;
    const gc = String(v['Recipient Department/Class'] || '').trim();
    if (gc) gradeClassOptions[gc] = true;
  });

  return {
    success:true,
    data:{
      filters:{
        startDate:range.startDate,
        endDate:range.endDate,
        recipientType:recipientFilter,
        symptomCategory:symptomFilter,
        gradeClass:recipientFilter === 'STUDENT' ? String(p.gradeClass || '') : ''
      },
      summary:{
        totalVisits:visits.length,
        uniqueRecipients:Object.keys(unique).length,
        studentVisits:recipientCounts.STUDENT,
        teacherVisits:recipientCounts.TEACHER,
        staffVisits:recipientCounts.STAFF,
        otherVisits:recipientCounts.OTHER,
        referralToHospital:referral,
        emergencyTransfer:emergency,
        repeatVisits:repeatVisits
      },
      categoryCounts:categoryCounts,
      trend:trend,
      topSymptoms:topSymptoms,
      gradeClassOptions:Object.keys(gradeClassOptions).sort()
    }
  };
}

function normalizeDashboardDateRange_(start,end) {
  const today = Utilities.formatDate(new Date(),getTimeZone_(),'yyyy-MM-dd');
  let endDate = String(end || today).trim();
  let startDate = String(start || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('INVALID_DATE_RANGE');
  if (!startDate) {
    const d = new Date();
    d.setDate(d.getDate()-29);
    startDate = Utilities.formatDate(d,getTimeZone_(),'yyyy-MM-dd');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate > endDate) throw new Error('INVALID_DATE_RANGE');
  return {startDate:startDate,endDate:endDate};
}

function dashboardRecipientType_(visit) {
  const raw = String(visit && visit['Recipient Type'] || '').trim().toUpperCase();
  if (raw === 'STUDENT' || (!raw && String(visit && visit['Student ID'] || '').trim())) return 'STUDENT';
  if (raw === 'TEACHER') return 'TEACHER';
  if (raw === 'STAFF') return 'STAFF';
  return 'OTHER';
}

function dashboardRecipientKey_(visit) {
  const source = String(visit && visit['Recipient Source'] || '').trim().toUpperCase();
  const id = String(visit && (visit['Recipient ID'] || visit['Student ID']) || '').trim();
  const name = String(visit && visit['Recipient Name'] || '').trim().toLowerCase();
  if (id) return (source || dashboardRecipientType_(visit))+':'+id;
  return name ? (source || 'LEGACY')+':NAME:'+name : '';
}

function normalizedVisitCategories_(visit) {
  let categories = parseJsonArray_(visit && visit['Symptom Categories']).map(function(x){
    return String(x || '').trim().toUpperCase();
  }).filter(function(x){return SYMPTOM_CATEGORIES.indexOf(x) >= 0;});
  if (!categories.length) categories = categoryForLegacySymptoms_(visit);
  return categories.filter(function(x,idx,arr){return arr.indexOf(x) === idx;});
}

function buildDashboardTrend_(visits,startDate,endDate) {
  const map = {};
  visits.forEach(function(v){
    const d = String(v['Visit Date'] || '').trim();
    if (d) map[d] = (map[d] || 0) + 1;
  });

  const start = new Date(startDate+'T00:00:00');
  const end = new Date(endDate+'T00:00:00');
  const span = Math.round((end.getTime()-start.getTime())/86400000)+1;
  const out = [];

  if (span <= 120) {
    for (let i=0;i<span;i++) {
      const d = new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
      const key = Utilities.formatDate(d,getTimeZone_(),'yyyy-MM-dd');
      out.push({date:key,count:map[key] || 0});
    }
    return out;
  }

  const monthMap = {};
  Object.keys(map).forEach(function(d){
    const month = d.slice(0,7);
    monthMap[month] = (monthMap[month] || 0) + map[d];
  });
  const cursor = new Date(start.getFullYear(),start.getMonth(),1);
  const last = new Date(end.getFullYear(),end.getMonth(),1);
  while (cursor.getTime() <= last.getTime()) {
    const key = Utilities.formatDate(cursor,getTimeZone_(),'yyyy-MM');
    out.push({date:key,count:monthMap[key] || 0});
    cursor.setMonth(cursor.getMonth()+1);
  }
  return out;
}
