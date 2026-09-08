import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId.trim() || !password) return;

    setBusy(true);
    try {
      await login(staffId.trim(), password);
      Swal.fire({
        icon: 'success',
        title: 'เข้าสู่ระบบสำเร็จ',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err: any) {
      Swal.fire({
        icon: 'error',
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        text: err.message || 'Staff ID หรือ Password ไม่ถูกต้อง',
        confirmButtonColor: '#0b1f3a'
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-icon">🏥</div>
          <h2>School Nurse System</h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '4px' }}>
            ระบบบันทึกการรักษาและจ่ายยาห้องพยาบาล
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="staffId">
              รหัสเจ้าหน้าที่ (Staff ID)
            </label>
            <input
              id="staffId"
              type="text"
              className="form-control"
              placeholder="เช่น 520294"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
              disabled={busy}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              รหัสผ่าน (Password)
            </label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={busy}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '12px', minHeight: '48px' }}
            disabled={busy}
          >
            {busy ? 'กำลังเข้าสู่ระบบ (รอสักครู่)...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
          Hospital & Infirmary Management · Bangkok Hospital Hatyai
        </div>
      </div>
    </div>
  );
};
