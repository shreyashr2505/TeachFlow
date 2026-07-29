import React, { useMemo } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { ApprovalScreen, BranchSelectionScreen, InactiveClassScreen, LoadingScreen, LoginScreen } from '../screens/AuthScreens';
import { DashboardScreen } from '../screens/DashboardScreen';
import {
  AiModule,
  AnalyticsModule,
  ApprovalsModule,
  AttendanceModule,
  BatchesModule,
  BranchesModule,
  FeesModule,
  LecturesModule,
  MarksModule,
  MessagesModule,
  ReportsModule,
  SettingsModule,
  StudentsModule,
  SuperAdminModule,
  TeachersModule,
} from '../screens/ModuleScreens';
import { getFeatureTabs } from '../utils/features';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

const TabContent = ({ id, navigation }: { id: string; navigation: { navigate: (route: string) => void } }) => {
  switch (id) {
    case 'dashboard':
      return <DashboardScreen onNavigate={(feature) => navigation.navigate(feature)} />;
    case 'students':
      return <StudentsModule />;
    case 'teachers':
      return <TeachersModule />;
    case 'batches':
      return <BatchesModule />;
    case 'lectures':
      return <LecturesModule />;
    case 'attendance':
      return <AttendanceModule />;
    case 'marks':
      return <MarksModule />;
    case 'fees':
      return <FeesModule />;
    case 'approvals':
      return <ApprovalsModule />;
    case 'messages':
      return <MessagesModule />;
    case 'reports':
      return <ReportsModule />;
    case 'analytics':
      return <AnalyticsModule />;
    case 'ai':
      return <AiModule />;
    case 'branches':
      return <BranchesModule />;
    case 'settings':
      return <SettingsModule />;
    case 'classes':
    case 'payments':
    case 'pricing':
    case 'growth':
    case 'users':
      return <SuperAdminModule />;
    default:
      return <DashboardScreen onNavigate={(feature) => navigation.navigate(feature)} />;
  }
};

const MainTabs = () => {
  const { user, currentClass, planSettings } = useAuth();
  const tabs = useMemo(
    () =>
      getFeatureTabs(user?.role ?? null, currentClass?.plan, (feature) => {
        if (!currentClass) return true;
        return feature === 'advanced_analytics' || feature === 'ai' || feature === 'messaging' || feature === 'branches'
          ? currentClass.plan !== 'free' && planSettings[currentClass.plan].features[
              feature === 'advanced_analytics'
                ? 'analytics'
                : feature === 'ai'
                  ? 'aiReports'
                  : feature === 'messaging'
                    ? 'messaging'
                    : 'branchesEnabled'
            ]
          : true;
      }),
    [currentClass?.plan, planSettings, user?.role]
  );

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingTop: 6,
          paddingBottom: 8,
          height: 70,
        },
        tabBarActiveTintColor: '#bfdbfe',
        tabBarInactiveTintColor: '#9ca3af',
      }}
    >
      {tabs.map((tab) => (
        <Tab.Screen
          key={tab.id}
          name={tab.id}
          options={{
            tabBarLabel: tab.shortLabel,
            tabBarIcon: ({ color, size }) => (
              <Feather
                name={
                  tab.id === 'dashboard'
                    ? 'home'
                    : tab.id === 'students'
                      ? 'users'
                      : tab.id === 'teachers'
                        ? 'user-check'
                        : tab.id === 'batches'
                          ? 'layers'
                          : tab.id === 'lectures'
                            ? 'calendar'
                            : tab.id === 'attendance'
                              ? 'check-circle'
                              : tab.id === 'marks'
                                ? 'bar-chart-2'
                                : tab.id === 'fees'
                                  ? 'credit-card'
                                  : tab.id === 'approvals'
                                    ? 'shield'
                                    : tab.id === 'messages'
                                      ? 'message-circle'
                                      : tab.id === 'reports'
                                        ? 'file-text'
                                        : tab.id === 'analytics'
                                          ? 'pie-chart'
                                          : tab.id === 'ai'
                                            ? 'cpu'
                                            : tab.id === 'branches'
                                              ? 'home'
                                              : tab.id === 'settings'
                                                ? 'settings'
                                                : tab.id === 'classes'
                                                  ? 'layout'
                                                  : tab.id === 'payments'
                                                    ? 'credit-card'
                                                    : tab.id === 'pricing'
                                                      ? 'tag'
                                                      : tab.id === 'growth'
                                                        ? 'trending-up'
                                                        : 'user'
                }
                size={size}
                color={color}
              />
            ),
          }}
        >
          {({ navigation }) => <TabContent id={tab.id} navigation={navigation} />}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  const { user, currentClass, classes, isLoading } = useAuth();

  const state = useMemo(() => {
    if (isLoading) return 'loading';
    if (!user) return 'login';
    if (user.role === 'super_admin') return 'main';
    if (user.role === 'admin' && classes.length === 0) return 'setup';
    if (user.approved === false) return 'approval';
    if (!currentClass && classes.length > 1) return 'branches';
    if (!currentClass) return 'login';
    if (currentClass.isActive === false) return 'inactive';
    return 'main';
  }, [classes.length, currentClass, isLoading, user]);

  return (
    <NavigationContainer theme={navTheme}>
      {state === 'loading' ? (
        <LoadingScreen />
      ) : state === 'login' ? (
        <LoginScreen />
      ) : state === 'approval' ? (
        <ApprovalScreen />
      ) : state === 'branches' ? (
        <BranchSelectionScreen />
      ) : state === 'setup' ? (
        <BranchesModule />
      ) : state === 'inactive' ? (
        <InactiveClassScreen className={currentClass?.name} plan={currentClass?.plan} />
      ) : (
        <Stack.Navigator key={state} screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Tabs" component={MainTabs} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
};
