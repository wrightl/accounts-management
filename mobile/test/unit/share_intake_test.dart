import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'package:ddapp_mobile/core/share/share_intake.dart';

SharedMediaFile _file(String path, SharedMediaType type, [String? mimeType]) =>
    SharedMediaFile(path: path, type: type, mimeType: mimeType);

void main() {
  test('takes the first image or PDF, ignoring text and video', () {
    expect(
      ShareIntake.receiptPathFrom([
        _file('Hello', SharedMediaType.text),
        _file('/tmp/clip.mp4', SharedMediaType.video),
        _file('/tmp/receipt.PDF', SharedMediaType.file),
        _file('/tmp/photo.jpg', SharedMediaType.image),
      ]),
      '/tmp/receipt.PDF',
    );
    expect(
      ShareIntake.receiptPathFrom([
        _file('/tmp/scan', SharedMediaType.file, 'application/pdf'),
      ]),
      '/tmp/scan',
    );
    expect(ShareIntake.receiptPathFrom([_file('Hi', SharedMediaType.text)]), isNull);
  });

  test('hands on a receipt that launched the app and later ones', () async {
    final later = StreamController<List<SharedMediaFile>>.broadcast();
    final received = <String>[];
    final intake = ShareIntake(
      initial: () async => [_file('/tmp/first.jpg', SharedMediaType.image)],
      stream: () => later.stream,
      reset: () async {},
    );

    await intake.start(received.add);
    later.add([_file('/tmp/second.pdf', SharedMediaType.file)]);
    await Future<void>.delayed(Duration.zero);
    await intake.stop();

    expect(received, ['/tmp/first.jpg', '/tmp/second.pdf']);
  });
}
