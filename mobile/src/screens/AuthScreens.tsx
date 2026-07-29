import React, { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { CoachingClass, User } from '../types';
import { Body, Button, Card, Input, PressCard, Screen, ScrollContent, SectionTitle, SpaceBetween, Title } from '../components/ui';
import { colors, radius, spacing } from '../theme';

export const LoadingScreen = () => (
  <Screen>
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Feather name="loader" size={26} color="#93c5fd" />
    </View>
  </Screen>
);

export const ApprovalScreen = () => {
  const { logout, refreshUserData } = useAuth();
  return (
    <Screen>
      <ScrollContent contentContainerStyle={{ flex: 1, justifyContent: 'center' }}>
        <Card>
          <SectionTitle>Approval Pending</SectionTitle>
          <Body style={{ marginTop: 10 }}>
            Your account is approved in Auth, but the class admin still needs to enable access in Firestore.
          </Body>
          <View style={{ height: 18 }} />
          <Button variant="primary" label="Refresh Status" onPress={() => void refreshUserData()} />
          <View style={{ height: 10 }} />
          <Button variant="secondary" label="Logout" onPress={() => void logout()} />
        </Card>
      </ScrollContent>
    </Screen>
  );
};

export const InactiveClassScreen = ({ className, plan }: { className?: string; plan?: string }) => {
  const { logout } = useAuth();
  return (
    <Screen>
      <ScrollContent contentContainerStyle={{ flex: 1, justifyContent: 'center' }}>
        <Card>
          <SectionTitle>Subscription expired</SectionTitle>
          <Body style={{ marginTop: 10 }}>{className ?? 'This class workspace'} is currently inactive.</Body>
          {plan ? <Body style={{ marginTop: 8 }}>Current plan: {plan}</Body> : null}
          <View style={{ height: 18 }} />
          <Button variant="primary" label="Logout" onPress={() => void logout()} />
        </Card>
      </ScrollContent>
    </Screen>
  );
};

export const BranchSelectionScreen = () => {
  const { classes, currentClass, switchClass } = useAuth();
  const sorted = useMemo(() => [...classes].sort((a, b) => (a.id === currentClass?.id ? -1 : b.id === currentClass?.id ? 1 : a.name.localeCompare(b.name))), [classes, currentClass?.id]);
  return (
    <Screen>
      <ScrollContent>
        <Title>Select branch</Title>
        <Body style={{ marginTop: 10 }}>You have access to more than one branch. Pick the workspace you want to open.</Body>
        <View style={{ height: spacing.md }} />
        <FlatList
          data={sorted}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <PressCard onPress={() => void switchClass(item.id)}>
              <Card>
                <SpaceBetween>
                  <View style={{ flex: 1 }}>
                    <SectionTitle>{item.name}</SectionTitle>
                    <Body style={{ marginTop: 6 }}>{item.description ?? 'No description added yet.'}</Body>
                  </View>
                  {item.id === currentClass?.id ? <Feather name="check-circle" size={20} color="#86efac" /> : null}
                </SpaceBetween>
              </Card>
            </PressCard>
          )}
        />
      </ScrollContent>
    </Screen>
  );
};

export const LoginScreen = ({ initialMode = 'login' }: { initialMode?: 'login' | 'signup' }) => {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [role, setRole] = useState<User['role']>('student');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(email.trim(), password, role);
      } else {
        await signup(email.trim(), password, name.trim(), role);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollContent contentContainerStyle={{ paddingTop: 18 }}>
        <View
          style={{
            padding: 22,
            borderRadius: 28,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            marginBottom: spacing.md,
          }}
        >
          <Title>TeachFlow</Title>
          <Body style={{ marginTop: 8 }}>Premium mobile classroom control for admins, teachers, students, and parents.</Body>
        </View>

        <Card>
          <SectionTitle>{mode === 'login' ? 'Sign in' : 'Create account'}</SectionTitle>
          <View style={{ height: 14 }} />
          {mode === 'signup' ? (
            <>
              <Input placeholder="Full name" placeholderTextColor="#6b7280" value={name} onChangeText={setName} style={{ marginBottom: 12 }} />
            </>
          ) : null}
          <Input placeholder="Email" placeholderTextColor="#6b7280" value={email} onChangeText={setEmail} keyboardType="email-address" style={{ marginBottom: 12 }} />
          <Input placeholder="Password" placeholderTextColor="#6b7280" value={password} onChangeText={setPassword} secureTextEntry style={{ marginBottom: 12 }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            {(['admin', 'teacher', 'student', 'parent'] as User['role'][]).map((item) => (
              <PressCard key={item} onPress={() => setRole(item)}>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: role === item ? 'rgba(59,130,246,0.18)' : colors.surfaceElevated,
                    borderWidth: 1,
                    borderColor: role === item ? 'rgba(59,130,246,0.4)' : colors.border,
                  }}
                >
                  <Body style={{ color: role === item ? '#bfdbfe' : colors.textMuted, fontWeight: '700', textTransform: 'capitalize' }}>{item}</Body>
                </View>
              </PressCard>
            ))}
          </View>

          {error ? <Body style={{ color: '#fca5a5', marginBottom: 10 }}>{error}</Body> : null}
          <Button variant="primary" label={busy ? 'Working...' : mode === 'login' ? 'Login' : 'Sign up'} loading={busy} onPress={() => void submit()} />

          <View style={{ height: 10 }} />
          <Button
            variant="ghost"
            label={mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Login'}
            onPress={() => setMode((current) => (current === 'login' ? 'signup' : 'login'))}
          />
        </Card>
      </ScrollContent>
    </Screen>
  );
};

export const WelcomeGate = ({ children }: { children: React.ReactNode }) => <>{children}</>;
