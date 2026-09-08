import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserRecord, UserRole } from '../types';
import { api } from '../api';
import Swal from 'sweetalert2';

export const UsersPage: React.FC = () => {
  const { session } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStaffId, setNewStaffId] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('NURSE');
  const [newPassword, setNewPassword] = useState('');

  const [resetModalUser, setResetModalUser] = useState<UserRecord | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const data = await api<UserRecord[]>('getUsers', {}, session.token);
      setUsers(data || []);
    } catch (err: any) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffId.trim() || !newName.trim() || !newPassword) return;

    try {
      await api(
        'createUser',
        {
          staffId: newStaffId.trim(),
          name: newName.trim(),
          role: newRole,
          password: newPassword
        },
        session?.token
      );

      Swal.fire({
        icon: 'success',
        title: 'สร้างผู้ใช้สำเร็จ',
        text: `สร้างบัญชีสำหรับ ${newName} (${newStaffId}) เรียบร้อยแล้ว`,
        confirmButtonColor: '#0b1f3a'
      });

      setShowCreateModal(false);
      setNewStaffId('');
      setNewName('');
      setNewPassword('');
      loadUsers();
    } catch (err: any) {
      Swal.fire('สร้างผู้ใช้ล้มเหลว', err.message, 'error');
    }
  };

  const handleToggleActive = async (user: UserRecord) => {
    const nextState = !user.active;
    const confirm = await Swal.fire({
      title: nextState ? 'เปิดการใช้งานบัญชี?' : 'ระงับการใช้งานบัญชี?',
      text: `ต้องการ${nextState ? 'เปิด' : 'ระงับ'}การเข้าถึงของ ${user.name} (${user.staffId}) ใช่หรือไม่?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: nextState ? '#059669' : '#dc2626',
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก'
    });

    if (!confirm.isConfirmed) return;

    try {
      await api('updateUser', { staffId: user.staffId, active: nextState }, session?.token);
      Swal.fire('สำเร็จ', `อัปเดตสถานะของ ${user.name} เรียบร้อยแล้ว`, 'success');
      loadUsers();
    } catch (err: any) {
      Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalUser || !resetPasswordVal) return;

    try {
      await api(
        'resetPassword',
        { staffId: resetModalUser.staffId, password: resetPasswordVal },
        session?.token
      );

      Swal.fire({
        icon: 'success',
        title: 'รีเซ็ตรหัสผ่านสำเร็จ',
        text: `ตั้งรหัสผ่านใหม่สำหรับ ${resetModalUser.name} เรียบร้อยแล้ว`,
        confirmButtonColor: '#0b1f3a'
      });

      setResetModalUser(null);
      setResetPasswordVal('');
    } catch (err: any) {
      Swal.fire('รีเซ็ตรหัสผ่านล้มเหลว', err.message, 'error');
    }
  };

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>จัดการผู้ใช้งานระบบ (User Management)</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            สร้าง กำหนดสิทธิ์ และควบคุมการเข้าใช้งานระบบห้องพยาบาล (Admin / Super Admin)
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          + เพิ่มผู้ใช้งานใหม่
        </button>
      </div>

      <section className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Staff ID</th>
                <th>ชื่อ - นามสกุล</th>
                <th>บทบาท (Role)</th>
                <th>สถานะ</th>
                <th>เข้าสู่ระบบล่าสุด</th>
                <th style={{ textAlign: 'right' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                    {loading ? 'กำลังโหลดรายชื่อผู้ใช้...' : 'ไม่พบข้อมูลผู้ใช้ในระบบ'}
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.staffId}>
                    <td><strong>{u.staffId}</strong></td>
                    <td>{u.name}</td>
                    <td>
                      <span className={`badge ${u.role === 'SUPER_ADMIN' ? 'badge-danger' : u.role === 'ADMIN' ? 'badge-primary' : 'badge-gray'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.active ? 'badge-success' : 'badge-danger'}`}>
                        {u.active ? 'ใช้งานอยู่' : 'ระงับใช้งาน'}
                      </span>
                    </td>
                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>
                      {u.lastLogin || 'ยังไม่เคยเข้าระบบ'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ marginRight: '8px' }}
                        onClick={() => {
                          setResetModalUser(u);
                          setResetPasswordVal('');
                        }}
                      >
                        🔑 รีเซ็ตรหัส
                      </button>
                      <button
                        className={`btn btn-sm ${u.active ? 'btn-outline' : 'btn-secondary'}`}
                        style={{ color: u.active ? '#dc2626' : '#059669' }}
                        onClick={() => handleToggleActive(u)}
                      >
                        {u.active ? 'ระงับ' : 'เปิดใช้งาน'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal: Create User */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="card-header">
              <span className="card-title">สร้างผู้ใช้งานใหม่</span>
              <button className="btn btn-outline btn-sm" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label className="form-label">รหัสเจ้าหน้าที่ (Staff ID) *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="เช่น NURSE01 หรือ 520295"
                  value={newStaffId}
                  onChange={(e) => setNewStaffId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">ชื่อ - นามสกุล *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="เช่น พยาบาลวิชาชีพ สมศรี"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">บทบาทและสิทธิ์ (Role) *</label>
                <select
                  className="form-control"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  required
                >
                  <option value="NURSE">NURSE (จ่ายยา, ค้นหานักเรียน, ดูสต็อก)</option>
                  <option value="ADMIN">ADMIN (จ่ายยา, รับเข้า, ปรับสต็อก, แดชบอร์ด)</option>
                  <option value="MANAGER">MANAGER (ดูรายงานและแดชบอร์ดอย่างเดียว)</option>
                  <option value="SUPER_ADMIN">SUPER_ADMIN (ทุกสิทธิ์ + จัดการผู้ใช้/ระบบ)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">รหัสผ่านเริ่มต้น (Password) *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  บันทึกผู้ใช้
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetModalUser && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="card-header">
              <span className="card-title">รีเซ็ตรหัสผ่าน</span>
              <button className="btn btn-outline btn-sm" onClick={() => setResetModalUser(null)}>
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPassword}>
              <p style={{ marginBottom: '14px', fontSize: '0.9rem', color: '#475569' }}>
                ตั้งรหัสผ่านใหม่สำหรับ: <strong>{resetModalUser.name}</strong> ({resetModalUser.staffId})
              </p>

              <div className="form-group">
                <label className="form-label">รหัสผ่านใหม่ (New Password) *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="กรอกรหัสผ่านใหม่"
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  อัปเดตรหัสผ่าน
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setResetModalUser(null)}
                >
                  ยกเลิก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
