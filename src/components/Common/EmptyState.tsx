import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description }) => (
  <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
    <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
    <p className="mt-2 text-sm text-gray-600">{description}</p>
  </div>
);

export default EmptyState;
