import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/constants/app_constants.dart';

/// The device details HMRC's fraud prevention headers need when the server
/// calls HMRC for something done in the app (connection method
/// MOBILE_APP_VIA_SERVER). Sent to Alfa's API in the X-Alfa-Device header as
/// base64url JSON; the server checks it and turns it into the Gov-Client-*
/// headers (src/lib/hmrc/fraud-headers.ts).
class HmrcDeviceDetails {
  static const headerName = 'X-Alfa-Device';

  final FlutterSecureStorage _storage;
  String? _deviceId;

  HmrcDeviceDetails(this._storage);

  /// A random ID for this install, kept in secure storage.
  Future<String> _ensureDeviceId() async {
    if (_deviceId != null) return _deviceId!;
    var id = await _storage.read(key: AppConstants.keyHmrcDeviceId);
    if (id == null || id.isEmpty) {
      id = _uuidV4();
      await _storage.write(key: AppConstants.keyHmrcDeviceId, value: id);
    }
    return _deviceId = id;
  }

  static String _uuidV4() {
    final rng = Random.secure();
    final b = List<int>.generate(16, (_) => rng.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
        '${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// The header value, or null if the screen isn't known yet.
  Future<String?> headerValue() async {
    final dispatcher = PlatformDispatcher.instance;
    final views = dispatcher.views;
    if (views.isEmpty) return null;
    final view = views.first;
    final ratio = view.devicePixelRatio;
    final displays = dispatcher.displays.isNotEmpty
        ? dispatcher.displays.toList()
        : [view.display];
    final screens = displays
        .map((d) => {
              'width': d.size.width.round(),
              'height': d.size.height.round(),
              'scalingFactor': d.devicePixelRatio,
              // Flutter doesn't expose colour depth; phone screens are 24-bit.
              'colourDepth': 24,
            })
        .where((s) => (s['width'] as int) > 0 && (s['height'] as int) > 0)
        .toList();
    if (screens.isEmpty) return null;

    final details = {
      'deviceId': await _ensureDeviceId(),
      'screens': screens,
      'window': {
        'width': (view.physicalSize.width / ratio).round(),
        'height': (view.physicalSize.height / ratio).round(),
      },
      'utcOffsetMinutes': DateTime.now().timeZoneOffset.inMinutes,
      'osFamily': Platform.isIOS
          ? 'iOS'
          : Platform.isAndroid
              ? 'Android'
              : Platform.operatingSystem,
      'osVersion': Platform.operatingSystemVersion,
      if (Platform.isIOS) 'deviceManufacturer': 'Apple',
    };
    return base64Url.encode(utf8.encode(jsonEncode(details))).replaceAll('=', '');
  }
}
