import React, { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api, getErrorMessage } from '../../api';
import { useAuth } from '../../context/AuthContext';

interface NotificationLogRecord {
  'Notification ID': string;
  'Visit ID': string;
  'Notification Type': string;
  Recipient: string;
  Status: string;
  'Attempt Count': number;
  'Created At': string;
  'Sent At': string;
  'Error Message': string;
}

const normalizeStatus = (value: string): string => String(value || '').trim().toUpperCase();

const STATUS_TEXT: Record<string, string> = {
  SENT: 'ส่งสำเร็จ',
  FAILED: 'ส่งไม่สำเร็จ — Retry ได้',
  DISABLED: 'ปิดการส่ง',
  PENDING: 'รอเริ่มส่ง',
  SENDING: 'กำลังส่ง / ยังยืนยันไม่ได้',
  UNKNOWN: 'สถานะไม่แน่นอน — ห้ามส่งซ้ำ',
};

export const NotificationLogPage: React.FC = () => {
  const { session } = useAuth();
  const role = session?.role || '';
  const canRetry = ['NURSE', 'ADMIN', 'SUPER_ADMIN'].includes(role);
  const canRecover = ['ADMIN', 'SUPER_ADMIN'].includes(role);
  const [records, setRecords] = useState<NotificationLogRecord[]>([]);
  const [visitId, setVisitId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!session?.token) return;
    setLoading(true);
    setError('');
    try {
      const rows = await api<NotificationLogRecord[]>(
        'getNotificationLog',
        { visitId: visitId.trim(), limit: 200 },
        session.token, undefined, 20000, true
      );
      setRecords(rows || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถโหลด Notification Log');
    } finally {
      setLoading(false);
    }
  }, [session?.token, visitId]);

  useEffect(() => { void load(); }, [session?.token]);

  const retry = async (item: NotificationLogRecord) => {
    if (!session?.token || normalizeStatus(item.Status) !== 'FAILED') return;
    const target = item.Recipient?.trim() || 'ผู้รับจาก CONFIG';
    const recipientNote = item.Recipient?.trim()
      ? `Visit: ${item['Visit ID']} · ไปยัง ${target}`
      : `Visit: ${item['Visit ID']} · ช่องผู้รับใน log ว่าง ระบบจะใช้ผู้รับที่กำหนดใน CONFIG (${target})`;
    const confirm = await Swal.fire({
      title: 'ยืนยัน Retry Email?',
      text: recipientNote,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Retry 1 ครั้ง', cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;
    setBusyId(item['Notification ID']);
    try {
      const outcome = await api<{status: string; error?: string}>('retryNotification',
        {notificationId:item['Notification ID']}, session.token, undefined, 30000, true);
      const resultStatus = normalizeStatus(outcome.status);
      const detail = outcome.error ? `\nรายละเอียด: ${getErrorMessage(outcome.error)}` : '';
      await Swal.fire({
        icon: resultStatus === 'SENT' ? 'success' : 'warning',
        title: 'ผลการ Retry',
        text: `สถานะ: ${STATUS_TEXT[resultStatus] || outcome.status}${detail}`
      });
      await load();
    } catch (err) {
      await Swal.fire('Retry ไม่สำเร็จ',
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusyId('');
    }
  };

  const unlockAfterVerification = async (item: NotificationLogRecord) => {
    if (!session?.token || role !== 'SUPER_ADMIN' || !['UNKNOWN','SENDING'].includes(item.Status))
      return;
    const confirmation = await Swal.fire({
      title: 'ปลดล็อก Email ที่สถานะไม่แน่นอน',
      text: `Visit ${item['Visit ID']} — ต้องตรวจสอบกับผู้รับ Email ผ่านช่องทางอื่นให้แน่ใจว่าไม่เคยได้รับ Email นี้ก่อน มิฉะนั้นอาจส่งข้อมูลผู้รับบริการซ้ำ`,
      input: 'text',
      inputLabel: 'พิมพ์ CONFIRMED_NOT_DELIVERED หลังตรวจสอบเสร็จ',
      inputPlaceholder: 'CONFIRMED_NOT_DELIVERED',
      inputValidator: (value) => value === 'CONFIRMED_NOT_DELIVERED'
        ? undefined : 'ต้องยืนยันด้วยข้อความให้ถูกต้อง',
      showCancelButton: true,
      confirmButtonText: 'ปลดล็อกเพื่อ Retry (ยังไม่ส่ง)',
      cancelButtonText: 'ยกเลิก',
      icon: 'warning',
      confirmButtonColor: '#b91c1c'
    });
    if (!confirmation.isConfirmed) return;
    setBusyId(item['Notification ID']);
    try {
      await api('resolveUncertainNotification',
        { notificationId:item['Notification ID'], confirmation:'CONFIRMED_NOT_DELIVERED' },
        session.token, undefined, 30000, true);
      await Swal.fire('ปลดล็อกแล้ว',
        'สถานะเปลี่ยนเป็น FAILED เท่านั้น — ยังไม่ได้ส่ง Email อีกครั้ง กรุณาตรวจสอบก่อนเลือก Retry',
        'warning');
      await load();
    } catch (err) {
      await Swal.fire('ไม่สามารถปลดล็อก',
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusyId('');
    }
  };

  const reconcile = async () => {
    if (!session?.token || !canRecover) return;
    const confirm = await Swal.fire({
      title: 'ตรวจหา Referral ที่ยังไม่มี Notification Log',
      text: 'การดำเนินการนี้อาจส่ง Email ของ Visit ใน 72 ชั่วโมงล่าสุดที่ยังไม่ได้สร้าง Log สูงสุด 25 Visit กรุณาตรวจสอบการตั้งค่า Email และความเหมาะสมก่อน',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'ตรวจและส่งรายการที่ขาด', cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;
    setBusyId('RECONCILE');
    try {
      const outcome = await api<{checked: number; results: Array<{status: string}>}>(
        'reconcileNotifications', {limit:25}, session.token, undefined, 60000, true);
      await Swal.fire('ตรวจสอบแล้ว',
        `พบรายการที่ต้องดำเนินการ: ${outcome.checked} Visit\nกรุณาตรวจผลแต่ละรายการใน Log`,
        'info');
      await load();
    } catch (err) {
      await Swal.fire('Reconcile ไม่สำเร็จ',
        err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="main-content">
      <div style={{ marginBottom: 16 }}>
        <h2>Notification Log — Referral / Emergency</h2>
        <p style={{ color: '#64748b', lineHeight: 1.6 }}>
          การบันทึก Visit และการส่ง Email เป็นคนละขั้นตอน ต้องตรวจสอบสถานะ Email แยกต่างหาก
          สถานะ UNKNOWN / SENDING ไม่อนุญาตให้ Retry จนกว่าผู้ดูแลระบบจะตรวจสอบการส่งจริง
        </p>
      </div>
      <section className="card">
        <div className="card-header">
          <span className="card-title">ตรวจสอบการส่ง Email</span>
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'end', marginBottom: 14 }}>
          <div className="form-group" style={{ flex:'1 1 220px', marginBottom: 0 }}>
            <label className="form-label">Visit ID (เว้นว่าง = แสดงล่าสุด)</label>
            <input className="form-control" value={visitId} onChange={e => setVisitId(e.target.value)}
              placeholder="Vxxxxxxxx..." />
          </div>
          <button className="btn btn-primary" onClick={() => void load()} disabled={loading || !!busyId}>
            {loading ? 'กำลังโหลด...' : 'ค้นหา / Refresh'}
          </button>
          {canRecover && (
            <button className="btn btn-outline" onClick={() => void reconcile()}
              disabled={loading || !!busyId}>
              ตรวจหารายการตกค้าง
            </button>
          )}
        </div>
        {error && <div role="alert" style={{ color:'#b91c1c', padding:10 }}>{error}</div>}
        <div role="status" aria-live="polite" style={{ color:'#475569', marginBottom:10 }}>
          {loading ? 'กำลังโหลดข้อมูล' : `แสดง ${records.length} รายการ`}
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth: 790, fontSize:'.86rem' }}>
            <thead>
              <tr style={{ background:'#f1f5f9', color:'#0b1f3a', textAlign:'left' }}>
                {['Visit ID','ประเภท','ผู้รับ Email','สถานะ','จำนวนครั้ง','วันที่สร้าง / ส่ง','จัดการ'].map(label => (
                  <th key={label} scope="col" style={{ padding:10, borderBottom:'1px solid #cbd5e1' }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map(row => {
                const status = normalizeStatus(row.Status);
                const uncertain = ['UNKNOWN','SENDING'].includes(status);
                return (
                  <tr key={row['Notification ID']} style={{ borderBottom:'1px solid #e2e8f0' }}>
                    <td style={{ padding:10 }}>{row['Visit ID']}</td>
                    <td style={{ padding:10 }}>{row['Notification Type']}</td>
                    <td style={{ padding:10, overflowWrap:'anywhere' }}>{row.Recipient || '—'}</td>
                    <td style={{ padding:10, fontWeight:600, color: uncertain ? '#b91c1c' : status === 'SENT' ? '#15803d' : '#b45309' }}>
                      {STATUS_TEXT[status] || row.Status}
                      {row['Error Message'] && <div style={{ fontWeight:400, fontSize:'.78rem', overflowWrap:'anywhere' }}>{row['Error Message']}</div>}
                    </td>
                    <td style={{ padding:10 }}>{row['Attempt Count']}</td>
                    <td style={{ padding:10 }}>{row['Created At']}<div>{row['Sent At'] || ''}</div></td>
                    <td style={{ padding:10 }}>
                      {status === 'FAILED' && canRetry
                        ? <button className="btn btn-outline btn-sm" disabled={!!busyId}
                            onClick={() => void retry(row)}>
                            {busyId === row['Notification ID'] ? 'กำลัง Retry...' : 'Retry'}
                          </button>
                        : status === 'FAILED' && !canRetry
                          ? <span title="ต้องมีสิทธิ์ NURSE, ADMIN หรือ SUPER_ADMIN">ต้องมีสิทธิ์ Retry</span>
                        : role === 'SUPER_ADMIN' && uncertain
                          ? <button className="btn btn-outline btn-sm"
                              disabled={!!busyId}
                              onClick={() => void unlockAfterVerification(row)}>
                              ตรวจสอบแล้ว / ปลดล็อก
                            </button>
                          : '—'}
                    </td>
                  </tr>
                );
              })}
              {!loading && records.length === 0 && (
                <tr><td colSpan={7} style={{ padding:24, textAlign:'center', color:'#64748b' }}>ไม่พบ Notification Log</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
