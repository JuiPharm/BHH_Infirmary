import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Swal from 'sweetalert2';

interface HeaderProps {
  currentTab: string;
  setTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setTab }) => {
  const { session, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (!session) return null;

  const role = session.role;

  const navItems = [
    { id: 'dispense', label: 'จ่ายยา/เวชภัณฑ์', show: ['NURSE', 'ADMIN', 'SUPER_ADMIN'].includes(role) },
    { id: 'dashboard', label: 'แดชบอร์ด', show: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role) },
    { id: 'students', label: 'ประวัตินักเรียน', show: true },
    { id: 'stock', label: 'คลังเวชภัณฑ์', show: true },
    { id: 'users', label: 'จัดการผู้ใช้', show: ['ADMIN', 'SUPER_ADMIN'].includes(role) },
    { id: 'config', label: 'ตั้งค่าระบบ', show: ['SUPER_ADMIN'].includes(role) },
  ].filter(item => item.show);

  const handleLogout = () => {
    Swal.fire({
      title: 'ต้องการออกจากระบบหรือไม่?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#0b1f3a',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'ออกจากระบบ',
      cancelButtonText: 'ยกเลิก'
    }).then((result) => {
      if (result.isConfirmed) {
        logout();
      }
    });
  };

  const handleSelectTab = (tabId: string) => {
    setTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand" style={{ cursor: 'pointer' }} onClick={() => handleSelectTab('dispense')}>
          <img
            src="https://lh5.googleusercontent.com/d/1r7PM1ogHIbxskvcauVIYaQOfSHXWGncO"
            alt="BHH Logo"
            style={{ height: '38px', objectFit: 'contain', background: '#fff', borderRadius: '6px', padding: '2px 6px' }}
          />
          <div>
            <div style={{ lineHeight: 1.1 }}>School Nurse</div>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 400 }}>ระบบห้องพยาบาล</span>
          </div>
        </div>

        <nav className="nav-links">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
              onClick={() => handleSelectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="user-panel">
          <div className="user-badge">
            <strong>{session.name}</strong>
            <span>{session.staffId} · <span className="badge badge-primary" style={{ fontSize: '0.65rem' }}>{session.role}</span></span>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            ออกจากระบบ
          </button>
        </div>

        <button
          className="hamburger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-nav open">
          <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '8px' }}>
            <div style={{ color: '#fff', fontWeight: 700 }}>{session.name}</div>
            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{session.staffId} · {session.role}</div>
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
              onClick={() => handleSelectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
          <button
            className="btn-logout"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={handleLogout}
          >
            ออกจากระบบ
          </button>
        </div>
      )}
    </header>
  );
};
