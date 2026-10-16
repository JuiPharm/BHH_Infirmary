import React, {useEffect,useState} from 'react';
import Swal from 'sweetalert2';
import {api} from '../../api';
import {useAuth} from '../../context/AuthContext';

interface AllergyRule {
  'Rule ID':string;
  'Allergen Terms':string;
  'Blocked Generic Terms':string;
  Reference:string;
  Status:'LOCKED'|'DRAFT'|'ACTIVE';
  'Created By'?:string;
  'Updated By'?:string;
  'Updated At'?:string;
  'Approved By'?:string;
  'Approved At'?:string;
}
const emptyForm={ruleId:'',allergenTerms:'',blockedGenericTerms:'',reference:''};

export const AllergyRulesPage: React.FC=()=>{
 const {session}=useAuth();
 const [rules,setRules]=useState<AllergyRule[]>([]);
 const [form,setForm]=useState({...emptyForm});
 const [showForm,setShowForm]=useState(false);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const canManage=session?.role==='SUPER_ADMIN';

 const load=async()=>{
  if(!session?.token || !canManage)return;
  setLoading(true);setError('');
  try{
   const data=await api<AllergyRule[]>('getDrugAllergyRules',{},session.token,undefined,20000,true);
   setRules(data||[]);
  }catch(err:any){setError(err?.message||'ไม่สามารถอ่านกฎแพ้ยาได้');}
  finally{setLoading(false);}
 };
 useEffect(()=>{void load();},[session?.token]);

 const startNew=()=>{setForm({...emptyForm});setShowForm(true);};
 const edit=(rule:AllergyRule)=>{
  if(rule.Status!=='DRAFT')return;
  setForm({
   ruleId:rule['Rule ID'],
   allergenTerms:rule['Allergen Terms'],
   blockedGenericTerms:rule['Blocked Generic Terms'],
   reference:rule.Reference
  });
  setShowForm(true);window.scrollTo({top:0,behavior:'smooth'});
 };
 const save=async(e:React.FormEvent)=>{
  e.preventDefault();if(!canManage||saving)return;
  setSaving(true);
  try{
   await api('saveDrugAllergyRule',form,session?.token);
   setShowForm(false);setForm({...emptyForm});
   await load();
   await Swal.fire({icon:'success',title:'บันทึกร่างกฎแล้ว',text:'กฎยังไม่เริ่มทำงาน ต้องตรวจสอบและ Publish ก่อน',confirmButtonColor:'#0b1f3a'});
  }catch(err:any){
   await Swal.fire({icon:'error',title:'ไม่สามารถบันทึกกฎ',text:err?.message||'โปรดตรวจสอบข้อมูล',confirmButtonColor:'#0b1f3a'});
  }finally{setSaving(false);}
 };
 const publish=async(rule:AllergyRule)=>{
  if(!canManage || rule.Status!=='DRAFT')return;
  const confirmation=await Swal.fire({
   icon:'warning',title:'อนุมัติให้กฎแพ้ยามีผลทันที?',
   text:'โปรดยืนยันว่าเภสัชกรผู้รับผิดชอบทบทวนข้อมูล Allergen, Generic Drug, ข้อห้ามใช้ และแหล่งอ้างอิงแล้ว กฎ ACTIVE จะไม่สามารถแก้ไขได้โดยตรง',
   showCancelButton:true,confirmButtonText:'ทบทวนแล้ว — Publish',cancelButtonText:'กลับไปตรวจสอบ',
   confirmButtonColor:'#a3471e'
  });
  if(!confirmation.isConfirmed)return;
  setSaving(true);
  try{
   await api('publishDrugAllergyRule',{ruleId:rule['Rule ID'],clinicalReviewed:true},session?.token);
   await load();
   await Swal.fire({icon:'success',title:'Publish กฎสำเร็จ',text:'การจ่ายยาที่ตรงกับกฎนี้จะถูก Hard Stop',confirmButtonColor:'#0b1f3a'});
  }catch(err:any){
   await Swal.fire({icon:'error',title:'ไม่สามารถ Publish',text:err?.message||'โปรดตรวจสอบข้อมูล',confirmButtonColor:'#0b1f3a'});
  }finally{setSaving(false);}
 };

 if(!canManage)return <div className="main-content"><p>เฉพาะ Super Admin เท่านั้นที่จัดการกฎแพ้ยาได้</p></div>;
 return <div className="main-content">
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:12,marginBottom:18}}>
   <div>
    <h2 style={{marginBottom:6}}>Drug Allergy Rules</h2>
    <p style={{color:'#64748b',margin:0}}>จัดการกฎ Hard Stop โดยไม่ต้องแก้ Code · เฉพาะ Super Admin</p>
   </div>
   <div style={{display:'flex',gap:8}}>
    <button className="btn btn-outline" onClick={()=>void load()} disabled={loading||saving}>{loading?'กำลังโหลด...':'รีเฟรช'}</button>
    <button className="btn btn-primary" onClick={startNew} disabled={saving}>+ เพิ่มกฎแพ้ยา</button>
   </div>
  </div>
  <div className="card" style={{marginBottom:16,borderLeft:'4px solid #ad7d17',background:'#fffdf5'}}>
   <strong style={{color:'#7a4e11'}}>ข้อควรระวังทางคลินิก</strong>
   <p style={{margin:'8px 0 0',lineHeight:1.7,color:'#53492a'}}>
    ทุกกฎต้องระบุสารที่แพ้และชื่อสามัญของยาที่ห้ามจ่ายให้ตรงกับ Drug Master พร้อมเอกสารอ้างอิง กฎใหม่เริ่มเป็น Draft และจะมีผลหลัง Publish เท่านั้น
    กฎพื้นฐาน Penicillin → Amoxicillin/Ampicillin ถูกล็อกและไม่สามารถปิดผ่านหน้าเว็บได้
   </p>
  </div>
  {error&&<div className="card" role="alert" style={{marginBottom:16,borderLeft:'4px solid #b91c1c',color:'#991b1b'}}>{error}</div>}
  {showForm&&<section className="card" style={{marginBottom:18,borderTop:'4px solid #0c4a75'}}>
   <h3 style={{marginTop:0}}>{form.ruleId?'แก้ไข Draft':'เพิ่มกฎแพ้ยาใหม่'}</h3>
   <form onSubmit={save}>
    <div style={{display:'grid',gap:16,gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))'}}>
     <div className="form-group">
      <label htmlFor="allergy-terms">Allergen / Drug Allergy Terms</label>
      <input id="allergy-terms" className="form-control" required maxLength={900}
       placeholder="เช่น SULFA | SULFONAMIDE"
       value={form.allergenTerms} onChange={e=>setForm(f=>({...f,allergenTerms:e.target.value}))}/>
      <small style={{color:'#64748b'}}>ชื่อที่พบในประวัติแพ้ยา · คั่นชื่อพ้องด้วย |</small>
     </div>
     <div className="form-group">
      <label htmlFor="allergy-blocked">Blocked Generic Drug Names</label>
      <input id="allergy-blocked" className="form-control" required maxLength={900}
       placeholder="เช่น SULFAMETHOXAZOLE | CO-TRIMOXAZOLE"
       value={form.blockedGenericTerms} onChange={e=>setForm(f=>({...f,blockedGenericTerms:e.target.value}))}/>
      <small style={{color:'#64748b'}}>ใช้ชื่อสามัญที่ตรงกับ Drug Master · คั่นหลายชื่อด้วย |</small>
     </div>
    </div>
    <div className="form-group" style={{marginTop:14}}>
     <label htmlFor="allergy-reference">Guideline / Clinical Reference (ต้องระบุ)</label>
     <input id="allergy-reference" className="form-control" required minLength={8} maxLength={500}
      placeholder="ชื่อเอกสาร, ปี, หรือลิงก์อ้างอิง"
      value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))}/>
    </div>
    <div style={{display:'flex',gap:10,marginTop:16}}>
     <button className="btn btn-primary" type="submit" disabled={saving}>{saving?'กำลังบันทึก...':'บันทึก Draft'}</button>
     <button className="btn btn-outline" type="button" onClick={()=>setShowForm(false)} disabled={saving}>ยกเลิก</button>
    </div>
   </form>
  </section>}
  <section className="card">
   <h3 style={{marginTop:0}}>รายการกฎแพ้ยา <span style={{color:'#64748b',fontWeight:400}}>({rules.length})</span></h3>
   <div className="table-responsive">
    <table className="table">
     <thead><tr><th>Allergen Terms</th><th>Blocked Generic Drug</th><th>Reference</th><th>Status</th><th>Approved By</th><th>จัดการ</th></tr></thead>
     <tbody>{rules.length===0?<tr><td colSpan={6} style={{textAlign:'center',padding:24}}>{loading?'กำลังโหลด...':'ไม่มีรายการกฎ'}</td></tr>:
      rules.map(rule=><tr key={rule['Rule ID']}>
       <td style={{maxWidth:250,whiteSpace:'normal'}}><strong>{rule['Allergen Terms']}</strong></td>
       <td style={{maxWidth:250,whiteSpace:'normal'}}>{rule['Blocked Generic Terms']}</td>
       <td style={{maxWidth:280,whiteSpace:'normal',fontSize:13}}>{rule.Reference||'-'}</td>
       <td><span className="badge" style={{background:rule.Status==='ACTIVE'?'#dff3eb':rule.Status==='LOCKED'?'#e7eaf0':'#fff0ce',
        color:rule.Status==='ACTIVE'?'#08694d':rule.Status==='LOCKED'?'#304862':'#885c0a'}}>{rule.Status}</span></td>
       <td style={{fontSize:13}}>{rule['Approved By']||'รออนุมัติ'}</td>
       <td>{rule.Status==='DRAFT'?<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        <button className="btn btn-outline btn-sm" onClick={()=>edit(rule)} disabled={saving}>แก้ Draft</button>
        <button className="btn btn-primary btn-sm" onClick={()=>void publish(rule)} disabled={saving}>Approve / Publish</button>
       </div>:<span style={{color:'#64748b',fontSize:12}}>ล็อกการแก้ไข</span>}</td>
      </tr>)}</tbody>
    </table>
   </div>
  </section>
 </div>;
};
