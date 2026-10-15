import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:ddapp_mobile/features/auth/auth_provider.dart';
import 'package:ddapp_mobile/features/books/screens/more_screen.dart';
import '../support/signed_in.dart';

Future<void> _pump(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: auth,
      child: const MaterialApp(home: MoreScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows only the pages in the web menu', (tester) async {
    await _pump(tester, await signedIn(menuFeatures: ['close', 'dividends']));

    expect(find.text('Weekly close'), findsOneWidget);
    expect(find.text('Dividends'), findsOneWidget);
    expect(find.text('AI bookkeeper'), findsNothing);
    expect(find.text('Spending'), findsNothing);
    expect(find.text('Reimbursements'), findsNothing);
    // Deadlines are core, not optional.
    expect(find.text('Deadlines'), findsOneWidget);
  });

  testWidgets('leaves desk work to the web and ends with the account', (tester) async {
    await _pump(tester, await signedIn());

    // Inbox lives on the bell; read-only lists moved to the web.
    expect(find.text('Inbox'), findsNothing);
    for (final gone in ['Transactions', 'Reports', 'Recurring', 'Shareholders', 'Users']) {
      expect(find.text(gone), findsNothing, reason: gone);
    }
    await tester.scrollUntilVisible(find.text('Sign out'), 200);
    expect(find.text('Open Alfa on the web'), findsOneWidget);
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Lee Wright'), findsOneWidget);
    expect(find.text('Sign out'), findsOneWidget);
  });

  testWidgets('hides Deadlines from people who cannot read the books', (tester) async {
    await _pump(tester, await signedIn(permissions: []));

    expect(find.text('Deadlines'), findsNothing);
    expect(find.text('Notifications'), findsOneWidget);
  });
}
