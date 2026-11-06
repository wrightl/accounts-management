import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import '../../core/push/push_notification_service.dart';
import '../../core/widget/home_widget_sync.dart';
import 'auth_provider.dart';

/// Sign out everywhere on this phone. The push token goes first, while the
/// session can still authorise removing it.
Future<void> signOut(BuildContext context) async {
  final clerk = ClerkAuth.of(context, listen: false);
  final auth = context.read<AuthProvider>();
  await PushNotificationService.instance.stop();
  await HomeWidgetSync.instance.clear();
  await clerk.signOut();
  await auth.logout();
}
