import React, { createContext, useContext, useState, useEffect } from 'react';
import { Session, UserRole } from '../types';
import { api } from '../api';

interface AuthContextType {
  session: Session | null;
  loading: boolean;
  login: (staffId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'school_nurse_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Only show initial loading if there is actually a stored token to verify
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return !!saved;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    async function verifySession() {
      if (!session?.token) {
        setLoading(false);
        return;
      }

      try {
        // Quick verify with 6s timeout so user is never stuck
        const validSession = await api<Session>('getSession', {}, session.token);
        setSession(validSession);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validSession));
      } catch (err) {
        console.warn('Session invalid or expired:', err);
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      } finally {
        setLoading(false);
      }
    }

    if (loading) {
      verifySession();
    }
  }, []);

  const login = async (staffId: string, password: string) => {
    // Do NOT set loading(true) here — let LoginPage handle button spinner
    // so LoginPage is never unmounted during login attempt
    const s = await api<Session>('login', { staffId: staffId.trim(), password });
    setSession(s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  };

  const logout = async () => {
    if (session?.token) {
      try {
        await api('logout', {}, session.token);
      } catch (err) {
        console.warn('Logout error (ignored):', err);
      }
    }
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  };

  const isRole = (roles: UserRole[]): boolean => {
    if (!session?.role) return false;
    return roles.includes(session.role);
  };

  return (
    <AuthContext.Provider value={{ session, loading, login, logout, isRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
