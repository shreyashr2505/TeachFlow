import React from 'react';
import { AuthProvider } from '../store/AuthStore';

export const AppProviders = ({ children }: { children: React.ReactNode }) => {
  return <AuthProvider>{children}</AuthProvider>;
};
