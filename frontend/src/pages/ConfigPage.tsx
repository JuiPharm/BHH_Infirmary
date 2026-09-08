import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ConfigRecord } from '../types';
import { api } from '../api';
import Swal from 'sweetalert2';

export const ConfigPage: React.FC = () => {
  const { session } = useAuth();
  const [configs, setConfigs] = useState<ConfigRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const data = await api<ConfigRecord[]>('getConfig', {}, session.token);
      setConfigs(data || []);
    } catch (err: any) {
      console.error('Failed to load config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (c: ConfigRecord) => {
    setEditingKey(c['Config Key']);
    setEditValue(c['Config Value'] || '');
  };

  const handleSaveConfig = async (key: string) => {
    try {
      await api('updateConfig', { key, value: editValue }, session?.token);
      Swal.fire({
        icon: 'success',
        title: 'บันทึกสำเร็จ',
        text: `อัปเดตการตั้งค่า ${key} เรียบร้อยแล้ว`,
        timer: 1500,
        showConfirmButton: false
      });
      setEditingKey(null);
      loadConfig();
    } catch (err: any) {
      Swal.fire('บันทึกผิดพลาด', err.message, 'error');
    }
  };

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>ตั้งค่าระบบ (System Configuration)</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            ปรับแต่งพารามิเตอร์ของระบบ เกณฑ์แจ้งเตือนสต็อก และงบประมาณ (Super Admin เท่านั้น)
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadConfig} disabled={loading}>
          {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
        </button>
      </div>

      <section className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>คีย์การตั้งค่า (Key)</th>
                <th>คำอธิบาย</th>
                <th>ประเภท</th>
                <th>ค่าที่ตั้งไว้ (Value)</th>
                <th>อัปเดตล่าสุด</th>
                <th style={{ textAlign: 'right' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {configs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                    {loading ? 'กำลังโหลดการตั้งค่า...' : 'ไม่พบข้อมูล Configuration ในระบบ'}
                  </td>
                </tr>
              ) : (
                configs.map((c) => {
                  const isEditing = editingKey === c['Config Key'];

                  return (
                    <tr key={c['Config Key']}>
                      <td><strong>{c['Config Key']}</strong></td>
                      <td style={{ color: '#475569' }}>{c.Description || '-'}</td>
                      <td><span className="badge badge-gray">{c['Data Type']}</span></td>
                      <td style={{ fontWeight: 600 }}>
                        {isEditing ? (
                          <input
                            type="text"
                            className="form-control"
                            style={{ padding: '6px 10px', height: '36px' }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            autoFocus
                          />
                        ) : (
                          c['Config Value'] || <span style={{ color: '#94a3b8' }}>-</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        {c['Updated At'] ? `${c['Updated At']} (${c['Updated By'] || 'SYSTEM'})` : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => handleSaveConfig(c['Config Key'])}
                            >
                              บันทึก
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => setEditingKey(null)}
                            >
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleStartEdit(c)}
                          >
                            แก้ไข
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
