import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import type { AppStackParamList } from '../navigation/AppStack';
import { paymentService } from '../services/paymentService';
import { pdfService } from '../services/pdfService';
import { teachflowData } from '../services/teachflowData';
import type { BillingOverview, Fee, FeePayment, PaymentRecord, Student } from '../types/Models';
import { useAuth } from '../store/AuthStore';

type Props = NativeStackScreenProps<AppStackParamList, 'FeesScreen'>;
type FinanceTab = 'fees' | 'history' | 'billing';
type HistoryFilter = 'all' | 'paid' | 'pending';

const formatCurrency = (amount: number) => `Rs. ${Math.max(0, amount).toLocaleString('en-IN')}`;
const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-IN') : 'Not set');
const buildStatus = (amount: number, paidAmount: number): Fee['status'] => (paidAmount <= 0 ? 'due' : paidAmount >= amount ? 'paid' : 'partial');

const emptyFeeForm = { studentId: '', amount: '0', dueDate: new Date().toISOString().slice(0, 10), description: '' };
const emptyPaymentForm = { amount: '0', paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: 'cash' as FeePayment['method'], notes: '' };

export const FeesScreen = ({ route }: Props) => {
  const { currentClass, firebaseUser, logout, refreshAuthData, userProfile } = useAuth();
  const role = userProfile?.role ?? 'student';
  const canManageFees = role === 'admin';
  const canManageBilling = role === 'admin';
  const [activeTab, setActiveTab] = useState<FinanceTab>(route.params?.initialTab ?? (canManageBilling ? 'fees' : 'history'));
  const [students, setStudents] = useState<Student[]>([]);
  const [fees, setFees] = useState<Fee[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [billingOverview, setBillingOverview] = useState<BillingOverview | null>(null);
  const [feeForm, setFeeForm] = useState(emptyFeeForm);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [editingFee, setEditingFee] = useState<Fee | null>(null);
  const [paymentFee, setPaymentFee] = useState<Fee | null>(null);
  const [feeFilter, setFeeFilter] = useState<'all' | Fee['status']>('all');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setActiveTab(route.params?.initialTab ?? (canManageBilling ? 'fees' : 'history'));
  }, [canManageBilling, route.params?.initialTab]);

  useEffect(() => {
    if (!currentClass?.id) return;
    const unsubs = [
      teachflowData.subscribeToStudents(currentClass.id, setStudents, (nextError) => setError(nextError.message)),
      teachflowData.subscribeToFees(currentClass.id, setFees, (nextError) => setError(nextError.message)),
    ];
    if (canManageBilling || role === 'super_admin') {
      unsubs.push(teachflowData.subscribeToPayments(setPayments, (nextError) => setError(nextError.message)));
    }
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [canManageBilling, currentClass?.id, role]);

  useEffect(() => {
    if (!canManageBilling || !currentClass?.id) return;
    teachflowData
      .getBillingOverview(currentClass.id)
      .then(setBillingOverview)
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : 'Failed to load billing overview.'));
  }, [canManageBilling, currentClass?.id]);

  const currentStudent = useMemo(
    () => students.find((item) => item.email.toLowerCase() === (firebaseUser?.email ?? '').toLowerCase()) ?? null,
    [firebaseUser?.email, students]
  );
  const linkedStudentIds = userProfile?.linkedStudentIds ?? (userProfile?.linkedStudentId ? [userProfile.linkedStudentId] : []);
  const visibleStudentIds = canManageFees ? students.map((student) => student.id) : role === 'student' ? (currentStudent ? [currentStudent.id] : []) : linkedStudentIds;
  const visibleStudents = students.filter((student) => visibleStudentIds.includes(student.id));
  const visibleFees = fees
    .filter((fee) => visibleStudentIds.includes(fee.studentId))
    .filter((fee) => (studentFilter === 'all' ? true : fee.studentId === studentFilter))
    .filter((fee) => (feeFilter === 'all' ? true : fee.status === feeFilter))
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  const feeSummary = visibleFees.reduce(
    (summary, fee) => ({
      total: summary.total + fee.amount,
      collected: summary.collected + fee.paidAmount,
      pending: summary.pending + Math.max(fee.amount - fee.paidAmount, 0),
      dueCount: summary.dueCount + (fee.status === 'paid' ? 0 : 1),
    }),
    { total: 0, collected: 0, pending: 0, dueCount: 0 }
  );
  const historyEntries = useMemo(() => {
    const paid = visibleFees.flatMap((fee) => (fee.paymentHistory ?? []).map((payment) => ({ id: payment.id, fee, payment, type: 'paid' as const })));
    const pending = visibleFees.filter((fee) => fee.status !== 'paid').map((fee) => ({ id: `${fee.id}-pending`, fee, payment: null, type: 'pending' as const }));
    const entries = [...(historyFilter !== 'pending' ? paid : []), ...(historyFilter !== 'paid' ? pending : [])];
    return entries.sort((left, right) => new Date((right.payment?.paidDate ?? right.fee.dueDate)).getTime() - new Date((left.payment?.paidDate ?? left.fee.dueDate)).getTime());
  }, [historyFilter, visibleFees]);
  const billingPayments = billingOverview?.payments ?? payments.filter((payment) => payment.classId === currentClass?.id);
  const revenueMetrics = paymentService.getRevenueMetrics(billingPayments);

  const resetFeeForm = () => {
    setEditingFee(null);
    setFeeForm({ ...emptyFeeForm, studentId: visibleStudents[0]?.id ?? '' });
  };
  const resetPaymentForm = () => {
    setPaymentFee(null);
    setPaymentForm(emptyPaymentForm);
  };

  const saveFee = async () => {
    if (!currentClass?.id) return;
    const amount = Number(feeForm.amount);
    if (!feeForm.studentId) return setError('Please select a student.');
    if (!feeForm.description.trim()) return setError('Description is required.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Amount must be greater than zero.');
    if (!feeForm.dueDate) return setError('Due date is required.');
    const student = students.find((item) => item.id === feeForm.studentId);
    if (!student) return setError('Selected student was not found.');

    setBusyKey(editingFee ? `save:${editingFee.id}` : 'create');
    setError('');
    setSuccess('');
    try {
      if (editingFee) {
        await teachflowData.updateFee(currentClass.id, editingFee.id, {
          ...editingFee,
          studentId: student.id,
          studentName: student.name,
          amount,
          dueDate: feeForm.dueDate,
          description: feeForm.description.trim(),
          status: buildStatus(amount, editingFee.paidAmount),
        });
        setSuccess('Fee updated successfully.');
      } else {
        await teachflowData.addFee(currentClass.id, {
          studentId: student.id,
          studentName: student.name,
          amount,
          dueDate: feeForm.dueDate,
          status: 'due',
          paidAmount: 0,
          description: feeForm.description.trim(),
          paymentHistory: [],
          receiptCount: 0,
        });
        setSuccess('Fee added successfully.');
      }
      resetFeeForm();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save fee.');
    } finally {
      setBusyKey('');
    }
  };

  const startEditFee = (fee: Fee) => {
    setEditingFee(fee);
    setFeeForm({ studentId: fee.studentId, amount: String(fee.amount), dueDate: fee.dueDate, description: fee.description });
  };

  const deleteFee = (fee: Fee) => {
    if (!currentClass?.id) return;
    Alert.alert('Delete fee', `Delete ${fee.description} for ${fee.studentName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setBusyKey(`delete:${fee.id}`);
          teachflowData.deleteFee(currentClass.id, fee.id).then(() => setSuccess('Fee deleted successfully.')).catch((nextError) => {
            setError(nextError instanceof Error ? nextError.message : 'Failed to delete fee.');
          }).finally(() => setBusyKey(''));
        },
      },
    ]);
  };

  const savePayment = async () => {
    if (!currentClass?.id || !paymentFee) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Payment amount must be greater than zero.');
    if (!paymentForm.paymentDate) return setError('Payment date is required.');
    const nextPaidAmount = Math.min(paymentFee.amount, paymentFee.paidAmount + amount);
    const payment: FeePayment = {
      id: `payment-${Date.now()}`,
      amount,
      paidDate: paymentForm.paymentDate,
      method: paymentForm.paymentMethod,
      receiptNumber: `RCP-${Date.now()}`,
      notes: paymentForm.notes.trim() || undefined,
    };
    const updatedFee: Fee = {
      ...paymentFee,
      paidAmount: nextPaidAmount,
      status: buildStatus(paymentFee.amount, nextPaidAmount),
      paidDate: paymentForm.paymentDate,
      paymentDate: paymentForm.paymentDate,
      paymentMethod: paymentForm.paymentMethod,
      paymentHistory: [...(paymentFee.paymentHistory ?? []), payment],
      receiptCount: (paymentFee.receiptCount ?? 0) + 1,
    };
    setBusyKey(`payment:${paymentFee.id}`);
    setError('');
    setSuccess('');
    try {
      await teachflowData.updateFee(currentClass.id, paymentFee.id, updatedFee);
      const student = students.find((item) => item.id === paymentFee.studentId) ?? null;
      await pdfService.shareFeeReceipt(updatedFee, payment, student, currentClass);
      setSuccess('Payment saved and receipt generated.');
      resetPaymentForm();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save payment.');
    } finally {
      setBusyKey('');
    }
  };

  const shareInvoice = async (fee: Fee, payment?: FeePayment | null) => {
    try {
      const student = students.find((item) => item.id === fee.studentId) ?? null;
      await pdfService.shareInvoice({
        fee,
        payment,
        student,
        coachingClass: currentClass,
        invoiceNumber: payment?.receiptNumber ?? `INV-${fee.id.slice(0, 6).toUpperCase()}`,
      });
      setSuccess('Invoice PDF generated.');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to generate invoice.');
    }
  };

  const refreshBilling = async () => {
    if (!currentClass?.id || !canManageBilling) return;
    const overview = await teachflowData.getBillingOverview(currentClass.id);
    setBillingOverview(overview);
    await refreshAuthData();
  };

  const runBillingAction = async (key: string, action: () => Promise<void>, successMessage: string, errorMessage: string) => {
    setBusyKey(key);
    setError('');
    setSuccess('');
    try {
      await action();
      setSuccess(successMessage);
      await refreshBilling();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : errorMessage);
    } finally {
      setBusyKey('');
    }
  };

  const toggleAutoRenew = async () => {
    if (!currentClass?.id || !userProfile?.uid) return;
    const autoRenew = billingOverview?.class.autoRenew ?? currentClass.autoRenew ?? false;
    if (autoRenew) {
      const subscriptionId = billingOverview?.class.subscriptionId ?? currentClass.subscriptionId ?? '';
      await runBillingAction(
        'autorenew-off',
        async () => {
          if (subscriptionId) await paymentService.disableAutoPay(currentClass.id, userProfile.uid, subscriptionId);
          else await teachflowData.updateClassBillingState(currentClass.id, false);
        },
        'Auto-renew disabled.',
        'Failed to disable auto-renew.'
      );
      return;
    }
    await runBillingAction(
      'autorenew-on',
      async () => {
        await paymentService.enableAutoPay(currentClass.id, userProfile.uid, currentClass.name);
      },
      'Auto-renew mandate started.',
      'Failed to enable auto-renew.'
    );
  };

  const tabs: FinanceTab[] = canManageBilling ? ['fees', 'history', 'billing'] : ['fees', 'history'];

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Fees & Billing</Text>
            <Text style={styles.subtitle}>{canManageFees ? 'Fees, payments, invoices, and subscription billing.' : 'Fee status, payment history, and receipts.'}</Text>
          </View>
          <Pressable onPress={() => void logout()} style={styles.neutralButton}><Text style={styles.neutralText}>Logout</Text></Pressable>
        </View>

        <View style={styles.row}>
          {tabs.map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, activeTab === tab ? styles.tabActive : null]}>
              <Text style={[styles.tabText, activeTab === tab ? styles.tabTextActive : null]}>{tab.toUpperCase()}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
        {success ? <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View> : null}

        <View style={styles.grid}>
          <View style={styles.stat}><Text style={styles.statValue}>{formatCurrency(feeSummary.total)}</Text><Text style={styles.statLabel}>Total</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{formatCurrency(feeSummary.collected)}</Text><Text style={styles.statLabel}>Collected</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{formatCurrency(feeSummary.pending)}</Text><Text style={styles.statLabel}>Pending</Text></View>
          <View style={styles.stat}><Text style={styles.statValue}>{feeSummary.dueCount}</Text><Text style={styles.statLabel}>Open</Text></View>
        </View>

        {activeTab === 'fees' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{canManageFees ? (editingFee ? 'Edit Fee' : 'Add Fee') : 'Filters'}</Text>
              <Text style={styles.label}>Student Filter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                <Pressable onPress={() => setStudentFilter('all')} style={[styles.pill, studentFilter === 'all' ? styles.pillActive : null]}><Text style={styles.pillText}>All</Text></Pressable>
                {visibleStudents.map((student) => (
                  <Pressable key={student.id} onPress={() => setStudentFilter(student.id)} style={[styles.pill, studentFilter === student.id ? styles.pillActive : null]}><Text style={styles.pillText}>{student.name}</Text></Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>Status Filter</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {(['all', 'due', 'partial', 'paid', 'pending'] as Array<'all' | Fee['status']>).map((status) => (
                  <Pressable key={status} onPress={() => setFeeFilter(status)} style={[styles.pill, feeFilter === status ? styles.pillActive : null]}><Text style={styles.pillText}>{status}</Text></Pressable>
                ))}
              </ScrollView>

              {canManageFees ? (
                <>
                  <Text style={styles.label}>Student Id</Text>
                  <TextInput value={feeForm.studentId} onChangeText={(value) => setFeeForm((current) => ({ ...current, studentId: value }))} style={styles.input} placeholder="Student ID" />
                  <Text style={styles.label}>Amount</Text>
                  <TextInput value={feeForm.amount} onChangeText={(value) => setFeeForm((current) => ({ ...current, amount: value }))} keyboardType="numeric" style={styles.input} placeholder="Amount" />
                  <Text style={styles.label}>Due Date</Text>
                  <TextInput value={feeForm.dueDate} onChangeText={(value) => setFeeForm((current) => ({ ...current, dueDate: value }))} style={styles.input} placeholder="YYYY-MM-DD" />
                  <Text style={styles.label}>Description</Text>
                  <TextInput value={feeForm.description} onChangeText={(value) => setFeeForm((current) => ({ ...current, description: value }))} style={styles.input} placeholder="Tuition fee" />
                  <View style={styles.row}>
                    <Pressable onPress={() => void saveFee()} style={styles.primaryButton}><Text style={styles.primaryText}>{busyKey.startsWith('save:') || busyKey === 'create' ? 'Saving...' : editingFee ? 'Update Fee' : 'Add Fee'}</Text></Pressable>
                    {editingFee ? <Pressable onPress={resetFeeForm} style={styles.neutralButton}><Text style={styles.neutralText}>Cancel</Text></Pressable> : null}
                  </View>
                </>
              ) : null}
            </View>

            {visibleFees.length === 0 ? <View style={styles.card}><Text style={styles.muted}>No fee records found.</Text></View> : null}
            {visibleFees.map((fee) => (
              <View key={fee.id} style={styles.card}>
                <Text style={styles.cardTitle}>{fee.description}</Text>
                <Text style={styles.muted}>{fee.studentName} | Due {formatDate(fee.dueDate)} | {fee.status.toUpperCase()}</Text>
                <Text style={styles.metric}>Amount: {formatCurrency(fee.amount)}</Text>
                <Text style={styles.metric}>Paid: {formatCurrency(fee.paidAmount)}</Text>
                <Text style={styles.metric}>Method: {(fee.paymentMethod ?? 'manual').toUpperCase()}</Text>
                <View style={styles.row}>
                  <Pressable onPress={() => void shareInvoice(fee, fee.paymentHistory?.[fee.paymentHistory.length - 1] ?? null)} style={styles.neutralButton}><Text style={styles.neutralText}>Invoice</Text></Pressable>
                  {canManageFees ? <Pressable onPress={() => startEditFee(fee)} style={styles.neutralButton}><Text style={styles.neutralText}>Edit</Text></Pressable> : null}
                  {canManageFees ? <Pressable onPress={() => { setPaymentFee(fee); setPaymentForm({ ...emptyPaymentForm, amount: String(Math.max(fee.amount - fee.paidAmount, 0)) }); }} style={styles.neutralButton}><Text style={styles.neutralText}>{fee.status === 'paid' ? 'Add Receipt' : 'Mark Paid'}</Text></Pressable> : null}
                  {canManageFees ? <Pressable onPress={() => deleteFee(fee)} style={styles.deleteButton}><Text style={styles.deleteText}>{busyKey === `delete:${fee.id}` ? 'Deleting...' : 'Delete'}</Text></Pressable> : null}
                </View>
              </View>
            ))}

            {paymentFee ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Record Payment</Text>
                <Text style={styles.muted}>{paymentFee.studentName} | Remaining {formatCurrency(Math.max(paymentFee.amount - paymentFee.paidAmount, 0))}</Text>
                <Text style={styles.label}>Amount</Text>
                <TextInput value={paymentForm.amount} onChangeText={(value) => setPaymentForm((current) => ({ ...current, amount: value }))} keyboardType="numeric" style={styles.input} />
                <Text style={styles.label}>Payment Date</Text>
                <TextInput value={paymentForm.paymentDate} onChangeText={(value) => setPaymentForm((current) => ({ ...current, paymentDate: value }))} style={styles.input} />
                <Text style={styles.label}>Method</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                  {(['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'manual'] as FeePayment['method'][]).map((method) => (
                    <Pressable key={method} onPress={() => setPaymentForm((current) => ({ ...current, paymentMethod: method }))} style={[styles.pill, paymentForm.paymentMethod === method ? styles.pillActive : null]}><Text style={styles.pillText}>{method}</Text></Pressable>
                  ))}
                </ScrollView>
                <Text style={styles.label}>Notes</Text>
                <TextInput value={paymentForm.notes} onChangeText={(value) => setPaymentForm((current) => ({ ...current, notes: value }))} style={styles.input} placeholder="Optional notes" />
                <View style={styles.row}>
                  <Pressable onPress={() => void savePayment()} style={styles.primaryButton}><Text style={styles.primaryText}>{busyKey === `payment:${paymentFee.id}` ? 'Saving...' : 'Save Payment'}</Text></Pressable>
                  <Pressable onPress={resetPaymentForm} style={styles.neutralButton}><Text style={styles.neutralText}>Cancel</Text></Pressable>
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {activeTab === 'history' ? (
          <>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Payment History</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                {(['all', 'paid', 'pending'] as HistoryFilter[]).map((filter) => (
                  <Pressable key={filter} onPress={() => setHistoryFilter(filter)} style={[styles.pill, historyFilter === filter ? styles.pillActive : null]}><Text style={styles.pillText}>{filter}</Text></Pressable>
                ))}
              </ScrollView>
            </View>
            {historyEntries.length === 0 ? <View style={styles.card}><Text style={styles.muted}>No history records found.</Text></View> : null}
            {historyEntries.map((entry) => (
              <View key={entry.id} style={styles.card}>
                <Text style={styles.cardTitle}>{entry.fee.description}</Text>
                <Text style={styles.muted}>
                  {entry.type === 'paid'
                    ? `${entry.fee.studentName} | ${entry.payment?.method.toUpperCase()} | ${formatDate(entry.payment?.paidDate)}`
                    : `${entry.fee.studentName} | Pending until ${formatDate(entry.fee.dueDate)}`}
                </Text>
                <Text style={styles.metric}>{entry.type === 'paid' ? `Payment: ${formatCurrency(entry.payment?.amount ?? 0)}` : `Outstanding: ${formatCurrency(entry.fee.amount - entry.fee.paidAmount)}`}</Text>
                <Pressable onPress={() => void shareInvoice(entry.fee, entry.payment)} style={styles.neutralButton}><Text style={styles.neutralText}>{entry.type === 'paid' ? 'Receipt PDF' : 'Invoice PDF'}</Text></Pressable>
              </View>
            ))}
          </>
        ) : null}

        {activeTab === 'billing' && canManageBilling ? (
          <>
            <View style={styles.grid}>
              <View style={styles.stat}><Text style={styles.statValue}>{(billingOverview?.class.plan ?? currentClass?.plan ?? 'free').toUpperCase()}</Text><Text style={styles.statLabel}>Plan</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{formatDate(billingOverview?.class.planExpiry ?? currentClass?.planExpiry)}</Text><Text style={styles.statLabel}>Expiry</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{formatDate(billingOverview?.class.nextBillingDate ?? currentClass?.nextBillingDate)}</Text><Text style={styles.statLabel}>Next Billing</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{billingOverview?.class.autoRenew ?? currentClass?.autoRenew ? 'ON' : 'OFF'}</Text><Text style={styles.statLabel}>Auto Renew</Text></View>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Subscription Controls</Text>
              <Text style={styles.muted}>Razorpay order creation and verification are handled only through backend functions.</Text>
              <View style={styles.row}>
                <Pressable onPress={() => void runBillingAction('upgrade-standard', async () => { if (currentClass?.id && userProfile?.uid) await paymentService.upgradePlan(currentClass.id, 'standard', userProfile.uid); }, 'Standard plan payment completed.', 'Failed to upgrade.')} style={styles.primaryButton}><Text style={styles.primaryText}>{busyKey === 'upgrade-standard' ? 'Processing...' : 'Upgrade Standard'}</Text></Pressable>
                <Pressable onPress={() => void runBillingAction('upgrade-pro', async () => { if (currentClass?.id && userProfile?.uid) await paymentService.upgradePlan(currentClass.id, 'pro', userProfile.uid); }, 'Pro plan payment completed.', 'Failed to upgrade.')} style={styles.primaryButton}><Text style={styles.primaryText}>{busyKey === 'upgrade-pro' ? 'Processing...' : 'Upgrade Pro'}</Text></Pressable>
              </View>
              <View style={styles.row}>
                <Pressable onPress={() => void toggleAutoRenew()} style={styles.neutralButton}><Text style={styles.neutralText}>{busyKey === 'autorenew-on' || busyKey === 'autorenew-off' ? 'Updating...' : billingOverview?.class.autoRenew ?? currentClass?.autoRenew ? 'Disable Auto Renew' : 'Enable Auto Renew'}</Text></Pressable>
                <Pressable onPress={() => void refreshBilling()} style={styles.neutralButton}><Text style={styles.neutralText}>Refresh</Text></Pressable>
              </View>
              <Text style={styles.muted}>Expo app me actual Razorpay checkout ke liye native dev build / prebuild required hai.</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Revenue Snapshot</Text>
              <Text style={styles.metric}>Paid Payments: {revenueMetrics.paidCount}</Text>
              <Text style={styles.metric}>Failed Payments: {revenueMetrics.failedCount}</Text>
              <Text style={styles.metric}>Revenue: {formatCurrency(revenueMetrics.revenue / 100)}</Text>
              <Text style={styles.metric}>Failed Attempts: {billingOverview?.class.failedAttemptsCount ?? currentClass?.failedAttemptsCount ?? 0}</Text>
            </View>
            {billingPayments.map((payment) => (
              <View key={payment.id} style={styles.card}>
                <Text style={styles.cardTitle}>{payment.plan.toUpperCase()} payment</Text>
                <Text style={styles.muted}>Order {payment.orderId} | {payment.status.toUpperCase()} | {formatDate(payment.createdAt)}</Text>
                <Text style={styles.metric}>Amount: {formatCurrency(payment.amount / 100)}</Text>
                {payment.failureReason ? <Text style={styles.metric}>Failure: {paymentService.getFailureLabel(payment.failureReason)}</Text> : null}
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '48%', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase' },
  tab: { flex: 1, minWidth: 90, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb', alignItems: 'center' },
  tabActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#374151' },
  tabTextActive: { color: '#fff' },
  card: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  muted: { fontSize: 13, color: '#6b7280' },
  metric: { fontSize: 14, color: '#374151' },
  label: { fontSize: 12, fontWeight: '700', color: '#4b5563', textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff' },
  pill: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  pillActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#1f2937' },
  primaryButton: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#2563eb' },
  primaryText: { color: '#fff', fontWeight: '700' },
  neutralButton: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#e5e7eb' },
  neutralText: { color: '#111827', fontWeight: '600' },
  deleteButton: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 10, backgroundColor: '#fee2e2' },
  deleteText: { color: '#b91c1c', fontWeight: '700' },
  errorBox: { padding: 12, borderRadius: 10, backgroundColor: '#fee2e2' },
  errorText: { color: '#b91c1c', fontWeight: '600' },
  successBox: { padding: 12, borderRadius: 10, backgroundColor: '#dcfce7' },
  successText: { color: '#166534', fontWeight: '600' },
});
