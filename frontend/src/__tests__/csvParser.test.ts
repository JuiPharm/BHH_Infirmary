import { describe, it, expect } from 'vitest';
import { parseStudentsInput, parseItemsInput, parseDelimitedText } from '../utils/csvParser';

describe('csvParser Utility', () => {
  it('parses comma-separated values correctly', () => {
    const raw = `studentId,firstName,lastName,grade,className,gender\nSTD001,John,Doe,Grade 1,1,M\nSTD002,Jane,Smith,Grade 2,2,F`;
    const res = parseStudentsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentId).toBe('STD001');
    expect(res.data[0].fullName).toBe('John Doe');
    expect(res.data[1].studentId).toBe('STD002');
  });

  it('parses tab-delimited values (Excel copy-paste) with Thai headers', () => {
    const raw = `รหัสนักเรียน\tชื่อ\tนามสกุล\tระดับชั้น\tห้อง\tเพศ\nSTD101\tสมชาย\tใจดี\tป.1\t1\tชาย\nSTD102\tสมหญิง\tรักเรียน\tป.1\t2\tหญิง`;
    const res = parseStudentsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentId).toBe('STD101');
    expect(res.data[0].fullName).toBe('สมชาย ใจดี');
    expect(res.data[0].grade).toBe('ป.1');
    expect(res.data[0].className).toBe('1');
    expect(res.data[0].gender).toBe('ชาย');
  });

  it('handles quotes with commas inside', () => {
    const raw = `itemCode,genericName,tradeName,unit,minStock,itemType\nPARA500,"Paracetamol, 500mg",Tylenol,เม็ด,100,DRUG\nGAUZE,"Gauze 2x2, sterile",Gauze,ชิ้น,50,เวชภัณฑ์`;
    const res = parseItemsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].genericName).toBe('Paracetamol, 500mg');
    expect(res.data[0].itemType).toBe('DRUG');
    expect(res.data[1].genericName).toBe('Gauze 2x2, sterile');
    expect(res.data[1].itemType).toBe('MEDICAL_SUPPLY');
  });

  it('preserves leading zeros for studentId and text codes', () => {
    const raw = `studentId,firstName,lastName,grade,className,gender\n00123,สมใจ,นึก,ป.1,1,ชาย\n0520294,สมพร,ดี,ป.2,2,หญิง`;
    const res = parseStudentsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentId).toBe('00123');
    expect(res.data[1].studentId).toBe('0520294');
  });

  it('parses exact Google Sheet headers for STUDENTS', () => {
    const raw = `Student ID,First Name,Last Name,Full Name,Grade,Class,Gender,Status\n01001,สมชาย,ใจดี,สมชาย ใจดี,ป.1,1,ชาย,ACTIVE\n01002,สมหญิง,รักเรียน,สมหญิง รักเรียน,ป.1,2,หญิง,ACTIVE`;
    const res = parseStudentsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].studentId).toBe('01001');
    expect(res.data[0].fullName).toBe('สมชาย ใจดี');
    expect(res.data[0].grade).toBe('ป.1');
    expect(res.data[0].className).toBe('1');
    expect(res.data[0].gender).toBe('ชาย');
    expect(res.data[0].status).toBe('ACTIVE');
  });

  it('parses exact Google Sheet headers for ITEM_MASTER including optional QTY column', () => {
    const raw = `Item Code,Item Type,Generic Name,Trade Name,QTY,Unit,Minimum Stock,Maximum Stock,Unit Cost,Active/Inactive\nPARA500,DRUG,Paracetamol 500mg,Tylenol,50,เม็ด,100,1000,0.50,TRUE\nBETADINE,DRUG,Povidone Iodine,Betadine,10,ขวด,10,100,25.00,TRUE`;
    const res = parseItemsInput(raw);
    expect(res.errors).toHaveLength(0);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].itemCode).toBe('PARA500');
    expect(res.data[0].itemType).toBe('DRUG');
    expect(res.data[0].genericName).toBe('Paracetamol 500mg');
    expect(res.data[0].tradeName).toBe('Tylenol');
    expect(res.data[0].unit).toBe('เม็ด');
    expect(res.data[0].minStock).toBe(100);
    expect(res.data[0].maxStock).toBe(1000);
    expect(res.data[0].unitCost).toBe(0.5);
    expect(res.data[0].active).toBe(true);
  });
});