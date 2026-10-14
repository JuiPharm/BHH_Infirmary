import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../../context/AuthContext';
import {
  DashboardSummaryData,
  DashboardV2Data,
  SymptomCategory
} from '../../types';
import { getDashboardV2 } from '../clinical/api';

const formatInputDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const initialDates = () => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { startDate: formatInputDate(start), endDate: formatInputDate(end) };
};

export const DashboardV2Page: React.FC = () => {
  const { session } = useAuth();
  const defaults = useMemo(initialDates, []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [recipientType, setRecipientType] = useState('');
  const [symptomCategory, setSymptomCategory] = useState('');
  const [gradeClass, setGradeClass] = useState('');
  const [data, setData] = useState<DashboardV2Data | null>(null);
  const [inventory, setInventory] = useState<DashboardSummaryData | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (forceRefresh = false) => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [dashboard, stockSummary] = await Promise.all([
        getDashboardV2(
          { startDate, endDate, recipientType, symptomCategory, gradeClass },
          session.token,
          forceRefresh
        ),
        api<DashboardSummaryData>(
          'getDashboardSummary',
          {},
          session.token,
          undefined,
          20000,
          forceRefresh
        ).catch(() => null)
      ]);
      setData(dashboard);
      setInventory(stockSummary);
    } catch (err) {
      console.error('Failed to load Dashboard V2', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
  }, [session?.token]);

  useEffect(() => {
    if (recipientType !== 'STUDENT' && gradeClass) setGradeClass('');
  }, [recipientType]);

  const summary = data?.summary;
  const maxTrend = Math.max(...(data?.trend || []).map((x) => x.count), 1);
  const maxSymptom = Math.max(...(data?.topSymptoms || []).map((x) => x.count), 1);
  const categoryTotal =
    (data?.categoryCounts.TRAUMA || 0) +
    (data?.categoryCounts.NON_TRAUMA || 0) +
    (data?.categoryCounts.OTHER || 0);

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
        <div>
          <h2>Dashboard V2 — Infirmary Visits</h2>
          <p style={{ color: '#64748b', marginTop: 4 }}>
            KPI และกราฟผู้มารับบริการทั้งหมดใช้ Date Range และ filter ชุดเดียวกัน
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => load(true)} disabled={loading}>
          {loading ? 'กำลังโหลด...' : 'รีเฟรช'}
        </button>
      </div>

      <section className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Filters</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input className="form-control" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input className="form-control" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Recipient Type</label>
            <select className="form-control" value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
              <option value="">ทั้งหมด</option>
              <option value="STUDENT">Student</option>
              <option value="TEACHER">Teacher</option>
              <option value="STAFF">Staff</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Symptom Category</label>
            <select className="form-control" value={symptomCategory} onChange={(e) => setSymptomCategory(e.target.value)}>
              <option value="">ทั้งหมด</option>
              {(['TRAUMA','NON_TRAUMA','OTHER'] as SymptomCategory[]).map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </div>
          {recipientType === 'STUDENT' && (
            <div className="form-group">
              <label className="form-label">Grade / Class</label>
              <input
                className="form-control"
                list="grade-class-options"
                value={gradeClass}
                onChange={(e) => setGradeClass(e.target.value)}
                placeholder="เช่น ป.6/2"
              />
              <datalist id="grade-class-options">
                {(data?.gradeClassOptions || []).map((x) => <option key={x} value={x} />)}
              </datalist>
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => load(true)} disabled={loading}>
          ใช้ Filter
        </button>
      </section>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Total Visits" value={summary?.totalVisits ?? '-'} icon="🩺" color="#0b1f3a" bgColor="#e0e7ff" />
        <StatCard label="Unique Recipients" value={summary?.uniqueRecipients ?? '-'} icon="👥" color="#0369a1" bgColor="#e0f2fe" />
        <StatCard label="Student Visits" value={summary?.studentVisits ?? '-'} icon="🎓" color="#1d4ed8" bgColor="#dbeafe" />
        <StatCard label="Teacher Visits" value={summary?.teacherVisits ?? '-'} icon="🧑‍🏫" color="#6d28d9" bgColor="#ede9fe" />
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard label="Staff Visits" value={summary?.staffVisits ?? '-'} icon="👤" color="#0f766e" bgColor="#ccfbf1" />
        <StatCard label="Other Visits" value={summary?.otherVisits ?? '-'} icon="➕" color="#475569" bgColor="#f1f5f9" />
        <StatCard label="Referral to Hospital" value={summary?.referralToHospital ?? '-'} icon="🏥" color="#b45309" bgColor="#fff3cd" />
        <StatCard label="Emergency Transfer" value={summary?.emergencyTransfer ?? '-'} icon="🚨" color="#b91c1c" bgColor="#fdecec" />
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <StatCard label="Repeat Visits" value={summary?.repeatVisits ?? '-'} icon="↻" color="#0369a1" bgColor="#e0f2fe" />
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <section className="card">
          <div className="card-header">
            <span className="card-title">Symptom Classification</span>
          </div>
          {([
            ['TRAUMA', data?.categoryCounts.TRAUMA || 0, '#b45309'],
            ['NON_TRAUMA', data?.categoryCounts.NON_TRAUMA || 0, '#1769aa'],
            ['OTHER', data?.categoryCounts.OTHER || 0, '#475569']
          ] as Array<[string, number, string]>).map(([label, value, color]) => {
            const pct = categoryTotal ? (value / categoryTotal) * 100 : 0;
            return (
              <div key={label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <strong>{label}</strong>
                  <span>{value} visits</span>
                </div>
                <div style={{ height: 10, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: color }} />
                </div>
              </div>
            );
          })}
          {(data?.categoryCounts.UNCLASSIFIED || 0) > 0 && (
            <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', color: '#64748b', borderRadius: 8, fontSize: '.84rem' }}>
              Historical / Unclassified: {data?.categoryCounts.UNCLASSIFIED} visits — เก็บแยกเพื่อไม่เดาหมวดจากข้อมูลเดิมที่ไม่รองรับ
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <span className="card-title">Top Symptoms</span>
          </div>
          {(data?.topSymptoms || []).length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: '#94a3b8' }}>ไม่มีข้อมูล</div>
          ) : (
            (data?.topSymptoms || []).slice(0, 8).map((sym) => {
              const pct = (sym.count / maxSymptom) * 100;
              return (
                <div key={sym.symptom} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.88rem', marginBottom: 4 }}>
                    <strong>{sym.symptom}</strong>
                    <span>{sym.count}</span>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#1769aa' }} />
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      <section className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <span className="card-title">Visit Trend — {data?.filters.startDate || startDate} ถึง {data?.filters.endDate || endDate}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, minHeight: 220, overflowX: 'auto', paddingTop: 18 }}>
          {(data?.trend || []).length === 0 ? (
            <div style={{ margin: 'auto', color: '#94a3b8' }}>ไม่มีข้อมูลในช่วงวันที่เลือก</div>
          ) : (
            (data?.trend || []).map((point) => {
              const height = Math.max((point.count / maxTrend) * 160, point.count ? 8 : 2);
              return (
                <div key={point.date} style={{ minWidth: 30, textAlign: 'center' }} title={`${point.date}: ${point.count}`}>
                  <div style={{ fontSize: '.7rem', color: '#475569', marginBottom: 3 }}>{point.count}</div>
                  <div style={{ height, background: '#0b1f3a', borderRadius: '4px 4px 0 0' }} />
                  <div style={{ fontSize: '.62rem', color: '#64748b', marginTop: 4, transform: 'rotate(-45deg)', transformOrigin: 'top left', whiteSpace: 'nowrap' }}>
                    {point.date}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <span className="card-title">Inventory Snapshot</span>
          <span style={{ color: '#64748b', fontSize: '.78rem' }}>ไม่อยู่ภายใต้ Visit Date Range</span>
        </div>
        <div className="grid-4">
          <StatCard label="Active Items" value={inventory?.items ?? '-'} icon="📦" color="#0b1f3a" bgColor="#e0e7ff" />
          <StatCard label="Low Stock" value={inventory?.lowStock ?? '-'} icon="⚠️" color="#b45309" bgColor="#fff3cd" />
          <StatCard label="Expiry Alerts" value={inventory?.expiryAlerts ?? '-'} icon="⏳" color="#b91c1c" bgColor="#fdecec" />
        </div>
      </section>
    </div>
  );
};
