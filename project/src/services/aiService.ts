import { auth } from './firebase';
import { firebaseService } from './firebaseService';
import { canAccessFeature, formatPlanName } from '../utils/plan';

type AIFeature = 'class_analytics' | 'student_analysis' | 'improvement_plan' | 'admin_chat' | 'report_card';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const DEFAULT_MONTHLY_LIMIT = Number(import.meta.env.VITE_AI_MONTHLY_TOKEN_LIMIT ?? '200000');
const AI_RETRY_DELAY_MS = 2000;
const AI_RATE_LIMIT_DELAY_MS = 7000;
const AI_MAX_RETRIES = 3;
const AI_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const AI_COOLDOWN_MS = 5000;
const MAX_AI_CALLS_PER_MINUTE = 3;
const MAX_ADMIN_CHAT_PER_DAY = 10;
const AI_LIMITS = {
  free: 5,
  standard: 50,
  pro: 200,
} as const;
const CACHE_STORAGE_KEY = 'teachflow.ai.cache.v1';
const LIMITER_STORAGE_KEY = 'teachflow.ai.limiter.v1';
const aiResponseCache = new Map<string, { value: string; expiresAt: number }>();
const pendingRequests = new Map<string, Promise<string>>();

type CachedAIResponse = {
  value: string;
  expiresAt: number;
};

type LimiterState = {
  lastCallAt: number;
  minuteWindowStart: number;
  callsInWindow: number;
  chatDayKey: string;
  chatCallsToday: number;
};

const defaultLimiterState = (): LimiterState => ({
  lastCallAt: 0,
  minuteWindowStart: 0,
  callsInWindow: 0,
  chatDayKey: '',
  chatCallsToday: 0,
});

const estimateTokens = (text: string) => Math.max(Math.ceil(text.trim().length / 4), 1);
const getMonthKey = () => new Date().toISOString().slice(0, 7);
const getDayKey = () => new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const getActorKey = () => auth.currentUser?.uid ?? 'anonymous';
const isBrowser = typeof window !== 'undefined';

