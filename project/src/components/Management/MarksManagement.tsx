import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Edit, Trash2, Trophy, TrendingUp, Download } from 'lucide-react';
import { Marks, Student } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';
import StyledSelect from '../Common/StyledSelect';
import { isPositiveNumber, validateRequired } from '../../utils/validation';
import { pdfService } from '../../services/pdfService';

const MarksManagement: React.FC = () => {
  const { currentClass, user } = useAuth();
  const [marks, setMarks] = useState<Marks[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [selectedBatch, setSelectedBatch] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMarks, setEditingMarks] = useState<Marks | null>(null);
  const [recentAddSuccess, setRecentAddSuccess] = useState(false);
  const [newMarks, setNewMarks] = useState({
    studentId: '',
    subject: 'Mathematics',
    examType: 'Unit Test',
    examName: '',
    totalMarks: 100,
    obtainedMarks: 0,
    date: '',
    batch: 'Batch A',
  });

  useEffect(() => {
    if (!currentClass?.id) return;
    setIsLoading(true);
    const unsubs = [
      firebaseService.subscribeToMarks(
        currentClass.id,
        (data) => {
          setMarks(data);
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

  const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
  const batches = useMemo(
    () =>
      Array.from(new Set(students.map((student) => student.batch))).length
        ? Array.from(new Set(students.map((student) => student.batch)))
        : ['Batch A', 'Batch B', 'Batch C'],
    [students]
  );
  const examTypes = ['Unit Test', 'Quiz', 'Assignment', 'Mid Term', 'Final Exam'];
  const existingExamOptions = useMemo(
    () =>
      Array.from(
        new Map(
          marks
            .filter((mark) => newMarks.batch === 'all' || mark.batch === newMarks.batch)
            .map((mark) => [
              `${mark.examName}__${mark.date}`,
              {
                value: `${mark.examName}__${mark.date}`,
                label: `${mark.examName} • ${mark.examType} • ${new Date(mark.date).toLocaleDateString('en-IN')}`,
                examName: mark.examName,
                examType: mark.examType,
                date: mark.date,
              },
            ])
        ).values()
      ),
    [marks, newMarks.batch]
  );

  const filteredMarks = marks.filter((mark) => {
    const matchesSearch =
      mark.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      mark.examName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'all' || mark.subject === selectedSubject;
    const matchesBatch = selectedBatch === 'all' || mark.batch === selectedBatch;
    return matchesSearch && matchesSubject && matchesBatch;
  });

  const analytics = useMemo(() => {
    const totalObtained = filteredMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
    const totalMarks = filteredMarks.reduce((sum, item) => sum + item.totalMarks, 0);
    const overallAverage = totalMarks > 0 ? Math.round((totalObtained / totalMarks) * 100) : 0;
    const subjectAverages = subjects.map((subject) => {
      const subjectMarks = filteredMarks.filter((item) => item.subject === subject);
      const subjectTotal = subjectMarks.reduce((sum, item) => sum + item.totalMarks, 0);
      const subjectObtained = subjectMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
      return {
        subject,
        average: subjectTotal > 0 ? Math.round((subjectObtained / subjectTotal) * 100) : 0,
      };
    });
    const studentScores = students.map((student) => {
      const studentMarks = filteredMarks.filter((item) => item.studentId === student.id);
      const studentTotal = studentMarks.reduce((sum, item) => sum + item.totalMarks, 0);
      const studentObtained = studentMarks.reduce((sum, item) => sum + item.obtainedMarks, 0);
      return {
        student,
        score: studentTotal > 0 ? Math.round((studentObtained / studentTotal) * 100) : 0,
      };
    }).sort((a, b) => b.score - a.score);

    return {
      overallAverage,
      subjectAverages,
      topStudent: studentScores[0],
    };
  }, [filteredMarks, students]);

  const getStudentsForBatch = () => students.filter((student) => newMarks.batch === 'all' || student.batch === newMarks.batch);

  const resetForm = () => {
    setEditingMarks(null);
    setRecentAddSuccess(false);
    setNewMarks({
      studentId: '',
      subject: 'Mathematics',
      examType: 'Unit Test',
      examName: '',
      totalMarks: 100,
      obtainedMarks: 0,
      date: '',
      batch: batches[0] ?? 'Batch A',
    });
    setShowAddModal(false);
  };

  const clearForNextEntry = () => {
    setNewMarks((prev) => ({
      ...prev,
      studentId: '',
      obtainedMarks: 0,
    }));
    setRecentAddSuccess(true);
    window.setTimeout(() => setRecentAddSuccess(false), 2000);
  };

  const handleSaveMarks = async () => {
    if (!currentClass?.id || !user) return;
    setError('');
    setSuccess('');
    const examError = validateRequired('Exam name', newMarks.examName);
    if (examError) return setError(examError);
    if (!newMarks.studentId) return setError('Please select a student.');
    if (!newMarks.date) return setError('Please select an exam date.');
    if (!isPositiveNumber(newMarks.totalMarks) || newMarks.totalMarks <= 0) return setError('Total marks must be greater than zero.');
    if (!isPositiveNumber(newMarks.obtainedMarks) || newMarks.obtainedMarks > newMarks.totalMarks) return setError('Obtained marks must be between 0 and total marks.');

    const student = students.find((item) => item.id === newMarks.studentId);
    if (!student) return setError('Selected student was not found.');

    try {
      if (editingMarks) {
        await firebaseService.updateMarks(currentClass.id, editingMarks.id, {
          ...editingMarks,
          ...newMarks,
          studentName: student.name,
          teacherId: user.id,
        });
        await firebaseService.createAuditLog(currentClass.id, {
          actorId: user.id,
          actorName: user.name,
          action: 'updated marks',
          entityType: 'marks',
          entityId: editingMarks.id,
          metadata: { studentName: student.name, examName: newMarks.examName },
        });
        setSuccess('Marks updated successfully.');
        resetForm();
      } else {
        const created = await firebaseService.addMarks(currentClass.id, {
          ...newMarks,
          studentName: student.name,
          teacherId: user.id,
        });
        await firebaseService.createAuditLog(currentClass.id, {
          actorId: user.id,
          actorName: user.name,
          action: 'added marks',
          entityType: 'marks',
          entityId: created.id,
          metadata: { studentName: student.name, examName: newMarks.examName },
        });
        setSuccess('Marks added successfully.');
        clearForNextEntry();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save marks.');
    }
  };

  const handleDeleteMarks = async (id: string) => {
    if (!currentClass?.id || !user || !window.confirm('Are you sure you want to delete these marks?')) return;
    try {
      await firebaseService.deleteMarks(currentClass.id, id);
      await firebaseService.createAuditLog(currentClass.id, {
        actorId: user.id,
        actorName: user.name,
        action: 'deleted marks',
        entityType: 'marks',
        entityId: id,
      });
      setSuccess('Marks deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete marks.');
    }
  };

  const getGradeColor = (percentage: number) => {
    if (percentage >= 90) return 'text-green-600 bg-green-100';
    if (percentage >= 75) return 'text-blue-600 bg-blue-100';
    if (percentage >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  if (isLoading) {
    return <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-gray-500">Loading marks...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marks Management</h1>
          <p className="text-gray-600 mt-2">Enter marks, compare performance, and export report cards.</p>
        </div>
        <button onClick={() => { setRecentAddSuccess(false); setShowAddModal(true); }} className="flex items-center space-x-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all">
          <Plus className="h-5 w-5" />
          <span>Add Marks</span>
        </button>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Overall Average</div><div className="mt-2 text-2xl font-bold text-blue-700">{analytics.overallAverage}%</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Entries</div><div className="mt-2 text-2xl font-bold text-gray-900">{filteredMarks.length}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Top Student</div><div className="mt-2 text-lg font-bold text-green-700">{analytics.topStudent?.student.name ?? 'NA'}</div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6"><div className="text-sm font-medium text-gray-600">Best Subject</div><div className="mt-2 text-lg font-bold text-purple-700">{analytics.subjectAverages.sort((a, b) => b.average - a.average)[0]?.subject ?? 'NA'}</div></div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input type="text" placeholder="Search students or exams..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-4">
            <StyledSelect value={selectedSubject} onChange={setSelectedSubject} options={[{ value: 'all', label: 'All Subjects' }, ...subjects.map((subject) => ({ value: subject, label: subject }))]} />
            <StyledSelect value={selectedBatch} onChange={setSelectedBatch} options={[{ value: 'all', label: 'All Batches' }, ...batches.map((batch) => ({ value: batch, label: batch }))]} />
          </div>
        </div>
      </div>

      {filteredMarks.length === 0 ? (
        <EmptyState title="No marks records yet" description="Add the first exam result to start building subject analytics and report cards." />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Exam Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marks</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Percentage</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMarks.map((mark) => {
                  const percentage = (mark.obtainedMarks / mark.totalMarks) * 100;
                  const student = students.find((item) => item.id === mark.studentId);
                  return (
                    <tr key={mark.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                            <Trophy className="h-5 w-5 text-white" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">{mark.studentName}</div>
                            <div className="text-sm text-gray-500">{mark.batch}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900">{mark.examName}</div><div className="text-sm text-gray-500">{mark.subject} • {mark.examType}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-bold text-gray-900">{mark.obtainedMarks}/{mark.totalMarks}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getGradeColor(percentage)}`}>{percentage.toFixed(1)}%</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(mark.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          {student && <button onClick={() => pdfService.downloadStudentReport(student, marks.filter((item) => item.studentId === student.id), currentClass)} className="text-purple-600 hover:text-purple-900 p-1 hover:bg-purple-50 rounded"><Download className="h-4 w-4" /></button>}
                          <button onClick={() => { setEditingMarks(mark); setRecentAddSuccess(false); setNewMarks({ studentId: mark.studentId, subject: mark.subject, examType: mark.examType, examName: mark.examName, totalMarks: mark.totalMarks, obtainedMarks: mark.obtainedMarks, date: mark.date, batch: mark.batch }); setShowAddModal(true); }} className="text-blue-600 hover:text-blue-900 p-1 hover:bg-blue-50 rounded"><Edit className="h-4 w-4" /></button>
                          <button onClick={() => void handleDeleteMarks(mark.id)} className="text-red-600 hover:text-red-900 p-1 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4" /></button>
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
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{editingMarks ? 'Edit Marks' : 'Add New Marks'}</h2>
            <div className="flex-1 overflow-y-auto pr-2">
              <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Batch</label><StyledSelect value={newMarks.batch} onChange={(value) => setNewMarks({ ...newMarks, batch: value, studentId: '' })} options={batches.map((batch) => ({ value: batch, label: batch }))} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Student</label><StyledSelect value={newMarks.studentId} onChange={(value) => setNewMarks({ ...newMarks, studentId: value })} options={[{ value: '', label: 'Select Student' }, ...getStudentsForBatch().map((student) => ({ value: student.id, label: `${student.name} (${student.rollNumber})` }))]} /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Subject</label><StyledSelect value={newMarks.subject} onChange={(value) => setNewMarks({ ...newMarks, subject: value })} options={subjects.map((subject) => ({ value: subject, label: subject }))} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Exam Type</label><StyledSelect searchable searchPlaceholder="Search exam type" value={newMarks.examType} onChange={(value) => setNewMarks({ ...newMarks, examType: value })} options={examTypes.map((type) => ({ value: type, label: type }))} /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Search Existing Exam</label><StyledSelect searchable searchPlaceholder="Search existing exams" value="" onChange={(value) => { const found = existingExamOptions.find((option) => option.value === value); if (!found) return; setNewMarks((prev) => ({ ...prev, examName: found.examName, examType: found.examType, date: found.date })); }} options={[{ value: '', label: 'Select to autofill' }, ...existingExamOptions.map((option) => ({ value: option.value, label: option.label }))]} /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Exam Name</label><input type="text" value={newMarks.examName} onChange={(e) => setNewMarks({ ...newMarks, examName: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Total Marks</label><input type="number" value={newMarks.totalMarks} onChange={(e) => setNewMarks({ ...newMarks, totalMarks: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" min="1" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Obtained Marks</label><input type="number" value={newMarks.obtainedMarks} onChange={(e) => setNewMarks({ ...newMarks, obtainedMarks: Number(e.target.value) })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" min="0" max={newMarks.totalMarks} /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Date</label><input type="date" value={newMarks.date} onChange={(e) => setNewMarks({ ...newMarks, date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
              </div>
              {newMarks.totalMarks > 0 && <div className="bg-blue-50 p-4 rounded-lg"><div className="flex items-center space-x-2"><TrendingUp className="h-5 w-5 text-blue-600" /><span className="font-medium text-blue-900">Percentage: {((newMarks.obtainedMarks / newMarks.totalMarks) * 100).toFixed(1)}%</span></div></div>}
              {!editingMarks && recentAddSuccess ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
                  Marks added successfully. Continue adding marks without leaving this screen.
                </div>
              ) : null}
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">Cancel</button>
              <button onClick={() => void handleSaveMarks()} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all">{editingMarks ? 'Update Marks' : recentAddSuccess ? '✔ Marks Added' : 'Add Marks'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarksManagement;
