import React from 'react';

interface FeedbackMessageProps {
  type: 'success' | 'error' | 'info';
  message: string;
}

const styles = {
  success: 'border-green-200 bg-green-50 text-green-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

const FeedbackMessage: React.FC<FeedbackMessageProps> = ({ type, message }) => {
  if (!message) return null;
  return <div className={`rounded-lg border px-4 py-3 ${styles[type]}`}>{message}</div>;
};

export default FeedbackMessage;