const loadJsonMap = <T>(storageKey: string): Record<string, T> => {
  if (!isBrowser) {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const saveJsonMap = <T>(storageKey: string, value: Record<string, T>) => {
  if (!isBrowser) {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Ignore quota/localStorage errors and continue with in-memory state.
  }
};

const getLimiterState = (actorKey: string): LimiterState => {
  const allStates = loadJsonMap<LimiterState>(LIMITER_STORAGE_KEY);
  const state = allStates[actorKey];

  if (!state) {
    return defaultLimiterState();
  }

  return {
    ...defaultLimiterState(),
    ...state,
  };
};

const setLimiterState = (actorKey: string, nextState: LimiterState) => {
  const allStates = loadJsonMap<LimiterState>(LIMITER_STORAGE_KEY);
  allStates[actorKey] = nextState;
  saveJsonMap(LIMITER_STORAGE_KEY, allStates);
};

const getCooldownRemainingMs = (lastCallAt: number) => Math.max(AI_COOLDOWN_MS - (Date.now() - lastCallAt), 0);

const getRateLimiterSnapshot = (feature?: AIFeature) => {
  const state = getLimiterState(getActorKey());
  const cooldownRemainingMs = getCooldownRemainingMs(state.lastCallAt);
  const isMinuteWindowActive = Date.now() - state.minuteWindowStart < 60_000;
  const callsThisMinute = isMinuteWindowActive ? state.callsInWindow : 0;
  const dayKey = getDayKey();
  const chatCallsToday = state.chatDayKey === dayKey ? state.chatCallsToday : 0;
  const remainingChatCallsToday = Math.max(MAX_ADMIN_CHAT_PER_DAY - chatCallsToday, 0);

  return {
    cooldownRemainingMs,
    callsThisMinute,
    remainingCallsThisMinute: Math.max(MAX_AI_CALLS_PER_MINUTE - callsThisMinute, 0),
    chatCallsToday,
    remainingChatCallsToday,
    canCall:
      cooldownRemainingMs === 0 &&
      callsThisMinute < MAX_AI_CALLS_PER_MINUTE &&
      (feature !== 'admin_chat' || remainingChatCallsToday > 0),
  };
};

const reserveAILimitSlot = (feature: AIFeature) => {
  const actorKey = getActorKey();
  const state = getLimiterState(actorKey);
  const now = Date.now();
  const cooldownRemainingMs = getCooldownRemainingMs(state.lastCallAt);

  if (cooldownRemainingMs > 0) {
    throw new Error(`Please wait ${Math.ceil(cooldownRemainingMs / 1000)} seconds before the next AI request.`);
  }

  const isMinuteWindowActive = now - state.minuteWindowStart < 60_000;
  const callsInWindow = isMinuteWindowActive ? state.callsInWindow : 0;

  if (callsInWindow >= MAX_AI_CALLS_PER_MINUTE) {
    throw new Error('AI request limit reached for this minute. Please wait a little before trying again.');
  }

  const dayKey = getDayKey();
  const chatCallsToday = state.chatDayKey === dayKey ? state.chatCallsToday : 0;
  if (feature === 'admin_chat' && chatCallsToday >= MAX_ADMIN_CHAT_PER_DAY) {
    throw new Error('Daily admin AI chat limit reached. Please continue tomorrow or use the saved results above.');
  }

  setLimiterState(actorKey, {
    lastCallAt: now,
    minuteWindowStart: isMinuteWindowActive ? state.minuteWindowStart : now,
    callsInWindow: callsInWindow + 1,
    chatDayKey: dayKey,
    chatCallsToday: feature === 'admin_chat' ? chatCallsToday + 1 : chatCallsToday,
  });
};

const readCachedResponse = (cacheKey: string) => {
  const inMemory = aiResponseCache.get(cacheKey);
  if (inMemory && inMemory.expiresAt > Date.now()) {
    return inMemory.value;
  }

  if (inMemory) {
    aiResponseCache.delete(cacheKey);
  }

  const storedCache = loadJsonMap<CachedAIResponse>(CACHE_STORAGE_KEY);
  const stored = storedCache[cacheKey];
  if (!stored) {
    return null;
  }

  if (stored.expiresAt <= Date.now()) {
    delete storedCache[cacheKey];
    saveJsonMap(CACHE_STORAGE_KEY, storedCache);
    return null;
  }

  aiResponseCache.set(cacheKey, stored);
  return stored.value;
};

const writeCachedResponse = (cacheKey: string, value: string) => {
  const entry = {
    value,
    expiresAt: Date.now() + AI_CACHE_TTL_MS,
  };

  aiResponseCache.set(cacheKey, entry);

  const storedCache = loadJsonMap<CachedAIResponse>(CACHE_STORAGE_KEY);
  storedCache[cacheKey] = entry;
  saveJsonMap(CACHE_STORAGE_KEY, storedCache);
};

const stringifyAIResponse = (payload: Record<string, unknown>) => JSON.stringify(payload);

type GeminiPart = { text?: string };
type GeminiPayload = {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
    };
  }>;
};

const parseGeminiText = (payload: GeminiPayload): string => {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new Error('AI response was empty.');
  }

  const text = parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
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

const callAIWithRetry = async (work: () => Promise<string>, retries = AI_MAX_RETRIES): Promise<string> => {
  try {
    return await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isRetryable = message.includes('status 503') || message.includes('status 429');

    if (isRetryable && retries > 0) {
      await sleep(message.includes('status 429') ? AI_RATE_LIMIT_DELAY_MS : AI_RETRY_DELAY_MS);
      return callAIWithRetry(work, retries - 1);
    }

    if (message.includes('status 429')) {
      throw new Error('AI is receiving too many requests right now. Please wait a few seconds and try again.');
    }

    if (message.includes('status 503')) {
      throw new Error('AI is busy right now due to high demand. Please try again in a few moments.');
    }

    throw error;
  }
};

