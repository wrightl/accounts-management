import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../data/models/dashboard.dart';

class PeriodChips extends StatelessWidget {
  const PeriodChips({
    super.key,
    required this.current,
    required this.onSelected,
  });

  final String current;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final option in dashboardPeriodOptions)
          ChoiceChip(
            label: Text(option.label),
            selected: option.value == current,
            showCheckmark: false,
            selectedColor: BrandColors.navy,
            labelStyle: TextStyle(
              color: option.value == current ? Colors.white : BrandColors.muted,
              fontSize: 13,
            ),
            side: BorderSide(
              color: option.value == current
                  ? BrandColors.navy
                  : BrandColors.border,
            ),
            onSelected: (_) => onSelected(option.value),
          ),
      ],
    );
  }
}
