import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Student, DispenseHeaderRecord } from '../types';
import { api } from '../api';
import { parseStudentsInput, StudentImportRow } from '../utils/csvParser';
import Swal from 'sweetalert2';

export const StudentsPage: React.FC = () => {
  const { session, isRole } = useAuth();
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [history, setHistory] = useState<DispenseHeaderRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedStudents, setParsedStudents] = useState<StudentImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canImport = isRole(['ADMIN', 'SUPER_ADMIN']);

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

  const handleTextChange = (text: string) => {
    setImportText(text);
    if (!text.trim()) {
      setParsedStudents([]);
      setParseErrors([]);
      return;
    }
    const res = parseStudentsInput(text);
    setParsedStudents(res.data);
    setParseErrors(res.errors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      handleTextChange(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
      'Student ID,First Name,Last Name,Full Name,Grade,Class,Gender,Status\n' +
      '01001,สมชาย,ใจดี,สมชาย ใจดี,ป.1,1,ชาย,ACTIVE\n' +
      '01002,สมหญิง,รักเรียน,สมหญิง รักเรียน,ป.1,2,หญิง,ACTIVE\n' +
      '01003,อนันต์,สุขใจ,อนันต์ สุขใจ,ม.1,1,ชาย,ACTIVE\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'STUDENTS_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmImport = async () => {
    if (!parsedStudents.length || !session?.token) return;
    setImporting(true);
    try {
      const res = await api<{ added: number; updated: number; total: number }>(
        'importStudents',
        { students: parsedStudents },
        session.token
      );
      Swal.fire({
        icon: 'success',
        title: 'นำเข้าข้อมูลนักเรียนสำเร็จ!',
        html: `เพิ่มใหม่: <b>${res.added}</b> รายการ<br/>อัปเดต: <b>${res.updated}</b> รายการ<br/>รวมทั้งหมด: <b>${res.total}</b> รายการ`,
        confirmButtonColor: '#0b1f3a'
      });
      setShowImportModal(false);
      setImportText('');
      setParsedStudents([]);
      setParseErrors([]);
    } catch (err: any) {
      Swal.fire('นำเข้าข้อมูลล้มเหลว', err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>ข้อมูลและประวัติการรักษานักเรียน</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            ค้นหาข้อมูลนักเรียนและตรวจสอบประวัติการเข้ารับการรักษาและการจ่ายยาในอดีต
          </p>
        </div>
        {canImport && (
          <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
            📁 นำเข้าข้อมูลนักเรียน (Upload CSV)
          </button>
        )}
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
              placeholder="รหัสนักเรียน (เช่น 01234) / ชื่อ / นามสกุล / ชั้น / ห้อง"
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

      {/* Modal: Import Students */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="card-header">
              <span className="card-title">📁 นำเข้ารายชื่อนักเรียน (Import Student Roster)</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setParsedStudents([]);
                  setParseErrors([]);
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '14px' }}>
              อัปโหลดไฟล์ <code>.csv</code> หรือคัดลอกตารางจาก Excel / Google Sheets มาวาง (หัวตารางตรงตาม Google Sheet: <code>Student ID, First Name, Last Name, Full Name, Grade, Class, Gender, Status</code>)
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                📄 เลือกไฟล์ CSV / Text
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleDownloadTemplate}
              >
                ⬇️ ดาวน์โหลดแม่แบบ CSV (ตรงตาม Google Sheet)
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">
                วางข้อมูลข้อความ (CSV / คัดลอกจาก Google Sheet หรือ Excel)
              </label>
              <textarea
                className="form-control"
                rows={5}
                placeholder="Student ID,First Name,Last Name,Full Name,Grade,Class,Gender,Status&#10;01001,สมชาย,ใจดี,สมชาย ใจดี,ป.1,1,ชาย,ACTIVE"
                value={importText}
                onChange={(e) => handleTextChange(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>

            {/* Error Message */}
            {parseErrors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '14px' }}>
                <strong>พบข้อผิดพลาด:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {parseErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview Section */}
            {parsedStudents.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    พรีวิวข้อมูลที่จะนำเข้า (ทั้งหมด {parsedStudents.length} รายการ):
                  </strong>
                  <span className="badge badge-primary">{parsedStudents.length} รายการ</span>
                </div>

                <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>รหัสนักเรียน</th>
                        <th>ชื่อ - นามสกุล</th>
                        <th>ชั้น</th>
                        <th>ห้อง</th>
                        <th>เพศ</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedStudents.slice(0, 10).map((s, idx) => (
                        <tr key={idx}>
                          <td><strong>{s.studentId}</strong></td>
                          <td>{s.fullName}</td>
                          <td>{s.grade}</td>
                          <td>{s.className}</td>
                          <td>{s.gender || '-'}</td>
                          <td><span className="badge badge-success">{s.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedStudents.length > 10 && (
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                    * แสดงตัวอย่าง 10 รายการแรกจากทั้งหมด {parsedStudents.length} รายการ
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={parsedStudents.length === 0 || importing}
                onClick={handleConfirmImport}
              >
                {importing ? 'กำลังนำเข้าข้อมูล...' : `ยืนยันนำเข้าข้อมูล (${parsedStudents.length} รายการ)`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={importing}
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setParsedStudents([]);
                  setParseErrors([]);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};