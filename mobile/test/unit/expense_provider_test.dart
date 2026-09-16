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

    test('approveExpense updates expense status', () async {
      final mockExpense = Expense(
        id: '1',
        companyId: 'company1',
        description: 'Test expense',
        amountPence: 1000,
        category: 'Travel',
        expenseDate: DateTime.now(),
        status: 'recorded',
        billable: false,
        source: 'manual',
        receipts: [],
        createdAt: DateTime.now(),
        updatedAt: DateTime.now(),
      );

      when(mockRepository.approveExpense('1', approvalType: 'recorded'))
          .thenAnswer((_) async => ApiResponse.success(mockExpense));

      provider.expenses.add(mockExpense.copyWith(status: 'pending'));
      final result = await provider.approveExpense('1');

      expect(result, true);
      expect(provider.error, null);
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
      notes: notes,
      billable: billable,
      source: source,
      receipts: receipts,
      createdByName: createdByName,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );
  }
}
