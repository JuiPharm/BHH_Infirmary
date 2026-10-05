import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { normalizeItemType } from '../domain/stock';
import { hasVisitClinicalContent } from '../domain/visit';
import { CartItem, Item, Student, VisitDisposition, VisitVitals } from '../types';

const COMMON_SYMPTOMS = [
  'ปวดศีรษะ (Headache)',
  'มีไข้ (Fever)',
  'ไอ (Cough)',
  'เจ็บคอ (Sore Throat)',
  'ปวดท้อง (Abdominal Pain)',
  'คลื่นไส้ (Nausea)',
  'อาเจียน (Vomiting)',
  'ท้องเสีย (Diarrhea)',
  'เวียนศีรษะ (Dizziness)',
  'แผล/อุบัติเหตุ (Minor Injury)',
  'ผื่น/แพ้ (Rash/Allergy)',
  'ปวดประจำเดือน (Menstrual pain)',
  'อื่นๆ (Other)'
];

const INTERVENTIONS = [
  ['REST', 'พักสังเกตอาการ'],
  ['WOUND_CARE', 'ทำแผล/ล้างแผล'],
  ['COLD_COMPRESS', 'ประคบเย็น'],
  ['WARM_COMPRESS', 'ประคบอุ่น'],
  ['ORAL_HYDRATION', 'ให้ดื่มน้ำ/สารน้ำทางปาก'],
  ['FIRST_AID', 'ปฐมพยาบาล'],
  ['MEDICATION', 'ให้ยา'],
  ['MEDICAL_SUPPLY', 'ใช้เวชภัณฑ์'],
  ['PARENT_CONTACTED', 'ติดต่อผู้ปกครอง'],
  ['REFERRED', 'ส่งต่อ']
] as const;

const DISPOSITIONS: Array<[VisitDisposition, string]> = [
  ['RETURN_TO_CLASS', 'กลับเข้าชั้นเรียน'],
  ['OBSERVATION', 'พักสังเกตอาการ'],
  ['SEND_HOME', 'ให้กลับบ้าน'],
  ['PARENT_PICKUP', 'ผู้ปกครองมารับ'],
  ['REFER_CLINIC', 'ส่งต่อคลินิก'],
  ['REFER_HOSPITAL', 'ส่งต่อโรงพยาบาล'],
  ['EMERGENCY_TRANSFER', 'ส่งฉุกเฉิน'],
  ['OTHER', 'อื่นๆ']
];

const numericOrBlank = (value: string): number | '' => {
  if (!value.trim()) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
};

