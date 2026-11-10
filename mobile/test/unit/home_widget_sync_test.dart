import 'package:flutter_test/flutter_test.dart';
import 'package:alfa/core/widget/home_widget_sync.dart';
import 'package:alfa/data/models/dashboard.dart';

void main() {
  late Map<String, String?> saved;
  late int updates;
  late HomeWidgetSync sync;

  setUp(() {
    saved = {};
    updates = 0;
    sync = HomeWidgetSync(
      save: (key, value) async => saved[key] = value,
      update: () async => updates++,
    );
  });

  final data = DashboardData.fromJson({
    'role': 'admin',
    'firstName': 'Lee',
    'heroes': [
      {'key': 'outstanding', 'title': 'Owed to you', 'value': '£4,200.00', 'valuePence': 420000},
      {'key': 'collected', 'title': 'Collected', 'value': '£9,000.00', 'valuePence': 900000},
    ],
    'safeToPay': {'safeNowFormatted': '£1,500.00', 'cashKnown': true},
  });

  test('shows what clients owe and Safe to pay', () async {
    await sync.publish(data, hidden: false);
    expect(saved['owed'], '£4,200.00');
    expect(saved['safe_to_pay'], '£1,500.00');
    expect(saved['updated'], startsWith('Updated '));
    expect(updates, 1);
  });

  test('shows no figures while the app lock is on, or after sign-out', () async {
    await sync.publish(data, hidden: false);
    await sync.publish(data, hidden: true);
    expect(saved, {'owed': null, 'safe_to_pay': null, 'updated': null});

    await sync.publish(data, hidden: false);
    await sync.clear();
    expect(saved['owed'], isNull);
  });
}
