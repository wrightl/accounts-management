import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../features/auth/auth_provider.dart';
import '../../../features/notifications/screens/inbox_screen.dart';
import '../../../features/notifications/screens/notification_prefs_screen.dart';
import '../../work/bookkeeper_screen.dart';
import '../../work/deadlines_screen.dart';
import '../../work/weekly_close_screen.dart';
import 'record_list_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    // Same pages and order as the web menu, minus any this person hid.
    bool shows(String feature) => user?.showsFeature(feature) ?? false;
    final items = <_MoreItem>[
      if (shows('close'))
        _MoreItem(
          title: 'Weekly close',
          subtitle: 'The checklist that keeps the books up to date',
          icon: Icons.task_alt,
          screen: (_) => const WeeklyCloseScreen(),
        ),
      if (shows('bookkeeper'))
        _MoreItem(
          title: 'AI bookkeeper',
          subtitle: 'Category and receipt suggestions to review',
          icon: Icons.auto_awesome_outlined,
          screen: (_) => const BookkeeperScreen(),
        ),
      if (user?.canReadAccounts ?? false)
        _MoreItem(
          title: 'Deadlines',
          subtitle: 'Filings and tax payments coming up',
          icon: Icons.event_outlined,
          screen: (_) => const DeadlinesScreen(),
        ),
      const _MoreItem(
        resource: 'transactions',
        title: 'Transactions',
        subtitle: 'Bank feed and reconciliation',
        icon: Icons.account_balance_outlined,
      ),
      if (shows('spending'))
        const _MoreItem(
          resource: 'spending',
          title: 'Spending',
          subtitle: 'Cash outflows this month',
          icon: Icons.payments_outlined,
        ),
      if (shows('reimbursements'))
        const _MoreItem(
          resource: 'reimbursements',
          title: 'Reimbursements',
          subtitle: 'Founder payout runs',
          icon: Icons.outbox_outlined,
        ),
      if (shows('recurring'))
        const _MoreItem(
          resource: 'recurring',
          title: 'Recurring',
          subtitle: 'Templates and next run dates',
          icon: Icons.autorenew,
        ),
      // The server leaves limited-company pages out for sole traders.
      if (shows('dividends'))
        const _MoreItem(
          resource: 'dividends',
          title: 'Dividends',
          subtitle: 'Declarations and payouts',
          icon: Icons.pie_chart_outline,
        ),
      if (shows('shareholders'))
        const _MoreItem(
          resource: 'shareholders',
          title: 'Shareholders',
          subtitle: 'Share register',
          icon: Icons.groups_outlined,
        ),
      if (user?.canReadReports ?? false)
        const _MoreItem(
          resource: 'reports',
          title: 'Reports',
          subtitle: 'Profit & loss and aged AR',
          icon: Icons.insights_outlined,
        ),
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
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: BrandColors.wash,
                foregroundColor: BrandColors.navy,
                child: const Icon(Icons.notifications_outlined),
              ),
              title: const Text('Inbox'),
              subtitle: const Text('Notifications and alerts'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const InboxScreen(),
                  ),
                );
              },
            ),
          ),
          Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: BrandColors.wash,
                foregroundColor: BrandColors.navy,
                child: const Icon(Icons.tune),
              ),
              title: const Text('Notification settings'),
              subtitle: const Text('In-app, email, and push'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => const NotificationPrefsScreen(),
                  ),
                );
              },
            ),
          ),
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
                      builder: item.screen ??
                          (_) => RecordListScreen(
                                resource: item.resource!,
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
    this.resource,
    required this.title,
    required this.subtitle,
    required this.icon,
    this.screen,
  });

  /// A read-only list from /api/mobile/records, unless [screen] is given.
  final String? resource;
  final WidgetBuilder? screen;
  final String title;
  final String subtitle;
  final IconData icon;
}
