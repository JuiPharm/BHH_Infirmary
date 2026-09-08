import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { DashboardSummaryData, VisitTrendData, TopSymptomData, TopItemData, Item, StockLot } from '../types';
import { api } from '../api';
import { StatCard } from '../components/StatCard';
import { getDaysUntilExpiry } from '../domain/stock';

export const DashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [trends, setTrends] = useState<VisitTrendData[]>([]);
  const [trendDays, setTrendDays] = useState<number>(14);
  const [topSymptoms, setTopSymptoms] = useState<TopSymptomData[]>([]);
  const [topItems, setTopItems] = useState<TopItemData[]>([]);
  const [lowStockList, setLowStockList] = useState<Item[]>([]);
  const [expiryList, setExpiryList] = useState<StockLot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, [trendDays]);

  const loadDashboard = async () => {
    if (!session?.token) return;
    setLoading(true);
    try {
      // 1. Fetch summary KPI first
      const sumData = await api<DashboardSummaryData>('getDashboardSummary', {}, session.token);
      setSummary(sumData);
      setLoading(false);

      // 2. Fetch trends and details smoothly
      const [trendData, sympData, itemData, lowData, expData] = await Promise.all([
        api<VisitTrendData[]>('getVisitTrend', { days: trendDays }, session.token).catch(() => []),
        api<TopSymptomData[]>('getTopSymptoms', {}, session.token).catch(() => []),
        api<TopItemData[]>('getTopItems', {}, session.token).catch(() => []),
        api<Item[]>('getLowStock', {}, session.token).catch(() => []),
        api<StockLot[]>('getExpiryAlerts', { days: 90 }, session.token).catch(() => [])
      ]);

      setTrends(trendData || []);
      setTopSymptoms(sympData || []);
      setTopItems(itemData || []);
      setLowStockList(lowData || []);
      setExpiryList(expData || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const maxTrend = Math.max(...trends.map((t) => t.count), 1);
  const maxSymptom = Math.max(...topSymptoms.map((s) => s.count), 1);
  const maxItem = Math.max(...topItems.map((i) => i.qty), 1);

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2>แดชบอร์ดและรายงานภาพรวม (Infirmary Dashboard)</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            สรุปสถิติผู้เข้ารับบริการ แนวโน้มอาการป่วย และสถานะเวชภัณฑ์คงคลัง
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={loadDashboard} disabled={loading}>
          {loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid-4" style={{ marginBottom: '24px' }}>
        <StatCard
          label="ผู้ป่วยวันนี้ (Today Visits)"
          value={summary?.visitsToday ?? '-'}
          icon="🩺"
          color="#0b1f3a"
          bgColor="#e0e7ff"
        />
        <StatCard
          label="ผู้ป่วยสะสมทั้งหมด (Total Visits)"
          value={summary?.totalVisits ?? '-'}
          icon="📊"
          color="#0369a1"
          bgColor="#e0f2fe"
        />
        <StatCard
          label="เวชภัณฑ์ใกล้หมดสต็อก (Low Stock)"
          value={summary?.lowStock ?? '-'}
          icon="⚠️"
          color="#d97706"
          bgColor="#fef3c7"
        />
        <StatCard
          label="ยาใกล้หมดอายุ (Expiring in 90d)"
          value={summary?.expiryAlerts ?? '-'}
          icon="⏳"
          color="#dc2626"
          bgColor="#fee2e2"
        />
      </div>

      {/* Row 1: Trends & Top Symptoms */}
      <div className="grid-2" style={{ marginBottom: '24px' }}>
        {/* Visit Trend Chart */}
        <section className="card">
          <div className="card-header">
            <span className="card-title">แนวโน้มผู้เข้ารับบริการ (Visit Trend)</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className={`btn btn-sm ${trendDays === 7 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTrendDays(7)}
              >
                7 วัน
              </button>
              <button
                className={`btn btn-sm ${trendDays === 14 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTrendDays(14)}
              >
                14 วัน
              </button>
              <button
                className={`btn btn-sm ${trendDays === 30 ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setTrendDays(30)}
              >
                30 วัน
              </button>
            </div>
          </div>

          <div style={{ height: '220px', display: 'flex', alignItems: 'flex-end', gap: '8px', paddingTop: '20px' }}>
            {trends.length === 0 ? (
              <div style={{ width: '100%', textAlign: 'center', color: '#94a3b8', alignSelf: 'center' }}>
                ไม่มีข้อมูลการเข้ารับบริการในช่วงเวลานี้
              </div>
            ) : (
              trends.map((t) => {
                const heightPct = Math.max((t.count / maxTrend) * 100, 4);
                return (
                  <div
                    key={t.date}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: '100%',
                      justifyContent: 'flex-end'
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: t.count > 0 ? '#0b1f3a' : '#cbd5e1', marginBottom: '4px' }}>
                      {t.count}
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${heightPct}%`,
                        background: t.count > 0 ? 'linear-gradient(180deg, #0b1f3a 0%, #1e40af 100%)' : '#e2e8f0',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s'
                      }}
                      title={`${t.date}: ${t.count} คน`}
                    />
                    <span
                      style={{
                        fontSize: '0.65rem',
                        color: '#64748b',
                        marginTop: '6px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '45px'
                      }}
                    >
                      {t.date.substring(5)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Top Symptoms */}
        <section className="card">
          <div className="card-header">
            <span className="card-title">อาการที่พบบ่อยที่สุด (Top Symptoms)</span>
          </div>

          {topSymptoms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
              ยังไม่มีข้อมูลอาการที่บันทึก
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topSymptoms.slice(0, 6).map((sym) => {
                const pct = (sym.count / maxSymptom) * 100;
                return (
                  <div key={sym.symptom}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                      <strong>{sym.symptom}</strong>
                      <span style={{ color: '#0b1f3a', fontWeight: 700 }}>{sym.count} ครั้ง</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: '#e11d48',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Row 2: Top Items & Stock/Expiry Alerts */}
      <div className="grid-2">
        {/* Top Dispensed Items */}
        <section className="card">
          <div className="card-header">
            <span className="card-title">เวชภัณฑ์ที่จ่ายมากที่สุด (Top Dispensed Items)</span>
          </div>

          {topItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
              ยังไม่มีข้อมูลการจ่ายยาในระบบ
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topItems.slice(0, 6).map((it) => {
                const pct = (it.qty / maxItem) * 100;
                return (
                  <div key={it.itemCode}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem', marginBottom: '4px' }}>
                      <strong>{it.itemCode}</strong>
                      <span style={{ color: '#059669', fontWeight: 700 }}>{it.qty} หน่วย</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: '#059669',
                          borderRadius: '4px'
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Low Stock & Expiry Alerts */}
        <section className="card">
          <div className="card-header">
            <span className="card-title">การแจ้งเตือนเวชภัณฑ์ (Stock Alerts)</span>
          </div>

          <div>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: '#d97706' }}>
              ⚠️ รายการใกล้หมด / ต่ำกว่าเกณฑ์ ({lowStockList.length})
            </h4>
            {lowStockList.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
                ไม่มีรายการที่ต่ำกว่าเกณฑ์ Minimum Stock
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
                {lowStockList.slice(0, 5).map((l) => (
                  <span key={l['Item Code']} className="badge badge-warning">
                    {l['Generic Name'] || l['Item Code']}: เหลือ {l.QTY} (Min {l['Minimum Stock']})
                  </span>
                ))}
              </div>
            )}

            <h4 style={{ fontSize: '0.95rem', marginBottom: '8px', color: '#dc2626' }}>
              ⏳ รายการใกล้หมดอายุภายใน 90 วัน ({expiryList.length})
            </h4>
            {expiryList.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                ไม่มี Lot ที่จะหมดอายุในอีก 90 วัน
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {expiryList.slice(0, 5).map((e) => {
                  const days = getDaysUntilExpiry(e['Expiry Date']);
                  return (
                    <span key={e['Stock Lot ID']} className="badge badge-danger">
                      {e['Item Code']} ({e['Lot Number']}): อีก {days} วัน
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
