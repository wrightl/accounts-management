import 'package:flutter/foundation.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import '../../data/repositories/notification_repository.dart';

/// Registers an FCM device token when Firebase is configured.
/// No-ops safely when Firebase options / google-services are missing.
class PushNotificationService {
  PushNotificationService({NotificationRepository? repository})
      : _repository = repository ?? NotificationRepository();

  final NotificationRepository _repository;
  bool _started = false;

  Future<void> start() async {
    if (_started) return;
    _started = true;
    if (kIsWeb) return;

    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
    } catch (error) {
      debugPrint('Push: Firebase not configured ($error)');
      return;
    }

    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return;
      }

      final token = await messaging.getToken();
      if (token != null && token.isNotEmpty) {
        await _repository.registerPushToken(token);
      }

      messaging.onTokenRefresh.listen((token) {
        _repository.registerPushToken(token);
      });
    } catch (error) {
      debugPrint('Push: registration skipped ($error)');
    }
  }
}
