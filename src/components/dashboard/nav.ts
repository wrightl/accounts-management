import type { Permission } from '@/lib/roles';
import {
    featureAppliesTo,
    isFeatureEnabled,
    type MenuFeature,
} from '@/lib/menu/features';

export const NAV_COLLAPSED_COOKIE = 'dd-nav-collapsed';

export type NavIcon =
    | 'overview'
    | 'close'
    | 'bookkeeper'
    | 'help'
    | 'clients'
    | 'invoices'
    | 'expenses'
    | 'reimbursements'
    | 'bank'
    | 'spending'
    | 'reports'
    | 'dividends'
    | 'shareholders'
    | 'reserves'
    | 'safeToPay'
    | 'forecast'
    | 'profitability'
    | 'directorLoans'
    | 'deadlines'
    | 'queries'
    | 'quotes'
    | 'orders'
    | 'recurring'
    | 'audit'
    | 'inboundEmail'
    | 'settings'
    | 'billing'
    | 'users'
    | 'menu'
    | 'profile'
    | 'notifications'
    | 'company'
    | 'payments'
    | 'reminders'
    | 'templates'
    | 'assistant';

export interface NavItem {
    href: string;
    label: string;
    icon: NavIcon;
    permission: Permission;
    /** Optional item the person can hide from their menu. Omitted = core. */
    feature?: MenuFeature;
    /** Only shown when the deployment can call the AI Gateway. */
    requiresAi?: true;
    /** Other paths that highlight this item (e.g. pages under the Settings hub). */
    activePrefixes?: string[];
    /** Phase the section is planned for (shown as a badge in stubs). */
    phase?: number;
}

export interface NavGroup {
    id: string;
    /** When omitted, items render without a group header (e.g. Overview). */
    label?: string;
    /** Label for people who can't change records, such as an external accountant. */
    readOnlyLabel?: string;
    items: NavItem[];
}

/** Utility destination, rendered in the sidebar footer rather than the main list. */
export const HELP_NAV_ITEM: NavItem = {
    href: '/help',
    label: 'Help',
    icon: 'help',
    permission: 'workspace:read',
};

/**
 * Pages reached from the Settings hub rather than the sidebar. Listed here so
 * the command palette can still find them.
 */
export const SETTINGS_HUB_PREFIXES = [
    '/settings',
    '/company',
    '/users',
    '/audit',
    '/inbound-email',
];

export interface SettingsPage extends NavItem {
    description: string;
    section: 'you' | 'business' | 'team';
    /** Hide from people with this permission (they edit it elsewhere). */
    hideWithPermission?: Permission;
}

/** Destinations on the Settings hub, filtered by permission like the sidebar. */
export const SETTINGS_PAGES: SettingsPage[] = [
    {
        href: '/settings/menu',
        label: 'Your menu',
        description: 'Choose which pages show in your sidebar.',
        icon: 'menu',
        permission: 'workspace:read',
        section: 'you',
    },
    {
        href: '/profile',
        label: 'Profile and display',
        description: 'Your name, photo, text size, contrast, and motion.',
        icon: 'profile',
        permission: 'workspace:read',
        section: 'you',
    },
    {
        href: '/settings/notifications',
        label: 'Notifications',
        description: 'Which events reach you in the app, by email, or as alerts.',
        icon: 'notifications',
        permission: 'workspace:read',
        section: 'you',
    },
    {
        href: '/settings/ai-assistant',
        label: 'AI assistant',
        description: 'Ask Claude, ChatGPT or another assistant about your books.',
        icon: 'assistant',
        permission: 'workspace:read',
        section: 'you',
    },
    {
        href: '/company',
        label: 'Company profile',
        description: 'Registered details, Companies House dates, and bank details.',
        icon: 'company',
        permission: 'filing:read',
        // Admins see and edit all of this on Business settings.
        hideWithPermission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/settings/business',
        label: 'Business settings',
        description: 'Company details, Companies House, VAT, bank details, and numbering.',
        icon: 'settings',
        permission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/settings/document-templates',
        label: 'Document Templates',
        description: 'Choose how invoices, quotes and credit notes look, or design your own.',
        icon: 'templates',
        permission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/settings/payments',
        label: 'Online payments',
        description: 'Let clients pay invoices by card.',
        icon: 'payments',
        permission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/settings/reminders',
        label: 'Payment reminders',
        description: 'Automatic reminders for unpaid invoices.',
        icon: 'reminders',
        permission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/settings/billing',
        label: 'Billing',
        description: 'Your subscription and invoices from us.',
        icon: 'billing',
        permission: 'settings:manage',
        section: 'business',
    },
    {
        href: '/users',
        label: 'Users',
        description: 'Invite co-founders and your accountant, and set roles.',
        icon: 'users',
        permission: 'users:manage',
        section: 'team',
    },
    {
        href: '/inbound-email',
        label: 'Inbound email',
        description: 'Receipts emailed in, and any that could not be read.',
        icon: 'inboundEmail',
        permission: 'users:manage',
        section: 'team',
    },
    {
        href: '/audit',
        label: 'Audit log',
        description: 'A record of sensitive changes and who made them.',
        icon: 'audit',
        permission: 'users:manage',
        section: 'team',
    },
];

