import 'package:flutter/material.dart';
import '../../../data/models/dashboard.dart';
import 'dashboard_card.dart';

/// "Safe to pay yourself", worded as on the web Overview.
class SafeToPayCard extends StatelessWidget {
  const SafeToPayCard({super.key, required this.data});

  final SafeToPayData data;

  @override
  Widget build(BuildContext context) {
    return DashboardCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const DashboardSectionTitle(title: 'Safe to pay yourself'),
          const SizedBox(height: 8),
          Text(data.safeNowFormatted, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text(
            data.cashKnown && data.safeLaterFormatted != null
                ? '${data.safeLaterFormatted} in 30 days if clients pay on time.'
                : 'Import a bank statement to work this out.',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
