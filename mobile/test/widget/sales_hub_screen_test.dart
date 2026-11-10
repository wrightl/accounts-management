import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:alfa/data/models/api_response.dart';
import 'package:alfa/data/models/books.dart';
import 'package:alfa/data/repositories/books_repository.dart';
import 'package:alfa/features/auth/auth_provider.dart';
import 'package:alfa/features/books/books_provider.dart';
import 'package:alfa/features/books/screens/sales_hub_screen.dart';
import '../support/signed_in.dart';

class _EmptyBooks extends BooksRepository {
  @override
  Future<ApiResponse<BooksPage>> getPage(String resource, {int offset = 0}) async =>
      ApiResponse.success(
        BooksPage(title: resource, emptyMessage: 'Nothing yet.', stats: [], items: []),
      );
}

Future<void> _pump(WidgetTester tester, AuthProvider auth) async {
  await tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => BooksProvider(repository: _EmptyBooks())),
      ],
      child: const MaterialApp(home: SalesHubScreen()),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('shows Quotes only when it is in the web menu, never Orders', (tester) async {
    await _pump(tester, await signedIn(menuFeatures: ['quotes', 'orders']));
    expect(find.text('Invoices'), findsWidgets);
    expect(find.text('Quotes'), findsOneWidget);
    expect(find.text('Clients'), findsOneWidget);
    expect(find.text('Orders'), findsNothing);
  });

  testWidgets('drops Quotes when hidden', (tester) async {
    await _pump(tester, await signedIn(menuFeatures: []));
    expect(find.text('Quotes'), findsNothing);
  });
}
