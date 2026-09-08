import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { LoginPage } from './pages/LoginPage';
import { DispensePage } from './pages/DispensePage';
import { StudentsPage } from './pages/StudentsPage';
import { StockPage } from './pages/StockPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { ConfigPage } from './pages/ConfigPage';

export const AppContent: React.FC = () => {
  const { session, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dispense');

  // Set default landing tab based on role
  useEffect(() => {
    if (session) {
      if (session.role === 'MANAGER') {
        setCurrentTab('dashboard');
      } else {
        setCurrentTab('dispense');
      }
    }
  }, [session?.role]);

  if (loading) {
    return (
      <div className="login-wrap">
        <div className="card" style={{ padding: '32px 48px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🏥</div>
          <h3 style={{ color: '#0b1f3a' }}>กำลังโหลดระบบ School Nurse...</h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '6px' }}>
            กำลังตรวจสอบความถูกต้องของเซสชัน
          </p>
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
        {currentTab === 'dispense' && ['NURSE', 'ADMIN', 'SUPER_ADMIN'].includes(role) && (
          <DispensePage />
        )}
        {currentTab === 'dashboard' && ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(role) && (
          <DashboardPage />
        )}
        {currentTab === 'students' && <StudentsPage />}
        {currentTab === 'stock' && <StockPage />}
        {currentTab === 'users' && role === 'SUPER_ADMIN' && <UsersPage />}
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
        School Nurse Management System · Bangkok Hospital Hatyai (BHH Infirmary) · Production V1.0
      </footer>
    </div>
  );
};
