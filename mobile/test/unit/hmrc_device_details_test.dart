import 'dart:convert';

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
}
