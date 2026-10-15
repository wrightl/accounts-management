import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/data/models/dashboard.dart';
import 'package:ddapp_mobile/data/models/expense.dart';
import 'package:ddapp_mobile/data/models/work.dart';

Deadline _deadline(String status, int daysLeft, {String? filedOn}) => Deadline.fromJson({
      'kind': 'vat_return',
      'label': 'VAT return',
      'dueDate': '2026-11-07',
      'status': status,
      'daysLeft': daysLeft,
      'filedOn': filedOn,
    });

void main() {
  test('describes when a deadline is due, as the web does', () {
    expect(_deadline('upcoming', 12).whenLabel, 'Due in 12 days');
    expect(_deadline('due_soon', 1).whenLabel, 'Due in 1 day');
    expect(_deadline('due_soon', 0).whenLabel, 'Due today');
    expect(_deadline('overdue', -3).whenLabel, '3 days overdue');
    expect(_deadline('done', 5, filedOn: '2026-10-01').whenLabel, 'Done on 2026-10-01');
  });

  test('reads the weekly close checklist', () {
    final close = WeeklyClose.fromJson({
      'outstanding': 1,
      'bankReconciledThrough': '2026-10-10',
      'items': [
        {'key': 'receipts', 'label': 'Receipts to review', 'count': 2},
        {'key': 'bank', 'label': 'Bank transactions reconciled', 'count': 0},
      ],
      'lastClose': {'closedAt': '2026-10-06T09:00:00.000Z', 'closedByName': 'Lee'},
      'deadlines': [],
    });

    expect(close.items.first.isDone, false);
    expect(close.items.last.isDone, true);
    expect(close.lastClosedByName, 'Lee');
  });

  test('reads bookkeeper suggestions', () {
    final page = BookkeeperPage.fromJson({
      'aiReady': true,
      'uncategorised': 3,
      'categories': [
        {'id': 't1', 'bookedAt': '2026-10-01', 'amountFormatted': '£19.99', 'categoryLabel': 'Software'},
      ],
      'receipts': [
        {
          'matchId': 'm1',
          'expenseDescription': 'Train',
          'expenseAmountFormatted': '£20.00',
          'bankAmountFormatted': '£21.00',
          'bookedAt': '2026-10-02',
          'amountsDiffer': true,
        },
      ],
    });

    expect(page.categories.single.categoryLabel, 'Software');
    expect(page.receipts.single.amountsDiffer, true);
  });

  test('summarises a receipt reading like the web field', () {
    final read = ReceiptExtraction.fromJson({
      'description': 'Pret',
      'amountPounds': '6.50',
      'spentAt': '2026-10-01',
      'currency': 'USD',
      'confidence': 'partial',
    });
    expect(read.summary, 'Filled: description, amount, date');
    expect(read.isForeignCurrency, true);
    expect(read.spentAt, DateTime(2026, 10, 1));

    final none = ReceiptExtraction.fromJson({'confidence': 'none', 'description': ' '});
    expect(none.summary, 'No fields could be read — fill in the details manually.');
  });

  test('sends mileage only when logging mileage', () {
    final mileage = CreateExpenseRequest(
      description: 'Client visit',
      amountPence: 450,
      category: 'Travel',
      expenseDate: DateTime(2026, 10, 1),
      status: 'reimbursable',
      mileageMiles: 10,
      mileageRatePence: 45,
    ).toJson();
    expect(mileage['useMileage'], true);
    expect(mileage['mileageMiles'], 10);

    final plain = CreateExpenseRequest(
      description: 'Taxi',
      amountPence: 1500,
      category: 'Travel',
      expenseDate: DateTime(2026, 10, 1),
      status: 'recorded',
    ).toJson();
    expect(plain.containsKey('useMileage'), false);
  });

  test('reads safe to pay when the server sends it', () {
    final withSafe = SafeToPayData.fromJson({
      'safeNowFormatted': '£4,000.00',
      'safeLaterFormatted': '£5,500.00',
      'cashKnown': true,
    });
    expect(withSafe.safeNowFormatted, '£4,000.00');
    expect(withSafe.cashKnown, true);
  });
}
