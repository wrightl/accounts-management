import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/constants/app_constants.dart';

/// The phone's operating system and model, as HMRC's Gov-Client-User-Agent
/// header wants them.
class HmrcDeviceOs {
  const HmrcDeviceOs({
    required this.family,
    required this.version,
    this.manufacturer,
    this.model,
  });

  final String family;

  /// A plain version such as "18.1" or "15".
  final String version;
  final String? manufacturer;
  final String? model;
}

/// One screen, in physical pixels.
class HmrcScreen {
  const HmrcScreen({
    required this.width,
    required this.height,
    required this.scalingFactor,
    this.colourDepth = 24,
  });

  final int width;
  final int height;
  final double scalingFactor;
  final int colourDepth;
}

/// The device details HMRC's fraud prevention headers need when the server
/// calls HMRC for something done in the app (connection method
/// MOBILE_APP_VIA_SERVER). Sent to Alfa's API in the X-Alfa-Device header as
/// base64url JSON with no padding; the server checks it with
/// mobileClientDetailsSchema and turns it into the Gov-Client-* headers
/// (src/lib/hmrc/fraud-headers.ts).
class HmrcDeviceDetails {
  static const headerName = 'X-Alfa-Device';

  final FlutterSecureStorage _storage;
  final DeviceInfoPlugin _deviceInfo;
  String? _deviceId;
  HmrcDeviceOs? _os;

  HmrcDeviceDetails(this._storage, {DeviceInfoPlugin? deviceInfo})
      : _deviceInfo = deviceInfo ?? DeviceInfoPlugin();

  /// A random ID for this install, kept in secure storage so it stays the
  /// same until the app is removed.
  Future<String> deviceId() async {
    if (_deviceId != null) return _deviceId!;
    var id = await _storage.read(key: AppConstants.keyHmrcDeviceId);
    if (id == null || !isUuid(id)) {
      id = uuidV4();
      await _storage.write(key: AppConstants.keyHmrcDeviceId, value: id);
    }
    return _deviceId = id;
  }

  static final _uuidPattern = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false,
  );

  static bool isUuid(String value) => _uuidPattern.hasMatch(value);

  static String uuidV4([Random? random]) {
    final rng = random ?? Random.secure();
    final b = List<int>.generate(16, (_) => rng.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-'
        '${h.substring(16, 20)}-${h.substring(20)}';
  }

  /// The operating system and model, read once. Falls back to what dart:io
  /// knows if the plugin fails, so the header is still sent.
  Future<HmrcDeviceOs> _readOs() async {
    if (_os != null) return _os!;
    HmrcDeviceOs os;
    try {
      if (Platform.isIOS) {
        final info = await _deviceInfo.iosInfo;
        final machine = info.utsname.machine;
        os = HmrcDeviceOs(
          family: 'iOS',
          version: info.systemVersion,
          manufacturer: 'Apple',
          // e.g. "iPhone 15 Pro"; the hardware code ("iPhone16,1") if not known.
          model: info.modelName.isNotEmpty ? info.modelName : machine,
        );
      } else if (Platform.isAndroid) {
        final info = await _deviceInfo.androidInfo;
        os = HmrcDeviceOs(
          family: 'Android',
          version: info.version.release,
          manufacturer: info.manufacturer,
          model: info.model,
        );
      } else {
        os = fallbackOs();
      }
    } catch (_) {
      os = fallbackOs();
    }
    return _os = os;
  }

  /// What dart:io alone can say about the operating system.
  static HmrcDeviceOs fallbackOs() {
    final family = Platform.isIOS
        ? 'iOS'
        : Platform.isAndroid
            ? 'Android'
            : Platform.operatingSystem;
    return HmrcDeviceOs(
      family: family,
      version: cleanOsVersion(Platform.operatingSystemVersion),
      manufacturer: Platform.isIOS ? 'Apple' : null,
    );
  }

  /// The first version number in dart:io's long description, e.g. "18.1"
  /// from "Version 18.1 (Build 22B83)", or the description itself if it has
  /// no number.
  static String cleanOsVersion(String raw) {
    final match = RegExp(r'\d+(?:\.\d+)*').firstMatch(raw);
    final value = match?.group(0) ?? raw.trim();
    return value.isEmpty ? 'unknown' : value;
  }

  /// The details as the server's mobileClientDetailsSchema expects them.
  /// Screens and window sizes that aren't positive are left out; returns null
  /// when no screen is left, since the server would refuse the header.
  static Map<String, dynamic>? buildDetails({
    required String deviceId,
    required List<HmrcScreen> screens,
    required int windowWidth,
    required int windowHeight,
    required int utcOffsetMinutes,
    required HmrcDeviceOs os,
  }) {
    final usable = screens
        .where((s) => s.width > 0 && s.height > 0 && s.scalingFactor > 0)
        .take(8)
        .map((s) => {
              'width': s.width,
              'height': s.height,
              'scalingFactor': s.scalingFactor,
              'colourDepth': s.colourDepth,
            })
        .toList();
    if (usable.isEmpty || windowWidth < 1 || windowHeight < 1) return null;

    String? optional(String? value, int max) {
      final v = value?.trim() ?? '';
      return v.isEmpty ? null : _cut(v, max);
    }

    final family = _cut(os.family.trim(), 64);
    final version = _cut(os.version.trim(), 256);
    final manufacturer = optional(os.manufacturer, 128);
    final model = optional(os.model, 128);
    return {
      'deviceId': deviceId,
      'screens': usable,
      'window': {'width': windowWidth, 'height': windowHeight},
      'utcOffsetMinutes': utcOffsetMinutes,
      'osFamily': family.isEmpty ? 'unknown' : family,
      'osVersion': version.isEmpty ? 'unknown' : version,
      'deviceManufacturer': ?manufacturer,
      'deviceModel': ?model,
    };
  }

  static String _cut(String value, int max) =>
      value.length <= max ? value : value.substring(0, max);

  /// base64url of the JSON, without "=" padding.
  static String encode(Map<String, dynamic> details) =>
      base64Url.encode(utf8.encode(jsonEncode(details))).replaceAll('=', '');

  /// The header value, or null if the screen isn't known yet.
  Future<String?> headerValue() async {
    final dispatcher = PlatformDispatcher.instance;
    final views = dispatcher.views;
    if (views.isEmpty) return null;
    final view = views.first;
    final ratio = view.devicePixelRatio;
    if (ratio <= 0) return null;
    final displays =
        dispatcher.displays.isNotEmpty ? dispatcher.displays : [view.display];
    // Flutter doesn't expose colour depth; phone screens are 24-bit.
    final screens = [
      for (final d in displays)
        HmrcScreen(
          width: d.size.width.round(),
          height: d.size.height.round(),
          scalingFactor: d.devicePixelRatio,
        ),
    ];
    final details = buildDetails(
      deviceId: await deviceId(),
      screens: screens,
      windowWidth: (view.physicalSize.width / ratio).round(),
      windowHeight: (view.physicalSize.height / ratio).round(),
      utcOffsetMinutes: DateTime.now().timeZoneOffset.inMinutes,
      os: await _readOs(),
    );
    return details == null ? null : encode(details);
  }
}
