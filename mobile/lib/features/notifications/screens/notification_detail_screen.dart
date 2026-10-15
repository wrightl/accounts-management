import 'package:flutter/material.dart';
import '../../../data/models/notification.dart';
import '../../../features/expenses/screens/expense_list_screen.dart';
import '../../../features/books/screens/sales_hub_screen.dart';
import '../../../features/work/bookkeeper_screen.dart';
import '../../../features/work/deadlines_screen.dart';
import '../../../features/work/weekly_close_screen.dart';

class NotificationDetailScreen extends StatelessWidget {
  const NotificationDetailScreen({super.key, required this.notification});

  final AppNotification notification;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notification')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              notification.title,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 8),
            Text(
              notification.createdAt.toLocal().toString(),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 16),
            Text(
              notification.body,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const Spacer(),
            if (notification.href != null)
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => _openRelated(context, notification),
                  child: const Text('Open related'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  void _openRelated(BuildContext context, AppNotification n) {
    final href = n.href ?? '';
    final Widget? work = href.startsWith('/deadlines')
        ? const DeadlinesScreen()
        : href.startsWith('/close')
            ? const WeeklyCloseScreen()
            : href.startsWith('/bookkeeper')
                ? const BookkeeperScreen()
                : null;
    if (work != null) {
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => work));
      return;
    }
    if (href.contains('/expenses')) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const ExpenseListScreen()),
      );
      return;
    }
    if (href.contains('/quotes') ||
        href.contains('/invoices') ||
        href.contains('/orders') ||
        href.contains('/recurring')) {
      Navigator.of(context).push(
        MaterialPageRoute<void>(builder: (_) => const SalesHubScreen()),
      );
      return;
    }
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Open this item in the web app for full detail.'),
      ),
    );
  }
}
