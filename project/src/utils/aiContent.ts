export type AIResponseKind =
  | 'class_analytics'
  | 'student_analysis'
  | 'improvement_plan'
  | 'admin_chat'
  | 'report_card';

export interface AISectionData {
  title: string;
  items: string[];
}

const extractJsonCandidate = (raw: string) => {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1).trim();
  }

  return raw.trim();
};

const asStringArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }

  return [];
};

const splitParagraphs = (text: string) =>
  text
    .split(/\n+/)
    .map((item) => item.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

export const tryParseAIJson = (raw: string): Record<string, unknown> | null => {
  const candidate = extractJsonCandidate(raw);
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

export const buildAISections = (raw: string, kind: AIResponseKind): AISectionData[] => {
  const parsed = tryParseAIJson(raw);

  if (parsed) {
    if (kind === 'class_analytics') {
      return [
        { title: 'Performance Overview', items: asStringArray(parsed.overview) },
        { title: 'Key Observations', items: asStringArray(parsed.observations) },
        { title: 'Action Plan', items: asStringArray(parsed.plan) },
      ].filter((section) => section.items.length > 0);
    }

    if (kind === 'student_analysis') {
      return [
        { title: 'Performance Insight', items: asStringArray(parsed.insight) },
        { title: 'Key Risk Area', items: asStringArray(parsed.riskArea) },
        { title: 'Recommended Action', items: asStringArray(parsed.actions) },
      ].filter((section) => section.items.length > 0);
    }

    if (kind === 'improvement_plan') {
      return [
        { title: 'Core Focus Area', items: asStringArray(parsed.focusArea) },
        { title: 'Action Steps', items: asStringArray(parsed.actionSteps) },
        { title: 'Expected Outcome', items: asStringArray(parsed.expectedOutcome) },
      ].filter((section) => section.items.length > 0);
    }

    if (kind === 'admin_chat') {
      return [
        { title: 'AI Guidance', items: asStringArray(parsed.response) },
      ].filter((section) => section.items.length > 0);
    }

    if (kind === 'report_card') {
      return [
        { title: 'Performance Summary', items: asStringArray(parsed.performanceSummary) },
        { title: 'Improvement Plan', items: asStringArray(parsed.improvementPlan) },
        { title: 'Suggestions', items: asStringArray(parsed.suggestions) },
      ].filter((section) => section.items.length > 0);
    }
  }

  return [
    {
      title: 'AI Insights',
      items: splitParagraphs(raw),
    },
  ].filter((section) => section.items.length > 0);
};
