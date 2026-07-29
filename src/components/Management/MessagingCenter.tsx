import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquare, Send, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { firebaseService } from '../../services/firebaseService';
import FeedbackMessage from '../Common/FeedbackMessage';
import EmptyState from '../Common/EmptyState';
import { Message, Teacher, User } from '../../types';

const MessagingCenter: React.FC = () => {
  const { user, currentClass } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [classUsers, setClassUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formData, setFormData] = useState({
    toUserId: '',
    subject: '',
    message: '',
  });

  useEffect(() => {
    if (!currentClass?.id || !user) return;
    const messageUnsub = user?.role === 'admin'
      ? firebaseService.subscribeToMessagesForClass(currentClass.id, setMessages, (err) => setError(err.message))
      : undefined;
    const inboxUnsub = user && user.role !== 'admin'
      ? firebaseService.subscribeToMessagesForUser(currentClass.id, user.id, (incoming) => {
          setMessages((prev) => {
            const sentMessages = prev.filter((item) => item.fromUserId === user.id);
            const merged = [...incoming, ...sentMessages];
            return merged.filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index);
          });
        }, (err) => setError(err.message))
      : undefined;
    const sentUnsub = user && user.role !== 'admin'
      ? firebaseService.subscribeToMessagesSentByUser(currentClass.id, user.id, (sent) => {
          setMessages((prev) => {
            const inboxMessages = prev.filter((item) => item.toUserId === user.id);
            const merged = [...inboxMessages, ...sent];
            return merged.filter((item, index, all) => all.findIndex((entry) => entry.id === item.id) === index);
          });
        }, (err) => setError(err.message))
      : undefined;

    let usersUnsub: (() => void) | undefined;
    let isMounted = true;

    const loadRecipients = async () => {
      setError('');

      if (user.role === 'admin') {
        usersUnsub = firebaseService.subscribeToClassUsers(currentClass.id, setClassUsers, (err) => setError(err.message));
        return;
      }

      try {
        const adminUser = await firebaseService.getUserProfile(currentClass.adminId);
        if (!isMounted) return;

        const adminRecipients = adminUser ? [adminUser] : [];

        if (user.role === 'teacher') {
          setClassUsers(adminRecipients);
          return;
        }

        usersUnsub = firebaseService.subscribeToTeachers(
          currentClass.id,
          (teachers) => {
            if (!isMounted) return;
            const teacherRecipients: User[] = teachers.map((teacher: Teacher) => ({
              id: teacher.id,
              name: teacher.name,
              email: teacher.email,
              role: 'teacher',
              approved: true,
              createdAt: teacher.joinedAt,
              classId: teacher.classId,
              classIds: [teacher.classId],
              activeClassId: teacher.classId,
            }));
            setClassUsers([...adminRecipients, ...teacherRecipients]);
          },
          (err) => setError(err.message)
        );
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load message recipients.');
      }
    };

    void loadRecipients();

    return () => {
      isMounted = false;
      messageUnsub?.();
      inboxUnsub?.();
      sentUnsub?.();
      usersUnsub?.();
    };
  }, [currentClass?.adminId, currentClass?.id, user]);

  const recipientOptions = useMemo(() => {
    if (!user) return [];

    if (user.role === 'admin') {
      return classUsers.filter((item) => item.id !== user.id);
    }

    if (user.role === 'teacher') {
      return classUsers.filter((item) => item.role === 'admin');
    }

    return classUsers.filter((item) => item.role === 'admin' || item.role === 'teacher');
  }, [classUsers, user]);

  const visibleMessages = useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return messages;
    return messages.filter((item) => item.toUserId === user.id || item.fromUserId === user.id);
  }, [messages, user]);

  const handleSend = async () => {
    if (!user || !currentClass?.id) return;
    if (!formData.toUserId || !formData.message.trim()) {
      setError('Please choose a recipient and enter a message.');
      return;
    }

    const recipient = classUsers.find((item) => item.id === formData.toUserId);
    if (!recipient) {
      setError('Selected recipient was not found.');
      return;
    }

    try {
      await firebaseService.createMessage({
        classId: currentClass.id,
        fromUserId: user.id,
        fromUserName: user.name,
        fromRole: user.role,
        toUserId: recipient.id,
        toRole: recipient.role,
        subject: formData.subject.trim() || undefined,
        message: formData.message.trim(),
      });
      setFormData({ toUserId: '', subject: '', message: '' });
      setSuccess('Message sent successfully.');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messaging</h1>
          <p className="mt-2 text-gray-600">
            {user?.role === 'admin'
              ? 'See all branch conversations and reply to students, parents, and teachers.'
              : 'Send questions, complaints, or updates to the right people in your class.'}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500">Messages</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{visibleMessages.length}</div>
        </div>
      </div>

      <FeedbackMessage type="error" message={error} />
      <FeedbackMessage type="success" message={success} />

      <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Send Message</h2>
              <p className="text-sm text-gray-500">Students and parents can contact admins and teachers. Teachers can contact admins.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Recipient</label>
              <select
                value={formData.toUserId}
                onChange={(event) => setFormData((prev) => ({ ...prev, toUserId: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select recipient</option>
                {recipientOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Subject</label>
              <input
                type="text"
                value={formData.subject}
                onChange={(event) => setFormData((prev) => ({ ...prev, subject: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Complaint, leave request, fees query..."
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Message</label>
              <textarea
                value={formData.message}
                onChange={(event) => setFormData((prev) => ({ ...prev, message: event.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={6}
                placeholder="Type your message here..."
              />
            </div>

            <button
              onClick={() => void handleSend()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 font-medium text-white hover:from-blue-700 hover:to-purple-700"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Send Message</span>
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Conversation Feed</h2>
          <div className="mt-5 space-y-4">
            {visibleMessages.length === 0 ? (
              <EmptyState title="No messages yet" description="Messages between admins, teachers, students, and parents will appear here." />
            ) : (
              visibleMessages.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-full bg-gray-100 p-2 text-gray-600">
                        <UserCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{item.subject || 'General message'}</div>
                        <div className="mt-1 text-sm text-gray-500">
                          {item.fromUserName} ({item.fromRole}) {item.toRole ? `to ${item.toRole}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString()}</div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-700">{item.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessagingCenter;
