type LectureCodeInput = {
  grade?: string | null;
  board?: string | null;
  subject?: string | null;
};

type BatchCodeInput = {
  date?: string | null;
  lecMode?: 'ONLINE' | 'OFFLINE' | null;
  branchName?: string | null;
  grade?: string | null;
  board?: string | null;
  batchName?: string | null;
};

type LectureHoursInput = {
  teacherId?: string | null;
  status?: string | null;
  date?: string | null;
  durationHours?: number | null;
  duration?: number | null;
};

type TeacherSalaryInput = {
  salaryType?: 'hourly' | 'fixed' | null;
  hourlyRate?: number | null;
  fixedSalary?: number | null;
  salary?: number | null;
};

const padTwo = (value: string) => value.trim().slice(0, 2).toUpperCase().padEnd(2, 'X');
const normalizeCodePart = (value: string) =>
  value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
const normalizeSimplePart = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '-');

export const getMonthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const buildLectureCode = (lecture: LectureCodeInput) => {
  const grade = normalizeCodePart(lecture.grade || 'NA');
  const board = padTwo(lecture.board || 'NA');
  const subject = normalizeCodePart(lecture.subject || 'SUBJECT');
  return `${grade}-${board}-${subject}`;
};

export const buildBatchCode = (lecture: BatchCodeInput) => {
  const parsedDate = typeof lecture.date === 'string' && lecture.date ? new Date(lecture.date) : null;
  const year = !parsedDate || Number.isNaN(parsedDate.getTime()) ? new Date().getFullYear() : parsedDate.getFullYear();
  const mode = lecture.lecMode === 'ONLINE' ? 'ON' : 'OFF';
  const branch = padTwo(lecture.branchName || 'BR');
  const grade = normalizeCodePart(lecture.grade || 'NA');
  const board = padTwo(lecture.board || 'NA');
  const batch = normalizeSimplePart(lecture.batchName || 'BATCH');
  return `${year}-${mode}-${branch}-${grade}-${board}-${batch}`;
};

export const getMonthlyHours = (lectures: LectureHoursInput[], teacherId: string, monthKey = getMonthKey()) =>
  lectures.reduce((total, lecture) => {
    if (lecture.teacherId !== teacherId || lecture.status !== 'completed') return total;
    const lectureDate = typeof lecture.date === 'string' && lecture.date ? new Date(lecture.date) : null;
    if (!lectureDate || Number.isNaN(lectureDate.getTime()) || getMonthKey(lectureDate) !== monthKey) return total;
    const hours = typeof lecture.durationHours === 'number' ? lecture.durationHours : typeof lecture.duration === 'number' ? lecture.duration / 60 : 0;
    return total + hours;
  }, 0);

export const calculateTeacherSalary = (teacher: TeacherSalaryInput, monthlyHours: number) => {
  if (teacher.salaryType === 'hourly') return Math.round(monthlyHours * (teacher.hourlyRate ?? 0));
  if (teacher.salaryType === 'fixed') return Math.round(teacher.fixedSalary ?? teacher.salary ?? 0);
  return Math.round(teacher.salary ?? teacher.fixedSalary ?? 0);
};
