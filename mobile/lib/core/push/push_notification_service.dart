import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../data/repositories/notification_repository.dart';

/// Abstracts Firebase Messaging so the token lifecycle can be tested.
abstract class PushTokenSource {
  Future<bool> initialise();
  Future<String?> getToken();
  Stream<String> get onTokenRefresh;
}

class FirebasePushTokenSource implements PushTokenSource {
  @override
  Future<bool> initialise() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
    } catch (error) {
      debugPrint('Push: Firebase not configured ($error)');
      return false;
    }
    final settings = await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    return settings.authorizationStatus != AuthorizationStatus.denied;
  }

  @override
  Future<String?> getToken() => FirebaseMessaging.instance.getToken();

  @override
  Stream<String> get onTokenRefresh => FirebaseMessaging.instance.onTokenRefresh;
}

/// Registers this device's FCM token for the signed-in person, and removes it
/// again on sign-out so the next person on the phone doesn't get their alerts.
/// No-ops safely when Firebase options / google-services are missing.
class PushNotificationService {
  PushNotificationService({
    NotificationRepository? repository,
    PushTokenSource? source,
  })  : _repository = repository ?? NotificationRepository(),
        _source = source ?? FirebasePushTokenSource();

  /// The app's one instance, so sign-out can stop what sign-in started.
  static PushNotificationService instance = PushNotificationService();

  final NotificationRepository _repository;
  final PushTokenSource _source;
  StreamSubscription<String>? _refresh;
  String? _token;
  bool _started = false;

  @visibleForTesting
  String? get token => _token;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    if (kIsWeb) return;

    try {
      if (!await _source.initialise()) return;

      final token = await _source.getToken();
      if (token != null && token.isNotEmpty) {
        _token = token;
        await _repository.registerPushToken(token);
      }

      _refresh = _source.onTokenRefresh.listen((token) async {
        final previous = _token;
        _token = token;
        if (previous != null && previous != token) {
          await _repository.unregisterPushToken(previous);
        }
        await _repository.registerPushToken(token);
      });
    } catch (error) {
      debugPrint('Push: registration skipped ($error)');
    }
  }

  /// Stop listening and remove this device's token from the signed-in person.
  /// Call before signing out, while the session can still authorise it.
  Future<void> stop() async {
    await _refresh?.cancel();
    _refresh = null;
    _started = false;
    final token = _token;
    _token = null;
    if (token == null) return;
    try {
      await _repository.unregisterPushToken(token);
    } catch (error) {
      debugPrint('Push: unregister failed ($error)');
    }
  }
}
