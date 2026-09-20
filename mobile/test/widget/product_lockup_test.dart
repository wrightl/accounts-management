import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/shared/widgets/product_lockup.dart';

void main() {
  testWidgets('ProductLockup shows Alfa by Dot+Dash', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: ProductLockup()),
      ),
    );

    expect(find.text('Alfa'), findsOneWidget);
    expect(find.text('by Dot+Dash'), findsOneWidget);
  });
}
