import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/data/models/user.dart';

Map<String, dynamic> _json(Map<String, dynamic> extra) => {
      'id': 'u1',
      'clerkUserId': 'user_1',
      'role': 'accountant',
      ...extra,
    };

void main() {
  test('gates actions on the permissions the server sends', () {
    final user = User.fromJson(_json({
      'permissions': ['accounts:read', 'reports:read'],
    }));

    expect(user.canReadAccounts, true);
    expect(user.canReadReports, true);
    expect(user.canWriteAccounts, false);
    expect(user.canManageSettings, false);
  });

  test('grants nothing when permissions are missing', () {
    final user = User.fromJson(_json({'role': 'admin'}));
    expect(user.canWriteAccounts, false);
  });

  test('shows only the optional pages in the web menu', () {
    final user = User.fromJson(_json({
      'menuFeatures': ['quotes'],
    }));

    expect(user.showsFeature('quotes'), true);
    expect(user.showsFeature('orders'), false);
  });

  test('shows every optional page when the server sends no menu', () {
    final user = User.fromJson(_json({}));
    expect(user.showsFeature('orders'), true);
  });
}
