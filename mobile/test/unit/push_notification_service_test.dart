import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/core/push/push_notification_service.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';
import 'package:ddapp_mobile/data/repositories/notification_repository.dart';

class _FakeSource implements PushTokenSource {
  _FakeSource(this.initialToken);

  final String? initialToken;
  final refreshes = StreamController<String>.broadcast();

  @override
  Future<bool> initialise() async => true;

  @override
  Future<String?> getToken() async => initialToken;

  @override
  Stream<String> get onTokenRefresh => refreshes.stream;
}

class _RecordingRepository extends NotificationRepository {
  final calls = <String>[];

  @override
  Future<ApiResponse<bool>> registerPushToken(
    String token, {
    String platform = 'fcm',
  }) async {
    calls.add('register:$token');
    return ApiResponse.success(true);
  }

  @override
  Future<ApiResponse<bool>> unregisterPushToken(String token) async {
    calls.add('unregister:$token');
    return ApiResponse.success(true);
  }
}

void main() {
  late _RecordingRepository repository;

  setUp(() => repository = _RecordingRepository());

  test('registers the token on start and removes it on stop', () async {
    final service = PushNotificationService(
      repository: repository,
      source: _FakeSource('token-a'),
    );

    await service.start();
    await service.stop();

    expect(repository.calls, ['register:token-a', 'unregister:token-a']);
    expect(service.token, isNull);
  });

  test('a refreshed token replaces the old one', () async {
    final source = _FakeSource('token-a');
    final service = PushNotificationService(repository: repository, source: source);

    await service.start();
    source.refreshes.add('token-b');
    await Future<void>.delayed(Duration.zero);
    await service.stop();

    expect(repository.calls, [
      'register:token-a',
      'unregister:token-a',
      'register:token-b',
      'unregister:token-b',
    ]);
  });

  test('can start again after signing out', () async {
    final service = PushNotificationService(
      repository: repository,
      source: _FakeSource('token-a'),
    );

    await service.start();
    await service.stop();
    await service.start();

    expect(repository.calls.last, 'register:token-a');
  });

  test('stop does nothing when no token was registered', () async {
    final service = PushNotificationService(
      repository: repository,
      source: _FakeSource(null),
    );

    await service.start();
    await service.stop();

    expect(repository.calls, isEmpty);
  });
}
