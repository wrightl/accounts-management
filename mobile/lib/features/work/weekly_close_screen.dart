import 'package:flutter/material.dart' hide DateUtils;
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';
import '../../data/models/work.dart';
import '../../data/repositories/work_repository.dart';
import '../../shared/widgets/loaded_list.dart';
import '../auth/auth_provider.dart';
import 'deadlines_screen.dart';

/// The weekly close checklist, as on the web: work down it, then close the week.
class WeeklyCloseScreen extends StatelessWidget {
  const WeeklyCloseScreen({super.key, this.repository});

  final WorkRepository? repository;

  @override
  Widget build(BuildContext context) {
    final repo = repository ?? WorkRepository();
    final user = context.watch<AuthProvider>().user;
    final canWrite = (user?.canWriteAccounts ?? false) && !(user?.isBillingReadOnly ?? false);

    return Scaffold(
      appBar: AppBar(title: const Text('Weekly close')),
      body: LoadedList<WeeklyClose>(
        load: repo.getWeeklyClose,
        builder: (context, close, reload) => [
          Text(
            'Fifteen minutes a week keeps the books up to date. Work down the list, '
            'then close the week.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 12),
          if (close.bankReconciledThrough != null)
            Text(
              'Bank reconciled up to ${close.bankReconciledThrough}',
              style: Theme.of(context).textTheme.titleSmall,
            ),
          if (close.lastClosedAt != null)
            Text(
              'Last closed ${DateUtils.formatDate(close.lastClosedAt!.toLocal())}'
              '${close.lastClosedByName != null ? ' by ${close.lastClosedByName}' : ''}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          const SizedBox(height: 12),
          for (final item in close.items)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                leading: Icon(
                  item.isDone ? Icons.check_circle : Icons.radio_button_unchecked,
                  color: item.isDone ? Colors.green : BrandColors.navy,
                ),
                title: Text(item.label),
                trailing: item.isDone
                    ? null
                    : Text(
                        item.amountFormatted ?? '${item.count}',
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
              ),
            ),
          if (close.deadlines.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text('Deadlines in the next two weeks',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final deadline in close.deadlines) DeadlineTile(deadline: deadline),
          ],
          if (canWrite) ...[
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _confirmClose(context, repo, close, reload),
              child: const Text('Close the week'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _confirmClose(
    BuildContext context,
    WorkRepository repo,
    WeeklyClose close,
    Future<void> Function() reload,
  ) async {
    if (close.outstanding > 0) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Close with items open?'),
          content: Text(
            '${close.outstanding} item${close.outstanding == 1 ? ' is' : 's are'} still open. '
            "They'll be recorded with this week's close so your accountant can see them.",
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Close anyway'),
            ),
          ],
        ),
      );
      if (ok != true || !context.mounted) return;
    }
    await runAndReload(context, repo.closeWeek, done: 'Week closed', reload: reload);
  }
}
