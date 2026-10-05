import React, { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../api';
import { StudentSafetyProfile } from '../types';

interface Props {
  profile: StudentSafetyProfile;
  token: string;
  onSaved: (profile: StudentSafetyProfile) => void;
  onCancel: () => void;
}

export const StudentSafetyEditor: React.FC<Props> = ({ profile, token, onSaved, onCancel }) => {
  const [drugAllergy, setDrugAllergy] = useState('');
  const [foodAllergy, setFoodAllergy] = useState('');
  const [chronicDiseases, setChronicDiseases] = useState('');
  const [asthma, setAsthma] = useState(false);
  const [epilepsy, setEpilepsy] = useState(false);
  const [diabetes, setDiabetes] = useState(false);
  const [specialCondition, setSpecialCondition] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDrugAllergy(profile.drugAllergy || '');
    setFoodAllergy(profile.foodAllergy || '');
    setChronicDiseases(profile.chronicDiseases || '');
    setAsthma(Boolean(profile.asthma));
    setEpilepsy(Boolean(profile.epilepsy));
    setDiabetes(Boolean(profile.diabetes));
    setSpecialCondition(profile.specialCondition || '');
    setEmergencyContactName(profile.emergencyContactName || '');
    setEmergencyContactRelation(profile.emergencyContactRelation || '');
    setEmergencyContactPhone(profile.emergencyContactPhone || '');
  }, [profile]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api<StudentSafetyProfile>(
        'updateStudentSafetyProfile',
        {
          studentId: profile.studentId,
          drugAllergy,
          foodAllergy,
          chronicDiseases,
          asthma,
          epilepsy,
          diabetes,
          specialCondition,
          emergencyContactName,
          emergencyContactRelation,
          emergencyContactPhone
        },
        token
      );
      onSaved(updated);
      Swal.fire('บันทึกสำเร็จ', 'อัปเดต Student Safety Profile แล้ว', 'success');
    } catch (err: any) {
      Swal.fire('บันทึกไม่สำเร็จ', err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <span className="card-title">แก้ไข Student Safety Profile</span>
      </div>

      <div className="form-group">
        <label className="form-label">Drug Allergy</label>
        <textarea
          className="form-control"
          value={drugAllergy}
          onChange={(e) => setDrugAllergy(e.target.value)}
          placeholder="ระบุชื่อยา/กลุ่มยา คั่นด้วย comma หรือขึ้นบรรทัดใหม่"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Food Allergy</label>
        <textarea
          className="form-control"
          value={foodAllergy}
          onChange={(e) => setFoodAllergy(e.target.value)}
          placeholder="เช่น Peanut, Egg, Seafood"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Chronic Diseases</label>
        <textarea
          className="form-control"
          value={chronicDiseases}
          onChange={(e) => setChronicDiseases(e.target.value)}
          placeholder="เช่น G6PD deficiency, congenital heart disease"
        />
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          ['Asthma', asthma, setAsthma],
          ['Epilepsy', epilepsy, setEpilepsy],
          ['Diabetes', diabetes, setDiabetes]
        ].map(([label, checked, setter]) => (
          <label key={String(label)} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={Boolean(checked)}
              onChange={(e) => (setter as React.Dispatch<React.SetStateAction<boolean>>)(e.target.checked)}
            />
            <span>{String(label)}</span>
          </label>
        ))}
      </div>

      <div className="form-group">
        <label className="form-label">Special Condition / Safety Note</label>
        <textarea
          className="form-control"
          value={specialCondition}
          onChange={(e) => setSpecialCondition(e.target.value)}
          placeholder="ข้อมูลสำคัญที่ควรเห็นก่อนให้การดูแล"
        />
      </div>

      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 8 }}>
        <strong>Emergency Contact</strong>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 10 }}>
          <div className="form-group">
            <label className="form-label">ชื่อผู้ติดต่อ</label>
            <input className="form-control" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">ความสัมพันธ์</label>
            <input className="form-control" value={emergencyContactRelation} onChange={(e) => setEmergencyContactRelation(e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">โทรศัพท์</label>
          <input className="form-control" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-outline" type="button" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </button>
        <button className="btn btn-primary" type="button" onClick={save} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : 'บันทึก Safety Profile'}
        </button>
      </div>
    </section>
  );
};
