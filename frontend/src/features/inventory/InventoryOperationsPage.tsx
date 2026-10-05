import React, { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import {
  InventoryIntegrityData,
  StockCountRecord,
  StockLot,
  StockLotStatus
} from '../../types';
import { inventoryApi } from './api';
import {
  LOT_STATUS_OPTIONS,
  isPhysicalLot,
  statusBadgeClass,
  summarizeVariance
} from './domain';

type Tab = 'INTEGRITY' | 'STATUS' | 'COUNT' | 'HISTORY';

export const InventoryOperationsPage: React.FC = () => {
  const { session, isRole } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('INTEGRITY');
  const [lots, setLots] = useState<StockLot[]>([]);
  const [integrity, setIntegrity] = useState<InventoryIntegrityData | null>(null);
  const [counts, setCounts] = useState<StockCountRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const [statusLotId, setStatusLotId] = useState('');
  const [nextStatus, setNextStatus] = useState<StockLotStatus>('QUARANTINE');
  const [statusReason, setStatusReason] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  const [countValues, setCountValues] = useState<Record<string, string>>({});
  const [countReason, setCountReason] = useState('Routine stock count');
  const [countSubmitting, setCountSubmitting] = useState(false);
  const [filter, setFilter] = useState('');

  const canMutate = isRole(['ADMIN', 'SUPER_ADMIN']);

  const loadAll = async (bypassCache = false) => {
    if (!session?.token) return;
    setLoading(true);
    try {
      const [lotData, integrityData, countData] = await Promise.all([
        inventoryApi.getLots(session.token),
        inventoryApi.getIntegrity(session.token, bypassCache),
        inventoryApi.getCounts(session.token, 200, bypassCache)
      ]);
      setLots(lotData || []);
      setIntegrity(integrityData);
      setCounts(countData || []);
    } catch (err: any) {
      Swal.fire('โหลด Inventory Operations ไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [session?.token]);

  const countableLots = useMemo(() => lots.filter(isPhysicalLot), [lots]);

  const physicalLots = useMemo(
    () =>
      countableLots.filter((lot) => {
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return [lot['Stock Lot ID'], lot['Item Code'], lot['Lot Number'], lot.Status]
          .some((v) => String(v || '').toLowerCase().includes(q));
      }),
    [countableLots, filter]
  );

  const selectedStatusLot = lots.find((lot) => lot['Stock Lot ID'] === statusLotId);

  const handleStatusChange = async () => {
    if (!session?.token || !statusLotId || !statusReason.trim()) {
      Swal.fire('ข้อมูลไม่ครบ', 'กรุณาเลือก Lot, สถานะใหม่ และระบุเหตุผล', 'warning');
      return;
    }

    const currentStatus = String(selectedStatusLot?.Status || '').toUpperCase();
    if (currentStatus === nextStatus) {
      Swal.fire('สถานะไม่เปลี่ยน', 'กรุณาเลือกสถานะใหม่ที่ต่างจากสถานะปัจจุบัน', 'info');
      return;
    }

    const confirm = await Swal.fire({
      title: 'ยืนยันเปลี่ยนสถานะ Lot',
      text: `${statusLotId}: ${currentStatus || '-'} → ${nextStatus}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
      confirmButtonColor: '#0b1f3a'
    });
    if (!confirm.isConfirmed) return;

    setStatusSubmitting(true);
    try {
      await inventoryApi.updateLotStatus(
        session.token,
        statusLotId,
        nextStatus,
        statusReason.trim()
      );
      await loadAll(true);
      setStatusLotId('');
      setStatusReason('');
      Swal.fire('สำเร็จ', 'อัปเดตสถานะ Stock Lot แล้ว', 'success');
    } catch (err: any) {
      Swal.fire('เปลี่ยนสถานะไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const selectedCountLines = useMemo(() => {
    return countableLots
      .filter((lot) => countValues[lot['Stock Lot ID']] !== undefined && countValues[lot['Stock Lot ID']] !== '')
      .map((lot) => ({
        lot,
        countedQty: Number(countValues[lot['Stock Lot ID']])
      }))
      .filter((line) => Number.isInteger(line.countedQty) && line.countedQty >= 0);
  }, [countableLots, countValues]);

  const handleSubmitCount = async () => {
    if (!session?.token || !selectedCountLines.length) {
      Swal.fire('ไม่มีรายการตรวจนับ', 'กรอกจำนวนจริงอย่างน้อย 1 Lot', 'warning');
      return;
    }

    const invalidInput = Object.entries(countValues).some(([_, value]) => {
      if (value === '') return false;
      const n = Number(value);
      return !Number.isInteger(n) || n < 0;
    });
    if (invalidInput) {
      Swal.fire('จำนวนไม่ถูกต้อง', 'จำนวนตรวจนับต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป', 'warning');
      return;
    }

    const changed = selectedCountLines.filter(
      ({ lot, countedQty }) => summarizeVariance(Number(lot['Current Qty']) || 0, countedQty) !== 0
    );

    const confirm = await Swal.fire({
      title: 'ยืนยัน Stock Count',
      text: `ตรวจนับ ${selectedCountLines.length} Lot · พบ variance ${changed.length} Lot`,
      icon: changed.length ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: 'บันทึกผลตรวจนับ',
      cancelButtonText: 'กลับไปตรวจสอบ',
      confirmButtonColor: '#0b1f3a'
    });
    if (!confirm.isConfirmed) return;

    setCountSubmitting(true);
    try {
      const result = await inventoryApi.submitStockCount(
        session.token,
        selectedCountLines.map(({ lot, countedQty }) => ({
          stockLotId: lot['Stock Lot ID'],
          countedQty
        })),
        countReason.trim() || 'Stock count'
      );
      setCountValues({});
      await loadAll(true);
      Swal.fire(
        'บันทึก Stock Count สำเร็จ',
        `Count ID: ${result.countId} · ปรับยอด ${result.adjustedLines} Lot`,
        'success'
      );
    } catch (err: any) {
      Swal.fire('Stock Count ไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCountSubmitting(false);
    }
  };

  const statusCount = (status: string) => integrity?.statusCounts?.[status] || 0;

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h2>Inventory Operations</h2>
          <p style={{ color: '#64748b' }}>
            Stock integrity, controlled lot status, cycle count และ reconciliation
          </p>
        </div>
        <button className="btn btn-outline" onClick={() => loadAll(true)} disabled={loading}>
          {loading ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {([
          ['INTEGRITY', 'Integrity'],
          ['STATUS', 'Lot Status'],
          ['COUNT', 'Stock Count'],
          ['HISTORY', 'Count History']
        ] as Array<[Tab, string]>).map(([id, label]) => (
          <button
            key={id}
            className={`tab-item ${activeTab === id ? 'active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'INTEGRITY' && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <section className="card">
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Total Lots</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{integrity?.totalLots ?? '-'}</div>
            </section>
            <section className="card">
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Quarantine Qty</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{integrity?.quarantinedQty ?? '-'}</div>
            </section>
            <section className="card">
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Recall Qty</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{integrity?.recalledQty ?? '-'}</div>
            </section>
            <section className="card">
              <div style={{ color: '#64748b', fontSize: '.8rem' }}>Expired but ACTIVE</div>
              <div style={{ fontSize: '1.7rem', fontWeight: 800 }}>{integrity?.expiredActiveLots ?? '-'}</div>
            </section>
          </div>

          <section className="card">
            <div className="card-header">
              <span className="card-title">Inventory Integrity Summary</span>
              <span className={`badge ${integrity?.reconciliation.balanced ? 'badge-success' : 'badge-danger'}`}>
                {integrity?.reconciliation.balanced ? 'Balanced' : 'Mismatch'}
              </span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {LOT_STATUS_OPTIONS.map((item) => (
                <span key={item.value} className={`badge ${statusBadgeClass(item.value)}`}>
                  {item.value}: {statusCount(item.value)}
                </span>
              ))}
            </div>

            {integrity?.reconciliation.mismatchCount ? (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item Code</th>
                      <th style={{ textAlign: 'right' }}>Aggregate</th>
                      <th style={{ textAlign: 'right' }}>Usable Lots</th>
                      <th style={{ textAlign: 'right' }}>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {integrity.reconciliation.mismatches.slice(0, 50).map((row) => (
                      <tr key={row.itemCode}>
                        <td><strong>{row.itemCode}</strong></td>
                        <td style={{ textAlign: 'right' }}>{row.aggregateQty}</td>
                        <td style={{ textAlign: 'right' }}>{row.usableLotQty}</td>
                        <td style={{ textAlign: 'right' }}>{row.variance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ color: '#166534', padding: 10 }}>
                ✓ ITEM_MASTER.QTY ตรงกับ usable lot quantity
              </div>
            )}
          </section>
        </>
      )}

      {activeTab === 'STATUS' && (
        <section className="card" style={{ maxWidth: 760 }}>
          <div className="card-header"><span className="card-title">Controlled Lot Status</span></div>
          {!canMutate && (
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 12, color: '#64748b' }}>
              MANAGER สามารถดูข้อมูลได้ แต่ไม่สามารถเปลี่ยนสถานะ Lot
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Stock Lot</label>
            <select className="form-control" value={statusLotId} onChange={(e) => setStatusLotId(e.target.value)} disabled={!canMutate}>
              <option value="">-- เลือก Lot --</option>
              {lots.map((lot) => (
                <option key={lot['Stock Lot ID']} value={lot['Stock Lot ID']}>
                  {lot['Item Code']} · {lot['Lot Number'] || '-'} · {lot['Stock Lot ID']} · {lot.Status} · Qty {lot['Current Qty']}
                </option>
              ))}
            </select>
          </div>

          {selectedStatusLot && (
            <div style={{ marginBottom: 12 }}>
              ปัจจุบัน: <span className={`badge ${statusBadgeClass(selectedStatusLot.Status)}`}>{selectedStatusLot.Status}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">สถานะใหม่</label>
            <select className="form-control" value={nextStatus} onChange={(e) => setNextStatus(e.target.value as StockLotStatus)} disabled={!canMutate}>
              {LOT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">เหตุผล *</label>
            <textarea className="form-control" value={statusReason} onChange={(e) => setStatusReason(e.target.value)} disabled={!canMutate} />
          </div>

          <button className="btn btn-primary" onClick={handleStatusChange} disabled={!canMutate || statusSubmitting}>
            {statusSubmitting ? 'กำลังบันทึก...' : 'เปลี่ยนสถานะ Lot'}
          </button>
        </section>
      )}

      {activeTab === 'COUNT' && (
        <section className="card">
          <div className="card-header">
            <span className="card-title">Cycle / Stock Count</span>
            <span style={{ color: '#64748b', fontSize: '.8rem' }}>{selectedCountLines.length} selected</span>
          </div>
          {!canMutate && (
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 12, color: '#64748b' }}>
              MANAGER สามารถดู Lot ได้ แต่การบันทึกผลตรวจนับจำกัดสำหรับ ADMIN / SUPER_ADMIN
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr', gap: 10, marginBottom: 12 }}>
            <input className="form-control" placeholder="ค้นหา Item / Lot / Status" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <input className="form-control" placeholder="เหตุผลการตรวจนับ" value={countReason} onChange={(e) => setCountReason(e.target.value)} disabled={!canMutate} />
          </div>

          <div className="table-responsive" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Lot</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>System Qty</th>
                  <th style={{ width: 150 }}>Counted Qty</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {physicalLots.map((lot) => {
                  const raw = countValues[lot['Stock Lot ID']] ?? '';
                  const counted = raw === '' ? null : Number(raw);
                  const variance = counted === null || !Number.isFinite(counted)
                    ? null
                    : summarizeVariance(Number(lot['Current Qty']) || 0, counted);
                  return (
                    <tr key={lot['Stock Lot ID']}>
                      <td><strong>{lot['Item Code']}</strong></td>
                      <td>{lot['Lot Number'] || '-'}<div style={{ color: '#94a3b8', fontSize: '.72rem' }}>{lot['Stock Lot ID']}</div></td>
                      <td><span className={`badge ${statusBadgeClass(lot.Status)}`}>{lot.Status}</span></td>
                      <td style={{ textAlign: 'right' }}>{lot['Current Qty']}</td>
                      <td>
                        <input
                          className="form-control"
                          type="number"
                          min={0}
                          step={1}
                          value={raw}
                          disabled={!canMutate}
                          onChange={(e) => setCountValues({ ...countValues, [lot['Stock Lot ID']]: e.target.value })}
                        />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {variance === null ? '-' : variance > 0 ? `+${variance}` : variance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={handleSubmitCount} disabled={!canMutate || countSubmitting}>
            {countSubmitting ? 'กำลังบันทึก...' : 'บันทึก Stock Count'}
          </button>
        </section>
      )}

      {activeTab === 'HISTORY' && (
        <section className="card">
          <div className="card-header"><span className="card-title">Stock Count History</span></div>
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>Count ID</th>
                  <th>Item</th>
                  <th>Lot</th>
                  <th style={{ textAlign: 'right' }}>System</th>
                  <th style={{ textAlign: 'right' }}>Counted</th>
                  <th style={{ textAlign: 'right' }}>Variance</th>
                  <th>เหตุผล</th>
                  <th>ผู้ตรวจนับ</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((row) => (
                  <tr key={row['Count Line ID']}>
                    <td>{row['Created At']}</td>
                    <td><code>{row['Count ID']}</code></td>
                    <td><strong>{row['Item Code']}</strong></td>
                    <td>{row['Stock Lot ID']}</td>
                    <td style={{ textAlign: 'right' }}>{row['System Qty']}</td>
                    <td style={{ textAlign: 'right' }}>{row['Counted Qty']}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{row.Variance}</td>
                    <td>{row.Reason}</td>
                    <td>{row['Staff ID']}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
