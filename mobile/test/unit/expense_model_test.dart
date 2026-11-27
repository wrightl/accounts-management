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

  group('tax codes and VAT', () {
    CreateExpenseRequest request({
      String? taxCode,
      int vatRate = 0,
      String? vatPounds,
      String? vatSource,
    }) =>
        CreateExpenseRequest(
          description: 'Train',
          amountPence: 1200,
          category: 'Travel',
          expenseDate: DateTime(2026, 11, 20),
          status: 'recorded',
          taxCode: taxCode,
          vatRate: vatRate,
          vatPounds: vatPounds,
          vatSource: vatSource,
        );

    test('sends the tax code with its rate for older servers', () {
      final json = request(taxCode: 'reduced', vatRate: 5).toJson();
      expect(json['taxCode'], 'reduced');
      expect(json['vatRate'], 5);
      expect(json.containsKey('vatPounds'), false);
      expect(json.containsKey('vatSource'), false);
    });

    test('sends no tax code when there is none', () {
      final json = request().toJson();
      expect(json.containsKey('taxCode'), false);
      expect(json['vatRate'], 0);
    });

    test('sends the VAT and where it came from together', () {
      final json = request(
        taxCode: 'standard',
        vatRate: 20,
        vatPounds: '1.98',
        vatSource: 'receipt',
      ).toJson();
      expect(json['vatPounds'], '1.98');
      expect(json['vatSource'], 'receipt');
    });

    test('sends no VAT figure without a source', () {
      final json = request(taxCode: 'standard', vatRate: 20, vatPounds: '2.00').toJson();
      expect(json.containsKey('vatPounds'), false);
      expect(json.containsKey('vatSource'), false);
    });

    test('reads the tax codes and default from the options', () {
      final options = ExpenseOptions.fromJson({
        'categories': ['Travel'],
        'payers': [],
        'clients': [],
        'orders': [],
        'vatRegistered': true,
        'defaultVatRate': 20,
        'taxCodes': [
          {'code': 'standard', 'label': 'Standard rate', 'rate': 20},
          {'code': 'exempt', 'label': 'Exempt', 'rate': 0},
        ],
        'defaultTaxCode': 'exempt',
      });
      expect(options.taxCodes.map((t) => t.code), ['standard', 'exempt']);
      expect(options.initialTaxCode, 'exempt');
      expect(options.taxCode('standard')!.display, 'Standard rate (20%)');
      expect(options.taxCode('exempt')!.display, 'Exempt');
    });

    test('falls back to the expense codes and the default rate on an older server', () {
      final options = ExpenseOptions.fromJson({
        'vatRegistered': true,
        'defaultVatRate': 5,
      });
      expect(options.taxCodes, fallbackExpenseTaxCodes);
      expect(options.taxCodes.map((t) => t.code), isNot(contains('export')));
      expect(options.initialTaxCode, 'reduced');
    });

    test('reads the tax code label and VAT on an expense', () {
      final expense = Expense.fromJson({
        'id': 'e1',
        'companyId': 'co1',
        'amountPence': 1200,
        'status': 'recorded',
        'vatRate': 5,
        'taxCode': 'reduced',
        'taxCodeLabel': 'Reduced rate',
        'vatPence': 57,
      });
      expect(expense.taxCode, 'reduced');
      expect(expense.taxCodeLabel, 'Reduced rate');
      expect(expense.vatPence, 57);
    });

    test('reads the VAT a receipt shows', () {
      final extraction = ReceiptExtraction.fromJson({
        'amountPounds': '12.00',
        'vatPounds': '2.00',
        'confidence': 'high',
      });
      expect(extraction.vatPounds, '2.00');
      expect(extraction.summary, 'Filled: amount, VAT');
    });
  });
}
