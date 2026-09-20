import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/books.dart';
import '../books_provider.dart';

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

  void _showDetail(BookRecord record) {
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
            ],
          ),
        );
      },
    );
  }
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
