import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Student, DispenseHeaderRecord } from '../types';
import { api } from '../api';
import Swal from 'sweetalert2';

export const StudentsPage: React.FC = () => {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [history, setHistory] = useState<DispenseHeaderRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !session?.token) return;
    setSearching(true);
    setSelectedStudent(null);
    try {
      const res = await api<Student[]>('searchStudents', { q: query.trim() }, session.token);
      setStudents(res || []);
      if (!res || res.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'ไม่พบข้อมูล',
          text: 'ไม่พบนักเรียนตามคำค้นหา',
          confirmButtonColor: '#0b1f3a'
        });
      }
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'ค้นหาล้มเหลว',
        text: err.message,
        confirmButtonColor: '#0b1f3a'
      });
    } finally {
      setSearching(false);
    }
  };

  const handleSelectStudent = async (stu: Student) => {
    setSelectedStudent(stu);
    if (!session?.token) return;
    setLoadingHistory(true);
    try {
      const res = await api<DispenseHeaderRecord[]>(
        'getStudentHistory',
        { studentId: stu.studentId },
        session.token
      );
      setHistory(res || []);
    } catch (err: any) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  return (
    <div className="main-content">
      <div style={{ marginBottom: '20px' }}>
        <h2>ข้อมูลและประวัติการรักษานักเรียน</h2>
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
          ค้นหาข้อมูลนักเรียนและตรวจสอบประวัติการเข้ารับการรักษาและการจ่ายยาในอดีต
        </p>
      </div>

      <div className="grid-2">
        {/* Left: Search & Results */}
        <section className="card">
          <div className="card-header">
            <span className="card-title">ค้นหานักเรียน</span>
          </div>

          <div className="search-bar">
            <input
              type="text"
              className="form-control"
              placeholder="รหัสนักเรียน / ชื่อ / นามสกุล / ชั้น / ห้อง"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button
              className="btn btn-primary"
              onClick={handleSearch}
              disabled={searching || !query.trim()}
            >
              {searching ? 'กำลังค้นหา...' : 'ค้นหา'}
            </button>
          </div>

          <div style={{ marginTop: '16px' }}>
            {students.length > 0 ? (
              students.map((stu) => (
                <div
                  key={stu.studentId}
                  className={`cart-item ${selectedStudent?.studentId === stu.studentId ? 'selected' : ''}`}
                  style={{
                    cursor: 'pointer',
                    background: selectedStudent?.studentId === stu.studentId ? '#eff6ff' : undefined,
                    borderColor: selectedStudent?.studentId === stu.studentId ? '#3b82f6' : undefined
                  }}
                  onClick={() => handleSelectStudent(stu)}
                >
                  <div>
                    <strong>{stu.fullName}</strong>
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      รหัส: {stu.studentId} · ชั้น {stu.grade}/{stu.className}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-outline">ดูประวัติ</button>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>
                พิมพ์คำค้นหาเพื่อแสดงรายชื่อนักเรียน
              </div>
            )}
          </div>
        </section>

        {/* Right: Selected Student Details & Visit Timeline */}
        <div>
          {selectedStudent ? (
            <div>
              {/* Profile Card */}
              <section className="card" style={{ marginBottom: '16px' }}>
                <div className="card-header">
                  <span className="card-title">ข้อมูลส่วนตัว</span>
                  <span className="badge badge-success">{selectedStudent.status || 'Active'}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>รหัสนักเรียน</span>
                    <div style={{ fontWeight: 700 }}>{selectedStudent.studentId}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ชื่อ - นามสกุล</span>
                    <div style={{ fontWeight: 700 }}>{selectedStudent.fullName}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ระดับชั้น</span>
                    <div style={{ fontWeight: 700 }}>{selectedStudent.grade}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>ห้องเรียน</span>
                    <div style={{ fontWeight: 700 }}>{selectedStudent.className}</div>
                  </div>
                </div>
              </section>

              {/* History Timeline */}
              <section className="card">
                <div className="card-header">
                  <span className="card-title">ประวัติการรับบริการ ({history.length} ครั้ง)</span>
                </div>

                {loadingHistory ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                    กำลังโหลดประวัติการรักษา...
                  </div>
                ) : history.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                    ไม่มีประวัติการเข้ารับบริการในระบบ
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {history.map((v) => {
                      let symptoms: string[] = [];
                      try {
                        symptoms = JSON.parse(v.Symptoms || '[]');
                      } catch {
                        symptoms = v.Symptoms ? [v.Symptoms] : [];
                      }

                      return (
                        <div
                          key={v['Visit ID']}
                          style={{
                            padding: '14px',
                            border: '1px solid #e2e8f0',
                            borderRadius: '8px',
                            background: '#f8fafc'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <strong style={{ color: '#0b1f3a' }}>{v['Visit Date']} {v['Visit Time']}</strong>
                            <span className="badge badge-primary">{v['Visit ID']}</span>
                          </div>

                          <div style={{ fontSize: '0.9rem', marginBottom: '6px' }}>
                            <span style={{ color: '#64748b' }}>อาการ: </span>
                            <strong>{symptoms.join(', ') || '-'}{v['Other Symptom'] ? ` (${v['Other Symptom']})` : ''}</strong>
                          </div>

                          {v.Note && (
                            <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '8px' }}>
                              <em>บันทึก: {v.Note}</em>
                            </div>
                          )}

                          {v.items && v.items.length > 0 && (
                            <div style={{ marginTop: '8px', borderTop: '1px dashed #cbd5e1', paddingTop: '8px' }}>
                              <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                เวชภัณฑ์ที่ได้รับ:
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {v.items.map((it) => (
                                  <span key={it['Dispense Item ID']} className="badge badge-gray" style={{ textTransform: 'none' }}>
                                    {it['Item Name'] || it['Item Code']} × {it.Qty} {it.Unit}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '6px', textAlign: 'right' }}>
                            ผู้บันทึก: {v['Staff ID']}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '48px 16px', color: '#94a3b8' }}>
              คลิกเลือกนักเรียนจากผลการค้นหาทางด้านซ้ายเพื่อดูประวัติการรักษา
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