const safeAI = async (classId: string, feature: AIFeature, prompt: string, fallbackText?: string) => {
  const cacheKey = `${classId}:${feature}:${prompt}`;
  const cached = readCachedResponse(cacheKey);
  if (cached) {
    return cached;
  }

  const pendingRequest = pendingRequests.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const coachingClass = await firebaseService.getClass(classId);
  if (!coachingClass) {
    throw new Error('Class not found for AI request.');
  }

  if (!canAccessFeature('ai', coachingClass.plan)) {
    throw new Error(`${formatPlanName(coachingClass.plan)} plan does not include AI. Upgrade required.`);
  }

  if (coachingClass.settings?.aiEnabled === false) {
    throw new Error('AI is currently blocked for this class by the platform admin.');
  }

  reserveAILimitSlot(feature);

  if (feature === 'report_card') {
    const reportUsageLimit = AI_LIMITS[coachingClass.plan];
    const reportUsageCount = await firebaseService.getAIUsageCountForMonth(classId, getMonthKey(), 'report_card');

    if (reportUsageCount >= reportUsageLimit) {
      throw new Error('AI limit reached. Upgrade plan.');
    }

    if ((coachingClass.settings.aiUsage?.limit ?? 0) !== reportUsageLimit || (coachingClass.settings.aiUsage?.used ?? 0) !== reportUsageCount) {
      await firebaseService.updateClassSettings(classId, {
        ...coachingClass.settings,
        aiUsage: {
          used: reportUsageCount,
          limit: reportUsageLimit,
          lastUsed: coachingClass.settings.aiUsage?.lastUsed,
        },
      });
    }
  }

  const promptTokens = estimateTokens(prompt);
  const usedTokens = await firebaseService.getAIUsageForMonth(classId, getMonthKey());
  const effectiveMonthlyLimit = coachingClass.settings?.aiMonthlyLimit ?? DEFAULT_MONTHLY_LIMIT;

  if (usedTokens + promptTokens > effectiveMonthlyLimit) {
    throw new Error('Monthly AI token limit reached for this class. Increase the limit or wait until next month.');
  }

  const request = (async () => {
    try {
      const output = await callAIWithRetry(() => generateAI(prompt));
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

      writeCachedResponse(cacheKey, output);
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const canUseFallback =
        Boolean(fallbackText) &&
        (message.includes('status 429') ||
          message.includes('status 503') ||
          message.includes('AI is receiving too many requests') ||
          message.includes('AI is busy right now'));

      if (canUseFallback) {
        writeCachedResponse(cacheKey, fallbackText!);
        return fallbackText!;
      }

      throw error;
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, request);
  return request;
};

export const aiService = {
  generateClassAnalytics(
    classId: string,
    input: {
      totalStudents?: number;
      averageAttendance: number;
      averageMarks: number;
      weakSubjects: string[];
      topStudents: string[];
      weakStudents: string[];
    }
  ) {
    const fallback = stringifyAIResponse({
      overview:
        'The class is showing a developing academic pattern, with a clear opportunity to improve consistency in attendance and marks through closer weekly tracking.',
      observations: [
        'Student participation needs more consistency across the class.',
        'Academic progress can improve with tighter follow-up on weaker learners.',
        'Regular subject-wise review will help stabilize performance faster.',
      ],
      plan: [
        'Review attendance and marks every week.',
        'Give extra support to low-performing students.',
        'Coordinate batch-level revision and short assessments.',
      ],
    });

    const prompt = `
You are an experienced academic coordinator of a coaching institute.

Analyze the class performance and write a professional, structured report for the admin.

Class Context:
- Total Students: ${input.totalStudents ?? 0}
- Average Attendance: ${input.averageAttendance}%
- Average Marks: ${input.averageMarks}
- Top Students: ${input.topStudents.join(', ') || 'Developing cohort'}
- Weak Students: ${input.weakStudents.join(', ') || 'Students needing support are being identified'}

Instructions:
- Maintain a professional and constructive tone
- Use a premium coaching institute report style
- Do NOT sound negative even if data is poor
- Avoid phrases like "no data" or "impossible to evaluate"
- Focus on insights and solutions
- Write like a real academic expert
- Write in a natural, human-like tone as a senior coaching teacher. Avoid repetition. Use varied sentence structure. Make the report feel personalized and insightful, not generic.
- Avoid repeating the same issue in multiple sections. Each section should provide new value.
- Keep each section concise (around 120 words or less).
- Do not use overly formal or robotic language. Keep it professional but conversational.
- Do not repeat the same issue multiple times

Return response strictly in JSON format:
{
  "overview": "short paragraph",
  "observations": ["point 1", "point 2", "point 3"],
  "plan": ["step 1", "step 2", "step 3"]
}
`.trim();

    return safeAI(classId, 'class_analytics', prompt, fallback);
  },

  generateStudentAnalysis(
    classId: string,
    input: {
      studentName: string;
      attendancePercentage: number;
      marksSummary: string[];
      batchName?: string;
    }
  ) {
    const fallback = stringifyAIResponse({
      insight:
        'The student is still in a developing stage and would benefit from consistent academic guidance, regular attendance, and close progress tracking.',
      riskArea:
        'Irregular engagement may slow confidence and subject retention if not addressed early.',
      actions: [
        'Schedule a focused follow-up with the student.',
        'Track weekly attendance and marks closely.',
        'Align teacher support with the student’s current learning pace.',
      ],
    });

    const prompt = `
You are a senior academic mentor.

Analyze the student's performance and provide a professional evaluation for the admin.

Student Details:
- Name: ${input.studentName}
- Attendance: ${input.attendancePercentage}%
- Marks: ${JSON.stringify(input.marksSummary)}
- Batch: ${input.batchName ?? 'Assigned batch'}

Instructions:
- Keep tone encouraging, not harsh
- Do NOT directly blame the student
- Avoid mentioning missing data explicitly
- Provide actionable insights
- Use a premium coaching institute report style
- Write in a natural, human-like tone as a senior coaching teacher. Avoid repetition. Use varied sentence structure. Make the report feel personalized and insightful, not generic.
- Avoid repeating the same issue in multiple sections. Each section should provide new value.
- Keep each section concise (around 120 words or less).
- Do not use overly formal or robotic language. Keep it professional but conversational.

Return response strictly in JSON format:
{
  "insight": "short paragraph",
  "riskArea": "short paragraph",
  "actions": ["action 1", "action 2", "action 3"]
}
`.trim();

    return safeAI(classId, 'student_analysis', prompt, fallback);
  },

  generateImprovementPlan(
    classId: string,
    input: {
      scope: 'class' | 'student';
      context: string;
      studentName?: string;
      attendancePercentage?: number;
    }
  ) {
    const fallback = input.scope === 'student'
      ? stringifyAIResponse({
        focusArea: 'Build regular study rhythm and improve classroom engagement.',
        actionSteps: [
          'Track attendance closely for the next 2 weeks.',
          'Set small daily revision targets.',
          'Review one weak subject with teacher support.',
          'Conduct short weekly progress checks.',
        ],
        expectedOutcome:
          'The student should show better consistency, improved confidence, and clearer performance trends.',
      })
      : stringifyAIResponse({
        focusArea: 'Improve consistency in attendance and academic follow-through across the class.',
        actionSteps: [
          'Track low-engagement students weekly.',
          'Run short revision checkpoints.',
          'Prioritize weaker subjects in upcoming lectures.',
          'Share progress updates with teachers regularly.',
        ],
        expectedOutcome:
          'The class should show steadier participation and a more visible improvement in learning outcomes.',
      });

    const prompt = input.scope === 'student'
      ? `
You are an academic performance coach.

Create a structured improvement plan for the student.

Student:
- ${input.studentName ?? 'Student'}
- Attendance: ${input.attendancePercentage ?? 0}%

Context:
${input.context}

Instructions:
- Be supportive and practical
- Write in a natural, human-like tone as a senior coaching teacher. Avoid repetition. Use varied sentence structure. Make the report feel personalized and insightful, not generic.
- Avoid repeating the same issue in multiple sections. Each section should provide new value.
- Give 3-5 clear steps
- Focus on improvement, not criticism
- Use a premium coaching institute report style
- Keep each section concise (around 120 words or less).
- Do not use overly formal or robotic language. Keep it professional but conversational.

Return response strictly in JSON format:
{
  "focusArea": "short paragraph",
  "actionSteps": ["step 1", "step 2", "step 3"],
  "expectedOutcome": "short paragraph"
}
`.trim()
      : `
You are an academic performance coach.

Create a structured improvement plan for the class.

Context:
${input.context}

Instructions:
- Be supportive and practical
- Write in a natural, human-like tone as a senior coaching teacher. Avoid repetition. Use varied sentence structure. Make the report feel personalized and insightful, not generic.
- Avoid repeating the same issue in multiple sections. Each section should provide new value.
- Give 3-5 clear steps
- Focus on improvement, not criticism
- Use a premium coaching institute report style
- Keep each section concise (around 120 words or less).
- Do not use overly formal or robotic language. Keep it professional but conversational.

Return response strictly in JSON format:
{
  "focusArea": "short paragraph",
  "actionSteps": ["step 1", "step 2", "step 3"],
  "expectedOutcome": "short paragraph"
}
`.trim();

    return safeAI(classId, 'improvement_plan', prompt, fallback);
  },

  askAdminAI(
    classId: string,
    input: {
      question: string;
      context: string;
      totalStudents?: number;
      averageAttendance?: number;
      averageMarks?: number;
    }
  ) {
    const fallback = stringifyAIResponse({
      response: [
        'Review attendance and marks together, not separately.',
        'Identify the weakest students and assign short weekly interventions.',
        'Focus teachers on one measurable improvement goal per batch this week.',
        'Recheck results after the next assessment cycle.',
      ],
    });

    const prompt = `
You are an AI assistant for a coaching institute management system.

Your role:
- Help the admin improve class performance
- Give practical, actionable advice
- Use coaching and education context
- Keep answers structured and professional

Rules:
- Do NOT give generic motivational answers
- Always give actionable steps
- Keep answers concise (max 120 words)
- Prefer bullet points
- Write in a natural, human-like tone as a senior coaching teacher. Avoid repetition. Use varied sentence structure. Make the report feel personalized and insightful, not generic.
- Avoid repeating the same issue in multiple sections. Each section should provide new value.
- Do not use overly formal or robotic language. Keep it professional but conversational.
- Use a premium coaching institute report style

If the question is unclear, assume it relates to:
- attendance
- student performance
- teaching improvement

Admin Question: ${input.question}

Context:
- Students: ${input.totalStudents ?? 0}
- Avg Attendance: ${input.averageAttendance ?? 0}%
- Avg Marks: ${input.averageMarks ?? 0}%
- Additional Context: ${input.context}

Return response strictly in JSON format:
{
  "response": ["point 1", "point 2", "point 3"]
}
`.trim();

    return safeAI(classId, 'admin_chat', prompt, fallback);
  },

  generateReportCardSummary(
    classId: string,
    input: {
      studentName: string;
      className: string;
      batchName: string;
      term: string;
      attendancePercentage: number;
      marks: Array<{
        subject: string;
        examType: string;
        examName: string;
        examDate: string;
        totalMarks: number;
        obtainedMarks: number;
        percentage: number;
      }>;
    }
  ) {
    const exams = input.marks.reduce<Array<{ name: string; date: string; subjects: Array<{ subject: string; marks: number }> }>>((acc, mark) => {
      const key = `${mark.examName}__${mark.examDate}`;
      const existing = acc.find((item) => `${item.name}__${item.date}` === key);
      if (existing) {
        existing.subjects.push({ subject: mark.subject, marks: mark.obtainedMarks });
      } else {
        acc.push({
          name: mark.examName,
          date: mark.examDate,
          subjects: [{ subject: mark.subject, marks: mark.obtainedMarks }],
        });
      }
      return acc;
    }, []);

    const studentPayload = {
      studentName: input.studentName,
      class: input.className,
      exams,
    };

    const fallback =
      'Overall Performance Summary: The student is showing steady progress and has a clear base to improve further with consistent revision. Strengths & Weak Areas: Some subjects are performing well, while a few areas still need stronger accuracy and regular practice. Improvement Suggestions: Keep a fixed study routine, revise weaker topics weekly, and review mistakes after each exam to improve confidence and scores.';

    const prompt = `
You are an academic performance assistant.

Analyze the student's performance based on the provided exam data.

Instructions:
- Keep the response SHORT (max 120-150 words)
- Use simple, clear language suitable for parents
- Do NOT use markdown or special formatting
- Structure response into 3 parts:
  1. Overall Performance Summary
  2. Strengths & Weak Areas
  3. Improvement Suggestions

Rules:
- Compare performance across exams
- Identify improvement or decline trends
- Mention subject-wise strengths and weak subjects
- Give practical improvement advice
- Avoid repeating same sentence
- Keep tone professional and encouraging

Student Data:
${JSON.stringify(studentPayload)}
`.trim();

    return safeAI(classId, 'report_card', prompt, fallback);
  },

  getLimiterState(feature?: AIFeature) {
    return getRateLimiterSnapshot(feature);
  },
};

export { estimateTokens };
