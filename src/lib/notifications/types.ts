import type { TenantRole } from "@/lib/roles";

/** Channel delivery flags for a single event type. */
export type NotificationChannels = {
  inApp: boolean;
  email: boolean;
  push: boolean;
};

export const NOTIFICATION_EVENT_TYPES = [
  "quote.accepted",
  "quote.declined",
  "quote.expired",
  "quote.expiring.3d",
  "quote.expiring.1d",
  "invoice.overdue",
  "recurring.due.3d",
  "recurring.sent",
  "expense.inbound.processed",
  "expense.inbound.failed",
  "user.invite.accepted",
  // Suggested extras (catalog; defaults mostly off for email/push)
  "invoice.paid",
  "invoice.send.failed",
  "expense.approved",
  "expense.rejected",
  "user.invited",
  "billing.trial_ending",
  "billing.payment_failed",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationEventDefinition = {
  type: NotificationEventType;
  label: string;
  description: string;
  /** Roles that receive the notification by default (plus explicit userIds). */
  defaultRoles: TenantRole[];
  defaultChannels: NotificationChannels;
};

/** Built-in catalog used for prefs UI and default channel matrix. */
export const NOTIFICATION_CATALOG: readonly NotificationEventDefinition[] = [
  {
    type: "quote.accepted",
    label: "Quote accepted",
    description: "A client or teammate accepts a quote",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: true },
  },
  {
    type: "quote.declined",
    label: "Quote declined",
    description: "A client or teammate declines a quote",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: true },
  },
  {
    type: "quote.expired",
    label: "Quote expired",
    description: "An open quote passes its valid-until date",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "quote.expiring.3d",
    label: "Quote expiring in 3 days",
    description: "Reminder three days before a quote expires",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "quote.expiring.1d",
    label: "Quote expiring tomorrow",
    description: "Reminder one day before a quote expires",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
  {
    type: "invoice.overdue",
    label: "Late invoice",
    description: "An invoice becomes overdue",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
  {
    type: "recurring.due.3d",
    label: "Recurring invoice due in 3 days",
    description: "A recurring template will generate in three days",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "recurring.sent",
    label: "Recurring invoice sent",
    description: "A recurring invoice was generated and sent",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "expense.inbound.processed",
    label: "Expense email processed",
    description: "An expense submitted by email was processed successfully",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "expense.inbound.failed",
    label: "Expense email failed",
    description: "Processing an expense email failed or was rejected",
    defaultRoles: ["admin"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
  {
    type: "user.invite.accepted",
    label: "Invite accepted",
    description: "Someone accepts an invitation to join the company",
    defaultRoles: ["admin"],
    defaultChannels: { inApp: true, email: false, push: true },
  },
  {
    type: "invoice.paid",
    label: "Invoice paid",
    description: "A payment is recorded against an invoice",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "invoice.send.failed",
    label: "Invoice send failed",
    description: "Sending an invoice email failed",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
  {
    type: "expense.approved",
    label: "Expense approved",
    description: "An expense you submitted was approved",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "expense.rejected",
    label: "Expense rejected",
    description: "An expense you submitted was rejected",
    defaultRoles: ["admin", "user"],
    defaultChannels: { inApp: true, email: false, push: true },
  },
  {
    type: "user.invited",
    label: "Team member invited",
    description: "Another admin invited someone to the company",
    defaultRoles: ["admin"],
    defaultChannels: { inApp: true, email: false, push: false },
  },
  {
    type: "billing.trial_ending",
    label: "Trial ending",
    description: "Your subscription trial is about to end",
    defaultRoles: ["admin"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
  {
    type: "billing.payment_failed",
    label: "Billing payment failed",
    description: "A subscription payment failed",
    defaultRoles: ["admin"],
    defaultChannels: { inApp: true, email: true, push: true },
  },
] as const;

const catalogByType = new Map(
  NOTIFICATION_CATALOG.map((e) => [e.type, e] as const),
);

export function getEventDefinition(
  type: string,
): NotificationEventDefinition | undefined {
  return catalogByType.get(type as NotificationEventType);
}

/** Built-in channel defaults for every catalog event. */
export function builtInChannelDefaults(): Record<
  NotificationEventType,
  NotificationChannels
> {
  const out = {} as Record<NotificationEventType, NotificationChannels>;
  for (const event of NOTIFICATION_CATALOG) {
    out[event.type] = { ...event.defaultChannels };
  }
  return out;
}

export type NotifyPayload = {
  companyId: string;
  type: NotificationEventType | string;
  title: string;
  body: string;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  meta?: Record<string, unknown> | null;
  /** Extra recipients beyond role defaults. */
  extraUserIds?: string[];
  /** Override catalog roles (e.g. admin-only for a specific emit). */
  roles?: TenantRole[];
};
