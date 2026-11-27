import 'dart:convert';
import 'dart:io';

import 'package:alfa/core/constants/app_constants.dart';
import 'package:alfa/data/api/hmrc_device_details.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

/// The sample header the server test decodes with mobileClientDetailsSchema
/// (tests/unit/hmrc-fraud-headers.test.ts). If this changes, update it there.
const sampleHeader =
    'eyJkZXZpY2VJZCI6IjNmMmM5YjFlLTdhNGQtNGU1Zi05YjZjLTFkMmUzZjRhNWI2YyIsInNjcmVlbnMiOlt7IndpZHRoIjoxMTc5LCJoZWlnaHQiOjI1NTYsInNjYWxpbmdGYWN0b3IiOjMuMCwiY29sb3VyRGVwdGgiOjI0fV0sIndpbmRvdyI6eyJ3aWR0aCI6MzkzLCJoZWlnaHQiOjg1Mn0sInV0Y09mZnNldE1pbnV0ZXMiOjYwLCJvc0ZhbWlseSI6ImlPUyIsIm9zVmVyc2lvbiI6IjE4LjEiLCJkZXZpY2VNYW51ZmFjdHVyZXIiOiJBcHBsZSIsImRldmljZU1vZGVsIjoiaVBob25lIDE1IFBybyJ9';

Map<String, dynamic> sampleDetails() => HmrcDeviceDetails.buildDetails(
      deviceId: '3f2c9b1e-7a4d-4e5f-9b6c-1d2e3f4a5b6c',
      screens: const [
        HmrcScreen(width: 1179, height: 2556, scalingFactor: 3.0),
      ],
      windowWidth: 393,
      windowHeight: 852,
      utcOffsetMinutes: 60,
      os: const HmrcDeviceOs(
        family: 'iOS',
        version: '18.1',
        manufacturer: 'Apple',
        model: 'iPhone 15 Pro',
      ),
    )!;

Map<String, dynamic> decode(String header) {
  final padded = header.padRight((header.length + 3) ~/ 4 * 4, '=');
  return jsonDecode(utf8.decode(base64Url.decode(padded)))
      as Map<String, dynamic>;
}

