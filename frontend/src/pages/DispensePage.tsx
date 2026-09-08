import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Student, Item, CartItem } from '../types';
import { api } from '../api';
import { normalizeItemType } from '../domain/stock';
import Swal from 'sweetalert2';

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
  'อื่นๆ (Other)'
];

export const DispensePage: React.FC = () => {
  const { session } = useAuth();

  // Student State
  const [studentQuery, setStudentQuery] = useState('');
  const [studentList, setStudentList] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchingStudent, setSearchingStudent] = useState(false);

  // Symptoms & Notes
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [otherSymptom, setOtherSymptom] = useState('');
  const [note, setNote] = useState('');

  // Items & Cart
  const [items, setItems] = useState<Item[]>([]);
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'DRUG' | 'MEDICAL_SUPPLY'>('ALL');
  const [itemSearch, setItemSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // Submission State
  const [submitting, setSubmitting] = useState(false);

  // Fetch Items on mount
  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    if (!session?.token) return;
    setLoadingItems(true);
    try {
      const data = await api<Item[]>('getItems', {}, session.token);
      setItems(data || []);
    } catch (err: any) {
      console.error('Failed to load items:', err);
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
      if (!data || data.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูลนักเรียน',
          text: 'ไม่พบลำดับที่ตรงกับคำค้นหา กรุณาตรวจสอบรหัสหรือชื่อ',
          confirmButtonColor: '#0b1f3a'
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'ค้นหาผิดพลาด',
        text: err.message,
        confirmButtonColor: '#0b1f3a'
      });
    } finally {
      setSearchingStudent(false);
    }
  };

  const toggleSymptom = (sym: string) => {
    if (selectedSymptoms.includes(sym)) {
      setSelectedSymptoms(selectedSymptoms.filter((s) => s !== sym));
      if (sym.includes('Other') || sym.includes('อื่นๆ')) setOtherSymptom('');
    } else {
      setSelectedSymptoms([...selectedSymptoms, sym]);
    }
  };

  const addToCart = (item: Item) => {
    const existing = cart.find((c) => c.itemCode === item['Item Code']);
    const currentStock = Number(item.QTY) || 0;

    if (currentStock <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'สต็อกหมด',
        text: `รายการ ${item['Generic Name'] || item['Trade Name']} ไม่มีในคลัง`,
        confirmButtonColor: '#0b1f3a'
      });
      return;
    }

    if (existing) {
      if (existing.qty + 1 > currentStock) {
        Swal.fire({
          icon: 'warning',
          title: 'เกินจำนวนสต็อก',
          text: `สต็อกคงเหลือทั้งหมดมีเพียง ${currentStock} ${item.Unit}`,
          confirmButtonColor: '#0b1f3a'
        });
        return;
      }
      setCart(
        cart.map((c) =>
          c.itemCode === item['Item Code'] ? { ...c, qty: c.qty + 1 } : c
        )
      );
    } else {
      setCart([
        ...cart,
        {
          itemCode: item['Item Code'],
          genericName: item['Generic Name'],
          tradeName: item['Trade Name'],
          itemType: item['Item Type'],
          unit: item.Unit,
          currentStock: currentStock,
          qty: 1
        }
      ]);
    }
  };

  const updateCartQty = (itemCode: string, delta: number) => {
    setCart(
      cart
        .map((c) => {
          if (c.itemCode !== itemCode) return c;
          const newQty = c.qty + delta;
          if (newQty > c.currentStock) {
            Swal.fire({
              icon: 'warning',
              title: 'เกินสต็อก',
              text: `คงเหลือสูงสุด ${c.currentStock} ${c.unit}`,
              confirmButtonColor: '#0b1f3a'
            });
            return c;
          }
          return newQty <= 0 ? null : { ...c, qty: newQty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (itemCode: string) => {
    setCart(cart.filter((c) => c.itemCode !== itemCode));
  };

  const filteredItems = items.filter((item) => {
    const itemType = normalizeItemType(item['Item Type']);
    const matchType =
      itemTypeFilter === 'ALL' || itemType === itemTypeFilter;
    const q = itemSearch.toLowerCase().trim();
    const matchQuery =
      !q ||
      item['Item Code'].toLowerCase().includes(q) ||
      (item['Generic Name'] || '').toLowerCase().includes(q) ||
      (item['Trade Name'] || '').toLowerCase().includes(q);
    return matchType && matchQuery;
  });

  const handleSubmitDispense = async () => {
    if (!selectedStudent) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่ได้เลือกนักเรียน',
        text: 'กรุณาค้นหาและเลือกนักเรียนก่อนทำการเบิกจ่าย',
        confirmButtonColor: '#0b1f3a'
      });
      return;
    }

    if (cart.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'ยังไม่มีรายการยา/เวชภัณฑ์',
        text: 'กรุณาเลือกรายการยาหรือเวชภัณฑ์อย่างน้อย 1 รายการ',
        confirmButtonColor: '#0b1f3a'
      });
      return;
    }

    if (selectedSymptoms.length === 0 && !note.trim()) {
      Swal.fire({
        icon: 'warning',
        title: 'กรุณาระบุอาการ',
        text: 'เลือกอาการหรือระบุบันทึกอาการของนักเรียน',
        confirmButtonColor: '#0b1f3a'
      });
      return;
    }

    // Pre-validate stock
    for (const c of cart) {
      if (c.qty > c.currentStock) {
        Swal.fire({
          icon: 'error',
          title: 'สต็อกไม่เพียงพอ',
          text: `รายการ ${c.genericName || c.itemCode} ต้องการ ${c.qty} แต่คงเหลือเพียง ${c.currentStock}`,
          confirmButtonColor: '#0b1f3a'
        });
        return;
      }
    }

    // SweetAlert2 Confirmation Dialog with Visit Breakdown
    const itemsHtml = `
      <div style="text-align: left; font-size: 0.95rem; margin-top: 10px;">
        <div style="background: #f1f5f9; padding: 10px 12px; border-radius: 8px; margin-bottom: 12px;">
          <div><b>นักเรียน:</b> ${selectedStudent.fullName} (${selectedStudent.studentId})</div>
          <div><b>ชั้นเรียน:</b> ${selectedStudent.grade}/${selectedStudent.className}</div>
          <div><b>อาการ:</b> ${selectedSymptoms.join(', ') || '-'}${otherSymptom ? ` (${otherSymptom})` : ''}</div>
          ${note ? `<div><b>หมายเหตุ:</b> ${note}</div>` : ''}
        </div>
        <b>รายการเวชภัณฑ์ที่จ่าย:</b>
        <table style="width: 100%; border-collapse: collapse; margin-top: 6px;">
          <thead>
            <tr style="border-bottom: 2px solid #cbd5e1; color: #475569;">
              <th style="text-align: left; padding: 6px 0;">รายการ</th>
              <th style="text-align: right; padding: 6px 0;">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            ${cart
              .map(
                (c) => `
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 8px 0;">
                  <div style="font-weight: 700; color: #0f172a;">${c.tradeName || c.genericName}</div>
                  ${c.tradeName && c.genericName ? `<div style="font-size: 0.85rem; color: #64748b;">${c.genericName}</div>` : ''}
                </td>
                <td style="text-align: right; font-weight: 700; vertical-align: top; padding-top: 8px;">${c.qty} ${c.unit}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;

    const confirm = await Swal.fire({
      title: 'ยืนยันการบันทึกจ่ายยา/เวชภัณฑ์',
      html: itemsHtml,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0b1f3a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ยืนยันจ่ายยา',
      cancelButtonText: 'แก้ไขข้อมูล'
    });

    if (!confirm.isConfirmed) return;

    // Generate unique clientTransactionId to protect against duplicate submission
    const clientTransactionId = 'TX-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    setSubmitting(true);
    Swal.fire({
      title: 'กำลังบันทึกข้อมูล...',
      text: 'ระบบกำลังตัดสต็อกแบบ FEFO และบันทึกประวัติการรักษา',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      const payload = {
        studentId: selectedStudent.studentId,
        symptoms: selectedSymptoms,
        otherSymptom: otherSymptom.trim(),
        note: note.trim(),
        items: cart.map((c) => ({
          itemCode: c.itemCode,
          qty: c.qty,
          itemName: c.tradeName && c.genericName ? `${c.tradeName} (${c.genericName})` : (c.tradeName || c.genericName || c.itemCode),
          itemType: c.itemType,
          unit: c.unit
        })),
        clientTransactionId
      };

      const result = await api<{ visitId: string; items: any[] }>('submitDispense', payload, session?.token);

      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ!',
        html: `
          <div style="font-size: 1.1rem; margin-top: 8px;">
            <div>บันทึกการรักษาและจ่ายยาเรียบร้อยแล้ว</div>
            <div style="margin-top: 10px; background: #e0f2fe; color: #0369a1; padding: 8px 12px; border-radius: 8px; font-weight: 700;">
              Visit ID: ${result.visitId}
            </div>
          </div>
        `,
        confirmButtonColor: '#0b1f3a',
        confirmButtonText: 'รับนักเรียนคนถัดไป'
      });

      // Reset state for next student
      setSelectedStudent(null);
      setStudentQuery('');
      setStudentList([]);
      setSelectedSymptoms([]);
      setOtherSymptom('');
      setNote('');
      setCart([]);
      loadItems(); // Refresh latest item stock count
    } catch (err: any) {
      console.error('Submit dispense failed:', err);
      Swal.fire({
        icon: 'error',
        title: 'การบันทึกไม่สำเร็จ',
        text: err.message || 'เกิดข้อผิดพลาดในการตัดสต็อก กรุณาลองใหม่อีกครั้ง',
        confirmButtonColor: '#0b1f3a'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="main-content">
      <div style={{ marginBottom: '20px' }}>
        <h2>บันทึกการรักษาและจ่ายยา (Dispensing)</h2>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
          ค้นหานักเรียน บันทึกอาการ และจ่ายยา/เวชภัณฑ์พร้อมตัดสต็อกตามหลัก FEFO
        </p>
      </div>

      <div className="grid-2">
        {/* Left Column: Student & Symptoms */}
        <div>
          {/* Section 1: Student Search & Selection */}
          <section className="card">
            <div className="card-header">
              <span className="card-title">1. ข้อมูลนักเรียน</span>
              {selectedStudent && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectedStudent(null)}
                >
                  เปลี่ยนนักเรียน
                </button>
              )}
            </div>

            {!selectedStudent ? (
              <div>
                <div className="search-bar">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="ค้นหาด้วย รหัสนักเรียน (เช่น 01234) / ชื่อ / นามสกุล / ชั้น"
                    value={studentQuery}
                    onChange={(e) => setStudentQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={handleSearchStudent}
                    disabled={searchingStudent || !studentQuery.trim()}
                  >
                    {searchingStudent ? 'ค้นหา...' : 'ค้นหา'}
                  </button>
                </div>

                {studentList.length > 0 && (
                  <div style={{ marginTop: '12px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                      ผลการค้นหา ({studentList.length} รายการ):
                    </div>
                    {studentList.map((stu) => (
                      <div
                        key={stu.studentId}
                        className="cart-item"
                        style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                        onClick={() => setSelectedStudent(stu)}
                      >
                        <div>
                          <strong>{stu.fullName}</strong>
                          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            รหัส: {stu.studentId} · ชั้น: {stu.grade}/{stu.className}
                          </div>
                        </div>
                        <button className="btn btn-primary btn-sm">เลือก</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#0b1f3a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', fontWeight: 700 }}>
                    {selectedStudent.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{selectedStudent.fullName}</h3>
                    <div style={{ fontSize: '0.88rem', color: '#64748b' }}>
                      รหัสนักเรียน: <strong>{selectedStudent.studentId}</strong> · ชั้นเรียน: <strong>{selectedStudent.grade}/{selectedStudent.className}</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Section 2: Symptoms & Notes */}
          <section className="card">
            <div className="card-header">
              <span className="card-title">2. อาการและข้อสังเกต</span>
            </div>

            <div className="symptom-grid">
              {COMMON_SYMPTOMS.map((sym) => {
                const isSelected = selectedSymptoms.includes(sym);
                return (
                  <div
                    key={sym}
                    className={`symptom-chip ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggleSymptom(sym)}
                  >
                    <span>{isSelected ? '✓' : '+'}</span>
                    <span>{sym.split(' ')[0]}</span>
                  </div>
                );
              })}
            </div>

            {selectedSymptoms.some((s) => s.includes('Other') || s.includes('อื่นๆ')) && (
              <div className="form-group">
                <label className="form-label">ระบุอาการอื่นๆ</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="เช่น ผื่นคัน, แน่นหน้าอก"
                  value={otherSymptom}
                  onChange={(e) => setOtherSymptom(e.target.value)}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">บันทึกเพิ่มเติม (Note)</label>
              <textarea
                className="form-control"
                placeholder="ระบุรายละเอียดการตรวจเบื้องต้น เช่น อุณหภูมิ 37.8 C หรืออาการที่พบ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </section>
        </div>

        {/* Right Column: Items & Cart */}
        <div>
          {/* Section 3: Item Picker */}
          <section className="card">
            <div className="card-header">
              <span className="card-title">3. เลือกยาและเวชภัณฑ์</span>
              <button className="btn btn-outline btn-sm" onClick={loadItems} disabled={loadingItems}>
                {loadingItems ? 'โหลด...' : 'รีเฟรชสต็อก'}
              </button>
            </div>

            <div className="tabs" style={{ marginBottom: '12px' }}>
              <button
                className={`tab-item ${itemTypeFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('ALL')}
              >
                ทั้งหมด
              </button>
              <button
                className={`tab-item ${itemTypeFilter === 'DRUG' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('DRUG')}
              >
                💊 ยา (Drug)
              </button>
              <button
                className={`tab-item ${itemTypeFilter === 'MEDICAL_SUPPLY' ? 'active' : ''}`}
                onClick={() => setItemTypeFilter('MEDICAL_SUPPLY')}
              >
                🩹 เวชภัณฑ์ (Supply)
              </button>
            </div>

            <div className="search-bar">
              <input
                type="text"
                className="form-control"
                placeholder="ค้นหาชื่อการค้า หรือ ชื่อสามัญยา..."
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
              />
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                  {loadingItems ? 'กำลังโหลดรายการเวชภัณฑ์...' : 'ไม่พบรายการยาหรือเวชภัณฑ์'}
                </div>
              ) : (
                filteredItems.map((item) => {
                  const stock = Number(item.QTY) || 0;
                  const inCart = cart.find((c) => c.itemCode === item['Item Code']);
                  const isOutOfStock = stock <= 0;

                  return (
                    <div
                      key={item['Item Code']}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderBottom: '1px solid #f1f5f9',
                        background: inCart ? '#f0fdf4' : '#fff'
                      }}
                    >
                      <div>
                        {item['Trade Name'] && item['Generic Name'] ? (
                          <>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                              {item['Trade Name']}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#475569', marginTop: '1px' }}>
                              {item['Generic Name']}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                            {item['Trade Name'] || item['Generic Name'] || item['Item Code']}
                          </div>
                        )}
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className={`badge ${normalizeItemType(item['Item Type']) === 'DRUG' ? 'badge-primary' : 'badge-gray'}`} style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                            {normalizeItemType(item['Item Type']) === 'DRUG' ? '💊 ยา' : '🩹 เวชภัณฑ์'}
                          </span>
                          <span>
                            คงเหลือ:{' '}
                            <strong style={{ color: isOutOfStock ? '#dc2626' : '#059669' }}>
                              {stock} {item.Unit}
                            </strong>
                          </span>
                        </div>
                      </div>

                      <button
                        className={`btn btn-sm ${isOutOfStock ? 'btn-secondary' : 'btn-primary'}`}
                        disabled={isOutOfStock}
                        onClick={() => addToCart(item)}
                      >
                        {isOutOfStock ? 'หมด' : inCart ? `+ เพิ่ม (${inCart.qty})` : '+ เลือก'}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Section 4: Visit Cart & Submit */}
          <section className="card" style={{ border: cart.length > 0 ? '2px solid #0b1f3a' : undefined }}>
            <div className="card-header">
              <span className="card-title">
                🛒 รายการที่ต้องการจ่าย ({cart.length} รายการ)
              </span>
              {cart.length > 0 && (
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => setCart([])}
                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                >
                  ล้างรายการ
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8' }}>
                ยังไม่มีรายการยา/เวชภัณฑ์ในตะกร้า
              </div>
            ) : (
              <div>
                {cart.map((item) => (
                  <div key={item.itemCode} className="cart-item">
                    <div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>
                        {item.tradeName && item.genericName
                          ? `${item.tradeName} (${item.genericName})`
                          : item.tradeName || item.genericName}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                        คงเหลือในคลัง: {item.currentStock} {item.unit}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="qty-stepper">
                        <button className="qty-btn" onClick={() => updateCartQty(item.itemCode, -1)}>
                          -
                        </button>
                        <span className="qty-display">{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateCartQty(item.itemCode, 1)}>
                          +
                        </button>
                      </div>
                      <span style={{ fontSize: '0.85rem', color: '#64748b', minWidth: '40px' }}>
                        {item.unit}
                      </span>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: '#dc2626', padding: '4px 8px' }}
                        onClick={() => removeFromCart(item.itemCode)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  className="btn btn-accent"
                  style={{ width: '100%', marginTop: '16px', height: '50px', fontSize: '1.05rem' }}
                  onClick={handleSubmitDispense}
                  disabled={submitting || !selectedStudent || cart.length === 0}
                >
                  {submitting ? 'กำลังบันทึกและตัดสต็อก...' : 'บันทึกจ่ายยาและเวชภัณฑ์'}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
