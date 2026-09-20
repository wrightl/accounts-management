import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';
import 'series_charts.dart';

const _bucketColors = [
  BrandColors.periwinkle,
  BrandColors.pink,
  BrandColors.navy,
  BrandColors.destructive,
];

class AgedReceivablesCard extends StatelessWidget {
  const AgedReceivablesCard({super.key, required this.data});

  final AgedReceivables data;

  @override
  Widget build(BuildContext context) {
    final rows = [
      LabeledBarRow(
        label: 'Current',
        formatted: data.current,
        value: data.raw.current,
        color: _bucketColors[0],
      ),
      LabeledBarRow(
        label: '1–30 days',
        formatted: data.d30,
        value: data.raw.d30,
        color: _bucketColors[1],
      ),
      LabeledBarRow(
        label: '31–60 days',
        formatted: data.d60,
        value: data.raw.d60,
        color: _bucketColors[2],
      ),
      LabeledBarRow(
        label: '90+ days',
        formatted: data.d90,
        value: data.raw.d90,
        color: _bucketColors[3],
      ),
    ];
    final total = data.raw.total;

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DashboardSectionTitle(
            title: 'Aged receivables',
            subtitle: data.overduePercent == null
                ? 'Outstanding balances by days past due'
                : 'Outstanding balances by days past due · ${data.overduePercent}% past due',
          ),
          const SizedBox(height: 16),
          if (total == 0)
            Text(
              'No outstanding receivables.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else ...[
            LabeledBarList(rows: rows),
            if (total > 0) ...[
              const SizedBox(height: 4),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                  height: 8,
                  child: Row(
                    children: [
                      for (final row in rows.where((r) => r.value > 0))
                        Expanded(
                          flex: row.value,
                          child: ColoredBox(color: row.color),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Total outstanding: ${CurrencyUtils.formatPence(total)}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
          ],
        ],
      ),
    );
  }
}

class TopClientsCard extends StatelessWidget {
  const TopClientsCard({
    super.key,
    required this.clients,
    required this.periodLabel,
  });

  final List<NamedSlice> clients;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    const colors = [
      BrandColors.navy,
      BrandColors.periwinkle,
      BrandColors.pink,
      BrandColors.muted,
      BrandColors.border,
    ];

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DashboardSectionTitle(
            title: 'Revenue by client',
            subtitle: 'Invoiced gross · $periodLabel',
          ),
          const SizedBox(height: 16),
          if (clients.isEmpty)
            Text(
              'No invoices in this period.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            LabeledBarList(
              rows: [
                for (var i = 0; i < clients.length; i++)
                  LabeledBarRow(
                    label: '${clients[i].name} (${clients[i].percent}%)',
                    formatted: clients[i].totalFormatted,
                    value: clients[i].totalPence,
                    color: colors[i % colors.length],
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