void main() {
  group('HmrcDeviceDetails.buildDetails', () {
    test('matches the server schema field for field', () {
      final details = sampleDetails();
      expect(details.keys, [
        'deviceId',
        'screens',
        'window',
        'utcOffsetMinutes',
        'osFamily',
        'osVersion',
        'deviceManufacturer',
        'deviceModel',
      ]);
      expect(details['screens'], [
        {'width': 1179, 'height': 2556, 'scalingFactor': 3.0, 'colourDepth': 24},
      ]);
      expect(details['window'], {'width': 393, 'height': 852});
      expect(details['utcOffsetMinutes'], 60);
      expect(details['osFamily'], 'iOS');
      expect(details['osVersion'], '18.1');
    });

    test('leaves out a manufacturer and model it does not know', () {
      final details = HmrcDeviceDetails.buildDetails(
        deviceId: HmrcDeviceDetails.uuidV4(),
        screens: const [HmrcScreen(width: 1080, height: 2400, scalingFactor: 2.75)],
        windowWidth: 393,
        windowHeight: 873,
        utcOffsetMinutes: -300,
        os: const HmrcDeviceOs(family: 'Android', version: '15', model: '  '),
      )!;
      expect(details.containsKey('deviceManufacturer'), isFalse);
      expect(details.containsKey('deviceModel'), isFalse);
      expect(details['utcOffsetMinutes'], -300);
    });

    test('drops empty screens and gives null when none are left', () {
      final details = HmrcDeviceDetails.buildDetails(
        deviceId: HmrcDeviceDetails.uuidV4(),
        screens: const [HmrcScreen(width: 0, height: 0, scalingFactor: 1)],
        windowWidth: 393,
        windowHeight: 852,
        utcOffsetMinutes: 0,
        os: const HmrcDeviceOs(family: 'iOS', version: '18.1'),
      );
      expect(details, isNull);
    });

    test('cuts long values to the lengths the server allows', () {
      final details = HmrcDeviceDetails.buildDetails(
        deviceId: HmrcDeviceDetails.uuidV4(),
        screens: const [HmrcScreen(width: 1, height: 1, scalingFactor: 1)],
        windowWidth: 1,
        windowHeight: 1,
        utcOffsetMinutes: 0,
        os: HmrcDeviceOs(family: 'x' * 100, version: '1', model: 'm' * 200),
      )!;
      expect((details['osFamily'] as String).length, 64);
      expect((details['deviceModel'] as String).length, 128);
    });
  });

  group('HmrcDeviceDetails.encode', () {
    test('is base64url with no padding', () {
      final header = HmrcDeviceDetails.encode(sampleDetails());
      expect(header, isNot(contains('=')));
      expect(header, isNot(contains('+')));
      expect(header, isNot(contains('/')));
      expect(RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(header), isTrue);
    });

    test('decodes back to the same details', () {
      final details = sampleDetails();
      expect(decode(HmrcDeviceDetails.encode(details)), details);
    });

    test('produces the sample header the server test checks', () {
      expect(HmrcDeviceDetails.encode(sampleDetails()), sampleHeader);
    });
  });

  group('device ID', () {
    test('uuidV4 gives version 4 UUIDs', () {
      for (var i = 0; i < 20; i++) {
        final id = HmrcDeviceDetails.uuidV4();
        expect(
          RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
              .hasMatch(id),
          isTrue,
          reason: id,
        );
      }
    });

    test('is kept in secure storage and reused', () async {
      FlutterSecureStorage.setMockInitialValues({});
      const storage = FlutterSecureStorage();
      final first = await HmrcDeviceDetails(storage).deviceId();
      expect(await storage.read(key: AppConstants.keyHmrcDeviceId), first);
      // A new instance, as after the app restarts, reads the same one.
      expect(await HmrcDeviceDetails(storage).deviceId(), first);
    });

    test('replaces a stored value that is not a UUID', () async {
      FlutterSecureStorage.setMockInitialValues({AppConstants.keyHmrcDeviceId: 'junk'});
      const storage = FlutterSecureStorage();
      final id = await HmrcDeviceDetails(storage).deviceId();
      expect(HmrcDeviceDetails.isUuid(id), isTrue);
      expect(await storage.read(key: AppConstants.keyHmrcDeviceId), id);
    });
  });

  test('cleanOsVersion keeps only the version number', () {
    expect(HmrcDeviceDetails.cleanOsVersion('Version 18.1 (Build 22B83)'), '18.1');
    expect(HmrcDeviceDetails.cleanOsVersion('15'), '15');
    expect(HmrcDeviceDetails.cleanOsVersion(''), 'unknown');
  });

  group('headerValue', () {
    const display = HmrcDisplay(
      screens: [HmrcScreen(width: 1080, height: 2400, scalingFactor: 2.75)],
      windowWidth: 393,
      windowHeight: 873,
    );
    const android = HmrcDeviceOs(
      family: 'Android',
      version: '15',
      manufacturer: 'Google',
      model: 'Pixel 9',
    );

    late DateTime clock;
    late int ipReads;
    late int osReads;
    late int versionReads;

    setUp(() {
      FlutterSecureStorage.setMockInitialValues({});
      clock = DateTime.utc(2026, 11, 27, 9, 15, 30, 123, 456);
      ipReads = 0;
      osReads = 0;
      versionReads = 0;
    });

    HmrcDeviceDetails details({
      Future<List<String>> Function()? localIps,
      Future<String?> Function()? appVersion,
      Future<HmrcDeviceOs> Function()? os,
      HmrcDisplay? Function()? displayLookup,
    }) =>
        HmrcDeviceDetails(
          const FlutterSecureStorage(),
          osLookup: os ??
              () async {
                osReads++;
                return android;
              },
          appVersionLookup: appVersion ??
              () async {
                versionReads++;
                return '1.0.0+4';
              },
          localIpsLookup: localIps ??
              () async {
                ipReads++;
                return ['192.168.1.20', 'fe80::1%wlan0', '2001:db8::5%en0', '192.168.1.20'];
              },
          displayLookup: displayLookup ?? () => display,
          now: () => clock,
        );

    test('includes the new keys with the right types', () async {
      final json = decode((await details().headerValue())!);

      expect(json['localIps'], isA<List<dynamic>>());
      expect((json['localIps'] as List).every((ip) => ip is String), isTrue);
      expect(json['localIps'], ['192.168.1.20', 'fe80::1', '2001:db8::5']);

      expect(json['localIpsAt'], isA<String>());
      expect(json['localIpsAt'], '2026-11-27T09:15:30.123Z');
      expect(
        RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$')
            .hasMatch(json['localIpsAt'] as String),
        isTrue,
      );

      expect(json['appVersion'], '1.0.0+4');
      expect(json['deviceManufacturer'], 'Google');
      expect(json['deviceModel'], 'Pixel 9');
    });

    test('keeps the existing fields and shapes', () async {
      final json = decode((await details().headerValue())!);
      expect(HmrcDeviceDetails.isUuid(json['deviceId'] as String), isTrue);
      expect(json['screens'], [
        {'width': 1080, 'height': 2400, 'scalingFactor': 2.75, 'colourDepth': 24},
      ]);
      expect(json['window'], {'width': 393, 'height': 873});
      expect(json['utcOffsetMinutes'], 0);
      expect(json['osFamily'], 'Android');
      expect(json['osVersion'], '15');
    });

    test('sends an empty list when the IP lookup fails or finds nothing', () async {
      final failing = decode((await details(
        localIps: () async => throw const SocketException('no network'),
      ).headerValue())!);
      expect(failing['localIps'], <String>[]);
      expect(failing['localIpsAt'], isA<String>());

      final empty = decode((await details(localIps: () async => []).headerValue())!);
      expect(empty['localIps'], <String>[]);
    });

    test('leaves out the app version and model when their lookups fail', () async {
      final json = decode((await details(
        appVersion: () async => throw Exception('no package info'),
        os: () async => throw Exception('no device info'),
      ).headerValue())!);
      expect(json.containsKey('appVersion'), isFalse);
      // The dart:io fallback, which knows no model.
      expect(json.containsKey('deviceModel'), isFalse);
      expect(json['osFamily'], isA<String>());
    });

    test('leaves out empty manufacturer and model', () async {
      final json = decode((await details(
        os: () async => const HmrcDeviceOs(
          family: 'Android',
          version: '15',
          manufacturer: '',
          model: ' ',
        ),
      ).headerValue())!);
      expect(json.containsKey('deviceManufacturer'), isFalse);
      expect(json.containsKey('deviceModel'), isFalse);
    });

    test('reads the IPs again only after 60 seconds', () async {
      final d = details();
      await d.headerValue();
      clock = clock.add(const Duration(seconds: 59));
      final cached = decode((await d.headerValue())!);
      expect(ipReads, 1);
      expect(cached['localIpsAt'], '2026-11-27T09:15:30.123Z');

      clock = clock.add(const Duration(seconds: 1));
      final fresh = decode((await d.headerValue())!);
      expect(ipReads, 2);
      expect(fresh['localIpsAt'], '2026-11-27T09:16:30.123Z');
    });

    test('reads the app version and device once', () async {
      final d = details();
      await d.headerValue();
      await d.headerValue();
      await d.headerValue();
      expect(versionReads, 1);
      expect(osReads, 1);
    });

    test('gives null rather than throwing when the screen lookup fails', () async {
      expect(await details(displayLookup: () => throw StateError('no view')).headerValue(), isNull);
      expect(await details(displayLookup: () => null).headerValue(), isNull);
    });
  });

  group('normaliseLocalIps', () {
    test('drops zone suffixes and duplicates, keeping order', () {
      expect(
        HmrcDeviceDetails.normaliseLocalIps(['10.0.0.2', 'fe80::a%en0', 'fe80::a%en1', '10.0.0.2']),
        ['10.0.0.2', 'fe80::a'],
      );
    });

    test('keeps at most 16', () {
      final ips = [for (var i = 0; i < 40; i++) '10.0.0.$i'];
      final kept = HmrcDeviceDetails.normaliseLocalIps(ips);
      expect(kept, hasLength(16));
      expect(kept.first, '10.0.0.0');
      expect(kept.last, '10.0.0.15');
    });
  });

  test('cuts every string to 128 characters', () {
    final json = HmrcDeviceDetails.buildDetails(
      deviceId: HmrcDeviceDetails.uuidV4(),
      screens: const [HmrcScreen(width: 1, height: 1, scalingFactor: 1)],
      windowWidth: 1,
      windowHeight: 1,
      utcOffsetMinutes: 0,
      os: HmrcDeviceOs(family: 'f', version: 'v' * 300, manufacturer: 'm' * 300, model: 'd' * 300),
      appVersion: 'a' * 300,
    )!;
    for (final key in ['osVersion', 'deviceManufacturer', 'deviceModel', 'appVersion']) {
      expect((json[key] as String).length, 128, reason: key);
    }
  });
}
