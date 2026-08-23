import type { Permission } from '@/lib/roles';

export const NAV_COLLAPSED_COOKIE = 'dd-nav-collapsed';

export type NavIcon =
    | 'overview'
    | 'clients'
    | 'invoices'
    | 'expenses'
    | 'reimbursements'
    | 'bank'
    | 'spending'
    | 'reports'
    | 'quotes'
    | 'audit'
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

export const NAV_ITEMS: NavItem[] = [
    {
        href: '/dashboard',
        label: 'Overview',
        icon: 'overview',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/transactions',
        label: 'Transactions',
        icon: 'bank',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/spending',
        label: 'Spending',
        icon: 'spending',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/expenses',
        label: 'Expenses',
        icon: 'expenses',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/reimbursements',
        label: 'Reimbursements',
        icon: 'reimbursements',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/clients',
        label: 'Clients',
        icon: 'clients',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/quotes',
        label: 'Quotes',
        icon: 'quotes',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/invoices',
        label: 'Invoices',
        icon: 'invoices',
        permission: 'accounts:read',
    },
    {
        href: '/dashboard/reports',
        label: 'Reports',
        icon: 'reports',
        permission: 'reports:read',
    },
    {
        href: '/dashboard/audit',
        label: 'Audit log',
        icon: 'audit',
        permission: 'users:manage',
    },
    {
        href: '/dashboard/settings',
        label: 'Settings',
        icon: 'settings',
        permission: 'settings:manage',
    },
    {
        href: '/dashboard/users',
        label: 'Users',
        icon: 'users',
        permission: 'users:manage',
    },
];
