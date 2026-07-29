import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import type { AppStackParamList } from '../navigation/AppStack';
import { paymentService } from '../services/paymentService';
import { teachflowData } from '../services/teachflowData';
import { CoachingClass, PaymentRecord } from '../types/Models';
import { useAuth } from '../store/AuthStore';

type Props = NativeStackScreenProps<AppStackParamList, 'SuperAdminDashboard'>;

const formatCurrency = (amount: number) => `Rs. ${Math.max(0, amount).toLocaleString('en-IN')}`;
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : 'Not set');

export const SuperAdminDashboard = ({ navigation }: Props) => {
  const { logout } = useAuth();
  const [classes, setClasses] = useState<CoachingClass[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const unsubs = [
      teachflowData.subscribeToAllClasses(setClasses, (nextError) => setError(nextError.message)),
      teachflowData.subscribeToPayments(setPayments, (nextError) => setError(nextError.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const metrics = paymentService.getRevenueMetrics(payments);
  const failedPayments = useMemo(() => payments.filter((payment) => ['failed', 'expired', 'cancelled', 'retry_requested'].includes(payment.status)), [payments]);
  const blockedClasses = useMemo(() => classes.filter((item) => item.blockedUntil && new Date(item.blockedUntil).getTime() > Date.now()), [classes]);

  const retryPayment = async (payment: PaymentRecord) => {
    setBusyKey(`retry:${payment.id}`);
    setError('');
    setSuccess('');
    try {
      await paymentService.managePayment(payment.id, 'retry');
      setSuccess(`Retry requested for ${payment.orderId}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to retry payment.');
    } finally {
      setBusyKey('');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Super Admin Billing</Text>
            <Text style={styles.subtitle}>Payments, failure logs, retries, and revenue analytics across all classes.</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.button}><Text style={styles.buttonText}>Logout</Text></Pressable>
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View> : null}

        <View style={styles.grid}>
          <View style={styles.card}><Text style={styles.value}>{classes.length}</Text><Text style={styles.label}>Classes</Text></View>
          <View style={styles.card}><Text style={styles.value}>{metrics.paidCount}</Text><Text style={styles.label}>Paid Payments</Text></View>
          <View style={styles.card}><Text style={styles.value}>{metrics.failedCount}</Text><Text style={styles.label}>Failed Payments</Text></View>
          <View style={styles.card}><Text style={styles.value}>{formatCurrency(metrics.revenue / 100)}</Text><Text style={styles.label}>Revenue</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Modules</Text>
          <View style={styles.actionGrid}>
            {[
              { label: 'Overview', moduleKey: 'overview', subtitle: 'Platform overview entry.' },
              { label: 'Classes', moduleKey: 'classes', subtitle: 'Global class management entry.' },
              { label: 'Payments', moduleKey: 'payments', subtitle: 'Platform payments entry.' },
              { label: 'Pricing', moduleKey: 'pricing', subtitle: 'Platform pricing entry.' },
              { label: 'AI Control', moduleKey: 'ai', subtitle: 'Platform AI controls entry.' },
              { label: 'Growth', moduleKey: 'growth', subtitle: 'Platform growth analytics entry.' },
              { label: 'Users', moduleKey: 'users', subtitle: 'Platform user management entry.' },
              { label: 'Billing Settings', moduleKey: 'settings', subtitle: 'Billing settings entry.' },
            ].map((item) => (
              <Pressable
                key={item.label}
                onPress={() => navigation.navigate('ModuleEntryScreen', { title: item.label, subtitle: item.subtitle, moduleKey: item.moduleKey })}
                style={styles.inlineButton}
              >
                <Text style={styles.inlineButtonText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Failure Logs</Text>
          {failedPayments.length === 0 ? <View style={styles.card}><Text style={styles.muted}>No failed payments.</Text></View> : null}
          {failedPayments.slice(0, 12).map((payment) => (
            <View key={payment.id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{payment.plan.toUpperCase()} | {payment.orderId}</Text>
                <Text style={styles.muted}>{payment.status.toUpperCase()} | {payment.failureReason ? paymentService.getFailureLabel(payment.failureReason) : 'No reason logged'}</Text>
                <Text style={styles.muted}>{formatDate(payment.createdAt)} | {formatCurrency(payment.amount / 100)}</Text>
              </View>
              <Pressable onPress={() => void retryPayment(payment)} style={styles.inlineButton}>
                <Text style={styles.inlineButtonText}>{busyKey === `retry:${payment.id}` ? 'Retrying...' : 'Retry'}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blocked Classes</Text>
          {blockedClasses.length === 0 ? <View style={styles.card}><Text style={styles.muted}>No classes are currently blocked.</Text></View> : null}
          {blockedClasses.map((item) => (
            <View key={item.id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{item.name}</Text>
                <Text style={styles.muted}>Plan: {item.plan.toUpperCase()} | Failed Attempts: {item.failedAttemptsCount ?? 0}</Text>
                <Text style={styles.muted}>Blocked Until: {formatDate(item.blockedUntil)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Payments</Text>
          {payments.slice(0, 15).map((payment) => (
            <View key={payment.id} style={styles.listCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{payment.plan.toUpperCase()} | {payment.orderId}</Text>
                <Text style={styles.muted}>{payment.status.toUpperCase()} | {formatDate(payment.createdAt)}</Text>
              </View>
              <Text style={styles.amount}>{formatCurrency(payment.amount / 100)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  button: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563eb' },
  buttonText: { color: '#fff', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '48%', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  value: { fontSize: 20, fontWeight: '700', color: '#111827' },
  label: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  listCard: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  muted: { fontSize: 13, color: '#6b7280' },
  amount: { fontSize: 15, fontWeight: '700', color: '#111827' },
  inlineButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: '#eff6ff' },
  inlineButtonText: { color: '#1d4ed8', fontWeight: '700' },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#fee2e2' },
  errorText: { color: '#b91c1c', fontWeight: '600' },
  successBox: { padding: 12, borderRadius: 10, backgroundColor: '#dcfce7' },
  successText: { color: '#166534', fontWeight: '600' },
});
