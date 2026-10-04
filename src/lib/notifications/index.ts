export {
  NOTIFICATION_CATALOG,
  NOTIFICATION_EVENT_TYPES,
  builtInChannelDefaults,
  getEventDefinition,
  type NotificationChannels,
  type NotificationEventType,
  type NotifyPayload,
} from "./types";

export {
  mergeChannelPrefs,
  parseChannelMatrix,
  resolveChannelsForEvent,
  getEffectiveChannels,
  loadCompanyChannelDefaults,
  loadUserChannelOverrides,
  saveCompanyChannelDefaults,
  saveUserChannelOverrides,
  type EventChannelMatrix,
} from "./prefs";

export { notify, notifyUsers, type NotifyResult } from "./create";

export {
  listNotifications,
  countUnreadNotifications,
  getNotificationForUser,
  markNotificationRead,
  markAllNotificationsRead,
  softDeleteNotification,
  todayKey,
  formatNotifyDate,
} from "./queries";

export { runNotificationScanners } from "./cron";

export {
  upsertPushSubscription,
  deletePushSubscription,
  sendPushToUser,
} from "./push";
