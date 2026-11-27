import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:ui';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:package_info_plus/package_info_plus.dart';
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

/// The screens and the app's window (in logical pixels).
class HmrcDisplay {
  const HmrcDisplay({
    required this.screens,
    required this.windowWidth,
    required this.windowHeight,
  });

  final List<HmrcScreen> screens;
  final int windowWidth;
  final int windowHeight;
}

/// The device details HMRC's fraud prevention headers need when the server
/// calls HMRC for something done in the app (connection method
/// MOBILE_APP_VIA_SERVER). Sent to Alfa's API in the X-Alfa-Device header as
/// base64url JSON with no padding; the server checks it with
/// mobileClientDetailsSchema and turns it into the Gov-Client-* headers
/// (src/lib/hmrc/fraud-headers.ts).
///
/// The platform lookups can be replaced, so tests don't depend on a device.
/// Each one is guarded: a lookup that fails only leaves its field out.
class HmrcDeviceDetails {
  static const headerName = 'X-Alfa-Device';

  /// How long the local IP addresses are reused before being read again.
  static const localIpsMaxAge = Duration(seconds: 60);

  /// The most local IP addresses sent.
  static const maxLocalIps = 16;

  /// The longest string sent in any field.
  static const maxStringLength = 128;

  final FlutterSecureStorage _storage;
  final Future<HmrcDeviceOs> Function() _osLookup;
  final Future<String?> Function() _appVersionLookup;
  final Future<List<String>> Function() _localIpsLookup;
  final HmrcDisplay? Function() _displayLookup;
  final DateTime Function() _now;

  String? _deviceId;
  HmrcDeviceOs? _os;
  String? _appVersion;
  bool _appVersionRead = false;
  List<String>? _localIps;
  DateTime? _localIpsAt;

  HmrcDeviceDetails(
    this._storage, {
    DeviceInfoPlugin? deviceInfo,
    Future<HmrcDeviceOs> Function()? osLookup,
    Future<String?> Function()? appVersionLookup,
    Future<List<String>> Function()? localIpsLookup,
    HmrcDisplay? Function()? displayLookup,
    DateTime Function()? now,
  })  : _osLookup = osLookup ?? (() => readOs(deviceInfo ?? DeviceInfoPlugin())),
        _appVersionLookup = appVersionLookup ?? readAppVersion,
        _localIpsLookup = localIpsLookup ?? readLocalIps,
        _displayLookup = displayLookup ?? readDisplay,
        _now = now ?? DateTime.now;

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

  // ---- Platform lookups (the defaults) ----

  /// The operating system and model from device_info_plus.
  static Future<HmrcDeviceOs> readOs(DeviceInfoPlugin deviceInfo) async {
    if (Platform.isIOS) {
      final info = await deviceInfo.iosInfo;
      return HmrcDeviceOs(
        family: 'iOS',
        version: info.systemVersion,
        manufacturer: 'Apple',
        // The hardware identifier, e.g. "iPhone15,2".
        model: info.utsname.machine,
      );
    }
    if (Platform.isAndroid) {
      final info = await deviceInfo.androidInfo;
      return HmrcDeviceOs(
        family: 'Android',
        version: info.version.release,
        manufacturer: info.manufacturer,
        model: info.model,
      );
    }
    return fallbackOs();
  }

  /// The app's version and build number, e.g. "1.0.0+4".
  static Future<String?> readAppVersion() async {
    final info = await PackageInfo.fromPlatform();
    if (info.version.isEmpty) return null;
    return info.buildNumber.isEmpty
        ? info.version
        : '${info.version}+${info.buildNumber}';
  }

  /// The device's own (non-loopback, non-link-local) IP addresses.
  static Future<List<String>> readLocalIps() async {
    final interfaces = await NetworkInterface.list(
      includeLoopback: false,
      includeLinkLocal: false,
      type: InternetAddressType.any,
    );
    return [
      for (final interface in interfaces)
        for (final address in interface.addresses) address.address,
    ];
  }

