import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/core/theme/app_theme.dart';
import 'package:ddapp_mobile/features/dashboard/widgets/period_chips.dart';

void main() {
  testWidgets('PeriodChips reports the selected period', (tester) async {
    String current = 'this-month';

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.lightTheme,
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              return PeriodChips(
                current: current,
                onSelected: (value) => setState(() => current = value),
              );
            },
          ),
        ),
      ),
    );

    await tester.tap(find.text('12 months'));
    await tester.pumpAndSettle();
    expect(current, 'trailing-12');
  });
}
