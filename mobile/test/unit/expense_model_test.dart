import 'package:flutter_test/flutter_test.dart';
import 'package:alfa/data/models/expense.dart';

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

  test('reads payer and client, and labels statuses like the web', () {
    final expense = Expense.fromJson({
      'id': 'e2',
      'companyId': 'co1',
      'status': 'company_paid',
      'paidByName': 'Ada',
      'clientName': 'Ada Ltd',
      'vatRate': 20,
    });

    expect(expense.statusLabel, 'Company paid');
    expect(expense.paidByName, 'Ada');
    expect(expense.clientName, 'Ada Ltd');
    expect(expense.vatRate, 20);
    expect(expenseStatusLabel('pending'), 'Pending review');
  });

  test('create request carries the web form fields', () {
    final json = CreateExpenseRequest(
      description: 'Taxi',
      amountPence: 1500,
      category: 'Travel',
      expenseDate: DateTime(2026, 3, 2),
      status: 'reimbursable',
      paidByUserId: 'u1',
      billable: true,
      clientId: 'c1',
      vatRate: 20,
    ).toJson();

    expect(json['status'], 'reimbursable');
    expect(json['paidByUserId'], 'u1');
    expect(json['clientId'], 'c1');
    expect(json['expenseDate'], '2026-03-02');
    expect(json.containsKey('notes'), false);
  });

  test('a foreign expense sends its currency and leaves sterling to the server', () {
    final json = CreateExpenseRequest(
      description: 'Paris train',
      currency: 'eur',
      originalAmount: '12.50',
      category: 'Travel',
      expenseDate: DateTime(2026, 3, 2),
      status: 'recorded',
    ).toJson();

    expect(json['currency'], 'EUR');
    expect(json['originalAmount'], '12.50');
    expect(json.containsKey('amountPence'), false);
  });

  test('a sterling expense sends no currency', () {
    final json = CreateExpenseRequest(
      description: 'Taxi',
      amountPence: 1500,
      currency: 'GBP',
      category: 'Travel',
      expenseDate: DateTime(2026, 3, 2),
      status: 'recorded',
    ).toJson();

    expect(json['amountPence'], 1500);
    expect(json.containsKey('currency'), false);
  });

  test('reads the foreign amount and the web display amount', () {
    final expense = Expense.fromJson({
      'id': 'e1',
      'companyId': 'c1',
      'description': 'Paris train',
      'amountPence': 1000,
      'currency': 'EUR',
      'originalAmountMinor': 1250,
      'amountFormatted': '£10.00 (€12.50)',
      'status': 'recorded',
    });

    expect(expense.isForeign, true);
    expect(expense.displayAmount, '£10.00 (€12.50)');
  });
}
