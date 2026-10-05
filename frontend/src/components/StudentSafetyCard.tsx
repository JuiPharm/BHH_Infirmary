import React from 'react';
import { StudentSafetyProfile } from '../types';

interface StudentSafetyCardProps {
  profile: StudentSafetyProfile | null;
  loading?: boolean;
  compact?: boolean;
  onEdit?: () => void;
}

const splitList = (value: string): string[] =>
  String(value || '')
    .split(/[\n,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const StudentSafetyCard: React.FC<StudentSafetyCardProps> = ({
  profile,
  loading = false,
  compact = false,
  onEdit
}) => {
  if (loading) {
    return (
      <section className="card">
        <div style={{ color: '#64748b', textAlign: 'center', padding: 12 }}>
          กำลังโหลดข้อมูลความเสี่ยง...
        </div>
      </section>
    );
  }

  if (!profile) return null;

  const drugAllergies = splitList(profile.drugAllergy);
  const foodAllergies = splitList(profile.foodAllergy);
  const chronic = splitList(profile.chronicDiseases);
  const conditionFlags = [
    profile.asthma ? 'Asthma' : '',
    profile.epilepsy ? 'Epilepsy' : '',
    profile.diabetes ? 'Diabetes' : ''
  ].filter(Boolean);

  const hasSafetyAlert =
    drugAllergies.length > 0 ||
    foodAllergies.length > 0 ||
    chronic.length > 0 ||
    conditionFlags.length > 0 ||
    Boolean(profile.specialCondition.trim());

  return (
    <section className="card" style={{ borderColor: hasSafetyAlert ? '#f59e0b' : undefined }}>
      <div className="card-header">
        <span className="card-title">⚠ Student Safety Profile</span>
        {onEdit && (
          <button className="btn btn-outline btn-sm" type="button" onClick={onEdit}>
            แก้ไขข้อมูล
          </button>
        )}
      </div>

      {!hasSafetyAlert ? (
        <div style={{ padding: '8px 0', color: '#64748b' }}>
          ไม่พบข้อมูล Allergy / Chronic disease / Special condition ที่บันทึกไว้
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {drugAllergies.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px' }}>
              <strong style={{ color: '#991b1b' }}>Drug Allergy</strong>
              <div style={{ marginTop: 4 }}>{drugAllergies.join(', ')}</div>
            </div>
          )}

          {foodAllergies.length > 0 && (
            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px' }}>
              <strong style={{ color: '#9a3412' }}>Food Allergy</strong>
              <div style={{ marginTop: 4 }}>{foodAllergies.join(', ')}</div>
            </div>
          )}

          {(chronic.length > 0 || conditionFlags.length > 0 || profile.specialCondition) && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>
              <strong style={{ color: '#92400e' }}>Health Alerts</strong>
              {chronic.length > 0 && <div style={{ marginTop: 4 }}>โรคประจำตัว: {chronic.join(', ')}</div>}
              {conditionFlags.length > 0 && <div style={{ marginTop: 4 }}>เงื่อนไขสำคัญ: {conditionFlags.join(', ')}</div>}
              {profile.specialCondition && <div style={{ marginTop: 4 }}>หมายเหตุ: {profile.specialCondition}</div>}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 12,
          borderTop: '1px solid #e2e8f0',
          paddingTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div>
          <strong>Visits 30 วัน:</strong>{' '}
          <span className={`badge ${profile.recentVisit30dCount >= 3 ? 'badge-warning' : 'badge-gray'}`}>
            {profile.recentVisit30dCount} ครั้ง
          </span>
          {profile.recentVisit30dCount >= 3 && (
            <div style={{ color: '#b45309', fontSize: '.82rem', marginTop: 4 }}>
              ⚠ เข้ารับบริการซ้ำ ≥ 3 ครั้งใน 30 วัน ควรทบทวนอาการเดิมและพิจารณาติดต่อผู้ปกครอง/ส่งต่อเมื่อเหมาะสม
            </div>
          )}
        </div>

        {!compact && profile.emergencyContactName && (
          <div style={{ minWidth: 220 }}>
            <div style={{ color: '#64748b', fontSize: '.8rem' }}>Emergency Contact</div>
            <strong>{profile.emergencyContactName}</strong>
            {profile.emergencyContactRelation && <span> · {profile.emergencyContactRelation}</span>}
            {profile.emergencyContactPhone && <div>{profile.emergencyContactPhone}</div>}
          </div>
        )}
      </div>

      {!compact && profile.recentVisits.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: '#64748b', fontSize: '.8rem', marginBottom: 6 }}>Recent visits</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {profile.recentVisits.map((visit) => (
              <div
                key={visit.visitId}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 7,
                  padding: '7px 9px',
                  fontSize: '.82rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10
                }}
              >
                <span>{visit.visitDate} {visit.visitTime}</span>
                <span style={{ color: '#64748b' }}>{visit.disposition || '-'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {profile.updatedAt && (
        <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 10, textAlign: 'right' }}>
          อัปเดตล่าสุด: {profile.updatedAt}{profile.updatedBy ? ` โดย ${profile.updatedBy}` : ''}
        </div>
      )}
    </section>
  );
};
