import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const Screen = ({ children }: { children: React.ReactNode }) => {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
};

export const CenterMessage = ({ title, subtitle }: { title: string; subtitle?: string }) => {
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </Screen>
  );
};

export const LoadingScreen = ({ label = 'Loading...' }: { label?: string }) => {
  return (
    <Screen>
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.subtitle}>{label}</Text>
      </View>
    </Screen>
  );
};

export const LoaderScreen = () => {
  return <LoadingScreen label="Loading TeachFlow..." />;
};

export const DashboardShell = ({
  title,
  subtitle,
  onLogout,
}: {
  title: string;
  subtitle: string;
  onLogout: () => void;
}) => {
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <Pressable onPress={onLogout} style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}>
          <Text style={styles.buttonText}>Logout</Text>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#4b5563',
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    minWidth: 120,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
