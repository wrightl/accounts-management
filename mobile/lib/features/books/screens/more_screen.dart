import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/auth/auth_provider.dart';
import 'record_list_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final items = <_MoreItem>[
      const _MoreItem(
        resource: 'transactions',
        title: 'Transactions',
        subtitle: 'Bank feed and reconciliation',
        icon: Icons.account_balance_outlined,
      ),
      const _MoreItem(
        resource: 'spending',
        title: 'Spending',
        subtitle: 'Cash outflows this month',
        icon: Icons.payments_outlined,
      ),
      const _MoreItem(
        resource: 'reimbursements',
        title: 'Reimbursements',
        subtitle: 'Founder payout runs',
        icon: Icons.outbox_outlined,
      ),
      const _MoreItem(
        resource: 'recurring',
        title: 'Recurring invoices',
        subtitle: 'Templates and next run dates',
        icon: Icons.autorenew,
      ),
      const _MoreItem(
        resource: 'reports',
        title: 'Reports',
        subtitle: 'Profit & loss and aged AR',
        icon: Icons.insights_outlined,
      ),
      if (user?.isLimitedCompany ?? true) ...[
        const _MoreItem(
          resource: 'dividends',
          title: 'Dividends',
          subtitle: 'Declarations and payouts',
          icon: Icons.pie_chart_outline,
        ),
        const _MoreItem(
          resource: 'shareholders',
          title: 'Shareholders',
          subtitle: 'Share register',
          icon: Icons.groups_outlined,
        ),
      ],
      if (user?.canManageSettings ?? false)
        const _MoreItem(
          resource: 'settings',
          title: 'Settings',
          subtitle: 'Company profile',
          icon: Icons.settings_outlined,
        ),
      if (user?.canManageUsers ?? false)
        const _MoreItem(
          resource: 'users',
          title: 'Users',
          subtitle: 'Roles and access',
          icon: Icons.manage_accounts_outlined,
        ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          Text(
            'The rest of the books. Create and edit documents on the web app; this view is for checking status on the go.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          for (final item in items)
            Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: BrandColors.wash,
                  foregroundColor: BrandColors.navy,
                  child: Icon(item.icon),
                ),
                title: Text(item.title),
                subtitle: Text(item.subtitle),
                trailing: const Icon(Icons.chevron_right),
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => RecordListScreen(
                        resource: item.resource,
                        title: item.title,
                      ),
                    ),
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}

class _MoreItem {
  const _MoreItem({
    required this.resource,
    required this.title,
    required this.subtitle,
    required this.icon,
  });

  final String resource;
  final String title;
  final String subtitle;
  final IconData icon;
}
