import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/books.dart';
import '../../auth/auth_provider.dart';
import '../books_provider.dart';
import '../widgets/record_payment_sheet.dart';

class RecordListScreen extends StatefulWidget {
  const RecordListScreen({
    super.key,
    required this.resource,
    required this.title,
    this.embedded = false,
  });

  final String resource;
  final String title;
  final bool embedded;

  @override
  State<RecordListScreen> createState() => _RecordListScreenState();
}

class _RecordListScreenState extends State<RecordListScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<BooksProvider>().load(widget.resource);
    });
  }

  @override
  Widget build(BuildContext context) {
    final body = Consumer<BooksProvider>(
      builder: (context, provider, _) {
        final page = provider.pageFor(widget.resource);
        final error = provider.errorFor(widget.resource);
        final loading = provider.isLoading(widget.resource);

        if (loading && page == null) {
          return const Center(child: CircularProgressIndicator());
        }
        if (error != null && page == null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline, color: BrandColors.destructive),
                  const SizedBox(height: 12),
                  Text(error, textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => provider.refresh(widget.resource),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          );
        }

        final items = page?.items ?? [];
        return RefreshIndicator(
          onRefresh: () => provider.refresh(widget.resource),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              if (page != null && page.stats.isNotEmpty) ...[
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final stat in page.stats) _StatChip(stat: stat),
                  ],
                ),
                const SizedBox(height: 16),
              ],
              if (items.isEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 48),
                  child: Text(
                    page?.emptyMessage ?? 'Nothing here yet.',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
                )
              else
                for (final item in items)
                  _RecordTile(
                    record: item,
                    onTap: () => _showDetail(item),
                  ),
              if (page?.hasMore ?? false)
                _LoadMore(onVisible: () => provider.loadMore(widget.resource)),
            ],
          ),
        );
      },
    );

    if (widget.embedded) return body;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: body,
    );
  }

  Future<void> _recordPayment(BookRecord invoice) async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => RecordPaymentSheet(invoice: invoice),
    );
    if (saved != true || !mounted) return;
    Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Payment recorded')),
    );
  }

  Future<void> _markPaid(BookRecord run) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Mark as paid?'),
        content: Text(
          'Only once you have sent ${run.amount ?? 'the money'} to ${run.title}. '
          'Match it to the bank payment on the web.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Mark as paid')),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    final result = await context.read<BooksProvider>().markReimbursementPaid(run.id);
    if (!mounted) return;
    if (result.success) Navigator.of(context).pop();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(result.success ? 'Marked as paid' : result.error ?? 'Could not mark it paid')),
    );
  }

  void _showDetail(BookRecord record) {
    final user = context.read<AuthProvider>().user;
    final canWrite = (user?.canWriteAccounts ?? false) && !(user?.isBillingReadOnly ?? false);
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      record.title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              if (record.subtitle.isNotEmpty)
                Text(
                  record.subtitle,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              const SizedBox(height: 16),
              for (final entry in record.details.entries)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry.key, style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 2),
                      Text(entry.value),
                    ],
                  ),
                ),
              if (canWrite && record.amountDuePence != null)
                ElevatedButton.icon(
                  onPressed: () => _recordPayment(record),
                  icon: const Icon(Icons.payments_outlined),
                  label: const Text('Record payment'),
                ),
              if (canWrite && record.canMarkPaid)
                ElevatedButton.icon(
                  onPressed: () => _markPaid(record),
                  icon: const Icon(Icons.check),
                  label: const Text('Mark as paid'),
                ),
            ],
          ),
        );
      },
    );
  }
}

/// Shown at the end of a list with more to come; asks for the next page
/// when it's built, i.e. when the list scrolls to it.
class _LoadMore extends StatefulWidget {
  const _LoadMore({required this.onVisible});

  final VoidCallback onVisible;

  @override
  State<_LoadMore> createState() => _LoadMoreState();
}

class _LoadMoreState extends State<_LoadMore> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => widget.onVisible());
  }

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      );
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.stat});

  final BookStat stat;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: BrandColors.wash.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(stat.label, style: Theme.of(context).textTheme.bodySmall),
          Text(
            stat.value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
  }
}

class _RecordTile extends StatelessWidget {
  const _RecordTile({required this.record, required this.onTap});

  final BookRecord record;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        onTap: onTap,
        title: Text(record.title),
        subtitle: Text(
          [
            record.subtitle,
            if (record.date != null) record.date!,
          ].where((s) => s.isNotEmpty).join(' · '),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (record.amount != null)
              Text(
                record.amount!,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontFeatures: const [FontFeature.tabularFigures()],
                    ),
              ),
            if (record.status != null) ...[
              const SizedBox(height: 4),
              Text(
                record.status!,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
