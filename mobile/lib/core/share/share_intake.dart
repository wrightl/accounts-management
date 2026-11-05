import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import '../../data/models/expense.dart';

/// Receipts shared into Alfa from another app (Photos, Files, Mail).
///
/// Android delivers them through the intent filters in AndroidManifest.xml.
/// iOS needs a Share Extension target (see mobile/README.md); until it's
/// added, nothing arrives on iOS and this does nothing.
class ShareIntake {
  ShareIntake({
    Future<List<SharedMediaFile>> Function()? initial,
    Stream<List<SharedMediaFile>> Function()? stream,
    Future<void> Function()? reset,
  })  : _initial = initial ?? ReceiveSharingIntent.instance.getInitialMedia,
        _stream = stream ?? ReceiveSharingIntent.instance.getMediaStream,
        _reset = reset ?? (() async => ReceiveSharingIntent.instance.reset());

  final Future<List<SharedMediaFile>> Function() _initial;
  final Stream<List<SharedMediaFile>> Function() _stream;
  final Future<void> Function() _reset;
  StreamSubscription<List<SharedMediaFile>>? _subscription;

  /// Call [onReceipt] with the path of each receipt file shared in, including
  /// one that launched the app.
  Future<void> start(void Function(String path) onReceipt) async {
    if (kIsWeb || _subscription != null) return;
    void handle(List<SharedMediaFile> files) {
      final path = receiptPathFrom(files);
      if (path != null) onReceipt(path);
    }

    try {
      _subscription = _stream().listen(handle, onError: (Object error) {
        debugPrint('Share: $error');
      });
      handle(await _initial());
      await _reset();
    } catch (error) {
      debugPrint('Share: not available ($error)');
    }
  }

  Future<void> stop() async {
    await _subscription?.cancel();
    _subscription = null;
  }

  /// The first shared file that can be a receipt. One expense per share, as
  /// the capture form holds one receipt.
  @visibleForTesting
  static String? receiptPathFrom(List<SharedMediaFile> files) {
    for (final file in files) {
      final isImage = file.type == SharedMediaType.image ||
          (file.mimeType?.startsWith('image/') ?? false);
      final lower = file.path.toLowerCase();
      final hasReceiptExtension =
          receiptFileExtensions.any((ext) => lower.endsWith('.$ext'));
      if (isImage || file.mimeType == 'application/pdf' || hasReceiptExtension) {
        return file.path;
      }
    }
    return null;
  }
}