  /// The screens and window from Flutter's view, or null before the first
  /// frame when nothing is known yet.
  static HmrcDisplay? readDisplay() {
    final dispatcher = PlatformDispatcher.instance;
    final views = dispatcher.views;
    if (views.isEmpty) return null;
    final view = views.first;
    final ratio = view.devicePixelRatio;
    if (ratio <= 0) return null;
    final displays =
        dispatcher.displays.isNotEmpty ? dispatcher.displays : [view.display];
    return HmrcDisplay(
      // Flutter doesn't expose colour depth; phone screens are 24-bit.
      screens: [
        for (final d in displays)
          HmrcScreen(
            width: d.size.width.round(),
            height: d.size.height.round(),
            scalingFactor: d.devicePixelRatio,
          ),
      ],
      windowWidth: (view.physicalSize.width / ratio).round(),
      windowHeight: (view.physicalSize.height / ratio).round(),
    );
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

  /// IP addresses as HMRC wants them: IPv6 zone suffixes ("%en0") dropped,
  /// duplicates removed, order kept, at most [maxLocalIps].
  static List<String> normaliseLocalIps(Iterable<String> raw) {
    final seen = <String>{};
    for (final value in raw) {
      final percent = value.indexOf('%');
      final ip = (percent >= 0 ? value.substring(0, percent) : value).trim();
      if (ip.isEmpty) continue;
      seen.add(ip);
      if (seen.length == maxLocalIps) break;
    }
    return seen.toList();
  }

  // ---- Cached reads, each one guarded ----

  Future<HmrcDeviceOs> _readOsOnce() async {
    if (_os != null) return _os!;
    try {
      _os = await _osLookup();
    } catch (_) {
      _os = fallbackOs();
    }
    return _os!;
  }

  Future<String?> _readAppVersionOnce() async {
    if (_appVersionRead) return _appVersion;
    try {
      _appVersion = await _appVersionLookup();
    } catch (_) {
      _appVersion = null;
    }
    // Read once, as it can't change while the app runs.
    _appVersionRead = true;
    return _appVersion;
  }

  /// The local IPs, read again once they are [localIpsMaxAge] old. A failed
  /// read gives an empty list (also cached, so a broken lookup isn't retried
  /// on every request).
  Future<({List<String> ips, DateTime at})> _readLocalIpsCached() async {
    final now = _now();
    final at = _localIpsAt;
    if (_localIps != null && at != null && now.difference(at) < localIpsMaxAge) {
      return (ips: _localIps!, at: at);
    }
    List<String> ips;
    try {
      ips = normaliseLocalIps(await _localIpsLookup());
    } catch (_) {
      ips = const [];
    }
    _localIps = ips;
    _localIpsAt = now;
    return (ips: ips, at: now);
  }

  // ---- Building the header ----

  /// The details as the server's mobileClientDetailsSchema expects them.
  /// Screens and window sizes that aren't positive are left out; returns null
  /// when no screen is left, since the server would refuse the header.
  ///
  /// [localIps], [localIpsAt] and [appVersion] are newer fields the server
  /// ignores until it reads them; each is left out when null.
  static Map<String, dynamic>? buildDetails({
    required String deviceId,
    required List<HmrcScreen> screens,
    required int windowWidth,
    required int windowHeight,
    required int utcOffsetMinutes,
    required HmrcDeviceOs os,
    List<String>? localIps,
    DateTime? localIpsAt,
    String? appVersion,
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

    String? optional(String? value, [int max = maxStringLength]) {
      final v = value?.trim() ?? '';
      return v.isEmpty ? null : _cut(v, max);
    }

    // The server allows at most 64 characters for the OS family.
    final family = optional(os.family, 64);
    final version = optional(os.version);
    final manufacturer = optional(os.manufacturer);
    final model = optional(os.model);
    final app = optional(appVersion);
    return {
      'deviceId': deviceId,
      'screens': usable,
      'window': {'width': windowWidth, 'height': windowHeight},
      'utcOffsetMinutes': utcOffsetMinutes,
      'osFamily': family ?? 'unknown',
      'osVersion': version ?? 'unknown',
      'deviceManufacturer': ?manufacturer,
      'deviceModel': ?model,
      if (localIps != null)
        'localIps': [for (final ip in normaliseLocalIps(localIps)) _cut(ip, maxStringLength)],
      if (localIpsAt != null) 'localIpsAt': isoMillisUtc(localIpsAt),
      'appVersion': ?app,
    };
  }

  /// ISO 8601 in UTC to the millisecond, e.g. "2026-11-27T09:15:30.123Z".
  /// (toIso8601String adds microseconds on phones, which HMRC doesn't want.)
  static String isoMillisUtc(DateTime time) {
    final utc = time.toUtc();
    final millis = DateTime.fromMillisecondsSinceEpoch(
      utc.millisecondsSinceEpoch,
      isUtc: true,
    );
    return millis.toIso8601String();
  }

  static String _cut(String value, int max) =>
      value.length <= max ? value : value.substring(0, max);

  /// base64url of the JSON, without "=" padding.
  static String encode(Map<String, dynamic> details) =>
      base64Url.encode(utf8.encode(jsonEncode(details))).replaceAll('=', '');

  /// The header value, or null if the screen isn't known yet. Safe to call on
  /// every request: the slow lookups are cached and none of them can throw.
  /// The IP addresses are never logged.
  Future<String?> headerValue() async {
    final HmrcDisplay? display;
    try {
      display = _displayLookup();
    } catch (_) {
      return null;
    }
    if (display == null) return null;

    final results = await Future.wait<Object?>([
      _readOsOnce(),
      _readAppVersionOnce(),
      _readLocalIpsCached(),
    ]);
    final os = results[0] as HmrcDeviceOs;
    final appVersion = results[1] as String?;
    final ips = results[2] as ({List<String> ips, DateTime at});

    final details = buildDetails(
      deviceId: await deviceId(),
      screens: display.screens,
      windowWidth: display.windowWidth,
      windowHeight: display.windowHeight,
      utcOffsetMinutes: _now().timeZoneOffset.inMinutes,
      os: os,
      localIps: ips.ips,
      localIpsAt: ips.at,
      appVersion: appVersion,
    );
    return details == null ? null : encode(details);
  }
}
