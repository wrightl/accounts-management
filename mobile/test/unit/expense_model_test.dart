import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/data/models/expense.dart';

void main() {
  test('parses expenses when category and date are null', () {
    final expense = Expense.fromJson({
      'id': 'e1',
      'companyId': 'co1',
      'description': null,
      'amountPence': 1500,
      'category': null,
      'expenseDate': null,
      'status': 'pending',
      'notes': null,
      'billable': true,
      'source': null,
      'receipts': [
        {
          'id': 'r1',
          'filename': null,
          'uploadedAt': '2026-09-01T00:00:00.000Z',
        },
      ],
      'createdAt': '2026-09-01T00:00:00.000Z',
      'updatedAt': null,
    });

    expect(expense.description, '');
    expect(expense.category, 'Other');
    expect(expense.source, 'manual');
    expect(expense.receipts.single.filename, 'receipt');
    expect(expense.expenseDate.year, 2026);
  });
}
