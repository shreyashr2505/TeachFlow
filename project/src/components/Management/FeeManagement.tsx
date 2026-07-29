import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, DollarSign, Download } from 'lucide-react';
import { Fee, FeePayment, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';
import StyledSelect from '../Common/StyledSelect';
import { isPositiveNumber, validateRequired } from '../../utils/validation';
import { notificationService } from '../../services/notificationService';
import { pdfService } from '../../services/pdfService';

const FeeManagement: React.FC = () => {
  const { currentClass, user } = useAuth();
  const [fees, setFees] = useState<Fee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [editingFee, setEditingFee] = useState<Fee | null>(null);
  const [paymentFee, setPaymentFee] = useState<Fee | null>(null);
  const [newFee, setNewFee] = useState({
    studentId: '',
    amount: 15000,
    dueDate: '',
    description: '',
    batch: 'Batch A',
  });
  const [paymentData, setPaymentData] = useState({
    amount: 0,
    paymentDate: '',
    paymentMethod: 'cash' as FeePayment['method'],
    notes: '',
  });

  useEffect(() => {
    if (!currentClass?.id) return;
    setIsLoading(true);
    const unsubs = [
      firebaseService.subscribeToFees(
        currentClass.id,
        (data) => {
          setFees(data);
          setIsLoading(false);
        },
        (err) => {
          setError(err.message);
          setIsLoading(false);
        }
      ),
      firebaseService.subscribeToStudents(currentClass.id, setStudents, (err) => setError(err.message)),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [currentClass?.id]);

  const batches = useMemo(
    () =>
      Array.from(new Set(students.map((student) => student.batch))).length
        ? Array.from(new Set(students.map((student) => student.batch)))
        : ['Batch A', 'Batch B', 'Batch C'],
    [students]
  );

  const filteredFees = fees.filter((fee) => {
    const matchesSearch =
      fee.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fee.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || fee.status === selectedStatus;
    const student = students.find((item) => item.id === fee.studentId);
    const matchesBatch = selectedBatch === 'all' || student?.batch === selectedBatch;
    return matchesSearch && matchesStatus && matchesBatch;
  });

  const stats = useMemo(() => {
    const total = filteredFees.reduce((sum, fee) => sum + fee.amount, 0);
    const collected = filteredFees.reduce((sum, fee) => sum + fee.paidAmount, 0);
    const pending = total - collected;
    const paymentRecords = filteredFees.reduce((sum, fee) => sum + (fee.paymentHistory?.length ?? 0), 0);
    const collectionRate = total > 0 ? Math.round((collected / total) * 100) : 0;
    return { total, collected, pending, paymentRecords, collectionRate };
  }, [filteredFees]);

  const getStudentsForBatch = () => students.filter((student) => newFee.batch === 'all' || student.batch === newFee.batch);

  const resetForm = () => {
    setEditingFee(null);
    setNewFee({
      studentId: '',
      amount: 15000,
      dueDate: '',
      description: '',
      batch: batches[0] ?? 'Batch A',
    });
    setShowAddModal(false);
  };

  const buildStatusFromAmount = (amount: number, paidAmount: number): Fee['status'] => {
    if (paidAmount <= 0) return 'due';
    if (paidAmount >= amount) return 'paid';
    return 'partial';
  };

  const handleSaveFee = async () => {
    if (!currentClass?.id || !user) return;
    setError('');
    setSuccess('');

    const descriptionError = validateRequired('Description', newFee.description);
    if (descriptionError) return setError(descriptionError);
    if (!newFee.studentId) return setError('Please select a student.');
    if (!isPositiveNumber(newFee.amount) || newFee.amount <= 0) return setError('Amount must be greater than zero.');
    if (!newFee.dueDate) return setError('Due date is required.');

    const student = students.find((item) => item.id === newFee.studentId);
    if (!student) return setError('Selected student was not found.');

    try {
      if (editingFee) {
        await firebaseService.updateFee(currentClass.id, editingFee.id, {
          ...editingFee,
          amount: newFee.amount,
          dueDate: newFee.dueDate,
          description: newFee.description,
          studentId: newFee.studentId,
          studentName: student.name,
          status: buildStatusFromAmount(newFee.amount, editingFee.paidAmount),
        });
        await firebaseService.createAuditLog(currentClass.id, {
          actorId: user.id,
          actorName: user.name,
          action: 'updated fee',
          entityType: 'fee',
          entityId: editingFee.id,
          metadata: { studentName: student.name, amount: newFee.amount },
        });
        setSuccess('Fee updated successfully.');
      } else {
        const created = await firebaseService.addFee(currentClass.id, {
          studentId: newFee.studentId,
          studentName: student.name,
          amount: newFee.amount,
          dueDate: newFee.dueDate,
          status: 'due',
          paidAmount: 0,
          description: newFee.description,
          paymentHistory: [],
          receiptCount: 0,
        });
        await firebaseService.createAuditLog(currentClass.id, {
          actorId: user.id,
          actorName: user.name,
          action: 'created fee',
          entityType: 'fee',
          entityId: created.id,
          metadata: { studentName: student.name, amount: newFee.amount },
        });
        if (student.parentEmail) {
          await notificationService.queueFeeReminder(currentClass.id, student.parentEmail, student.name, newFee.amount);
        }
        setSuccess('Fee created and reminder queued.');
      }
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fee.');
    }
  };

  const handleDeleteFee = async (id: string) => {
    if (!currentClass?.id || !user || !window.confirm('Are you sure you want to delete this fee record?')) return;
    try {
      await firebaseService.deleteFee(currentClass.id, id);
      await firebaseService.createAuditLog(currentClass.id, {
        actorId: user.id,
        actorName: user.name,
        action: 'deleted fee',
        entityType: 'fee',
        entityId: id,
      });
      setSuccess('Fee deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete fee.');
    }
  };

  const processPayment = async () => {
    if (!currentClass?.id || !paymentFee || !user) return;
    if (!isPositiveNumber(paymentData.amount) || paymentData.amount <= 0) return setError('Payment amount must be greater than zero.');
    if (!paymentData.paymentDate) return setError('Payment date is required.');

    try {
      const receiptNumber = `RCP-${Date.now()}`;
      const newPaidAmount = paymentFee.paidAmount + paymentData.amount;
      const newStatus = buildStatusFromAmount(paymentFee.amount, newPaidAmount);
      const nextPayment: FeePayment = {
        id: `payment-${Date.now()}`,
        amount: paymentData.amount,
        paidDate: paymentData.paymentDate,
        method: paymentData.paymentMethod,
        receiptNumber,
        notes: paymentData.notes.trim() || undefined,
      };

      await firebaseService.updateFee(currentClass.id, paymentFee.id, {
        paidAmount: newPaidAmount,
        status: newStatus,
        paidDate: paymentData.paymentDate,
        paymentHistory: [...(paymentFee.paymentHistory ?? []), nextPayment],
        receiptCount: (paymentFee.receiptCount ?? 0) + 1,
      });

      await firebaseService.createAuditLog(currentClass.id, {
        actorId: user.id,
        actorName: user.name,
        action: 'recorded payment',
        entityType: 'fee',
        entityId: paymentFee.id,
        metadata: { amount: paymentData.amount, receiptNumber },
      });

      pdfService.downloadFeeReceipt(
        {
          ...paymentFee,
          paidAmount: newPaidAmount,
          status: newStatus,
          paidDate: paymentData.paymentDate,
        },
        nextPayment,
        students.find((item) => item.id === paymentFee.studentId),
        currentClass
      );

      setShowPaymentModal(false);
      setPaymentFee(null);
      setPaymentData({ amount: 0, paymentDate: '', paymentMethod: 'cash', notes: '' });
      setSuccess('Payment recorded and receipt downloaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'due':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">Loading fees...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fee Management</h1>
          <p className="text-gray-600 mt-2">Manage student fees, payment history, receipts, and reminders.</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all">
          <Plus className="h-5 w-5" />
          <span>Add Fee</span>
        </button>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Total Fees</div><div className="mt-2 text-2xl font-bold text-gray-900">₹{stats.total.toLocaleString()}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Collected</div><div className="mt-2 text-2xl font-bold text-green-700">₹{stats.collected.toLocaleString()}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Pending</div><div className="mt-2 text-2xl font-bold text-orange-700">₹{stats.pending.toLocaleString()}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Collection Rate</div><div className="mt-2 text-2xl font-bold text-blue-700">{stats.collectionRate}%</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Payment Records</div><div className="mt-2 text-2xl font-bold text-purple-700">{stats.paymentRecords}</div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input type="text" placeholder="Search students or fees..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-4">
            <StyledSelect value={selectedStatus} onChange={setSelectedStatus} options={[{ value: 'all', label: 'All Status' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'due', label: 'Due' }]} />
            <StyledSelect value={selectedBatch} onChange={setSelectedBatch} options={[{ value: 'all', label: 'All Batches' }, ...batches.map((batch) => ({ value: batch, label: batch }))]} />
          </div>
        </div>
      </div>

      {filteredFees.length === 0 ? (
        <EmptyState title="No fee records yet" description="Create the first fee plan to start tracking collections and receipts." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fee Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">History</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredFees.map((fee) => {
                  const student = students.find((item) => item.id === fee.studentId);
                  const latestPayment = fee.paymentHistory?.[fee.paymentHistory.length - 1];
                  return (
                    <tr key={fee.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center"><div className="h-10 w-10 rounded-full bg-gradient-to-r from-green-500 to-blue-500 flex items-center justify-center"><DollarSign className="h-5 w-5 text-white" /></div><div className="ml-4"><div className="text-sm font-medium text-gray-900">{fee.studentName}</div><div className="text-sm text-gray-500">{student?.batch} • {student?.rollNumber}</div></div></div></td>
                      <td className="px-6 py-4"><div className="text-sm text-gray-900">{fee.description}</div><div className="text-xs text-gray-500">Due {new Date(fee.dueDate).toLocaleDateString()}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-bold text-gray-900">₹{fee.amount.toLocaleString()}</div><div className="text-xs text-green-600">Paid: ₹{fee.paidAmount.toLocaleString()}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900">{fee.paymentHistory?.length ?? 0} payments</div><div className="text-xs text-gray-500">{latestPayment ? `${latestPayment.method} on ${new Date(latestPayment.paidDate).toLocaleDateString()}` : 'No payments yet'}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(fee.status)}`}>{fee.status.charAt(0).toUpperCase() + fee.status.slice(1)}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          {fee.status !== 'paid' && <button onClick={() => { setPaymentFee(fee); setPaymentData({ amount: fee.amount - fee.paidAmount, paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'cash', notes: '' }); setShowPaymentModal(true); }} className="text-green-600 hover:text-green-900 p-1 hover:bg-green-50 rounded" title="Record Payment"><DollarSign className="h-4 w-4" /></button>}
                          {latestPayment && <button onClick={() => pdfService.downloadFeeReceipt(fee, latestPayment, student, currentClass)} className="text-purple-600 hover:text-purple-900 p-1 hover:bg-purple-50 rounded" title="Download Receipt"><Download className="h-4 w-4" /></button>}
                          <button onClick={() => { setEditingFee(fee); const studentBatch = student?.batch || batches[0] || 'Batch A'; setNewFee({ studentId: fee.studentId, amount: fee.amount, dueDate: fee.dueDate, description: fee.description, batch: studentBatch }); setShowAddModal(true); }} className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded"><Edit className="h-4 w-4" /></button>
                          <button onClick={() => void handleDeleteFee(fee.id)} className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 px-4 py-6">
          <div className="my-auto flex bg-white rounded-xl p-6 w-full max-w-2xl max-h-[calc(100vh-3rem)] flex-col overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingFee ? 'Edit Fee' : 'Add New Fee'}</h2>
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Batch</label><StyledSelect value={newFee.batch} onChange={(value) => setNewFee({ ...newFee, batch: value, studentId: '' })} options={batches.map((batch) => ({ value: batch, label: batch }))} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Student</label><StyledSelect value={newFee.studentId} onChange={(value) => setNewFee({ ...newFee, studentId: value })} options={[{ value: '', label: 'Select Student' }, ...getStudentsForBatch().map((student) => ({ value: student.id, label: `${student.name} (${student.rollNumber})` }))]} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label><input type="text" value={newFee.description} onChange={(e) => setNewFee({ ...newFee, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label><input type="number" value={newFee.amount} onChange={(e) => setNewFee({ ...newFee, amount: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label><input type="date" value={newFee.dueDate} onChange={(e) => setNewFee({ ...newFee, dueDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              </div>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button onClick={() => void handleSaveFee()} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all">{editingFee ? 'Update' : 'Add'} Fee</button>
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && paymentFee && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black bg-opacity-50 px-4 py-6">
          <div className="my-auto flex bg-white rounded-xl p-6 w-full max-w-md max-h-[calc(100vh-3rem)] flex-col overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Record Payment</h2>
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-medium text-gray-900">{paymentFee.studentName}</h3>
                <p className="text-sm text-gray-600">{paymentFee.description}</p>
                <div className="mt-2"><span className="text-sm text-gray-600">Total: ₹{paymentFee.amount.toLocaleString()}</span><br /><span className="text-sm text-gray-600">Paid: ₹{paymentFee.paidAmount.toLocaleString()}</span><br /><span className="text-sm font-medium text-red-600">Remaining: ₹{(paymentFee.amount - paymentFee.paidAmount).toLocaleString()}</span></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Amount (₹)</label><input type="number" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" max={paymentFee.amount - paymentFee.paidAmount} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label><input type="date" value={paymentData.paymentDate} onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label><StyledSelect value={paymentData.paymentMethod} onChange={(value) => setPaymentData({ ...paymentData, paymentMethod: value as FeePayment['method'] })} options={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cheque', label: 'Cheque' }]} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              {(paymentFee.paymentHistory?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Payment History</h3>
                  <div className="mt-3 space-y-2">
                    {(paymentFee.paymentHistory ?? []).slice().reverse().map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between text-sm">
                        <div>{payment.method} • {new Date(payment.paidDate).toLocaleDateString()}</div>
                        <div className="font-medium">₹{payment.amount.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button onClick={() => void processPayment()} className="px-4 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all">Record Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeManagement;
