import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/web_links.dart';
import '../../../features/auth/auth_provider.dart';
import '../../../features/notifications/screens/notification_prefs_screen.dart';
import '../../work/bookkeeper_screen.dart';
import '../../work/deadlines_screen.dart';
import '../../work/weekly_close_screen.dart';
import 'record_list_screen.dart';

/// The routine work the phone is good for, then the web for everything else,
/// then the person's own account.
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
      if (shows('spending'))
        _MoreItem(
          title: 'Spending',
          subtitle: 'Cash outflows this month',
          icon: Icons.payments_outlined,
          screen: (_) => const RecordListScreen(resource: 'spending', title: 'Spending'),
        ),
      if (shows('reimbursements'))
        _MoreItem(
          title: 'Reimbursements',
          subtitle: 'Founder payout runs',
          icon: Icons.outbox_outlined,
          screen: (_) =>
              const RecordListScreen(resource: 'reimbursements', title: 'Reimbursements'),
        ),
      // The server leaves limited-company pages out for sole traders.
      if (shows('dividends'))
        _MoreItem(
          title: 'Dividends',
          subtitle: 'Declarations and payouts',
          icon: Icons.pie_chart_outline,
          screen: (_) => const RecordListScreen(resource: 'dividends', title: 'Dividends'),
        ),
      _MoreItem(
        title: 'Notifications',
        subtitle: 'Which events reach you in the app, by email, or as alerts',
        icon: Icons.tune,
        screen: (_) => const NotificationPrefsScreen(),
      ),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        children: [
          for (final item in items) _MoreTile(item: item),
          const SizedBox(height: 16),
          Text('On the web', style: Theme.of(context).textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Bank reconciliation, reports, orders, recurring invoices, settings and '
            'your team are on the web app.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 8),
          _WebTile(
            title: 'Open Alfa on the web',
            icon: Icons.open_in_new,
            path: '/dashboard',
          ),
          _WebTile(
            title: 'Settings',
            icon: Icons.settings_outlined,
            path: '/settings',
          ),
          const SizedBox(height: 16),
          Card(
            margin: EdgeInsets.zero,
            child: Column(
              children: [
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: BrandColors.wash,
                    foregroundColor: BrandColors.navy,
                    child: Text(_initial(user?.name)),
                  ),
                  title: Text(user?.name.isNotEmpty == true ? user!.name : 'Your account'),
                  subtitle: Text(user?.email ?? ''),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.logout),
                  title: const Text('Sign out'),
                  onTap: () async {
                    await ClerkAuth.of(context, listen: false).signOut();
                    if (context.mounted) {
                      await context.read<AuthProvider>().logout();
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _initial(String? name) {
  final trimmed = name?.trim() ?? '';
  if (trimmed.isEmpty) return 'U';
  return trimmed.substring(0, 1).toUpperCase();
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({required this.item});

  final _MoreItem item;

  @override
  Widget build(BuildContext context) {
    return Card(
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
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(builder: item.screen),
        ),
      ),
    );
  }
}

class _WebTile extends StatelessWidget {
  const _WebTile({required this.title, required this.icon, required this.path});

  final String title;
  final IconData icon;
  final String path;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.open_in_new, size: 18),
        onTap: () => openOnWeb(context, path),
      ),
    );
  }
}

class _MoreItem {
  const _MoreItem({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.screen,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final WidgetBuilder screen;
}
