import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:alfa/core/security/app_lock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late DateTime now;
  late List<bool> answers;

  AppLock makeLock({bool supported = true}) => AppLock(
        authenticate: (_) async => answers.isEmpty ? false : answers.removeAt(0),
        isSupported: () async => supported,
        now: () => now,
      );

  setUp(() {
    now = DateTime(2026, 11, 5, 9);
    answers = [];
    SharedPreferences.setMockInitialValues({});
  });

  test('is off until turned on, and turning it on needs a successful check', () async {
    final lock = makeLock();
    await lock.load();
    expect(lock.enabled, false);
    expect(lock.locked, false);

    answers = [false];
    expect(await lock.setEnabled(true), false);
    expect(lock.enabled, false);

    answers = [true];
    expect(await lock.setEnabled(true), true);
    expect(lock.enabled, true);
    expect(lock.locked, false);
  });

  test('locks on launch once on, and unlocks with a check', () async {
    SharedPreferences.setMockInitialValues({'app_lock_enabled': true});
    final lock = makeLock();
    await lock.load();
    expect(lock.locked, true);

    answers = [false];
    expect(await lock.unlock(), false);
    expect(lock.locked, true);
    answers = [true];
    expect(await lock.unlock(), true);
    expect(lock.locked, false);
  });

  test('locks again only after five minutes away', () async {
    SharedPreferences.setMockInitialValues({'app_lock_enabled': true});
    final lock = makeLock();
    await lock.load();
    answers = [true];
    await lock.unlock();

    lock.didChangeAppLifecycleState(AppLifecycleState.paused);
    now = now.add(const Duration(minutes: 4));
    lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(lock.locked, false);

    lock.didChangeAppLifecycleState(AppLifecycleState.paused);
    now = now.add(const Duration(minutes: 5));
    lock.didChangeAppLifecycleState(AppLifecycleState.resumed);
    expect(lock.locked, true);
  });

  test('stays off on a phone without Face ID, fingerprint or a passcode', () async {
    SharedPreferences.setMockInitialValues({'app_lock_enabled': true});
    final lock = makeLock(supported: false);
    await lock.load();
    expect(lock.enabled, false);
    expect(lock.locked, false);
  });

  testWidgets('the gate hides the app while locked', (tester) async {
    SharedPreferences.setMockInitialValues({'app_lock_enabled': true});
    final lock = makeLock();
    await lock.load();

    await tester.pumpWidget(MaterialApp(
      home: AppLockGate(lock: lock, child: const Text('Your books')),
    ));
    await tester.pump();
    expect(find.text('Your books'), findsNothing);
    expect(find.text('Alfa is locked'), findsOneWidget);

    answers = [true];
    await tester.tap(find.text('Unlock'));
    await tester.pumpAndSettle();
    expect(find.text('Your books'), findsOneWidget);
  });
}
