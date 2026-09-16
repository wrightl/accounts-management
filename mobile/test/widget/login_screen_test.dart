import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/features/auth/screens/login_screen.dart';
import 'package:ddapp_mobile/features/auth/auth_provider.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('LoginScreen displays correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ChangeNotifierProvider(
          create: (_) => AuthProvider(),
          child: const LoginScreen(),
        ),
      ),
    );

    expect(find.text('Dot + Dash Accounts'), findsOneWidget);
    expect(find.text('Mobile App'), findsOneWidget);
    expect(find.byType(TextField), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Sign In'), findsOneWidget);
  });

  testWidgets('LoginScreen shows error for empty token', (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ChangeNotifierProvider(
          create: (_) => AuthProvider(),
          child: const LoginScreen(),
        ),
      ),
    );

    await tester.tap(find.widgetWithText(ElevatedButton, 'Sign In'));
    await tester.pump();

    expect(find.text('Please enter your Clerk token'), findsOneWidget);
  });
}
