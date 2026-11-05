import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../data/repositories/expense_repository.dart';

/// A random v4 UUID, for an expense's `clientRequestId`.
String newClientRequestId([Random? random]) {
  final rng = random ?? Random.secure();
  final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-'
      '${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// An expense captured while offline, waiting to be sent.
class QueuedExpense {
  QueuedExpense({
    required this.clientRequestId,
    required this.body,
    this.receiptPath,
    this.savedExpenseId,
    this.lastError,
    required this.queuedAt,
  });

  final String clientRequestId;

  /// The create request as the API takes it, including [clientRequestId].
  final Map<String, dynamic> body;

  /// A copy of the receipt in the app's own storage.
  final String? receiptPath;

  /// Set once the expense is saved, if its receipt still has to upload.
  final String? savedExpenseId;

  /// Why the server refused it, e.g. a locked period; it waits for the person.
  final String? lastError;
  final DateTime queuedAt;

  String get description => (body['description'] as String?) ?? 'Expense';

  QueuedExpense copyWith({String? savedExpenseId, String? lastError}) => QueuedExpense(
        clientRequestId: clientRequestId,
        body: body,
        receiptPath: receiptPath,
        savedExpenseId: savedExpenseId ?? this.savedExpenseId,
        lastError: lastError,
        queuedAt: queuedAt,
      );

  Map<String, dynamic> toJson() => {
        'clientRequestId': clientRequestId,
        'body': body,
        'receiptPath': receiptPath,
        'savedExpenseId': savedExpenseId,
        'lastError': lastError,
        'queuedAt': queuedAt.toIso8601String(),
      };

  factory QueuedExpense.fromJson(Map<String, dynamic> json) => QueuedExpense(
        clientRequestId: json['clientRequestId'] as String,
        body: Map<String, dynamic>.from(json['body'] as Map),
        receiptPath: json['receiptPath'] as String?,
        savedExpenseId: json['savedExpenseId'] as String?,
        lastError: json['lastError'] as String?,
        queuedAt: DateTime.parse(json['queuedAt'] as String),
      );
}

/// Expenses saved on this phone while offline, sent in order once it's back
/// online. Each carries its own id, so a send that times out after the
/// server saved it doesn't create a second expense.
class OfflineExpenseQueue {
  OfflineExpenseQueue({Future<Directory> Function()? directory})
      : _directory = directory ?? getApplicationSupportDirectory;

  final Future<Directory> Function() _directory;
  List<QueuedExpense>? _items;
  bool _flushing = false;

  Future<File> _file() async => File('${(await _directory()).path}/offline_expenses.json');

  Future<List<QueuedExpense>> items() async {
    if (_items != null) return List.unmodifiable(_items!);
    try {
      final file = await _file();
      if (!await file.exists()) return List.unmodifiable(_items = []);
      final raw = jsonDecode(await file.readAsString()) as List;
      _items = raw.map((e) => QueuedExpense.fromJson(Map<String, dynamic>.from(e as Map))).toList();
    } catch (error) {
      debugPrint('Offline queue unreadable ($error)');
      _items = [];
    }
    return List.unmodifiable(_items!);
  }

  Future<void> _save() async {
    final file = await _file();
    await file.parent.create(recursive: true);
    await file.writeAsString(jsonEncode([for (final item in _items!) item.toJson()]));
  }

  /// Keep [body] (which must carry its `clientRequestId`) and a copy of the
  /// receipt until it can be sent.
  Future<QueuedExpense> add(Map<String, dynamic> body, {String? receiptPath}) async {
    await items();
    final id = body['clientRequestId'] as String;
    String? copy;
    if (receiptPath != null) {
      final source = File(receiptPath);
      final name = receiptPath.split(Platform.pathSeparator).last;
      copy = '${(await _directory()).path}/offline-receipt-$id-$name';
      await source.copy(copy);
    }
    final item = QueuedExpense(
      clientRequestId: id,
      body: body,
      receiptPath: copy,
      queuedAt: DateTime.now(),
    );
    _items!.add(item);
    await _save();
    return item;
  }

  Future<void> remove(String clientRequestId) async {
    await items();
    final item = _items!.where((i) => i.clientRequestId == clientRequestId).firstOrNull;
    if (item == null) return;
    _items!.remove(item);
    await _save();
    final receipt = item.receiptPath;
    if (receipt != null) {
      try {
        await File(receipt).delete();
      } catch (_) {
        // Already gone.
      }
    }
  }

  /// Send what's waiting, oldest first. Stops at the first offline failure;
  /// an expense the server refuses keeps its error for the person to see.
  /// Returns how many were sent.
  Future<int> flush(ExpenseRepository repository) async {
    if (_flushing) return 0;
    _flushing = true;
    var sent = 0;
    try {
      for (final item in List.of(await items())) {
        if (item.lastError != null) continue;
        var savedId = item.savedExpenseId;
        if (savedId == null) {
          final created = await repository.createExpenseFromJson(item.body);
          if (created.isOffline) break;
          if (!created.success || created.data == null) {
            await _replace(item.copyWith(lastError: created.error ?? 'Could not save'));
            continue;
          }
          savedId = created.data!.id;
          await _replace(item.copyWith(savedExpenseId: savedId));
        }
        final receipt = item.receiptPath;
        if (receipt != null && await File(receipt).exists()) {
          final uploaded = await repository.uploadReceipt(savedId, receipt);
          if (uploaded.isOffline) break;
          if (!uploaded.success) {
            await _replace(item.copyWith(
              savedExpenseId: savedId,
              lastError: 'Saved, but the receipt didn\'t upload: ${uploaded.error}',
            ));
            continue;
          }
        }
        await remove(item.clientRequestId);
        sent += 1;
      }
    } finally {
      _flushing = false;
    }
    return sent;
  }

  /// Try a refused one again, e.g. after unlocking the period on the web.
  Future<void> retry(String clientRequestId) async {
    await items();
    final index = _items!.indexWhere((i) => i.clientRequestId == clientRequestId);
    if (index < 0) return;
    final item = _items![index];
    _items![index] = QueuedExpense(
      clientRequestId: item.clientRequestId,
      body: item.body,
      receiptPath: item.receiptPath,
      savedExpenseId: item.savedExpenseId,
      queuedAt: item.queuedAt,
    );
    await _save();
  }

  Future<void> _replace(QueuedExpense item) async {
    final index = _items!.indexWhere((i) => i.clientRequestId == item.clientRequestId);
    if (index < 0) return;
    _items![index] = item;
    await _save();
  }
}
