import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { UserRole } from '../store/AuthStore';
import { AdminDashboard } from '../screens/AdminDashboard';
import { StudentsScreen } from '../screens/StudentsScreen';
import { TeachersScreen } from '../screens/TeachersScreen';
import { BatchesScreen } from '../screens/BatchesScreen';
import { ParentLinkingScreen } from '../screens/ParentLinkingScreen';
import { LecturesScreen } from '../screens/LecturesScreen';
import { FeesScreen } from '../screens/FeesScreen';
import { TeacherDashboard } from '../screens/TeacherDashboard';
import { StudentDashboard } from '../screens/StudentDashboard';
import { ParentDashboard } from '../screens/ParentDashboard';
import { SuperAdminDashboard } from '../screens/SuperAdminDashboard';
import { ModuleEntryScreen } from '../screens/ModuleEntryScreen';

export type AppStackParamList = {
  AdminDashboard: undefined;
  StudentsScreen: undefined;
  TeachersScreen: undefined;
  BatchesScreen: undefined;
  ParentLinkingScreen: undefined;
  LecturesScreen: { initialTab?: 'lectures' | 'attendance' | 'marks' } | undefined;
  FeesScreen: { initialTab?: 'fees' | 'history' | 'billing' } | undefined;
  TeacherDashboard: undefined;
  StudentDashboard: undefined;
  ParentDashboard: undefined;
  SuperAdminDashboard: undefined;
  ModuleEntryScreen: { title: string; subtitle: string; moduleKey: string };
};

const Stack = createNativeStackNavigator<AppStackParamList>();

const roleToScreen: Record<UserRole, keyof AppStackParamList> = {
  admin: 'AdminDashboard',
  teacher: 'TeacherDashboard',
  student: 'StudentDashboard',
  parent: 'ParentDashboard',
  super_admin: 'SuperAdminDashboard',
};

export const AppStack = ({ role }: { role: UserRole }) => {
  return (
    <Stack.Navigator
      initialRouteName={roleToScreen[role]}
      screenOptions={{
        headerShown: true,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="AdminDashboard" component={AdminDashboard} options={{ title: 'Admin Dashboard' }} />
      <Stack.Screen name="StudentsScreen" component={StudentsScreen} options={{ title: 'Students' }} />
      <Stack.Screen name="TeachersScreen" component={TeachersScreen} options={{ title: 'Teachers' }} />
      <Stack.Screen name="BatchesScreen" component={BatchesScreen} options={{ title: 'Batches' }} />
      <Stack.Screen name="ParentLinkingScreen" component={ParentLinkingScreen} options={{ title: 'Parent Linking' }} />
      <Stack.Screen name="LecturesScreen" component={LecturesScreen} options={{ title: 'Lectures' }} />
      <Stack.Screen name="FeesScreen" component={FeesScreen} options={{ title: 'Fees' }} />
      <Stack.Screen name="TeacherDashboard" component={TeacherDashboard} />
      <Stack.Screen name="StudentDashboard" component={StudentDashboard} />
      <Stack.Screen name="ParentDashboard" component={ParentDashboard} />
      <Stack.Screen name="SuperAdminDashboard" component={SuperAdminDashboard} />
      <Stack.Screen name="ModuleEntryScreen" component={ModuleEntryScreen} options={({ route }) => ({ title: route.params.title })} />
    </Stack.Navigator>
  );
};
