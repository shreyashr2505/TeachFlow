import { Lecture, Teacher } from '../types';

const padTwo = (value: string) => value.trim().slice(0, 2).toUpperCase().padEnd(2, 'X');

const normalizeCodePart = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSimplePart = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '-');

export const getMonthKey = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const buildLectureCode = (lecture: Pick<Lecture, 'grade' | 'board' | 'subject'>) => {
  const grade = normalizeCodePart(lecture.grade || 'NA');
  const board = padTwo(lecture.board || 'NA');
  const subject = normalizeCodePart(lecture.subject || 'SUBJECT');
  return `${grade}-${board}-${subject}`;
};

export const buildBatchCode = (lecture: Pick<Lecture, 'date' | 'lecMode' | 'branchName' | 'grade' | 'board' | 'batchName'>) => {
  const year = Number.isNaN(new Date(lecture.date).getTime()) ? new Date().getFullYear() : new Date(lecture.date).getFullYear();
  const mode = lecture.lecMode === 'ONLINE' ? 'ON' : 'OFF';
  const branch = padTwo(lecture.branchName || 'BR');
  const grade = normalizeCodePart(lecture.grade || 'NA');
  const board = padTwo(lecture.board || 'NA');
  const batch = normalizeSimplePart(lecture.batchName || 'BATCH');
  return `${year}-${mode}-${branch}-${grade}-${board}-${batch}`;
};

export const getMonthlyHours = (lectures: Lecture[], teacherId: string, monthKey = getMonthKey()) =>
  lectures.reduce((total, lecture) => {
    if (lecture.teacherId !== teacherId || lecture.status !== 'completed') {
      return total;
    }

    const lectureDate = lecture.date ? new Date(lecture.date) : null;
    if (!lectureDate || Number.isNaN(lectureDate.getTime()) || getMonthKey(lectureDate) !== monthKey) {
      return total;
    }

    const hours = typeof lecture.durationHours === 'number'
      ? lecture.durationHours
      : typeof lecture.duration === 'number'
        ? lecture.duration / 60
        : 0;
    return total + hours;
  }, 0);

export const calculateTeacherSalary = (teacher: Teacher, monthlyHours: number) => {
  if (teacher.salaryType === 'hourly') {
    return Math.round(monthlyHours * (teacher.hourlyRate ?? 0));
  }

  if (teacher.salaryType === 'fixed') {
    return Math.round(teacher.fixedSalary ?? teacher.salary ?? 0);
  }

  return Math.round(teacher.salary ?? teacher.fixedSalary ?? 0);
};

export const getTeacherSalaryLabel = (teacher: Teacher) => {
  if (teacher.salaryType === 'hourly') {
    return 'Hourly';
  }

  if (teacher.salaryType === 'fixed') {
    return 'Fixed';
  }

  return 'Legacy';
};

export const getTeacherSalaryValue = (teacher: Teacher, monthlyHours: number) => {
  const salary = calculateTeacherSalary(teacher, monthlyHours);
  return salary.toLocaleString('en-IN');
};
