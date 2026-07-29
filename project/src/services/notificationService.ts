import { NotificationJob } from '../types';
import { firebaseService } from './firebaseService';

export const notificationService = {
  async queueFeeReminder(classId: string, recipient: string, studentName: string, pendingAmount: number) {
    const payload = {
      studentName,
      pendingAmount,
      classId,
    };

    const jobs: Omit<NotificationJob, 'id' | 'createdAt' | 'status'>[] = [
      { channel: 'email', recipient, template: 'fee-reminder', classId, payload },
      { channel: 'whatsapp', recipient, template: 'fee-reminder', classId, payload },
    ];

    await Promise.all(jobs.map((job) => firebaseService.queueNotification(job)));
  },
};
