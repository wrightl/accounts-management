import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';

class AttentionPanelCard extends StatelessWidget {
  const AttentionPanelCard({
    super.key,
    required this.items,
    this.onOpenExpenses,
  });

  final AttentionData items;
  final VoidCallback? onOpenExpenses;

  @override
  Widget build(BuildContext context) {
    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: DashboardSectionTitle(
                  title: 'Needs attention',
                  subtitle: items.allClear
                      ? 'All caught up'
                      : '${items.urgentCount} item${items.urgentCount == 1 ? '' : 's'} to clear',
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          if (items.allClear)
            Text(
              'Nothing urgent — enjoy the quiet morning.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else ...[
            _InboxSection(
              title: 'Overdue invoices',
              count: items.overdueInvoices.length,
              emptyMessage: 'No overdue invoices.',
              priority: _InboxPriority.high,
              child: Column(
                children: [
                  for (final invoice in items.overdueInvoices)
                    _AttentionTile(
                      title: invoice.number,
                      subtitle: invoice.clientName,
                      value: invoice.balanceFormatted,
                      valueColor: BrandColors.destructive,
                      meta: invoice.dueDate == null
                          ? null
                          : 'due ${invoice.dueDate}',
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            _InboxSection(
              title: 'Quotes expiring',
              count: items.expiringQuotes.length,
              emptyMessage: 'No quotes expiring within 30 days.',
              child: Column(
                children: [
                  for (final quote in items.expiringQuotes)
                    _AttentionTile(
                      title: quote.number,
                      subtitle: quote.clientName,
                      value: quote.grossFormatted,
                      meta: 'until ${quote.validUntil}',
                    ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            _InboxSection(
              title: 'Bank reconciliation',
              count: items.unreconciledCount,
              emptyMessage: 'All imported transactions are reconciled.',
              child: _AttentionTile(
                title: '${items.unreconciledCount}',
                subtitle: items.unreconciledCount == 1
                    ? 'unreconciled transaction'
                    : 'unreconciled transactions',
                titleStyle: Theme.of(context).textTheme.headlineMedium,
              ),
            ),
            const SizedBox(height: 10),
            _InboxSection(
              title: 'Pending expenses',
              count: items.pendingExpenses.length,
              emptyMessage: 'No expenses awaiting review.',
              priority: _InboxPriority.low,
              child: Column(
                children: [
                  for (final expense in items.pendingExpenses)
                    _AttentionTile(
                      title: expense.description,
                      subtitle: expense.submitterLabel,
                      value: expense.amountFormatted,
                      onTap: onOpenExpenses,
                    ),
                ],
              ),
            ),
            if (items.inboundEmailIssues.isNotEmpty) ...[
              const SizedBox(height: 10),
              _InboxSection(
                title: 'Inbound email failures',
                count: items.inboundEmailIssues.length,
                emptyMessage: 'No inbound email processing errors.',
                priority: _InboxPriority.high,
                child: Column(
                  children: [
                    for (final job in items.inboundEmailIssues)
                      _AttentionTile(
                        title: job.subject.isEmpty ? '(no subject)' : job.subject,
                        subtitle: job.fromEmail,
                        meta: job.attempts == 1
                            ? '1 attempt'
                            : '${job.attempts} attempts',
                        valueColor: BrandColors.destructive,
                      ),
                  ],
                ),
              ),
            ],
          ],
          const SizedBox(height: 16),
          const Divider(height: 1, color: BrandColors.border),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatChip(label: 'Owed to me', value: items.owedToMeFormatted),
              _StatChip(
                label: 'Reimbursable',
                value: items.reimbursableFormatted,
              ),
              if (items.unbilledFormatted != '£0.00')
                _StatChip(
                  label: 'Unbilled orders',
                  value: items.unbilledFormatted,
                ),
              if (items.recurringUpcomingFormatted != '£0.00')
                _StatChip(
                  label: 'Recurring next',
                  value: items.recurringUpcomingFormatted,
                ),
              if (items.winRatePercent != null)
                _StatChip(
                  label: 'Quote win rate',
                  value: '${items.winRatePercent}%',
                ),
              if (items.dsoDays != null)
                _StatChip(
                  label: 'Avg DSO',
                  value: '${items.dsoDays} days',
                ),
            ],
          ),
        ],
      ),
    );
  }
}

enum _InboxPriority { high, medium, low }

class _InboxSection extends StatelessWidget {
  const _InboxSection({
    required this.title,
    required this.count,
    required this.emptyMessage,
    required this.child,
    this.priority = _InboxPriority.medium,
  });

  final String title;
  final int count;
  final String emptyMessage;
  final Widget child;
  final _InboxPriority priority;

  @override
  Widget build(BuildContext context) {
    final high = priority == _InboxPriority.high && count > 0;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: high
            ? BrandColors.destructive.withValues(alpha: 0.05)
            : BrandColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: high
              ? BrandColors.destructive.withValues(alpha: 0.3)
              : BrandColors.border,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontSize: 14,
                      ),
                ),
              ),
              if (count > 0)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: high
                        ? BrandColors.destructive.withValues(alpha: 0.15)
                        : BrandColors.wash,
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '$count',
                    style: TextStyle(
                      fontSize: 12,
                      color: high ? BrandColors.destructive : BrandColors.muted,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          if (count == 0)
            Text(emptyMessage, style: Theme.of(context).textTheme.bodySmall)
          else
            child,
        ],
      ),
    );
  }
}

class _AttentionTile extends StatelessWidget {
  const _AttentionTile({
    required this.title,
    this.subtitle,
    this.value,
    this.meta,
    this.valueColor,
    this.titleStyle,
    this.onTap,
  });

  final String title;
  final String? subtitle;
  final String? value;
  final String? meta;
  final Color? valueColor;
  final TextStyle? titleStyle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final tile = Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: BrandColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: titleStyle ??
                Theme.of(context).textTheme.titleMedium?.copyWith(fontSize: 14),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
          ],
          if (value != null || meta != null) ...[
            const SizedBox(height: 4),
            Text.rich(
              TextSpan(
                children: [
                  if (value != null)
                    TextSpan(
                      text: value,
                      style: TextStyle(
                        color: valueColor ?? BrandColors.navy,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  if (meta != null)
                    TextSpan(
                      text: value == null ? meta : '  $meta',
                      style: const TextStyle(color: BrandColors.muted),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );

    if (onTap == null) return tile;
    return GestureDetector(onTap: onTap, child: tile);
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: BrandColors.wash.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 2),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontSize: 13,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
  }
}
