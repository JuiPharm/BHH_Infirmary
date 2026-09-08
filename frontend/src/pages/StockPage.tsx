import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Item, StockLot, StockTransactionRecord } from '../types';
import { api } from '../api';
import { getDaysUntilExpiry, getStockAlertLevel, normalizeItemType } from '../domain/stock';
import { parseItemsInput, ItemImportRow } from '../utils/csvParser';
import Swal from 'sweetalert2';

export const StockPage: React.FC = () => {
  const { session, isRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'LOTS' | 'RECEIVE' | 'ADJUST' | 'TRANSACTIONS'>('ITEMS');

  const [items, setItems] = useState<Item[]>([]);
  const [lots, setLots] = useState<StockLot[]>([]);
  const [transactions, setTransactions] = useState<StockTransactionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [itemSearch, setItemSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'DRUG' | 'MEDICAL_SUPPLY'>('ALL');

  // Receive Form State
  const [rcvItemCode, setRcvItemCode] = useState('');
  const [rcvLotNumber, setRcvLotNumber] = useState('');
  const [rcvExpiry, setRcvExpiry] = useState('');
  const [rcvQty, setRcvQty] = useState('');
  const [rcvUnitCost, setRcvUnitCost] = useState('');
  const [rcvSupplier, setRcvSupplier] = useState('');
  const [rcvSubmitting, setRcvSubmitting] = useState(false);

  // Adjust Form State
  const [adjLotId, setAdjLotId] = useState('');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjSubmitting, setAdjSubmitting] = useState(false);

  // Import Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [parsedItems, setParsedItems] = useState<ItemImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canMutateStock = isRole(['ADMIN', 'SUPER_ADMIN']);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async (forceRefresh: boolean = false) => {
    if (!session?.token) return;
    setLoading(true);
    try {
      if (activeTab === 'ITEMS' || activeTab === 'RECEIVE') {
        const data = await api<Item[]>('getStock', {}, session.token, undefined, 20000, forceRefresh);
        setItems(data || []);
      } else if (activeTab === 'LOTS' || activeTab === 'ADJUST') {
        const lotsPromise = api<StockLot[]>('getStockLots', {}, session.token, undefined, 20000, forceRefresh);
        const itemsPromise = (items.length > 0 && !forceRefresh)
          ? Promise.resolve(items)
          : api<Item[]>('getStock', {}, session.token, undefined, 20000, forceRefresh);
        const [lotsData, itemsData] = await Promise.all([lotsPromise, itemsPromise]);
        setLots(lotsData || []);
        setItems(itemsData || []);
      } else if (activeTab === 'TRANSACTIONS') {
        const txData = await api<StockTransactionRecord[]>('getStockTransactions', { limit: 100 }, session.token, undefined, 20000, forceRefresh);
        setTransactions(txData || []);
      }
    } catch (err: any) {
      console.error('Failed to load stock data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateStock || !session?.token) return;

    const qtyNum = parseInt(rcvQty, 10);
    if (!rcvItemCode || !rcvExpiry || isNaN(qtyNum) || qtyNum <= 0) {
      Swal.fire('ข้อมูลไม่ถูกต้อง', 'กรุณาระบุรหัสยา วันหมดอายุ และจำนวนมากกว่า 0', 'warning');
      return;
    }

    setRcvSubmitting(true);
    try {
      await api(
        'receiveStock',
        {
          itemCode: rcvItemCode,
          lotNumber: rcvLotNumber.trim(),
          expiry: rcvExpiry,
          qty: qtyNum,
          unitCost: parseFloat(rcvUnitCost) || 0,
          supplier: rcvSupplier.trim()
        },
        session.token
      );

      Swal.fire({
        icon: 'success',
        title: 'รับเข้าสต็อกสำเร็จ!',
        text: `รับรายการ ${rcvItemCode} จำนวน ${qtyNum} เข้าคลังแล้ว`,
        confirmButtonColor: '#0b1f3a'
      });

      // Reset form
      setRcvLotNumber('');
      setRcvExpiry('');
      setRcvQty('');
      setRcvUnitCost('');
      setRcvSupplier('');
      setActiveTab('ITEMS');
    } catch (err: any) {
      Swal.fire('รับเข้าไม่สำเร็จ', err.message, 'error');
    } finally {
      setRcvSubmitting(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutateStock || !session?.token) return;

    const deltaNum = parseInt(adjDelta, 10);
    if (!adjLotId || isNaN(deltaNum) || deltaNum === 0 || !adjReason.trim()) {
      Swal.fire('ข้อมูลไม่ถูกต้อง', 'กรุณาเลือก Lot, ระบุจำนวน (+/-) และเหตุผลการปรับปรุง', 'warning');
      return;
    }

    setAdjSubmitting(true);
    try {
      await api(
        'adjustStock',
        {
          stockLotId: adjLotId,
          delta: deltaNum,
          reason: adjReason.trim()
        },
        session.token
      );

      Swal.fire({
        icon: 'success',
        title: 'ปรับปรุงสต็อกสำเร็จ!',
        text: `บันทึกการปรับปรุงสต็อกเรียบร้อยแล้ว`,
        confirmButtonColor: '#0b1f3a'
      });

      setAdjDelta('');
      setAdjReason('');
      setActiveTab('LOTS');
    } catch (err: any) {
      Swal.fire('ปรับปรุงไม่สำเร็จ', err.message, 'error');
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleTextChange = (text: string) => {
    setImportText(text);
    if (!text.trim()) {
      setParsedItems([]);
      setParseErrors([]);
      return;
    }
    const res = parseItemsInput(text);
    setParsedItems(res.data);
    setParseErrors(res.errors);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      handleTextChange(content);
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' +
      'Item Code,Item Type,Generic Name,Trade Name,Unit,Minimum Stock,Maximum Stock,Unit Cost,Active/Inactive\n' +
      'PARA500,DRUG,Paracetamol 500mg,Tylenol,เม็ด,100,1000,0.50,TRUE\n' +
      'AMOX500,DRUG,Amoxicillin 500mg,Amoxil,แคปซูล,50,500,1.50,TRUE\n' +
      'GAUZE2X2,MEDICAL_SUPPLY,Gauze sterile 2x2,Gauze,ชิ้น,50,500,2.00,TRUE\n' +
      'BETADINE,DRUG,Povidone Iodine 15ml,Betadine,ขวด,10,100,25.00,TRUE\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'ITEM_MASTER_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmImport = async () => {
    if (!parsedItems.length || !session?.token) return;
    setImporting(true);
    try {
      const res = await api<{ added: number; updated: number; total: number }>(
        'importItems',
        { items: parsedItems },
        session.token
      );
      Swal.fire({
        icon: 'success',
        title: 'นำเข้ารายการเวชภัณฑ์สำเร็จ!',
        html: `เพิ่มใหม่: <b>${res.added}</b> รายการ<br/>อัปเดต: <b>${res.updated}</b> รายการ<br/>รวมทั้งหมด: <b>${res.total}</b> รายการ`,
        confirmButtonColor: '#0b1f3a'
      });
      setShowImportModal(false);
      setImportText('');
      setParsedItems([]);
      setParseErrors([]);
      loadData();
    } catch (err: any) {
      Swal.fire('นำเข้าข้อมูลล้มเหลว', err.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const filteredItems = items.filter((it) => {
    const itemType = normalizeItemType(it['Item Type']);
    const matchType = itemTypeFilter === 'ALL' || itemType === itemTypeFilter;
    const q = itemSearch.toLowerCase().trim();
    const matchQuery =
      !q ||
      it['Item Code'].toLowerCase().includes(q) ||
      (it['Generic Name'] || '').toLowerCase().includes(q) ||
      (it['Trade Name'] || '').toLowerCase().includes(q);
    return matchType && matchQuery;
  });

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2>คลังยาและเวชภัณฑ์ (Inventory & Stock)</h2>
          <p style={{ color: '#64748b', fontSize: '0.95rem' }}>
            จัดการรายการยา เวชภัณฑ์ ตรวจสอบ Lot วันหมดอายุ และบันทึกการรับเข้า/ปรับยอดสต็อก
          </p>
        </div>
        {canMutateStock && (
          <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
            📁 นำเข้ารายการยา/เวชภัณฑ์ (Upload CSV)
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-item ${activeTab === 'ITEMS' ? 'active' : ''}`}
          onClick={() => setActiveTab('ITEMS')}
        >
          📦 ยอดคงเหลือเวชภัณฑ์ (Items)
        </button>
        {isRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']) && (
          <button
            className={`tab-item ${activeTab === 'LOTS' ? 'active' : ''}`}
            onClick={() => setActiveTab('LOTS')}
          >
            🏷️ รายการ Lot (Stock Lots)
          </button>
        )}
        {canMutateStock && (
          <>
            <button
              className={`tab-item ${activeTab === 'RECEIVE' ? 'active' : ''}`}
              onClick={() => setActiveTab('RECEIVE')}
            >
              📥 รับเข้าสต็อก (Receive)
            </button>
            <button
              className={`tab-item ${activeTab === 'ADJUST' ? 'active' : ''}`}
              onClick={() => setActiveTab('ADJUST')}
            >
              ⚖️ ปรับยอดสต็อก (Adjust)
            </button>
          </>
        )}
        {isRole(['ADMIN', 'MANAGER', 'SUPER_ADMIN']) && (
          <button
            className={`tab-item ${activeTab === 'TRANSACTIONS' ? 'active' : ''}`}
            onClick={() => setActiveTab('TRANSACTIONS')}
          >
            📜 ประวัติการเคลื่อนไหว (Ledger)
          </button>
        )}
      </div>

      {/* TAB 1: ITEMS */}
      {activeTab === 'ITEMS' && (
        <section className="card">
          <div className="search-bar" style={{ flexWrap: 'wrap' }}>
            <input
              type="text"
              className="form-control"
              style={{ minWidth: '220px' }}
              placeholder="ค้นหาชื่อยา หรือ รหัสเวชภัณฑ์..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`btn btn-sm ${itemTypeFilter === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setItemTypeFilter('ALL')}
              >
                ทั้งหมด
              </button>
              <button
                className={`btn btn-sm ${itemTypeFilter === 'DRUG' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setItemTypeFilter('DRUG')}
              >
                💊 ยา
              </button>
              <button
                className={`btn btn-sm ${itemTypeFilter === 'MEDICAL_SUPPLY' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setItemTypeFilter('MEDICAL_SUPPLY')}
              >
                🩹 เวชภัณฑ์
              </button>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => loadData(true)} disabled={loading} style={{ marginLeft: 'auto' }}>
              {loading ? 'โหลด...' : 'รีเฟรช'}
            </button>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>รหัส</th>
                  <th>ประเภท</th>
                  <th>ชื่อสามัญ (Generic Name)</th>
                  <th>ชื่อการค้า (Trade Name)</th>
                  <th style={{ textAlign: 'right' }}>คงเหลือ</th>
                  <th>หน่วย</th>
                  <th style={{ textAlign: 'right' }}>Min - Max</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      {loading ? 'กำลังโหลดข้อมูลสต็อก...' : 'ไม่พบรายการยาหรือเวชภัณฑ์'}
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((it) => {
                    const current = Number(it.QTY) || 0;
                    const min = Number(it['Minimum Stock']) || 0;
                    const status = getStockAlertLevel(current, min);

                    return (
                      <tr key={it['Item Code']}>
                        <td><strong>{it['Item Code']}</strong></td>
                        <td>
                          <span className={`badge ${normalizeItemType(it['Item Type']) === 'DRUG' ? 'badge-primary' : 'badge-gray'}`}>
                            {normalizeItemType(it['Item Type']) === 'DRUG' ? '💊 ยา' : '🩹 เวชภัณฑ์'}
                          </span>
                        </td>
                        <td>{it['Generic Name']}</td>
                        <td>{it['Trade Name'] || '-'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '1rem' }}>
                          {current}
                        </td>
                        <td>{it.Unit}</td>
                        <td style={{ textAlign: 'right', color: '#64748b' }}>
                          {min} - {it['Maximum Stock'] || '-'}
                        </td>
                        <td>
                          {status === 'OUT_OF_STOCK' && <span className="badge badge-danger">หมดสต็อก</span>}
                          {status === 'LOW_STOCK' && <span className="badge badge-warning">ใกล้หมด</span>}
                          {status === 'NORMAL' && <span className="badge badge-success">ปกติ</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: LOTS */}
      {activeTab === 'LOTS' && (
        <section className="card">
          <div className="card-header">
            <span className="card-title">รายการ Lots และวันหมดอายุ (FEFO Tracking)</span>
            <button className="btn btn-outline btn-sm" onClick={() => loadData(true)} disabled={loading}>
              {loading ? 'โหลด...' : 'รีเฟรช'}
            </button>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Lot ID</th>
                  <th>รหัสยา</th>
                  <th>Lot No.</th>
                  <th>วันหมดอายุ</th>
                  <th>นับถอยหลัง</th>
                  <th style={{ textAlign: 'right' }}>รับเข้า</th>
                  <th style={{ textAlign: 'right' }}>คงเหลือ</th>
                  <th>ผู้จัดจำหน่าย</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {lots.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      {loading ? 'กำลังโหลดข้อมูล Lots...' : 'ยังไม่มีข้อมูล Stock Lot ในระบบ'}
                    </td>
                  </tr>
                ) : (
                  lots.map((l) => {
                    const days = getDaysUntilExpiry(l['Expiry Date']);
                    const isExpired = days <= 0;
                    const isCritical = days > 0 && days <= 30;
                    const isWarning = days > 30 && days <= 90;

                    return (
                      <tr key={l['Stock Lot ID']}>
                        <td><code>{l['Stock Lot ID']}</code></td>
                        <td><strong>{l['Item Code']}</strong></td>
                        <td>{l['Lot Number'] || '-'}</td>
                        <td>{l['Expiry Date']}</td>
                        <td>
                          {isExpired ? (
                            <span className="badge badge-danger">หมดอายุแล้ว</span>
                          ) : isCritical ? (
                            <span className="badge badge-danger">เหลือ {days} วัน</span>
                          ) : isWarning ? (
                            <span className="badge badge-warning">เหลือ {days} วัน</span>
                          ) : (
                            <span className="badge badge-success">เหลือ {days} วัน</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>{l['Received Qty']}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{l['Current Qty']}</td>
                        <td>{l.Supplier || '-'}</td>
                        <td>
                          <span className={`badge ${l.Status === 'ACTIVE' ? 'badge-success' : 'badge-gray'}`}>
                            {l.Status}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 3: RECEIVE STOCK */}
      {activeTab === 'RECEIVE' && (
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <section className="card">
            <div className="card-header">
              <span className="card-title">📥 บันทึกรับเวชภัณฑ์เข้าสต็อก</span>
            </div>

            <form onSubmit={handleReceiveSubmit}>
              <div className="form-group">
                <label className="form-label">เลือกรายการยา/เวชภัณฑ์ *</label>
                <select
                  className="form-control"
                  value={rcvItemCode}
                  onChange={(e) => setRcvItemCode(e.target.value)}
                  required
                >
                  <option value="">-- กรุณาเลือกรายการ --</option>
                  {items.map((it) => (
                    <option key={it['Item Code']} value={it['Item Code']}>
                      [{it['Item Code']}] {it['Generic Name'] || it['Trade Name']} ({it.Unit})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">หมายเลข Lot (Lot Number) *</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="เช่น LOT2026-A1"
                    value={rcvLotNumber}
                    onChange={(e) => setRcvLotNumber(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">วันหมดอายุ (Expiry Date) *</label>
                  <input
                    type="date"
                    className="form-control"
                    value={rcvExpiry}
                    onChange={(e) => setRcvExpiry(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">จำนวนที่รับเข้า (Received Qty) *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-control"
                    placeholder="จำนวนเต็ม > 0"
                    value={rcvQty}
                    onChange={(e) => setRcvQty(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">ราคาต่อหน่วย (Unit Cost)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-control"
                    placeholder="0.00"
                    value={rcvUnitCost}
                    onChange={(e) => setRcvUnitCost(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">ผู้จัดจำหน่าย / แหล่งที่มา (Supplier)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="เช่น GPO, โรงพยาบาลกรุงเทพหาดใหญ่"
                  value={rcvSupplier}
                  onChange={(e) => setRcvSupplier(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                disabled={rcvSubmitting}
              >
                {rcvSubmitting ? 'กำลังบันทึก...' : 'บันทึกรับเข้าสต็อก'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 4: ADJUST STOCK */}
      {activeTab === 'ADJUST' && (
        <div style={{ maxWidth: '650px', margin: '0 auto' }}>
          <section className="card">
            <div className="card-header">
              <span className="card-title">⚖️ ปรับยอดสต็อก (Stock Adjustment)</span>
            </div>

            <form onSubmit={handleAdjustSubmit}>
              <div className="form-group">
                <label className="form-label">เลือก Lot ที่ต้องการปรับยอด *</label>
                <select
                  className="form-control"
                  value={adjLotId}
                  onChange={(e) => setAdjLotId(e.target.value)}
                  required
                >
                  <option value="">-- กรุณาเลือก Lot --</option>
                  {lots.map((l) => (
                    <option key={l['Stock Lot ID']} value={l['Stock Lot ID']}>
                      [{l['Stock Lot ID']}] {l['Item Code']} (Lot: {l['Lot Number']}) คงเหลือ: {l['Current Qty']}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">
                  จำนวนที่ปรับ (Delta: ค่าบวก = เพิ่ม, ค่าลบ = ลด) *
                </label>
                <input
                  type="number"
                  className="form-control"
                  placeholder="เช่น -2 หรือ 5"
                  value={adjDelta}
                  onChange={(e) => setAdjDelta(e.target.value)}
                  required
                />
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  ใส่เครื่องหมายลบ (-) เพื่อตัดยอดชำรุด/หมดอายุ หรือตัวเลขบวกเพื่อเพิ่มยอด
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">เหตุผลการปรับปรุง (Reason) *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="เช่น ยาชำรุดแตกหัก, ปรับยอดจากการตรวจนับประจำเดือน"
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                disabled={adjSubmitting}
              >
                {adjSubmitting ? 'กำลังบันทึก...' : 'บันทึกการปรับยอด'}
              </button>
            </form>
          </section>
        </div>
      )}

      {/* TAB 5: TRANSACTIONS LEDGER */}
      {activeTab === 'TRANSACTIONS' && (
        <section className="card">
          <div className="card-header">
            <span className="card-title">📜 บัญชีประวัติการเคลื่อนไหวสต็อก (Stock Transactions)</span>
            <button className="btn btn-outline btn-sm" onClick={() => loadData(true)} disabled={loading}>
              {loading ? 'โหลด...' : 'รีเฟรช'}
            </button>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>เวลา</th>
                  <th>ประเภท</th>
                  <th>รหัสยา</th>
                  <th>Lot ID</th>
                  <th style={{ textAlign: 'right' }}>จำนวน</th>
                  <th style={{ textAlign: 'right' }}>ก่อนหน้า</th>
                  <th style={{ textAlign: 'right' }}>คงเหลือ</th>
                  <th>เหตุผล / Ref</th>
                  <th>ผู้ทำรายการ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                      {loading ? 'กำลังโหลดรายการเคลื่อนไหว...' : 'ยังไม่มีประวัติการเคลื่อนไหวในระบบ'}
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx['Transaction ID']}>
                      <td>{tx.Timestamp}</td>
                      <td>
                        <span
                          className={`badge ${
                            tx['Transaction Type'] === 'DISPENSE'
                              ? 'badge-danger'
                              : tx['Transaction Type'] === 'RECEIVE'
                              ? 'badge-success'
                              : 'badge-warning'
                          }`}
                        >
                          {tx['Transaction Type']}
                        </span>
                      </td>
                      <td><strong>{tx['Item Code']}</strong></td>
                      <td><code>{tx['Stock Lot ID']}</code></td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{tx.Qty}</td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>{tx['Before Qty']}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{tx['After Qty']}</td>
                      <td>{tx.Reason || tx['Reference ID'] || '-'}</td>
                      <td>{tx['Staff ID']}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Import Items */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-lg">
            <div className="card-header">
              <span className="card-title">📁 นำเข้ารายการยาและเวชภัณฑ์ (Import Items)</span>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setParsedItems([]);
                  setParseErrors([]);
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '14px' }}>
              อัปโหลดไฟล์ <code>.csv</code> หรือคัดลอกตารางรายการยา/เวชภัณฑ์จาก Excel หรือ Google Sheets มาวาง (หัวตารางตรงตาม Google Sheet: <code>Item Code, Item Type, Generic Name, Trade Name, Unit, Minimum Stock, Maximum Stock, Unit Cost, Active/Inactive</code>)
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
              <input
                type="file"
                accept=".csv,.tsv,.txt"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                📄 เลือกไฟล์ CSV / Text
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleDownloadTemplate}
              >
                ⬇️ ดาวน์โหลดแม่แบบ CSV (ตรงตาม Google Sheet)
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">
                วางข้อมูลข้อความ (CSV / คัดลอกจาก Google Sheet หรือ Excel)
              </label>
              <textarea
                className="form-control"
                rows={5}
                placeholder="Item Code,Item Type,Generic Name,Trade Name,Unit,Minimum Stock,Maximum Stock,Unit Cost,Active/Inactive&#10;PARA500,DRUG,Paracetamol 500mg,Tylenol,เม็ด,100,1000,0.50,TRUE"
                value={importText}
                onChange={(e) => handleTextChange(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              />
            </div>

            {/* Error Message */}
            {parseErrors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '6px', color: '#991b1b', fontSize: '0.85rem', marginBottom: '14px' }}>
                <strong>พบข้อผิดพลาด:</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                  {parseErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Preview Section */}
            {parsedItems.length > 0 && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    พรีวิวรายการเวชภัณฑ์ที่จะนำเข้า (ทั้งหมด {parsedItems.length} รายการ):
                  </strong>
                  <span className="badge badge-primary">{parsedItems.length} รายการ</span>
                </div>

                <div className="table-responsive" style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>รหัส</th>
                        <th>ประเภท</th>
                        <th>ชื่อสามัญ</th>
                        <th>ชื่อการค้า</th>
                        <th>หน่วย</th>
                        <th style={{ textAlign: 'right' }}>Min - Max</th>
                        <th style={{ textAlign: 'right' }}>ราคา</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedItems.slice(0, 10).map((it, idx) => (
                        <tr key={idx}>
                          <td><strong>{it.itemCode}</strong></td>
                          <td>
                            <span className={`badge ${it.itemType === 'DRUG' ? 'badge-primary' : 'badge-gray'}`}>
                              {it.itemType}
                            </span>
                          </td>
                          <td>{it.genericName}</td>
                          <td>{it.tradeName || '-'}</td>
                          <td>{it.unit}</td>
                          <td style={{ textAlign: 'right' }}>{it.minStock} - {it.maxStock}</td>
                          <td style={{ textAlign: 'right' }}>{it.unitCost.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedItems.length > 10 && (
                  <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
                    * แสดงตัวอย่าง 10 รายการแรกจากทั้งหมด {parsedItems.length} รายการ
                  </p>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                disabled={parsedItems.length === 0 || importing}
                onClick={handleConfirmImport}
              >
                {importing ? 'กำลังนำเข้าข้อมูล...' : `ยืนยันนำเข้ารายการ (${parsedItems.length} รายการ)`}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={importing}
                onClick={() => {
                  setShowImportModal(false);
                  setImportText('');
                  setParsedItems([]);
                  setParseErrors([]);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
