import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';

class QuoteToCashFunnelCard extends StatelessWidget {
  const QuoteToCashFunnelCard({
    super.key,
    required this.stages,
    required this.periodLabel,
  });

  final List<FunnelStage> stages;
  final String periodLabel;

  @override
  Widget build(BuildContext context) {
    final max = stages.fold<int>(0, (acc, s) => s.valuePence > acc ? s.valuePence : acc);
    final hasData = stages.any((s) => s.valuePence > 0);

    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const DashboardSectionTitle(
            title: 'Quote → cash',
            subtitle: 'Pipeline stock, then invoiced & collected',
          ),
          if (periodLabel.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              periodLabel,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
          const SizedBox(height: 16),
          if (!hasData)
            Text(
              'Nothing in the funnel yet.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            ...stages.map((stage) {
              final width = max <= 0
                  ? 0.0
                  : (stage.valuePence / max).clamp(0.08, 1.0);
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            stage.label,
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                        Text(
                          stage.valueFormatted,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                                fontFeatures: const [FontFeature.tabularFigures()],
                              ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: width,
                        minHeight: 10,
                        backgroundColor: BrandColors.wash,
                        color: BrandColors.navy,
                      ),
                    ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }
}