/** Settings hub destinations this person should see. */
export function visibleSettingsPages(
    permissionCheck: (permission: Permission) => boolean,
): SettingsPage[] {
    return SETTINGS_PAGES.filter(
        (page) =>
            permissionCheck(page.permission) &&
            !(page.hideWithPermission && permissionCheck(page.hideWithPermission)),
    );
}

export const NAV_GROUPS: NavGroup[] = [
    {
        id: 'overview',
        items: [
            {
                href: '/dashboard',
                label: 'Overview',
                icon: 'overview',
                permission: 'accounts:read',
            },
            {
                href: '/close',
                label: 'Weekly close',
                icon: 'close',
                permission: 'accounts:read',
                feature: 'close',
            },
            {
                href: '/bookkeeper',
                label: 'AI bookkeeper',
                icon: 'bookkeeper',
                permission: 'accounts:read',
                feature: 'bookkeeper',
                requiresAi: true,
            },
            {
                href: '/queries',
                label: 'Queries',
                icon: 'queries',
                permission: 'queries:read',
            },
        ],
    },
    {
        id: 'banking',
        label: 'Banking',
        items: [
            {
                href: '/transactions',
                label: 'Transactions',
                icon: 'bank',
                permission: 'records:read',
            },
            {
                href: '/spending',
                label: 'Spending',
                icon: 'spending',
                permission: 'accounts:read',
                feature: 'spending',
            },
        ],
    },
    {
        id: 'expenses',
        label: 'Expenses',
        items: [
            {
                href: '/expenses',
                label: 'Expenses',
                icon: 'expenses',
                permission: 'records:read',
            },
            {
                href: '/reimbursements',
                label: 'Reimbursements',
                icon: 'reimbursements',
                permission: 'records:read',
                feature: 'reimbursements',
            },
        ],
    },
    {
        id: 'sales',
        label: 'Sales',
        items: [
            {
                href: '/clients',
                label: 'Clients',
                icon: 'clients',
                permission: 'accounts:read',
            },
            {
                href: '/quotes',
                label: 'Quotes',
                icon: 'quotes',
                permission: 'accounts:read',
                feature: 'quotes',
            },
            {
                href: '/orders',
                label: 'Orders',
                icon: 'orders',
                permission: 'accounts:read',
                feature: 'orders',
            },
            {
                href: '/invoices',
                label: 'Invoices',
                icon: 'invoices',
                permission: 'records:read',
            },
            {
                href: '/recurring-invoices',
                label: 'Recurring',
                icon: 'recurring',
                permission: 'records:read',
                feature: 'recurring',
            },
        ],
    },
    {
        id: 'payingYourself',
        label: 'Paying yourself',
        readOnlyLabel: 'Directors & shareholders',
        items: [
            {
                href: '/dividends',
                label: 'Dividends',
                icon: 'dividends',
                permission: 'records:read',
                feature: 'dividends',
            },
            {
                href: '/shareholders',
                label: 'Shareholders',
                icon: 'shareholders',
                permission: 'records:read',
                feature: 'shareholders',
            },
            {
                href: '/directors-loans',
                label: "Director's loans",
                icon: 'directorLoans',
                permission: 'filing:read',
                feature: 'directorsLoans',
            },
            {
                href: '/safe-to-pay',
                label: 'Safe to pay',
                icon: 'safeToPay',
                permission: 'reports:read',
                feature: 'safeToPay',
            },
            {
                href: '/reserves',
                label: 'Tax & reserves',
                icon: 'reserves',
                permission: 'filing:read',
                feature: 'reserves',
            },
        ],
    },
    {
        id: 'reporting',
        label: 'Reporting',
        items: [
            {
                href: '/reports',
                label: 'Reports',
                icon: 'reports',
                permission: 'filing:read',
            },
            {
                href: '/profitability',
                label: 'Profitability',
                icon: 'profitability',
                permission: 'reports:read',
                feature: 'profitability',
            },
            {
                href: '/forecast',
                label: 'Cash forecast',
                icon: 'forecast',
                permission: 'reports:read',
                feature: 'forecast',
            },
            {
                href: '/deadlines',
                label: 'Deadlines',
                icon: 'deadlines',
                permission: 'filing:read',
            },
        ],
    },
    {
        id: 'settings',
        items: [
            {
                href: '/settings',
                label: 'Settings',
                icon: 'settings',
                permission: 'workspace:read',
                activePrefixes: SETTINGS_HUB_PREFIXES,
            },
        ],
    },
];

