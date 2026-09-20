import 'package:flutter/material.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';
import 'sparkline.dart';

class SpendingSnapshotCard extends StatelessWidget {
  const SpendingSnapshotCard({super.key, required this.data});

  final SpendingSnapshotData data;

  @override
  Widget build(BuildContext context) {
    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          DashboardSectionTitle(
            title: 'Cash spending',
            subtitle: data.periodLabel,
          ),
          const SizedBox(height: 12),
          Text(
            data.totalFormatted,
            style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
          const SizedBox(height: 4),
          Text(
            'vs ${data.compareTotalFormatted} ${data.compareLabel.toLowerCase()}',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          if (data.currentSeries.isNotEmpty) ...[
            const SizedBox(height: 16),
            DualSparkline(
              primary: data.currentSeries,
              secondary: data.previousSeries,
            ),
          ],
        ],
      ),
    );
  }
}
