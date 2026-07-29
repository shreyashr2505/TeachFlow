export const isValidEmail = (value: string) => /\S+@\S+\.\S+/.test(value.trim());

export const isValidPhone = (value: string) => value.trim() === '' || /^[+\d][\d\s-]{7,}$/.test(value.trim());

export const isPositiveNumber = (value: number) => Number.isFinite(value) && value >= 0;

export const sanitizeSubdomain = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 30);

export const validateRequired = (label: string, value: string) =>
  value.trim() ? '' : `${label} is required.`;

export const validatePassword = (value: string) => {
  if (value.length < 6) return 'Password must be at least 6 characters.';
  return '';
};
