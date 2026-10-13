import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:ddapp_mobile/features/expenses/expense_provider.dart';
import 'package:ddapp_mobile/data/repositories/expense_repository.dart';
import 'package:ddapp_mobile/data/models/expense.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';

@GenerateMocks([ExpenseRepository])
import 'expense_provider_test.mocks.dart';

void main() {
  group('ExpenseProvider', () {
    late MockExpenseRepository mockRepository;
    late ExpenseProvider provider;

    setUp(() {
      mockRepository = MockExpenseRepository();
      provider = ExpenseProvider(repository: mockRepository);
    });

    test('loadExpenses updates expenses list on success', () async {
      final mockExpenses = [
        Expense(
          id: '1',
          companyId: 'company1',
          description: 'Test expense',
          amountPence: 1000,
          category: 'Travel',
          expenseDate: DateTime.now(),
          status: 'pending',
          billable: false,
          source: 'manual',
          receipts: [],
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        ),
      ];

      when(mockRepository.getExpenses())
          .thenAnswer((_) async => ApiResponse.success(mockExpenses));

      await provider.loadExpenses();

      expect(provider.expenses.length, 1);
      expect(provider.expenses[0].description, 'Test expense');
      expect(provider.isLoading, false);
      expect(provider.error, null);
    });

    test('loadExpenses sets error on failure', () async {
      when(mockRepository.getExpenses())
          .thenAnswer((_) async => ApiResponse.error('Network error'));

      await provider.loadExpenses();

      expect(provider.expenses.length, 0);
      expect(provider.error, 'Network error');
      expect(provider.isLoading, false);
    });

    test('approveExpense sends the chosen status and payer', () async {
      final mockExpense = Expense(
        id: '1',
        companyId: 'company1',
        description: 'Test expense',
        amountPence: 1000,
        category: 'Travel',
        expenseDate: DateTime.now(),
        status: 'reimbursable',
        billable: false,
        paidByUserId: 'u1',
        source: 'manual',
        receipts: [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      when(mockRepository.approveExpense(
        '1',
        approvalType: 'reimbursable',
        paidByUserId: 'u1',
      )).thenAnswer((_) async => ApiResponse.success(mockExpense));

      provider.expenses.add(mockExpense.copyWith(status: 'pending'));
      final result = await provider.approveExpense(
        '1',
        approvalType: 'reimbursable',
        paidByUserId: 'u1',
      );

      expect(result, true);
      expect(provider.error, null);
      expect(provider.expenses.single.status, 'reimbursable');
    });

    test('rejectExpense drops the discarded expense from the list', () async {
      final pending = Expense(
        id: '1',
        companyId: 'company1',
        description: 'Duplicate',
        amountPence: 1000,
        category: 'Travel',
        expenseDate: DateTime.now(),
        status: 'pending',
        billable: false,
        source: 'email',
        receipts: [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );
      when(mockRepository.rejectExpense('1', reason: null))
          .thenAnswer((_) async => ApiResponse.success(pending));

      provider.expenses.add(pending);
      final result = await provider.rejectExpense('1');

      expect(result, true);
      expect(provider.expenses, isEmpty);
    });
  });
}

extension on Expense {
  Expense copyWith({String? status}) {
    return Expense(
      id: id,
      companyId: companyId,
      description: description,
      amountPence: amountPence,
      category: category,
      expenseDate: expenseDate,
      status: status ?? this.status,
      billable: billable,
      paidByUserId: paidByUserId,
      source: source,
      receipts: receipts,
      createdByName: createdByName,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
