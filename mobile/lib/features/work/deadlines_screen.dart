import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/work.dart';
import '../../data/repositories/work_repository.dart';
import '../../shared/widgets/loaded_list.dart';
import '../auth/auth_provider.dart';

/// Filing and payment deadlines, with mark done, as on the web.
class DeadlinesScreen extends StatelessWidget {
  const DeadlinesScreen({super.key, this.repository});

  final WorkRepository? repository;

  @override
  Widget build(BuildContext context) {
    final repo = repository ?? WorkRepository();
    final user = context.watch<AuthProvider>().user;
    final canWrite = (user?.canWriteAccounts ?? false) && !(user?.isBillingReadOnly ?? false);

    return Scaffold(
      appBar: AppBar(title: const Text('Deadlines')),
      body: LoadedList<DeadlinesPage>(
        load: repo.getDeadlines,
        builder: (context, page, reload) => [
          if (page.missingCompaniesHouse)
            const _Notice(
              'Add your company number in Business settings on the web to see your '
              'Companies House dates.',
            ),
          if (page.deadlines.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 32),
              child: Text('Nothing due in the next year.', textAlign: TextAlign.center),
            ),
          for (final deadline in page.deadlines)
            DeadlineTile(
              deadline: deadline,
              onToggle: canWrite
                  ? () => runAndReload(
                        context,
                        () => repo.setDeadlineDone(deadline, !deadline.isDone),
                        done: deadline.isDone ? 'Moved back to the list' : 'Marked done',
                        reload: reload,
                      )
                  : null,
            ),
        ],
      ),
    );
  }
}

class DeadlineTile extends StatelessWidget {
  const DeadlineTile({super.key, required this.deadline, this.onToggle});

  final Deadline deadline;
  final VoidCallback? onToggle;

  Color get _color {
    switch (deadline.status) {
      case 'overdue':
        return BrandColors.destructive;
      case 'due_soon':
        return Colors.orange;
      case 'done':
        return Colors.green;
      default:
        return BrandColors.navy;
    }
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = [
      deadline.dueDate,
      if (deadline.period != null) deadline.period!,
    ].join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: Icon(
          deadline.isDone ? Icons.check_circle : Icons.event_outlined,
          color: _color,
        ),
        title: Text(deadline.label),
        subtitle: Text('$subtitle\n${deadline.whenLabel}'),
        isThreeLine: true,
        trailing: onToggle == null
            ? null
            : TextButton(
                onPressed: onToggle,
                child: Text(deadline.isDone ? 'Undo' : 'Mark done'),
              ),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: BrandColors.wash,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
