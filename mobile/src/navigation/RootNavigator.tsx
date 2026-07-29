import React from 'react';
import { AuthStack } from './AuthStack';
import { AppStack } from './AppStack';
import { CenterMessage, LoaderScreen } from '../components/Screen';
import { useAuth } from '../store/AuthStore';

export const RootNavigator = () => {
  const { firebaseUser, initializing, userProfile, error } = useAuth();

  if (initializing) {
    return <LoaderScreen />;
  }

  if (!firebaseUser) {
    return <AuthStack />;
  }

  if (!userProfile) {
    return <CenterMessage title="Profile Error" subtitle={error ?? 'Unable to load your TeachFlow profile.'} />;
  }

  return <AppStack role={userProfile.role} />;
};
