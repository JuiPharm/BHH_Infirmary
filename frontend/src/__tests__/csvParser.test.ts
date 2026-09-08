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

  it('returns errors when required identifier column is missing', () => {
    const raw = `name,grade,class\nJohn,1,1`;
    const res = parseStudentsInput(raw);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.data).toHaveLength(0);
  });
});