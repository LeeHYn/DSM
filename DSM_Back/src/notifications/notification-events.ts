export const NOTIFICATION_SCHEDULE_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type NotificationScheduleStatus =
  (typeof NOTIFICATION_SCHEDULE_STATUS)[keyof typeof NOTIFICATION_SCHEDULE_STATUS];

export const NOTIFICATION_FAILURE_REASON = {
  NO_ACTIVE_FCM_TOKEN: 'NO_ACTIVE_FCM_TOKEN',
} as const;

export const NOTIFICATION_EVENTS = {
  DUE: 'notification.due',
} as const;