export const VisitPage: React.FC = () => {
  const { session } = useAuth();

  const [studentQuery, setStudentQuery] = useState('');
  const [studentList, setStudentList] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchingStudent, setSearchingStudent] = useState(false);

  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [otherSymptom, setOtherSymptom] = useState('');
  const [assessment, setAssessment] = useState('');
  const [note, setNote] = useState('');
  const [interventions, setInterventions] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<VisitDisposition | ''>('');
  const [outcomeNote, setOutcomeNote] = useState('');

  const [temperature, setTemperature] = useState('');
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [weight, setWeight] = useState('');

  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'DRUG' | 'MEDICAL_SUPPLY'>('ALL');
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadItems();
  }, [session?.token]);

  const loadItems = async () => {
    if (!session?.token) return;
    setLoadingItems(true);
    try {
      const data = await api<Item[]>('getItems', {}, session.token);
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load items', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSearchStudent = async () => {
    if (!studentQuery.trim() || !session?.token) return;
    setSearchingStudent(true);
    try {
      const data = await api<Student[]>('searchStudents', { q: studentQuery.trim() }, session.token);
      setStudentList(data || []);
      if (!data?.length) {
        Swal.fire('ไม่พบข้อมูลนักเรียน', 'กรุณาตรวจสอบรหัสหรือชื่อแล้วลองอีกครั้ง', 'info');
      }
    } catch (err: any) {
      Swal.fire('ค้นหาไม่สำเร็จ', err.message, 'error');
    } finally {
      setSearchingStudent(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((item) => {
      const type = normalizeItemType(item['Item Type']);
      const matchType = itemTypeFilter === 'ALL' || itemTypeFilter === type;
      const matchQuery =
        !q ||
        item['Item Code'].toLowerCase().includes(q) ||
        (item['Generic Name'] || '').toLowerCase().includes(q) ||
        (item['Trade Name'] || '').toLowerCase().includes(q);
      return matchType && matchQuery;
    });
  }, [items, itemSearch, itemTypeFilter]);

  const toggleValue = (value: string, current: string[], setCurrent: (v: string[]) => void) => {
    setCurrent(current.includes(value) ? current.filter((x) => x !== value) : [...current, value]);
  };

  const addToCart = (item: Item) => {
    const currentStock = Number(item.QTY) || 0;
    if (currentStock <= 0) {
      Swal.fire('สต็อกหมด', 'รายการนี้ไม่มี usable stock สำหรับจ่าย', 'warning');
      return;
    }

    const existing = cart.find((c) => c.itemCode === item['Item Code']);
    if (existing) {
      if (existing.qty >= currentStock) {
        Swal.fire('เกินสต็อก', `คงเหลือสูงสุด ${currentStock} ${item.Unit}`, 'warning');
        return;
      }
      setCart(cart.map((c) => c.itemCode === item['Item Code'] ? { ...c, qty: c.qty + 1 } : c));
      return;
    }

    setCart([
      ...cart,
      {
        itemCode: item['Item Code'],
        genericName: item['Generic Name'],
        tradeName: item['Trade Name'],
        itemType: item['Item Type'],
        unit: item.Unit,
        currentStock,
        qty: 1
      }
    ]);
  };

  const changeCartQty = (itemCode: string, delta: number) => {
    setCart(
      cart
        .map((c) => {
          if (c.itemCode !== itemCode) return c;
          const qty = c.qty + delta;
          if (qty > c.currentStock) return c;
          return qty <= 0 ? null : { ...c, qty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const resetForm = () => {
    setSelectedStudent(null);
    setStudentQuery('');
    setStudentList([]);
    setSelectedSymptoms([]);
    setOtherSymptom('');
    setAssessment('');
    setNote('');
    setInterventions([]);
    setDisposition('');
    setOutcomeNote('');
    setTemperature('');
    setBpSystolic('');
    setBpDiastolic('');
    setPulse('');
    setRespiratoryRate('');
    setSpo2('');
    setWeight('');
    setCart([]);
    setItemSearch('');
  };

  const buildVitals = (): VisitVitals => ({
    temperature: numericOrBlank(temperature),
    bpSystolic: numericOrBlank(bpSystolic),
    bpDiastolic: numericOrBlank(bpDiastolic),
    pulse: numericOrBlank(pulse),
    respiratoryRate: numericOrBlank(respiratoryRate),
    spo2: numericOrBlank(spo2),
    weight: numericOrBlank(weight)
  });

  const handleSubmit = async () => {
    if (!selectedStudent) {
      Swal.fire('ยังไม่ได้เลือกนักเรียน', 'กรุณาเลือกนักเรียนก่อนบันทึก Visit', 'warning');
      return;
    }

    const vitals = buildVitals();
    if (!hasVisitClinicalContent({
      symptoms: selectedSymptoms,
      otherSymptom,
      note,
      assessment,
      interventions,
      vitals
    })) {
      Swal.fire('ข้อมูล Clinical ยังไม่ครบ', 'กรุณาระบุอาการ สัญญาณชีพ การดูแล บันทึก หรือผลการประเมินอย่างน้อย 1 รายการ', 'warning');
      return;
    }

    if (!disposition) {
      Swal.fire('ยังไม่ได้ระบุผลลัพธ์', 'กรุณาเลือก Disposition ก่อนจบ Visit', 'warning');
      return;
    }

    for (const c of cart) {
      if (c.qty > c.currentStock) {
        Swal.fire('สต็อกไม่เพียงพอ', `${c.genericName || c.itemCode} คงเหลือ ${c.currentStock}`, 'error');
        return;
      }
    }

    const dispositionLabel = DISPOSITIONS.find(([code]) => code === disposition)?.[1] || disposition;
    const confirm = await Swal.fire({
      title: 'ยืนยันบันทึก Visit',
      text: [
        `นักเรียน: ${selectedStudent.fullName} (${selectedStudent.studentId})`,
        `อาการ: ${selectedSymptoms.join(', ') || otherSymptom || '-'}`,
        `Assessment: ${assessment || '-'}`,
        `Disposition: ${dispositionLabel}`,
        `ยา/เวชภัณฑ์: ${cart.length ? cart.length + ' รายการ' : 'ไม่มีการจ่าย'}`
      ].join('\n'),
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'บันทึก Visit',
      cancelButtonText: 'กลับไปแก้ไข',
      confirmButtonColor: '#0b1f3a'
    });
    if (!confirm.isConfirmed || !session?.token) return;

    const clientTransactionId = 'VISIT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
    setSubmitting(true);
    Swal.fire({ title: 'กำลังบันทึก Visit...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      const result = await api<{ visitId: string; disposition: string; status: string }>(
        'submitVisit',
        {
          studentId: selectedStudent.studentId,
          symptoms: selectedSymptoms,
          otherSymptom: otherSymptom.trim(),
          note: note.trim(),
          assessment: assessment.trim(),
          vitals,
          interventions,
          disposition,
          outcomeNote: outcomeNote.trim(),
          items: cart.map((c) => ({
            itemCode: c.itemCode,
            qty: c.qty,
            itemName: c.tradeName && c.genericName ? `${c.tradeName} (${c.genericName})` : (c.tradeName || c.genericName || c.itemCode),
            itemType: c.itemType,
            unit: c.unit
          })),
          clientTransactionId
        },
        session.token
      );

      await Swal.fire({
        icon: 'success',
        title: 'บันทึก Visit สำเร็จ',
        html: `Visit ID: <b>${result.visitId}</b><br/>สถานะ: ${result.status}`,
        confirmButtonText: 'รับนักเรียนคนถัดไป',
        confirmButtonColor: '#0b1f3a'
      });
      resetForm();
      loadItems();
    } catch (err: any) {
      Swal.fire('บันทึกไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาดในการบันทึก Visit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const vitalInput = (label: string, value: string, setValue: (v: string) => void, unit?: string, min?: number, max?: number) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          className="form-control"
          type="number"
          step="any"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {unit && <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className="main-content">
      <div style={{ marginBottom: 20 }}>
        <h2>รับบริการใหม่ (New Visit)</h2>
        <p style={{ color: '#64748b' }}>
          บันทึกอาการ ประเมิน สัญญาณชีพ การดูแล ผลลัพธ์ และจ่ายยา/เวชภัณฑ์เมื่อจำเป็น
        </p>
      </div>

      <div className="grid-2">
        <div>
          <section className="card">
            <div className="card-header"><span className="card-title">1. นักเรียน</span></div>
            {!selectedStudent ? (
              <>
                <div className="search-bar">
                  <input
                    className="form-control"
                    placeholder="รหัสนักเรียน / ชื่อ / นามสกุล / ชั้น"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                  />
                  <button className="btn btn-primary" onClick={handleSearchStudent} disabled={searchingStudent || !studentQuery.trim()}>
                    {searchingStudent ? 'กำลังค้นหา...' : 'ค้นหา'}
                  </button>
                </div>
                <div style={{ marginTop: 12 }}>
                  {studentList.map((stu) => (
                    <div key={stu.studentId} className="cart-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedStudent(stu)}>
                      <div>
                        <strong>{stu.fullName}</strong>
                        <div style={{ color: '#64748b', fontSize: '.85rem' }}>{stu.studentId} · {stu.grade}/{stu.className}</div>
                      </div>
                      <button className="btn btn-primary btn-sm">เลือก</button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div>
                  <strong>{selectedStudent.fullName}</strong>
                  <div style={{ color: '#64748b' }}>{selectedStudent.studentId} · {selectedStudent.grade}/{selectedStudent.className}</div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setSelectedStudent(null)}>เปลี่ยนนักเรียน</button>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">2. อาการและสัญญาณชีพ</span></div>
            <div className="symptom-grid">
              {COMMON_SYMPTOMS.map((sym) => (
                <div
                  key={sym}
                  className={`symptom-chip ${selectedSymptoms.includes(sym) ? 'selected' : ''}`}
                  onClick={() => toggleValue(sym, selectedSymptoms, setSelectedSymptoms)}
                >
                  <span>{selectedSymptoms.includes(sym) ? '✓' : '+'}</span>
                  <span>{sym}</span>
                </div>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">อาการอื่นๆ</label>
              <input className="form-control" value={otherSymptom} onChange={(e) => setOtherSymptom(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
              {vitalInput('Temperature', temperature, setTemperature, '°C', 30, 45)}
              {vitalInput('Weight', weight, setWeight, 'kg', 1, 300)}
              {vitalInput('BP Systolic', bpSystolic, setBpSystolic, 'mmHg', 40, 260)}
              {vitalInput('BP Diastolic', bpDiastolic, setBpDiastolic, 'mmHg', 20, 180)}
              {vitalInput('Pulse', pulse, setPulse, '/min', 20, 250)}
              {vitalInput('Respiratory Rate', respiratoryRate, setRespiratoryRate, '/min', 5, 100)}
              {vitalInput('SpO₂', spo2, setSpo2, '%', 50, 100)}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">3. Assessment & Intervention</span></div>
            <div className="form-group">
              <label className="form-label">Nursing / Infirmary Assessment</label>
              <textarea className="form-control" value={assessment} onChange={(e) => setAssessment(e.target.value)} placeholder="เช่น Mild URI symptoms, minor abrasion, headache..." />
            </div>
            <div className="form-group">
              <label className="form-label">บันทึกเพิ่มเติม</label>
              <textarea className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {INTERVENTIONS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={`btn btn-sm ${interventions.includes(code) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleValue(code, interventions, setInterventions)}
                >
                  {interventions.includes(code) ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div>
          <section className="card">
            <div className="card-header">
              <span className="card-title">4. ยา/เวชภัณฑ์ (Optional)</span>
              <button className="btn btn-outline btn-sm" onClick={loadItems} disabled={loadingItems}>
                {loadingItems ? 'กำลังโหลด...' : 'รีเฟรช'}
              </button>
            </div>
            <p style={{ color: '#64748b', fontSize: '.85rem' }}>Visit สามารถบันทึกได้โดยไม่ต้องจ่ายยา/เวชภัณฑ์</p>
            <div className="tabs" style={{ marginBottom: 10 }}>
              {(['ALL','DRUG','MEDICAL_SUPPLY'] as const).map((x) => (
                <button key={x} className={`tab-item ${itemTypeFilter === x ? 'active' : ''}`} onClick={() => setItemTypeFilter(x)}>
                  {x === 'ALL' ? 'ทั้งหมด' : x === 'DRUG' ? 'ยา' : 'เวชภัณฑ์'}
                </button>
              ))}
            </div>
            <input className="form-control" placeholder="ค้นหารายการ..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
            <div style={{ maxHeight: 230, overflowY: 'auto', marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {filteredItems.map((item) => (
                <div key={item['Item Code']} className="cart-item">
                  <div>
                    <strong>{item['Trade Name'] || item['Generic Name'] || item['Item Code']}</strong>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>{item['Generic Name']} · คงเหลือ {item.QTY} {item.Unit}</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => addToCart(item)} disabled={Number(item.QTY) <= 0}>+ เพิ่ม</button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              {cart.length === 0 ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: 12 }}>ไม่มีรายการจ่าย</div>
              ) : cart.map((c) => (
                <div key={c.itemCode} className="cart-item">
                  <div>
                    <strong>{c.tradeName || c.genericName}</strong>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>{c.itemCode}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => changeCartQty(c.itemCode, -1)}>-</button>
                    <strong>{c.qty}</strong>
                    <button className="btn btn-outline btn-sm" onClick={() => changeCartQty(c.itemCode, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header"><span className="card-title">5. Outcome / Disposition *</span></div>
            <div className="form-group">
              <label className="form-label">ผลลัพธ์หลังรับบริการ</label>
              <select className="form-control" value={disposition} onChange={(e) => setDisposition(e.target.value as VisitDisposition | '')}>
                <option value="">-- เลือก Disposition --</option>
                {DISPOSITIONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Outcome Note</label>
              <textarea className="form-control" value={outcomeNote} onChange={(e) => setOutcomeNote(e.target.value)} placeholder="เช่น อาการดีขึ้นหลังพัก 20 นาที / ผู้ปกครองรับกลับ 14:10 น." />
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginTop: 10 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'กำลังบันทึก...' : 'บันทึกและปิด Visit'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
