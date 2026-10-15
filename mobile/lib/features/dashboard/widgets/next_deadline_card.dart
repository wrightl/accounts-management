import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/work.dart';
import 'dashboard_card.dart';

/// The soonest open deadline; tapping opens the full list.
class NextDeadlineCard extends StatelessWidget {
  const NextDeadlineCard({super.key, required this.deadline, this.onTap});

  final Deadline deadline;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return DashboardCard(
      onTap: onTap,
      destructive: deadline.isOverdue,
      child: Row(
        children: [
          Icon(
            Icons.event_outlined,
            color: deadline.isOverdue ? BrandColors.destructive : BrandColors.navy,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Next deadline', style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 2),
                Text(deadline.label, style: Theme.of(context).textTheme.titleMedium),
                Text(
                  '${deadline.dueDate} · ${deadline.whenLabel}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          ),
          if (onTap != null) const Icon(Icons.chevron_right),
        ],
      ),
    );
  }
}
