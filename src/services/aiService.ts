import { firebaseService } from './firebaseService';

type AIFeature = 'class_analytics' | 'student_analysis' | 'improvement_plan' | 'admin_chat' | 'report_card';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_MONTHLY_LIMIT = Number(import.meta.env.VITE_AI_MONTHLY_TOKEN_LIMIT ?? '200000');

const estimateTokens = (text: string) => Math.max(Math.ceil(text.trim().length / 4), 1);
const getMonthKey = () => new Date().toISOString().slice(0, 7);

const parseGeminiText = (payload: any): string => {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('AI response was empty.');
  }

  const text = parts
    .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
    .join('\n')
    .trim();

  if (!text) {
    throw new Error('AI response was empty.');
  }

  return text;
};

const generateAI = async (prompt: string) => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing VITE_GEMINI_API_KEY. Add your Gemini API key to the environment before using AI.');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.5,
      },
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const payload = await response.json();
      detail = payload?.error?.message ? ` ${payload.error.message}` : '';
    } catch {
      detail = '';
    }
    throw new Error(`AI request failed with status ${response.status}.${detail}`);
  }

  const payload = await response.json();
  return parseGeminiText(payload);
};

const safeAI = async (classId: string, feature: AIFeature, prompt: string) => {
  const promptTokens = estimateTokens(prompt);
  const usedTokens = await firebaseService.getAIUsageForMonth(classId, getMonthKey());

  if (usedTokens + promptTokens > DEFAULT_MONTHLY_LIMIT) {
    throw new Error('Monthly AI token limit reached for this class. Increase the limit or wait until next month.');
  }

  const output = await generateAI(prompt);
  const completionTokens = estimateTokens(output);
  const totalTokens = promptTokens + completionTokens;

  await firebaseService.createAIUsageLog({
    classId,
    feature,
    promptTokens,
    completionTokens,
    totalTokens,
    monthKey: getMonthKey(),
  });

  return output;
};

export const aiService = {
  generateClassAnalytics(
    classId: string,
    input: {
      averageAttendance: number;
      averageMarks: number;
      weakSubjects: string[];
      topStudents: string[];
      weakStudents: string[];
    }
  ) {
    const prompt = [
      'You are an AI assistant for a coaching class management system.',
      'Answer only for admin users.',
      'Keep answers simple, actionable, and professional.',
      '',
      `Analyze this class data:`,
      `Average attendance: ${input.averageAttendance}%`,
      `Average marks: ${input.averageMarks}%`,
      `Weak subjects: ${input.weakSubjects.join(', ') || 'None identified'}`,
      `Top students: ${input.topStudents.join(', ') || 'None yet'}`,
      `Weak students: ${input.weakStudents.join(', ') || 'None yet'}`,
      '',
      'Give:',
      '1. Performance summary',
      '2. Main problems',
      '3. Immediate action plan',
    ].join('\n');

    return safeAI(classId, 'class_analytics', prompt);
  },

  generateStudentAnalysis(
    classId: string,
    input: {
      studentName: string;
      attendancePercentage: number;
      marksSummary: string[];
    }
  ) {
    const prompt = [
      'You are an AI assistant for a coaching class management system.',
      'Answer only for admin users.',
      'Keep answers simple and actionable.',
      '',
      `Analyze this student: ${input.studentName}`,
      `Attendance: ${input.attendancePercentage}%`,
      `Marks: ${input.marksSummary.join(', ') || 'No marks available'}`,
      '',
      'Explain:',
      '1. Why the student is underperforming or performing well',
      '2. The biggest academic risk',
      '3. The next best action for the admin',
    ].join('\n');

    return safeAI(classId, 'student_analysis', prompt);
  },

  generateImprovementPlan(
    classId: string,
    input: {
      scope: 'class' | 'student';
      context: string;
    }
  ) {
    const prompt = [
      'You are an AI assistant for a coaching class management system.',
      'Answer only for admin users.',
      'Keep answers simple, short, and actionable.',
      '',
      `Prepare an improvement plan for this ${input.scope}:`,
      input.context,
      '',
      'Return:',
      '1. Main issue',
      '2. 3 to 5 improvement steps',
      '3. A short expected outcome',
    ].join('\n');

    return safeAI(classId, 'improvement_plan', prompt);
  },

  askAdminAI(
    classId: string,
    input: {
      question: string;
      context: string;
    }
  ) {
    const prompt = [
      'You are an AI assistant for a coaching class management system.',
      'Answer based on student data and analytics.',
      'Keep answers simple and actionable.',
      'Answer only for admin users.',
      '',
      'Context:',
      input.context,
      '',
      `Admin question: ${input.question}`,
    ].join('\n');

    return safeAI(classId, 'admin_chat', prompt);
  },

  generateReportCardSummary(
    classId: string,
    input: {
      studentName: string;
      attendancePercentage: number;
      marksSummary: string[];
    }
  ) {
    const prompt = [
      'Generate a report card summary for a coaching class student.',
      'Keep it simple and professional.',
      '',
      `Student: ${input.studentName}`,
      `Attendance: ${input.attendancePercentage}%`,
      `Marks: ${input.marksSummary.join(', ') || 'No marks available'}`,
      '',
      'Include:',
      '1. Performance Summary',
      '2. Improvement Plan',
      '3. Suggestions',
    ].join('\n');

    return safeAI(classId, 'report_card', prompt);
  },
};

export { estimateTokens };
