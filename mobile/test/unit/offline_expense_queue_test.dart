import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:alfa/data/models/api_response.dart';
import 'package:alfa/data/models/expense.dart';
import 'package:alfa/data/repositories/expense_repository.dart';
import 'package:alfa/features/expenses/offline_expense_queue.dart';

Expense _saved(String id) => Expense.fromJson({
      'id': id,
      'companyId': 'c1',
      'description': 'Coffee',
      'amountPence': 350,
      'status': 'recorded',
    });

/// Answers create and upload from scripts, one answer per call.
class _ScriptedRepository extends ExpenseRepository {
  _ScriptedRepository({this.creates = const [], this.uploads = const []});

  final List<ApiResponse<Expense>> creates;
  final List<ApiResponse<String>> uploads;
  final createdBodies = <Map<String, dynamic>>[];
  final uploadedFor = <String>[];
  int _create = 0;
  int _upload = 0;

  @override
  Future<ApiResponse<Expense>> createExpenseFromJson(Map<String, dynamic> body) async {
    createdBodies.add(body);
    return creates[_create++];
  }

  @override
  Future<ApiResponse<String>> uploadReceipt(
    String expenseId,
    String filePath, {
    Function(int, int)? onProgress,
  }) async {
    uploadedFor.add(expenseId);
    return uploads[_upload++];
  }
}

final _offline = ApiResponse<Expense>.error('offline', code: 'offline');

void main() {
  late Directory dir;
  late OfflineExpenseQueue queue;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('queue');
    queue = OfflineExpenseQueue(directory: () async => dir);
  });

  tearDown(() => dir.delete(recursive: true));

  Map<String, dynamic> body(String id) => {'description': 'Coffee', 'clientRequestId': id};

  test('makes v4 request ids', () {
    final id = newClientRequestId(Random(1));
    expect(id, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
  });

  test('keeps expenses across restarts and sends them in order', () async {
    await queue.add(body('a'));
    await queue.add(body('b'));

    final reopened = OfflineExpenseQueue(directory: () async => dir);
    expect((await reopened.items()).map((i) => i.clientRequestId), ['a', 'b']);

    final repo = _ScriptedRepository(
      creates: [ApiResponse.success(_saved('e1')), ApiResponse.success(_saved('e2'))],
    );
    expect(await reopened.flush(repo), 2);
    expect(repo.createdBodies.map((b) => b['clientRequestId']), ['a', 'b']);
    expect(await reopened.items(), isEmpty);
  });

  test('stops while still offline and keeps the rest', () async {
    await queue.add(body('a'));
    await queue.add(body('b'));

    final repo = _ScriptedRepository(creates: [_offline]);
    expect(await queue.flush(repo), 0);
    expect(repo.createdBodies, hasLength(1));
    expect((await queue.items()).map((i) => i.lastError), [null, null]);
  });

  test('a refused expense waits with its reason; the next still goes', () async {
    await queue.add(body('a'));
    await queue.add(body('b'));

    final repo = _ScriptedRepository(creates: [
      ApiResponse.error('The books are locked up to 31 Mar 2026'),
      ApiResponse.success(_saved('e2')),
    ]);
    expect(await queue.flush(repo), 1);
    final left = await queue.items();
    expect(left.single.clientRequestId, 'a');
    expect(left.single.lastError, contains('locked'));
  });

  test('uploads the receipt copy, and retries only the upload if that fails', () async {
    final receipt = File('${dir.path}/photo.jpg')..writeAsBytesSync([1, 2, 3]);
    await queue.add(body('a'), receiptPath: receipt.path);
    final copy = (await queue.items()).single.receiptPath!;
    expect(File(copy).existsSync(), true);

    final first = _ScriptedRepository(
      creates: [ApiResponse.success(_saved('e1'))],
      uploads: [ApiResponse<String>.error('offline', code: 'offline')],
    );
    await queue.flush(first);
    expect((await queue.items()).single.savedExpenseId, 'e1');

    final second = _ScriptedRepository(uploads: [ApiResponse.success('r1')]);
    expect(await queue.flush(second), 1);
    expect(second.createdBodies, isEmpty);
    expect(second.uploadedFor, ['e1']);
    expect(File(copy).existsSync(), false);
  });
}
