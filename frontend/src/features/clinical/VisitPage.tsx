import React, { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '../../api';
import { StudentSafetyCard } from '../../components/StudentSafetyCard';
import { StudentSafetyEditor } from '../../components/StudentSafetyEditor';
import { useAuth } from '../../context/AuthContext';
import { normalizeItemType } from '../../domain/stock';
import { hasVisitClinicalContent } from '../../domain/visit';
import {
  CartItem,
  DrugAllergyStatus,
  FreeTextDrugAllergy,
  Item,
  Recipient,
  RecipientType,
  StudentSafetyProfile,
  SymptomCatalogItem,
  SymptomCategory,
  VisitDisposition,
  VisitSubmitP4Result,
  VisitVitals
} from '../../types';
import { getSymptomCatalog, searchRecipients, submitVisitP4 } from './api';
import {
  deriveClinicalAlert,
  deriveVisitCategory,
  validateFreeTextDrugAllergy
} from './domain';

const INTERVENTIONS = [
  ['REST', 'พักสังเกตอาการ'],
  ['WOUND_CARE', 'ทำแผล/ล้างแผล'],
  ['COLD_COMPRESS', 'ประคบเย็น'],
  ['WARM_COMPRESS', 'ประคบอุ่น'],
  ['ORAL_HYDRATION', 'ให้ดื่มน้ำ/สารน้ำทางปาก'],
  ['FIRST_AID', 'ปฐมพยาบาล'],
  ['MEDICATION', 'ให้ยา'],
  ['MEDICAL_SUPPLY', 'ใช้เวชภัณฑ์'],
  ['PARENT_CONTACTED', 'ติดต่อผู้ปกครอง'],
  ['REFERRED', 'ส่งต่อ']
] as const;

const DISPOSITIONS: Array<[VisitDisposition, string]> = [
  ['RETURN_TO_CLASS', 'กลับเข้าชั้นเรียน'],
  ['OBSERVATION', 'พักสังเกตอาการ'],
  ['SEND_HOME', 'ให้กลับบ้าน'],
  ['PARENT_PICKUP', 'ผู้ปกครองมารับ'],
  ['REFER_CLINIC', 'ส่งต่อคลินิก'],
  ['REFER_HOSPITAL', 'ส่งต่อโรงพยาบาล'],
  ['EMERGENCY_TRANSFER', 'ส่งฉุกเฉิน'],
  ['OTHER', 'อื่นๆ']
];

const RECIPIENT_LABELS: Record<RecipientType, string> = {
  STUDENT: 'นักเรียน',
  TEACHER: 'ครู',
  STAFF: 'บุคลากร',
  OTHER: 'อื่นๆ',
  PARENT: 'ผู้ปกครอง',
  VISITOR: 'ผู้มาติดต่อ'
};

const CATEGORY_LABELS: Record<SymptomCategory, string> = {
  NON_TRAUMA: 'Non Trauma',
  TRAUMA: 'Trauma',
  OTHER: 'Other'
};

type CustomSymptomCategory = Extract<SymptomCategory, 'TRAUMA' | 'NON_TRAUMA'>;
type CustomSymptom = { category: CustomSymptomCategory; symptom: string };

const numericOrBlank = (value: string): number | '' => {
  if (!value.trim()) return '';
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
};

const emptyAllergy: FreeTextDrugAllergy = {
  status: '',
  drugGroup: '',
  reaction: '',
  note: ''
};

export const VisitPage: React.FC = () => {
  const { session, isRole } = useAuth();

  const [recipientQuery, setRecipientQuery] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient | null>(null);
  const [searchingRecipient, setSearchingRecipient] = useState(false);
  const [freeTextMode, setFreeTextMode] = useState(false);
  const [freeName, setFreeName] = useState('');
  const [freeType, setFreeType] = useState<RecipientType>('OTHER');
  const [freeId, setFreeId] = useState('');
  const [freeDepartment, setFreeDepartment] = useState('');
  const [freeContact, setFreeContact] = useState('');
  const [freeTextAllergy, setFreeTextAllergy] = useState<FreeTextDrugAllergy>(emptyAllergy);

  const [safetyProfile, setSafetyProfile] = useState<StudentSafetyProfile | null>(null);
  const [loadingSafety, setLoadingSafety] = useState(false);
  const [studentSafetyReviewed, setStudentSafetyReviewed] = useState(false);
  const [editingSafety, setEditingSafety] = useState(false);

  const [symptomCatalog, setSymptomCatalog] = useState<SymptomCatalogItem[]>([]);
  const [loadingSymptoms, setLoadingSymptoms] = useState(false);
  const [symptomCatalogError, setSymptomCatalogError] = useState('');
  const [selectedSymptomIds, setSelectedSymptomIds] = useState<string[]>([]);
  const [customSymptoms, setCustomSymptoms] = useState<CustomSymptom[]>([]);
  const [customSymptomDrafts, setCustomSymptomDrafts] = useState<Record<CustomSymptomCategory, string>>({
    TRAUMA: '',
    NON_TRAUMA: ''
  });
  const [symptomSearch, setSymptomSearch] = useState('');
  const [expandedSymptomCategories, setExpandedSymptomCategories] = useState<SymptomCategory[]>(['NON_TRAUMA']);
  const symptomSearchInputRef = useRef<HTMLInputElement>(null);
  const selectedSymptomButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [otherSymptom, setOtherSymptom] = useState('');
  const [assessment, setAssessment] = useState('');
  const [note, setNote] = useState('');
  const [interventions, setInterventions] = useState<string[]>([]);
  const [disposition, setDisposition] = useState<VisitDisposition | ''>('');
  const [outcomeNote, setOutcomeNote] = useState('');

  const [temperature, setTemperature] = useState('');
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [weight, setWeight] = useState('');

  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'ALL' | 'DRUG' | 'MEDICAL_SUPPLY'>('ALL');
  const [loadingItems, setLoadingItems] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pendingVisitRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const loadSymptomCatalog = async (token: string) => {
    setLoadingSymptoms(true);
    setSymptomCatalogError('');
    try {
      const data = await getSymptomCatalog(token);
      setSymptomCatalog(data || []);
    } catch (err: any) {
      console.error('Failed to load symptom catalog', err);
      setSymptomCatalogError(err?.message || 'ไม่สามารถเชื่อมต่อ Symptom Master ได้');
      Swal.fire('โหลด Symptom Master ไม่สำเร็จ', err?.message || 'กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setLoadingSymptoms(false);
    }
  };

  useEffect(() => {
    if (!session?.token) return;
    loadSymptomCatalog(session.token);
    loadItems();
  }, [session?.token]);

  useEffect(() => {
    const q = recipientQuery.trim();
    if (!session?.token || selectedRecipient || q.length < 2) {
      if (q.length < 2) setRecipients([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setSearchingRecipient(true);
      try {
        const data = await searchRecipients(q, session.token);
        if (active) setRecipients(data || []);
      } catch (err: any) {
        if (active) {
          console.error('Recipient search failed', err);
          setRecipients([]);
        }
      } finally {
        if (active) setSearchingRecipient(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [recipientQuery, selectedRecipient, session?.token]);

  useEffect(() => {
    let active = true;
    setSafetyProfile(null);
    setStudentSafetyReviewed(false);
    if (
      !selectedRecipient ||
      selectedRecipient.recipientType !== 'STUDENT' ||
      selectedRecipient.recipientSource !== 'STUDENT_MASTER' ||
      !session?.token
    ) {
      return;
    }

    setLoadingSafety(true);
    api<StudentSafetyProfile>(
      'getStudentSafetyProfile',
      { studentId: selectedRecipient.recipientId },
      session.token
    )
      .then((profile) => { if (active) setSafetyProfile(profile); })
      .catch((err) => {
        if (active) {
          console.error('Failed to load student safety profile', err);
          Swal.fire('โหลด Safety Profile ไม่สำเร็จ', err.message, 'warning');
        }
      })
      .finally(() => { if (active) setLoadingSafety(false); });
    return () => { active = false; };
  }, [selectedRecipient, session?.token]);

  const loadItems = async () => {
    if (!session?.token) return;
    setLoadingItems(true);
    try {
      const data = await api<Item[]>('getItems', {}, session.token);
      setItems(data || []);
    } catch (err) {
      console.error('Failed to load items', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const symptomsByCategory = useMemo(() => {
    const grouped: Record<SymptomCategory, SymptomCatalogItem[]> = {
      NON_TRAUMA: [],
      TRAUMA: [],
      OTHER: []
    };
    symptomCatalog.forEach((item) => grouped[item.category].push(item));
    return grouped;
  }, [symptomCatalog]);

  const normalizedSymptomSearch = symptomSearch.trim().toLocaleLowerCase();
  const filteredSymptomsByCategory = useMemo(() => {
    const filtered: Record<SymptomCategory, SymptomCatalogItem[]> = {
      NON_TRAUMA: [],
      TRAUMA: [],
      OTHER: []
    };
    (Object.keys(symptomsByCategory) as SymptomCategory[]).forEach((category) => {
      filtered[category] = symptomsByCategory[category].filter((item) => {
        if (!normalizedSymptomSearch) return true;
        return (
          item.symptom.toLocaleLowerCase().includes(normalizedSymptomSearch) ||
          CATEGORY_LABELS[category].toLocaleLowerCase().includes(normalizedSymptomSearch)
        );
      });
    });
    return filtered;
  }, [symptomsByCategory, normalizedSymptomSearch]);

  useEffect(() => {
    if (!normalizedSymptomSearch) return;
    const matches = (Object.keys(filteredSymptomsByCategory) as SymptomCategory[])
      .filter((category) => filteredSymptomsByCategory[category].length > 0);
    setExpandedSymptomCategories((current) => Array.from(new Set([...current, ...matches])));
  }, [filteredSymptomsByCategory, normalizedSymptomSearch]);

  const symptomSearchResultCount = useMemo(
    () => (Object.values(filteredSymptomsByCategory) as SymptomCatalogItem[][])
      .reduce((count, itemsInCategory) => count + itemsInCategory.length, 0),
    [filteredSymptomsByCategory]
  );

  const derivedCategory = useMemo(
    () => deriveVisitCategory(symptomCatalog, selectedSymptomIds, customSymptoms.map((item) => item.category)),
    [symptomCatalog, selectedSymptomIds, customSymptoms]
  );
  const clinicalAlert = useMemo(
    () => deriveClinicalAlert(symptomCatalog, selectedSymptomIds),
    [symptomCatalog, selectedSymptomIds]
  );

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((item) => {
      const type = normalizeItemType(item['Item Type']);
      const matchType = itemTypeFilter === 'ALL' || itemTypeFilter === type;
      const matchQuery =
        !q ||
        item['Item Code'].toLowerCase().includes(q) ||
        (item['Generic Name'] || '').toLowerCase().includes(q) ||
        (item['Trade Name'] || '').toLowerCase().includes(q);
      return matchType && matchQuery;
    });
  }, [items, itemSearch, itemTypeFilter]);

  const selectedSymptoms = useMemo(
    () => symptomCatalog.filter((item) => selectedSymptomIds.includes(item.symptomId)),
    [symptomCatalog, selectedSymptomIds]
  );

  const addCustomSymptom = (category: CustomSymptomCategory) => {
    const symptom = customSymptomDrafts[category].trim();
    if (!symptom) return;
    if (symptom.length > 200) {
      Swal.fire('รายละเอียดอาการยาวเกินไป', 'ระบุได้ไม่เกิน 200 ตัวอักษร', 'warning');
      return;
    }
    if (customSymptoms.some((item) => item.category === category && item.symptom.toLocaleLowerCase() === symptom.toLocaleLowerCase())) {
      Swal.fire('เพิ่มอาการนี้แล้ว', 'อาการ Free text ซ้ำในหมวดเดียวกัน', 'info');
      return;
    }
    setCustomSymptoms((current) => [...current, { category, symptom }]);
    setCustomSymptomDrafts((current) => ({ ...current, [category]: '' }));
  };

  const removeCustomSymptom = (index: number) => {
    setCustomSymptoms((current) => current.filter((_, i) => i !== index));
  };

  const toggleSymptom = (id: string) => {
    setSelectedSymptomIds((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
    );
  };

  const removeSelectedSymptom = (id: string) => {
    const remaining = selectedSymptoms.filter((item) => item.symptomId !== id);
    toggleSymptom(id);
    window.requestAnimationFrame(() => {
      const nextSelected = remaining[0];
      if (nextSelected && selectedSymptomButtonRefs.current[nextSelected.symptomId]) {
        selectedSymptomButtonRefs.current[nextSelected.symptomId]?.focus();
      } else {
        symptomSearchInputRef.current?.focus();
      }
    });
  };

  const toggleSymptomCategory = (category: SymptomCategory) => {
    setExpandedSymptomCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category]);
  };

  const toggleIntervention = (code: string) => {
    setInterventions((current) =>
      current.includes(code) ? current.filter((x) => x !== code) : [...current, code]
    );
  };

  const selectRecipient = (recipient: Recipient) => {
    setEditingSafety(false);
    setSelectedRecipient(recipient);
    setStudentSafetyReviewed(false);
    setRecipientQuery(recipient.recipientName);
    setRecipients([]);
    setFreeTextMode(false);
    setFreeTextAllergy(emptyAllergy);
  };

  const useFreeTextRecipient = () => {
    if (!freeName.trim()) {
      Swal.fire('กรุณาระบุชื่อ', 'Free Text Visit ต้องมีชื่อ-นามสกุลอย่างน้อย', 'warning');
      return;
    }
    selectRecipient({
      recipientId: freeId.trim(),
      recipientName: freeName.trim(),
      recipientType: freeType,
      departmentClass: freeDepartment.trim(),
      recipientSource: 'FREE_TEXT',
      recipientContact: freeContact.trim()
    });
  };

  const clearRecipient = () => {
    setEditingSafety(false);
    setSelectedRecipient(null);
    setSafetyProfile(null);
    setStudentSafetyReviewed(false);
    setRecipientQuery('');
    setRecipients([]);
    setFreeTextMode(false);
    setFreeName('');
    setFreeType('OTHER');
    setFreeId('');
    setFreeDepartment('');
    setFreeContact('');
    setFreeTextAllergy(emptyAllergy);
  };

  const addToCart = (item: Item) => {
    const currentStock = Number(item.QTY) || 0;
    if (currentStock <= 0) {
      Swal.fire('สต็อกหมด', 'รายการนี้ไม่มี usable stock สำหรับจ่าย', 'warning');
      return;
    }

    const existing = cart.find((c) => c.itemCode === item['Item Code']);
    if (existing) {
      if (existing.qty >= currentStock) {
        Swal.fire('เกินสต็อก', `คงเหลือสูงสุด ${currentStock} ${item.Unit}`, 'warning');
        return;
      }
      setCart(cart.map((c) => c.itemCode === item['Item Code'] ? { ...c, qty: c.qty + 1 } : c));
      return;
    }

    setCart([
      ...cart,
      {
        itemCode: item['Item Code'],
        genericName: item['Generic Name'],
        tradeName: item['Trade Name'],
        itemType: item['Item Type'],
        unit: item.Unit,
        currentStock,
        qty: 1
      }
    ]);
  };

  const changeCartQty = (itemCode: string, delta: number) => {
    setCart(
      cart
        .map((c) => {
          if (c.itemCode !== itemCode) return c;
          const qty = c.qty + delta;
          if (qty > c.currentStock) return c;
          return qty <= 0 ? null : { ...c, qty };
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const buildVitals = (): VisitVitals => ({
    temperature: numericOrBlank(temperature),
    bpSystolic: numericOrBlank(bpSystolic),
    bpDiastolic: numericOrBlank(bpDiastolic),
    pulse: numericOrBlank(pulse),
    respiratoryRate: numericOrBlank(respiratoryRate),
    spo2: numericOrBlank(spo2),
    weight: numericOrBlank(weight)
  });

  const resetForm = () => {
    clearRecipient();
    setSelectedSymptomIds([]);
    setCustomSymptoms([]);
    setCustomSymptomDrafts({ TRAUMA: '', NON_TRAUMA: '' });
    setSymptomSearch('');
    setExpandedSymptomCategories(['NON_TRAUMA']);
    setOtherSymptom('');
    setAssessment('');
    setNote('');
    setInterventions([]);
    setDisposition('');
    setOutcomeNote('');
    setTemperature('');
    setBpSystolic('');
    setBpDiastolic('');
    setPulse('');
    setRespiratoryRate('');
    setSpo2('');
    setWeight('');
    setCart([]);
    setItemSearch('');
    pendingVisitRef.current = null;
  };

  const handleSubmit = async () => {
    if (!selectedRecipient || !session?.token) {
      Swal.fire('ยังไม่ได้เลือกผู้มารับบริการ', 'กรุณาค้นหาจาก Master หรือใช้ Free Text Visit', 'warning');
      return;
    }

    const vitals = buildVitals();
    if (!hasVisitClinicalContent({
      symptoms: selectedSymptomIds,
      customSymptoms: customSymptoms.map((item) => item.symptom),
      otherSymptom,
      note,
      assessment,
      interventions,
      vitals
    })) {
      Swal.fire(
        'ข้อมูล Clinical ยังไม่ครบ',
        'กรุณาระบุอาการ รายละเอียดเพิ่มเติม การดูแล บันทึก หรือผลการประเมินอย่างน้อย 1 รายการ โดย Vital Signs เป็นข้อมูลไม่บังคับ',
        'warning'
      );
      return;
    }

    if (!disposition) {
      Swal.fire('ยังไม่ได้ระบุผลลัพธ์', 'กรุณาเลือก Disposition ก่อนจบ Visit', 'warning');
      return;
    }

    const hasDrug = cart.some((c) => normalizeItemType(c.itemType) === 'DRUG');

    if (
      hasDrug &&
      selectedRecipient.recipientType === 'STUDENT' &&
      selectedRecipient.recipientSource === 'STUDENT_MASTER' &&
      (loadingSafety || !safetyProfile)
    ) {
      Swal.fire(
        'ยังตรวจสอบ Drug Allergy ไม่สำเร็จ',
        'ไม่สามารถจ่ายยาได้จนกว่าจะโหลด Student Safety Profile สำเร็จ',
        'error'
      );
      return;
    }

    if (hasDrug && selectedRecipient.recipientSource === 'STUDENT_MASTER' && !studentSafetyReviewed) {
      Swal.fire('กรุณาตรวจสอบประวัติแพ้ยา', 'ยืนยันการอ่าน Student Safety Profile ก่อนจ่ายยา', 'warning');
      return;
    }

    if (selectedRecipient.recipientSource === 'FREE_TEXT') {
      const allergyError = validateFreeTextDrugAllergy(freeTextAllergy, hasDrug);
      if (allergyError) {
        Swal.fire('Drug Allergy Safety', allergyError, 'warning');
        return;
      }
      if (hasDrug && freeTextAllergy.status === 'UNKNOWN') {
        const allergyConfirm = await Swal.fire({
          icon: 'warning',
          title: 'ยังยืนยันประวัติแพ้ยาไม่ได้',
          text: 'Drug Allergy Status = UNKNOWN กรุณาตรวจสอบความเหมาะสมก่อนดำเนินการจ่ายยา',
          showCancelButton: true,
          confirmButtonText: 'ตรวจสอบแล้ว ดำเนินการต่อ',
          cancelButtonText: 'กลับไปแก้ไข',
          confirmButtonColor: '#b45309'
        });
        if (!allergyConfirm.isConfirmed) return;
      }
    }

    for (const c of cart) {
      if (c.qty > c.currentStock) {
        Swal.fire('สต็อกไม่เพียงพอ', `${c.genericName || c.itemCode} คงเหลือ ${c.currentStock}`, 'error');
        return;
      }
    }

    const dispositionLabel = DISPOSITIONS.find(([code]) => code === disposition)?.[1] || disposition;
    const confirm = await Swal.fire({
      title: disposition === 'EMERGENCY_TRANSFER'
        ? 'ยืนยัน Emergency Transfer'
        : disposition === 'REFER_HOSPITAL'
          ? 'ยืนยันส่งต่อโรงพยาบาล'
          : 'ยืนยันบันทึก Visit',
      // Untrusted fields are rendered via text, not HTML.
      text: [
        `ผู้รับบริการ: ${selectedRecipient.recipientName}`,
        `ประเภท: ${RECIPIENT_LABELS[selectedRecipient.recipientType]}`,
        `อาการ: ${[...selectedSymptoms.map((x) => x.symptom), ...customSymptoms.map((x) => x.symptom), otherSymptom.trim()].filter(Boolean).join(', ') || '-'}`,
        `Visit Category: ${derivedCategory || '-'}`,
        `Clinical Alert: ${clinicalAlert}`,
        `Disposition: ${dispositionLabel}`,
        `ยา/เวชภัณฑ์: ${cart.length ? cart.length + ' รายการ' : 'ไม่มีการจ่าย'}`
      ].join('\n'),
      icon: disposition === 'EMERGENCY_TRANSFER' ? 'warning' : 'question',
      showCancelButton: true,
      confirmButtonText: disposition === 'EMERGENCY_TRANSFER'
        ? 'Complete Emergency Transfer'
        : disposition === 'REFER_HOSPITAL'
          ? 'Complete Referral Visit'
          : 'บันทึก Visit',
      cancelButtonText: 'กลับไปแก้ไข',
      confirmButtonColor: disposition === 'EMERGENCY_TRANSFER' ? '#b91c1c' : '#0b1f3a'
    });
    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    Swal.fire({
      title: 'กำลังบันทึก Visit...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    try {
      const payload = {
        recipient: selectedRecipient,
        studentId:
          selectedRecipient.recipientSource === 'STUDENT_MASTER'
            ? selectedRecipient.recipientId
            : '',
        symptomIds: selectedSymptomIds,
        customSymptoms,
        otherSymptom: otherSymptom.trim(),
        note: note.trim(),
        assessment: assessment.trim(),
        vitals,
        interventions,
        disposition,
        outcomeNote: outcomeNote.trim(),
        drugAllergy:
          selectedRecipient.recipientSource === 'FREE_TEXT'
            ? freeTextAllergy
            : undefined,
        studentSafetyAcknowledged:
          selectedRecipient.recipientSource === 'STUDENT_MASTER' && studentSafetyReviewed,
        studentDrugAllergySnapshot:
          selectedRecipient.recipientSource === 'STUDENT_MASTER'
            ? safetyProfile?.drugAllergy ?? ''
            : '',
        items: cart.map((c) => ({
          itemCode: c.itemCode,
          qty: c.qty,
          itemName:
            c.tradeName && c.genericName
              ? `${c.tradeName} (${c.genericName})`
              : c.tradeName || c.genericName || c.itemCode,
          itemType: c.itemType,
          unit: c.unit
        })),
      };
      // Reuse the idempotency key on an unchanged-form network retry.
      const fingerprint = JSON.stringify(payload);
      if (!pendingVisitRef.current || pendingVisitRef.current.fingerprint !== fingerprint) {
        pendingVisitRef.current = {
          fingerprint,
          id: 'VISIT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)
        };
      }
      const result = await submitVisitP4({
        ...payload,
        clientTransactionId: pendingVisitRef.current.id
      }, session.token);
      const notification = result.notification;
      let notice = '';
      let icon: 'success' | 'warning' = 'success';

      if (notification?.status === 'SENT') {
        notice = 'Notification: ส่ง Email สำเร็จ';
      } else if (notification?.status === 'FAILED') {
        icon = 'warning';
        notice = 'Visit บันทึกสำเร็จ แต่ Email ส่งไม่สำเร็จ กรุณาตรวจสอบ Notification Log';
      } else if (notification?.status === 'DISABLED') {
        icon = 'warning';
        notice = 'Visit บันทึกสำเร็จ แต่ Email Notification ยังถูกปิดใน CONFIG';
      } else if (notification?.status === 'UNKNOWN' || notification?.status === 'SENDING') {
        icon = 'warning';
        notice = 'สถานะการส่ง Email ยังยืนยันไม่ได้ ห้ามกดส่งซ้ำก่อนตรวจสอบ';
      } else if (notification?.status === 'PENDING') {
        icon = 'warning';
        notice = 'Email รอดำเนินการ กรุณาตรวจสอบ Notification Log';
      }

      await Swal.fire({
        icon,
        title: 'บันทึก Visit สำเร็จ',
        text: `Visit ID: ${result.visitId}\nสถานะ: ${result.status}\n${notice}`,
        confirmButtonText: 'รับผู้มารับบริการคนถัดไป',
        confirmButtonColor: '#0b1f3a'
      });
      pendingVisitRef.current = null;
      resetForm();
      loadItems();
    } catch (err: any) {
      const message = err?.message || 'เกิดข้อผิดพลาดในการบันทึก Visit';
      const mayHaveCommitted =
        /TIMEOUT|NETWORK|ไม่สามารถเชื่อมต่อ|ใช้เวลานาน|Duplicate|duplicate|ถูกประมวลผล/i.test(message);
      Swal.fire({
        title: mayHaveCommitted ? 'ยังยืนยันผลการบันทึกไม่ได้' : 'บันทึกไม่สำเร็จ',
        text: mayHaveCommitted
          ? message + '\nห้ามบันทึก Visit ซ้ำทันที โปรดตรวจสอบประวัติ Visit ก่อน เพื่อป้องกันการจ่ายสต็อกซ้ำ'
          : message,
        icon: mayHaveCommitted ? 'warning' : 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  const vitalInput = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    unit?: string,
    min?: number,
    max?: number
  ) => (
    <div className="form-group">
      <label className="form-label" htmlFor={'vital-' + label.replace(/\s+/g, '-')}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          id={'vital-' + label.replace(/\s+/g, '-')}
          className="form-control"
          type="number"
          step="any"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {unit && <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{unit}</span>}
      </div>
    </div>
  );

  const referralDisposition =
    disposition === 'REFER_HOSPITAL' || disposition === 'EMERGENCY_TRANSFER';

  return (
    <div className="main-content">
      <div style={{ marginBottom: 20 }}>
        <h2>รับบริการใหม่ (New Visit)</h2>
        <p style={{ color: '#64748b' }}>
          ค้นหา Student ID / Staff ID / ชื่อ ระบบจะระบุประเภทผู้รับบริการจาก Master ให้อัตโนมัติ
        </p>
      </div>

      <div className="grid-2">
        <div>
          <section className="card">
            <div className="card-header">
              <span className="card-title">1. ผู้มารับบริการ</span>
            </div>

            {!selectedRecipient ? (
              <>
                <div className="form-group">
                  <label className="form-label">Student ID / Staff ID / ชื่อ-นามสกุล</label>
                  <input
                    className="form-control"
                    value={recipientQuery}
                    onChange={(e) => {
                      setRecipientQuery(e.target.value);
                      setFreeTextMode(false);
                    }}
                    placeholder="พิมพ์อย่างน้อย 2 ตัวอักษร"
                  />
                </div>

                {searchingRecipient && (
                  <div role="status" aria-live="polite" style={{ color: '#64748b', fontSize: '.85rem', padding: '6px 0' }}>
                    กำลังค้นหา...
                  </div>
                )}

                {recipients.map((recipient) => (
                  <button
                    key={recipient.recipientSource + ':' + recipient.recipientId}
                    type="button"
                    className="cart-item"
                    style={{
                      width: '100%',
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                    onClick={() => selectRecipient(recipient)}
                  >
                    <div>
                      <strong>{recipient.recipientName}</strong>
                      <div style={{ color: '#64748b', fontSize: '.84rem' }}>
                        {RECIPIENT_LABELS[recipient.recipientType]} · {recipient.recipientId || 'ไม่มี ID'}
                        {recipient.departmentClass ? ' · ' + recipient.departmentClass : ''}
                      </div>
                    </div>
                    <span className="badge badge-info">{recipient.recipientType}</span>
                  </button>
                ))}

                {recipientQuery.trim().length >= 2 &&
                  !searchingRecipient &&
                  recipients.length === 0 && (
                    <div
                      style={{
                        border: '1px dashed #94a3b8',
                        borderRadius: 8,
                        padding: 14,
                        marginTop: 10,
                        background: '#f8fafc'
                      }}
                    >
                      <strong>ไม่พบข้อมูลใน Database</strong>
                      <div style={{ color: '#64748b', fontSize: '.85rem', marginTop: 4 }}>
                        ไม่ต้องสร้าง Student ปลอม สามารถบันทึก Visit แบบ Free Text ได้
                      </div>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ marginTop: 10 }}
                        onClick={() => {
                          setFreeTextMode(true);
                          setFreeName(recipientQuery.trim());
                        }}
                      >
                        + Free Text Visit
                      </button>
                    </div>
                  )}

                {!freeTextMode && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: 12, minHeight: 44 }}
                    onClick={() => {
                      setFreeTextMode(true);
                      setFreeName(recipientQuery.trim());
                    }}
                  >
                    + บันทึกผู้รับบริการที่ไม่มีใน Master (Free Text)
                  </button>
                )}

                {freeTextMode && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 14,
                      border: '1px solid #d9e2ec',
                      borderRadius: 8,
                      background: '#f8fafc'
                    }}
                  >
                    <div className="card-title" style={{ marginBottom: 10 }}>Free Text Recipient</div>
                    <div className="form-group">
                      <label className="form-label">ชื่อ-นามสกุล *</label>
                      <input className="form-control" value={freeName} onChange={(e) => setFreeName(e.target.value)} />
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">Recipient Type *</label>
                        <select
                          className="form-control"
                          value={freeType}
                          onChange={(e) => setFreeType(e.target.value as RecipientType)}
                        >
                          {(['STUDENT','TEACHER','STAFF','PARENT','VISITOR','OTHER'] as RecipientType[]).map((t) => (
                            <option key={t} value={t}>{RECIPIENT_LABELS[t]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">ID / Reference</label>
                        <input className="form-control" value={freeId} onChange={(e) => setFreeId(e.target.value)} />
                      </div>
                    </div>
                    <div className="grid-2">
                      <div className="form-group">
                        <label className="form-label">หน่วยงาน / ชั้น / แผนก</label>
                        <input className="form-control" value={freeDepartment} onChange={(e) => setFreeDepartment(e.target.value)} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">เบอร์ติดต่อ</label>
                        <input className="form-control" value={freeContact} onChange={(e) => setFreeContact(e.target.value)} />
                      </div>
                    </div>
                    <button className="btn btn-primary" onClick={useFreeTextRecipient}>
                      ใช้ข้อมูลนี้สำหรับ Visit
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  border: '1px solid #d9e2ec',
                  borderRadius: 8,
                  padding: 14
                }}
              >
                <div>
                  <strong style={{ fontSize: '1.05rem' }}>{selectedRecipient.recipientName}</strong>
                  <div style={{ color: '#475569', marginTop: 3 }}>
                    {RECIPIENT_LABELS[selectedRecipient.recipientType]} · {selectedRecipient.recipientId || 'ไม่มี ID'}
                    {selectedRecipient.departmentClass ? ' · ' + selectedRecipient.departmentClass : ''}
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: '.78rem', marginTop: 3 }}>
                    {selectedRecipient.recipientSource}
                  </div>
                </div>
                <button className="btn btn-outline btn-sm" onClick={clearRecipient}>
                  เปลี่ยนผู้รับบริการ
                </button>
              </div>
            )}
          </section>

          {selectedRecipient?.recipientType === 'STUDENT' &&
            selectedRecipient.recipientSource === 'STUDENT_MASTER' && (
              <>
            {editingSafety && safetyProfile && session?.token ? (
              <StudentSafetyEditor
                profile={safetyProfile}
                token={session.token}
                onSaved={(updated) => {
                  setSafetyProfile(updated);
                  setEditingSafety(false);
                  // A safety update invalidates the user's previous review.
                  setStudentSafetyReviewed(false);
                }}
                onCancel={() => setEditingSafety(false)}
              />
            ) : (
              <StudentSafetyCard
                profile={safetyProfile}
                loading={loadingSafety}
                compact
                onEdit={isRole(['NURSE', 'ADMIN', 'SUPER_ADMIN']) && safetyProfile
                  ? () => setEditingSafety(true)
                  : undefined}
              />
            )}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: 12,
              background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, marginBottom: 12
            }}>
              <input
                type="checkbox"
                checked={studentSafetyReviewed}
                disabled={!safetyProfile || loadingSafety}
                onChange={(e) => setStudentSafetyReviewed(e.target.checked)}
                style={{ width: 20, height: 20, flexShrink: 0 }}
              />
              <span>
                <strong>ยืนยันตรวจสอบ Drug Allergy / Student Safety Profile แล้ว</strong>
                <span style={{ display: 'block', color: '#475569', fontSize: '.84rem' }}>
                  ต้องยืนยันก่อนจ่ายยา ระบบตรวจสอบข้อมูลล่าสุดกับ Master อีกครั้งเมื่อบันทึก
                </span>
              </span>
            </label>
          </>
            )}

          {selectedRecipient?.recipientSource === 'FREE_TEXT' && (
            <section className="card">
              <div className="card-header">
                <span className="card-title">Drug Allergy Safety — Free Text Visit</span>
              </div>
              <p style={{ color: '#64748b', fontSize: '.85rem' }}>
                หากมีการจ่ายยา ต้องระบุสถานะแพ้ยาอย่างชัดเจน ระบบจะไม่ตีความช่องว่างว่าเป็น NKDA
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {([
                  ['NKDA', 'No known drug allergy (NKDA)'],
                  ['KNOWN_ALLERGY', 'มีประวัติแพ้ยา'],
                  ['UNKNOWN', 'ไม่ทราบ / ไม่สามารถยืนยันได้']
                ] as Array<[DrugAllergyStatus, string]>).map(([value, label]) => (
                  <label key={value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="radio"
                      name="free-text-allergy"
                      checked={freeTextAllergy.status === value}
                      onChange={() => setFreeTextAllergy({ ...freeTextAllergy, status: value })}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {freeTextAllergy.status === 'KNOWN_ALLERGY' && (
                <div style={{ marginTop: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Drug / Drug Group *</label>
                    <input
                      className="form-control"
                      value={freeTextAllergy.drugGroup}
                      onChange={(e) => setFreeTextAllergy({ ...freeTextAllergy, drugGroup: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Reaction *</label>
                    <input
                      className="form-control"
                      value={freeTextAllergy.reaction}
                      onChange={(e) => setFreeTextAllergy({ ...freeTextAllergy, reaction: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Note *</label>
                    <textarea
                      className="form-control"
                      value={freeTextAllergy.note}
                      onChange={(e) => setFreeTextAllergy({ ...freeTextAllergy, note: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {freeTextAllergy.status === 'UNKNOWN' && (
                <div
                  style={{
                    marginTop: 12,
                    background: '#fff3cd',
                    color: '#92400e',
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #f59e0b'
                  }}
                >
                  ⚠️ ประวัติแพ้ยายังไม่ยืนยัน หากมีการจ่ายยา ระบบจะเตือนอีกครั้งก่อนบันทึก
                </div>
              )}
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <span className="card-title">2. Symptom Classification</span>
              <span className="symptom-derived-category">
                Visit Category: <strong>{derivedCategory || '—'}</strong>
              </span>
            </div>

            <div className="symptom-search-wrap">
              <label className="form-label" htmlFor="symptom-search">ค้นหาอาการ</label>
              <div className="symptom-search-control">
                <input
                  id="symptom-search"
                  className="form-control"
                  type="search"
                  ref={symptomSearchInputRef}
                  value={symptomSearch}
                  onChange={(event) => setSymptomSearch(event.target.value)}
                  placeholder="ค้นหาอาการ เช่น ไข้ บาดแผล ปวดท้อง"
                  aria-describedby="symptom-search-help"
                />
                {symptomSearch && (
                  <button
                    type="button"
                    className="symptom-clear-search"
                    onClick={() => setSymptomSearch('')}
                    aria-label="ล้างคำค้นหาอาการ"
                  >
                    ล้าง
                  </button>
                )}
              </div>
              <p id="symptom-search-help" className="symptom-search-help">
                ค้นหาได้ทุกหมวด และเลือกอาการได้มากกว่าหนึ่งรายการ
              </p>
            </div>

            {(selectedSymptoms.length > 0 || customSymptoms.length > 0) && (
              <div className="symptom-selected-summary" aria-label="อาการที่เลือก">
                <div className="symptom-selected-heading">
                  <strong>อาการที่เลือก</strong>
                  <span>{selectedSymptoms.length + customSymptoms.length} รายการ</span>
                </div>
                <div className="symptom-selected-list">
                  {selectedSymptoms.map((item) => (
                    <button
                      key={item.symptomId}
                      type="button"
                      className="symptom-selected-chip"
                      ref={(element) => { selectedSymptomButtonRefs.current[item.symptomId] = element; }}
                      onClick={() => removeSelectedSymptom(item.symptomId)}
                      aria-label={`นำ ${item.symptom} ออกจากรายการอาการที่เลือก`}
                    >
                      <span>{item.symptom}</span><span aria-hidden="true">×</span>
                    </button>
                  ))}
                  {customSymptoms.map((item, index) => (
                    <button
                      key={`custom-${item.category}-${index}`}
                      type="button"
                      className="symptom-selected-chip"
                      onClick={() => removeCustomSymptom(index)}
                      aria-label={`นำ ${item.symptom} ออกจากรายการอาการ ${CATEGORY_LABELS[item.category]}`}
                    >
                      <span>{CATEGORY_LABELS[item.category]} · {item.symptom}</span><span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div
              className={`clinical-alert-banner clinical-alert-${clinicalAlert.toLowerCase()}`}
              role={clinicalAlert === 'EMERGENCY' ? 'alert' : 'status'}
              aria-live={clinicalAlert === 'EMERGENCY' ? 'assertive' : 'polite'}
            >
              <strong>Clinical Alert: {clinicalAlert}</strong>
              <span>
                {clinicalAlert === 'NORMAL'
                  ? 'ยังไม่มีอาการที่กำหนดระดับเตือนใน Symptom Master'
                  : 'โปรดประเมินอาการตามดุลยพินิจทางคลินิก การเตือนนี้ไม่ใช่การวินิจฉัยหรือคำสั่งส่งต่ออัตโนมัติ'}
              </span>
            </div>

            <div className="symptom-category-list">
              {(['NON_TRAUMA','TRAUMA','OTHER'] as SymptomCategory[]).map((category) => {
                const customSymptomCategory: CustomSymptomCategory | null =
                  category === 'TRAUMA' || category === 'NON_TRAUMA' ? category : null;
                const matches = filteredSymptomsByCategory[category];
                const selectedCount = symptomsByCategory[category]
                  .filter((item) => selectedSymptomIds.includes(item.symptomId)).length +
                  customSymptoms.filter((item) => item.category === category).length;
                const isExpanded = expandedSymptomCategories.includes(category);
                const panelId = `symptom-panel-${category.toLowerCase()}`;
                const triggerId = `symptom-trigger-${category.toLowerCase()}`;
                if (normalizedSymptomSearch && matches.length === 0 && !customSymptomCategory) return null;
                return (
                  <section className="symptom-category" key={category}>
                    <h3 className="symptom-category-heading">
                      <button
                        type="button"
                        id={triggerId}
                        className="symptom-category-toggle"
                        aria-expanded={isExpanded}
                        aria-controls={panelId}
                        onClick={() => toggleSymptomCategory(category)}
                      >
                        <span className="symptom-category-title">
                          <span aria-hidden="true" className="symptom-chevron">{isExpanded ? '⌄' : '›'}</span>
                          {CATEGORY_LABELS[category]}
                        </span>
                        <span className="symptom-category-meta">
                          {selectedCount > 0 && <span className="symptom-selected-count">เลือก {selectedCount}</span>}
                          <span>{normalizedSymptomSearch ? `${matches.length} ผลลัพธ์` : `${symptomsByCategory[category].length} อาการ`}</span>
                        </span>
                      </button>
                    </h3>
                    <div
                      id={panelId}
                      className="symptom-category-panel"
                      role="region"
                      aria-labelledby={triggerId}
                      hidden={!isExpanded}
                    >
                      <div className="symptom-grid">
                        {matches.map((item) => {
                          const selected = selectedSymptomIds.includes(item.symptomId);
                          return (
                            <button
                              key={item.symptomId}
                              type="button"
                              className={`symptom-chip ${selected ? 'selected' : ''}`}
                              onClick={() => toggleSymptom(item.symptomId)}
                              aria-pressed={selected}
                            >
                              <span aria-hidden="true">{selected ? '✓' : '+'}</span>
                              <span>{item.symptom}</span>
                            </button>
                          );
                        })}
                      </div>
                      {customSymptomCategory && (
                        <div className="custom-symptom-entry" style={{ marginTop: 12 }}>
                          <label className="form-label" htmlFor={`custom-symptom-${customSymptomCategory.toLowerCase()}`}>
                            เพิ่มอาการ Free text ในหมวด {CATEGORY_LABELS[customSymptomCategory]}
                          </label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input
                              id={`custom-symptom-${customSymptomCategory.toLowerCase()}`}
                              className="form-control"
                              value={customSymptomDrafts[customSymptomCategory]}
                              maxLength={200}
                              onChange={(event) => setCustomSymptomDrafts((current) => ({
                                ...current,
                                [customSymptomCategory]: event.target.value
                              }))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  addCustomSymptom(customSymptomCategory);
                                }
                              }}
                              placeholder="ระบุอาการที่ไม่มีในรายการ"
                              aria-label={`อาการ Free text ${CATEGORY_LABELS[customSymptomCategory]}`}
                            />
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => addCustomSymptom(customSymptomCategory)}
                              disabled={!customSymptomDrafts[customSymptomCategory].trim()}
                            >
                              + เพิ่ม
                            </button>
                          </div>
                          {customSymptoms.filter((item) => item.category === customSymptomCategory).length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                              {customSymptoms.map((item, index) => item.category === customSymptomCategory ? (
                                <span
                                  className="symptom-selected-chip"
                                  key={`custom-${item.category}-${index}`}
                                >
                                  {item.symptom}
                                  <button
                                    type="button"
                                    onClick={() => removeCustomSymptom(index)}
                                    aria-label={`ลบอาการ ${item.symptom}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              ) : null)}
                            </div>
                          )}
                          <small style={{ color: '#64748b' }}>
                            ระบบจะบันทึกหมวดตามที่เลือก และไม่ประเมิน Clinical Alert ให้อัตโนมัติ
                          </small>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>

            {!loadingSymptoms && symptomCatalog.length === 0 && (
              <div className="symptom-empty-state" role="status">
                <strong>{symptomCatalogError ? 'โหลดรายการอาการไม่สำเร็จ' : 'ยังไม่มีรายการอาการใน Symptom Master'}</strong>
                <span>{symptomCatalogError || 'ตรวจสอบการตั้งค่า Symptom Master หรือแจ้งผู้ดูแลระบบ'}</span>
                <button
                  type="button"
                  className="symptom-retry-button"
                  onClick={() => session?.token && loadSymptomCatalog(session.token)}
                  disabled={!session?.token}
                >
                  ลองโหลดอีกครั้ง
                </button>
              </div>
            )}

            {normalizedSymptomSearch && !loadingSymptoms && symptomCatalog.length > 0 && symptomSearchResultCount === 0 && (
              <div className="symptom-empty-state" role="status">
                <strong>ไม่พบอาการที่ตรงกับ “{symptomSearch.trim()}”</strong>
                <span>ลองใช้คำค้นหาอื่น หรือล้างคำค้นหาเพื่อดูอาการทั้งหมด</span>
              </div>
            )}

            {loadingSymptoms && <p className="symptom-loading" role="status">กำลังโหลด Symptom Master…</p>}

            <div className="form-group">
              <label className="form-label">รายละเอียดอาการเพิ่มเติม (ไม่ใช้จัดหมวด)</label>
              <input
                className="form-control"
                value={otherSymptom}
                onChange={(e) => setOtherSymptom(e.target.value)}
              />
            </div>

            <div style={{ color: '#64748b', fontSize: '.84rem', marginBottom: 8 }}>Vital Signs (ไม่บังคับ) — กรอกเฉพาะค่าที่ประเมินได้</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
              {vitalInput('Temperature', temperature, setTemperature, '°C', 30, 45)}
              {vitalInput('Weight', weight, setWeight, 'kg', 1, 300)}
              {vitalInput('BP Systolic', bpSystolic, setBpSystolic, 'mmHg', 40, 260)}
              {vitalInput('BP Diastolic', bpDiastolic, setBpDiastolic, 'mmHg', 20, 180)}
              {vitalInput('Pulse', pulse, setPulse, '/min', 20, 250)}
              {vitalInput('Respiratory Rate', respiratoryRate, setRespiratoryRate, '/min', 5, 100)}
              {vitalInput('SpO₂', spo2, setSpo2, '%', 50, 100)}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <span className="card-title">3. Assessment & Intervention</span>
            </div>
            <div className="form-group">
              <label className="form-label">Nursing / Infirmary Assessment</label>
              <textarea
                className="form-control"
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">บันทึกเพิ่มเติม</label>
              <textarea className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {INTERVENTIONS.map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  className={`btn btn-sm ${interventions.includes(code) ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => toggleIntervention(code)}
                >
                  {interventions.includes(code) ? '✓ ' : ''}{label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div>
          <section className="card">
            <div className="card-header">
              <span className="card-title">4. ยา/เวชภัณฑ์ (Optional)</span>
              <button className="btn btn-outline btn-sm" onClick={loadItems} disabled={loadingItems}>
                {loadingItems ? 'กำลังโหลด...' : 'รีเฟรช'}
              </button>
            </div>
            <p style={{ color: '#64748b', fontSize: '.85rem' }}>
              Visit บันทึกได้โดยไม่ต้องจ่ายยา/เวชภัณฑ์ และ backend จะจ่ายเฉพาะ usable ACTIVE lot ตาม FEFO
            </p>
            <div className="tabs" style={{ marginBottom: 10 }}>
              {(['ALL','DRUG','MEDICAL_SUPPLY'] as const).map((x) => (
                <button
                  key={x}
                  className={`tab-item ${itemTypeFilter === x ? 'active' : ''}`}
                  onClick={() => setItemTypeFilter(x)}
                >
                  {x === 'ALL' ? 'ทั้งหมด' : x === 'DRUG' ? 'ยา' : 'เวชภัณฑ์'}
                </button>
              ))}
            </div>
            <input
              className="form-control"
              placeholder="ค้นหารายการ..."
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
            />
            <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 10, border: '1px solid #e2e8f0', borderRadius: 8 }}>
              {filteredItems.map((item) => (
                <div key={item['Item Code']} className="cart-item">
                  <div>
                    <strong>{item['Trade Name'] || item['Generic Name'] || item['Item Code']}</strong>
                    <div style={{ color: '#64748b', fontSize: '.8rem' }}>
                      {item['Generic Name']} · คงเหลือ {item.QTY} {item.Unit}
                    </div>
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => addToCart(item)}
                    disabled={Number(item.QTY) <= 0}
                  >
                    + เพิ่ม
                  </button>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14 }}>
              {cart.length === 0 ? (
                <div style={{ color: '#94a3b8', textAlign: 'center', padding: 12 }}>ไม่มีรายการจ่าย</div>
              ) : (
                cart.map((c) => (
                  <div key={c.itemCode} className="cart-item">
                    <div>
                      <strong>{c.tradeName || c.genericName}</strong>
                      <div style={{ color: '#64748b', fontSize: '.8rem' }}>{c.itemCode}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => changeCartQty(c.itemCode, -1)}>-</button>
                      <strong>{c.qty}</strong>
                      <button className="btn btn-outline btn-sm" onClick={() => changeCartQty(c.itemCode, 1)}>+</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <span className="card-title">5. Outcome / Disposition *</span>
            </div>
            <div className="form-group">
              <label className="form-label">ผลลัพธ์หลังรับบริการ</label>
              <select
                className="form-control"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value as VisitDisposition | '')}
              >
                <option value="">-- เลือก Disposition --</option>
                {DISPOSITIONS.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>

            {disposition === 'REFER_HOSPITAL' && (
              <div style={{ background: '#fff3cd', color: '#92400e', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <strong>🏥 ส่งต่อโรงพยาบาล — REFER HOSPITAL</strong>
                <div style={{ fontSize: '.84rem', marginTop: 4 }}>
                  ระบบบันทึก Visit แยกจากการส่ง Email หลังบันทึกกรุณาตรวจสอบสถานะ Notification
                </div>
              </div>
            )}

            {disposition === 'EMERGENCY_TRANSFER' && (
              <div style={{ background: '#fdecec', color: '#991b1b', border: '1px solid #b91c1c', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <strong>🚨 EMERGENCY TRANSFER</strong>
                <div style={{ fontSize: '.84rem', marginTop: 6, lineHeight: 1.5 }}>
                  กรุณาตรวจสอบ Vital Signs, Assessment, Intervention และ Referral / Transfer Note ก่อน Complete
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">
                {referralDisposition ? 'Referral / Transfer Note' : 'Outcome Note'}
              </label>
              <textarea
                className="form-control"
                value={outcomeNote}
                onChange={(e) => setOutcomeNote(e.target.value)}
                placeholder={
                  referralDisposition
                    ? 'เช่น ผู้ปกครองรับทราบ / ประสานส่งต่อเรียบร้อย'
                    : 'เช่น อาการดีขึ้นหลังพัก 20 นาที'
                }
              />
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 10,
                background: disposition === 'EMERGENCY_TRANSFER' ? '#b91c1c' : undefined
              }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? 'กำลังบันทึก...'
                : disposition === 'EMERGENCY_TRANSFER'
                  ? 'Complete Emergency Transfer'
                  : disposition === 'REFER_HOSPITAL'
                    ? 'Complete Referral Visit'
                    : 'บันทึกและปิด Visit'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
};
