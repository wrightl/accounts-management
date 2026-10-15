import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';
import 'package:ddapp_mobile/data/models/user.dart';
import 'package:ddapp_mobile/data/models/work.dart';
import 'package:ddapp_mobile/data/repositories/work_repository.dart';
import 'package:ddapp_mobile/features/auth/auth_provider.dart';
import 'package:ddapp_mobile/features/work/deadlines_screen.dart';
import 'package:ddapp_mobile/data/repositories/auth_service.dart';

class _FakeWorkRepository extends WorkRepository {
  final marked = <String>[];

  @override
  Future<ApiResponse<DeadlinesPage>> getDeadlines() async => ApiResponse.success(
        DeadlinesPage.fromJson({
          'missingCompaniesHouse': false,
          'deadlines': [
            {
              'kind': 'vat_return',
              'label': 'VAT return',
              'dueDate': '2026-11-07',
              'status': 'due_soon',
              'daysLeft': 23,
            },
          ],
        }),
      );

  @override
  Future<ApiResponse<bool>> setDeadlineDone(Deadline deadline, bool done) async {
    marked.add('${deadline.kind}:$done');
    return ApiResponse.success(true);
  }
}

class _FakeAuthService extends AuthService {
  _FakeAuthService(this.permissions);

  final List<String> permissions;

  @override
  Future<ApiResponse<User>> validateToken() async => ApiResponse.success(
        User.fromJson({
          'id': 'u1',
          'clerkUserId': 'user_1',
          'role': 'admin',
          'permissions': permissions,
        }),
      );
}

Future<AuthProvider> _signedIn(List<String> permissions) async {
  final auth = AuthProvider(authService: _FakeAuthService(permissions));
  await auth.validateToken();
  return auth;
}

Future<void> _pump(WidgetTester tester, AuthProvider auth, WorkRepository repo) async {
  await tester.pumpWidget(
    ChangeNotifierProvider.value(
      value: auth,
      child: MaterialApp(home: DeadlinesScreen(repository: repo)),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('lists deadlines and marks one done', (tester) async {
    final repo = _FakeWorkRepository();
    await _pump(tester, await _signedIn(['accounts:read', 'accounts:write']), repo);

    expect(find.text('VAT return'), findsOneWidget);
    expect(find.textContaining('Due in 23 days'), findsOneWidget);

    await tester.tap(find.text('Mark done'));
    await tester.pumpAndSettle();
    expect(repo.marked, ['vat_return:true']);
  });

  testWidgets('hides mark done from read-only roles', (tester) async {
    await _pump(tester, await _signedIn(['accounts:read']), _FakeWorkRepository());

    expect(find.text('VAT return'), findsOneWidget);
    expect(find.text('Mark done'), findsNothing);
  });
}
