import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/api_response.dart';
import '../../data/models/work.dart';
import '../../data/repositories/work_repository.dart';
import '../../shared/widgets/loaded_list.dart';
import '../auth/auth_provider.dart';

/// AI bookkeeper suggestions to accept or dismiss, as on the web. Nothing
/// changes until someone accepts it.
class BookkeeperScreen extends StatelessWidget {
  const BookkeeperScreen({super.key, this.repository});

  final WorkRepository? repository;

  @override
  Widget build(BuildContext context) {
    final repo = repository ?? WorkRepository();
    final user = context.watch<AuthProvider>().user;
    final canWrite = (user?.canWriteAccounts ?? false) && !(user?.isBillingReadOnly ?? false);

    return Scaffold(
      appBar: AppBar(title: const Text('AI bookkeeper')),
      body: LoadedList<BookkeeperPage>(
        load: repo.getBookkeeper,
        builder: (context, page, reload) {
          Future<void> run(Future<ApiResponse<bool>> Function() action, String done) =>
              runAndReload(context, action, done: done, reload: reload);
          return [
            Text(
              'Suggestions to speed up the bookkeeping. Nothing changes until someone '
              'accepts it.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (!page.aiReady) ...[
              const SizedBox(height: 8),
              Text(
                "AI isn't set up on this deployment, so AI suggestions are off. "
                'Categories learned from your own history still work.',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text('Spending categories',
                      style: Theme.of(context).textTheme.titleMedium),
                ),
                if (canWrite)
                  TextButton.icon(
                    onPressed: () => run(repo.findSuggestions, 'Looked for new suggestions'),
                    icon: const Icon(Icons.auto_awesome, size: 18),
                    label: const Text('Find suggestions'),
                  ),
              ],
            ),
            Text(
              '${page.uncategorised} payment${page.uncategorised == 1 ? '' : 's'} out of the '
              'bank without a category.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            if (page.categories.isEmpty)
              const _Empty('No category suggestions waiting.')
            else ...[
              if (canWrite && page.categories.length > 1)
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => run(
                      () => repo.acceptCategories([for (final c in page.categories) c.id]),
                      'All accepted',
                    ),
                    child: Text('Accept all ${page.categories.length}'),
                  ),
                ),
              for (final s in page.categories)
                _SuggestionCard(
                  title: '${s.counterparty ?? 'Unknown payee'} · ${s.amountFormatted}',
                  lines: [
                    '${s.bookedAt} → ${s.categoryLabel}',
                    if (s.reason != null) s.reason!,
                  ],
                  onAccept: canWrite
                      ? () => run(() => repo.acceptCategories([s.id]), 'Category set')
                      : null,
                  onDismiss: canWrite
                      ? () => run(() => repo.dismissCategories([s.id]), 'Dismissed')
                      : null,
                ),
            ],
            const SizedBox(height: 16),
            Text('Receipts and card payments', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            if (page.receipts.isEmpty)
              const _Empty('No receipt matches waiting.')
            else
              for (final m in page.receipts)
                _SuggestionCard(
                  title: m.expenseDescription,
                  lines: [
                    'Receipt ${m.expenseAmountFormatted}'
                        '${m.spentAt != null ? ' on ${m.spentAt}' : ''}',
                    'Bank ${m.bankAmountFormatted} to ${m.counterparty ?? 'unknown payee'} '
                        'on ${m.bookedAt}',
                    if (m.note != null) m.note!,
                  ],
                  onAccept: canWrite
                      ? () => _acceptReceipt(context, repo, m, run)
                      : null,
                  onDismiss: canWrite
                      ? () => run(() => repo.dismissReceiptMatch(m.matchId), 'Dismissed')
                      : null,
                ),
          ];
        },
      ),
    );
  }

  Future<void> _acceptReceipt(
    BuildContext context,
    WorkRepository repo,
    ReceiptMatchSuggestion m,
    Future<void> Function(Future<ApiResponse<bool>> Function(), String) run,
  ) async {
    var useBankAmount = false;
    if (m.amountsDiffer) {
      final choice = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Amounts differ'),
          content: Text(
            'The receipt says ${m.expenseAmountFormatted} and the bank charged '
            '${m.bankAmountFormatted}. Which amount should the expense keep?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text('Keep ${m.expenseAmountFormatted}'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: Text('Use ${m.bankAmountFormatted}'),
            ),
          ],
        ),
      );
      if (choice == null) return;
      useBankAmount = choice;
    }
    await run(
      () => repo.acceptReceiptMatch(m.matchId, useBankAmount: useBankAmount),
      'Matched',
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({
    required this.title,
    required this.lines,
    this.onAccept,
    this.onDismiss,
  });

  final String title;
  final List<String> lines;
  final VoidCallback? onAccept;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 8, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            for (final line in lines)
              Text(line, style: Theme.of(context).textTheme.bodySmall),
            if (onAccept != null || onDismiss != null)
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (onDismiss != null)
                    TextButton(
                      onPressed: onDismiss,
                      style: TextButton.styleFrom(foregroundColor: BrandColors.muted),
                      child: const Text('Dismiss'),
                    ),
                  if (onAccept != null)
                    TextButton(onPressed: onAccept, child: const Text('Accept')),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Text(text, style: Theme.of(context).textTheme.bodySmall),
    );
  }
}
