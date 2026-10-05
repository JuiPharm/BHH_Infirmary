import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { VisitPage } from './pages/VisitPage';
import { StudentsPage } from './pages/StudentsPage';
import { StockPage } from './pages/StockPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { ConfigPage } from './pages/ConfigPage';
import { InventoryOperationsPage } from './features/inventory/InventoryOperationsPage';
import { getBackendHealth, REQUIRED_API_VERSION } from './api';

export const AppContent: React.FC = () => {
  const { session, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('visit');
  const [backendCheck, setBackendCheck] = useState<'CHECKING' | 'READY' | 'BLOCKED'>('CHECKING');
  const [backendVersion, setBackendVersion] = useState<string>('');

  useEffect(() => {
    let active = true;
    getBackendHealth()
      .then((health) => {
        if (!active) return;
        const version = String(health.apiVersion || '');
        setBackendVersion(version);
        setBackendCheck(health.success && version === REQUIRED_API_VERSION ? 'READY' : 'BLOCKED');
      })
      .catch(() => {
        if (!active) return;
        setBackendCheck('BLOCKED');
      });
    return () => {
      active = false;
    };
  }, []);

  // Set default landing tab based on role
  useEffect(() => {
    if (session) {
      if (session.role === 'MANAGER') {
        setCurrentTab('dashboard');
      } else {
        setCurrentTab('visit');
      }
    }
  }, [session?.role]);

  if (backendCheck === 'CHECKING') {
    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: '32px 48px', textAlign: 'center', maxWidth: '460px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏥</div>
          <h3 style={{ color: '#0b1f3a' }}>กำลังตรวจสอบ Production Backend...</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '6px' }}>
            ระบบกำลังตรวจสอบความเข้ากันได้ของ Frontend และ Apps Script API
          </p>
        </div>
      </div>
    );
  }

  if (backendCheck === 'BLOCKED') {
    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: '32px 40px', textAlign: 'center', maxWidth: '520px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🛡️</div>
          <h3 style={{ color: '#991b1b' }}>ระบบอยู่ระหว่างอัปเดต Production Backend</h3>
          <p style={{ color: '#475569', fontSize: '0.95rem', marginTop: '10px', lineHeight: 1.6 }}>
            เพื่อป้องกันข้อมูลคลินิกและสต็อกผิดพลาด ระบบจะไม่อนุญาตให้ทำรายการ
            จนกว่า Apps Script API จะอัปเดตเป็นเวอร์ชันที่รองรับ
          </p>
          <div style={{ marginTop: '14px', fontSize: '0.82rem', color: '#64748b' }}>
            Required API: {REQUIRED_API_VERSION} · Current API: {backendVersion || 'ไม่สามารถยืนยันได้'}
          </div>
          <button className="btn btn-primary" style={{ marginTop: '18px' }} onClick={() => window.location.reload()}>
            ตรวจสอบอีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: '32px 48px', textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏥</div>
          <h3 style={{ color: '#0b1f3a' }}>กำลังโหลดระบบ School Nurse...</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '6px' }}>
            กำลังตรวจสอบความถูกต้องของเซสชัน
          </p>
          <button
            className="btn btn-outline btn-sm"
            style={{ marginTop: '16px' }}
            onClick={() => {
              localStorage.removeItem('school_nurse_session');
              window.location.reload();
            }}
          >
            เข้าสู่ระบบใหม่ (หากโหลดนาน)
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  const role = session.role;

  return (
    <div className="app-container">
      <Header currentTab={currentTab} setTab={setCurrentTab} />

      <main>
        {currentTab === 'visit' && ['NURSE', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
          <VisitPage />
        )}
        {currentTab === 'dashboard' && ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role) && (
          <DashboardPage />
        )}
        {currentTab === 'students' && <StudentsPage />}
        {currentTab === 'stock' && <StockPage />}
        {currentTab === 'inventory-ops' && ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role) && (
          <InventoryOperationsPage />
        )}
        {currentTab === 'users' && ['ADMIN', 'SUPER_ADMIN'].includes(role) && <UsersPage />}
        {currentTab === 'config' && role === 'SUPER_ADMIN' && <ConfigPage />}
      </main>

      <footer
        style={{
          textAlign: 'center',
          padding: '20px 16px',
          fontSize: '0.8rem',
          color: '#94a3b8',
          borderTop: '1px solid #e2e8f0',
          marginTop: 'auto'
        }}
      >
        School Nurse Management System · Bangkok Hospital Hatyai (BHH Infirmary) · Clinical V2 · P3
      </footer>
    </div>
  );
};
