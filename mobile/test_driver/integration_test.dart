import 'dart:io';

import 'package:integration_test/integration_test_driver_extended.dart';

/// Writes each `takeScreenshot` PNG to SCREENSHOT_DIR, named with
/// SCREENSHOT_PREFIX so fastlane can tell devices apart.
Future<void> main() async {
  final dir = Platform.environment['SCREENSHOT_DIR'] ?? 'build/screenshots';
  final prefix = Platform.environment['SCREENSHOT_PREFIX'] ?? '';
  await integrationDriver(
    onScreenshot: (name, bytes, [args]) async {
      final file = File('$dir/$prefix$name.png');
      await file.create(recursive: true);
      await file.writeAsBytes(bytes);
      return true;
    },
  );
}