/** Flat list of all nav items across groups. */
export function flattenNavItems(groups: NavGroup[]): NavItem[] {
    return groups.flatMap((group) => group.items);
}

export interface NavFilter {
    permissionCheck: (permission: Permission) => boolean;
    entityType?: string | null;
    /** Whether AI is set up on this deployment (`aiGatewayConfigured()`). */
    aiAvailable: boolean;
    /** Optional items this person shows. Null or omitted shows every item. */
    enabledFeatures?: readonly MenuFeature[] | null;
}

/** Whether the item exists for this role and entity type, shown or not. */
function isAvailable(item: NavItem, filter: NavFilter): boolean {
    if (!filter.permissionCheck(item.permission)) return false;
    if (item.requiresAi && !filter.aiAvailable) return false;
    if (item.feature && !featureAppliesTo(item.feature, filter.entityType)) {
        return false;
    }
    return true;
}

function mapGroups(
    groups: NavGroup[],
    filter: NavFilter,
    keep: (item: NavItem) => boolean,
): NavGroup[] {
    const canWrite = filter.permissionCheck('accounts:write');
    return groups
        .map((group) => ({
            ...group,
            label: canWrite ? group.label : (group.readOnlyLabel ?? group.label),
            items: group.items.filter(keep),
        }))
        .filter((group) => group.items.length > 0);
}

/**
 * Filter groups by permission, entity type and the person's menu choices,
 * dropping empty groups.
 */
export function filterNavGroups(groups: NavGroup[], filter: NavFilter): NavGroup[] {
    return mapGroups(
        groups,
        filter,
        (item) =>
            isAvailable(item, filter) &&
            (!item.feature || isFeatureEnabled(item.feature, filter.enabledFeatures)),
    );
}

/** Items the person could open but has hidden from their menu. */
export function hiddenNavGroups(groups: NavGroup[], filter: NavFilter): NavGroup[] {
    return mapGroups(
        groups,
        filter,
        (item) =>
            isAvailable(item, filter) &&
            item.feature !== undefined &&
            !isFeatureEnabled(item.feature, filter.enabledFeatures),
    );
}

/** Optional items that disappear when AI isn't set up on the deployment. */
export function aiOnlyFeatures(groups: NavGroup[]): MenuFeature[] {
    return flattenNavItems(groups).flatMap((item) =>
        item.requiresAi && item.feature ? [item.feature] : [],
    );
}

/** Optional items this person could show, whether or not they currently do. */
export function optionalNavItems(
    groups: NavGroup[],
    filter: Omit<NavFilter, 'enabledFeatures'>,
): (NavItem & { feature: MenuFeature })[] {
    return flattenNavItems(groups).filter(
        (item): item is NavItem & { feature: MenuFeature } =>
            item.feature !== undefined && isAvailable(item, filter),
    );
}
