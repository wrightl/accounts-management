import type { Permission } from '@/lib/roles';

export const NAV_COLLAPSED_COOKIE = 'dd-nav-collapsed';

export type NavIcon =
    | 'overview'
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
    | 'quotes'
    | 'orders'
    | 'recurring'
    | 'audit'
    | 'inboundEmail'
    | 'settings'
    | 'users';

export interface NavItem {
    href: string;
    label: string;
    icon: NavIcon;
    permission: Permission;
    /** Phase the section is planned for (shown as a badge in stubs). */
    phase?: number;
}

export interface NavGroup {
    id: string;
    /** When omitted, items render without a group header (e.g. Overview). */
    label?: string;
    items: NavItem[];
}

/** Utility destination, rendered in the sidebar footer rather than the main list. */
export const HELP_NAV_ITEM: NavItem = {
    href: '/help',
    label: 'Help',
    icon: 'help',
    permission: 'accounts:read',
};

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
                permission: 'accounts:read',
            },
            {
                href: '/spending',
                label: 'Spending',
                icon: 'spending',
                permission: 'accounts:read',
            },
            {
                href: '/dividends',
                label: 'Dividends',
                icon: 'dividends',
                permission: 'accounts:read',
            },
            {
                href: '/shareholders',
                label: 'Shareholders',
                icon: 'shareholders',
                permission: 'accounts:read',
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
                permission: 'accounts:read',
            },
            {
                href: '/reimbursements',
                label: 'Reimbursements',
                icon: 'reimbursements',
                permission: 'accounts:read',
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
            },
            {
                href: '/orders',
                label: 'Orders',
                icon: 'orders',
                permission: 'accounts:read',
            },
            {
                href: '/invoices',
                label: 'Invoices',
                icon: 'invoices',
                permission: 'accounts:read',
            },
            {
                href: '/recurring-invoices',
                label: 'Recurring',
                icon: 'recurring',
                permission: 'accounts:read',
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
                permission: 'reports:read',
            },
        ],
    },
    {
        id: 'administration',
        label: 'Administration',
        items: [
            {
                href: '/audit',
                label: 'Audit log',
                icon: 'audit',
                permission: 'users:manage',
            },
            {
                href: '/inbound-email',
                label: 'Inbound email',
                icon: 'inboundEmail',
                permission: 'users:manage',
            },
            {
                href: '/settings',
                label: 'Settings',
                icon: 'settings',
                permission: 'settings:manage',
            },
            {
                href: '/users',
                label: 'Users',
                icon: 'users',
                permission: 'users:manage',
            },
        ],
    },
];

/** Flat list of all nav items across groups. */
export function flattenNavItems(groups: NavGroup[]): NavItem[] {
    return groups.flatMap((group) => group.items);
}

const LTD_ONLY_HREFS = new Set([
    '/dividends',
    '/shareholders',
]);

/** Filter groups by permission (and entity type), dropping empty groups. */
export function filterNavGroups(
    groups: NavGroup[],
    permissionCheck: (permission: Permission) => boolean,
    entityType?: string | null,
): NavGroup[] {
    const isSoleTrader = entityType === 'sole_trader';
    return groups
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => {
                if (!permissionCheck(item.permission)) return false;
                if (isSoleTrader && LTD_ONLY_HREFS.has(item.href)) return false;
                return true;
            }),
        }))
        .filter((group) => group.items.length > 0);
}
