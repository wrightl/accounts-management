import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:ddapp_mobile/features/expenses/expense_provider.dart';
import 'package:ddapp_mobile/data/repositories/expense_repository.dart';
import 'package:ddapp_mobile/data/models/expense.dart';
import 'package:ddapp_mobile/data/models/api_response.dart';

@GenerateMocks([ExpenseRepository])
import 'expense_provider_test.mocks.dart';

Future<ApiResponse<ExpensePage>> _getExpenses(
  MockExpenseRepository repository, {
  dynamic offset,
}) =>
    repository.getExpenses(
      status: anyNamed('status'),
      labelId: anyNamed('labelId'),
      limit: anyNamed('limit'),
      offset: offset ?? anyNamed('offset'),
    );

Expense _expense(String id) => Expense(
      id: id,
      companyId: 'company1',
      description: 'Expense $id',
      amountPence: 1000,
      category: 'Travel',
      expenseDate: DateTime(2026, 3, 1),
      status: 'recorded',
      billable: false,
      source: 'manual',
      receipts: [],
      createdAt: DateTime(2026, 3, 1),
      updatedAt: DateTime(2026, 3, 1),
    );

void main() {
  group('ExpenseProvider paging', () {
    late MockExpenseRepository repository;
    late ExpenseProvider provider;

    setUp(() {
      repository = MockExpenseRepository();
      provider = ExpenseProvider(repository: repository);
    });

    test('loads the next page after the ones already shown', () async {
      when(_getExpenses(repository, offset: 0)).thenAnswer((_) async =>
          ApiResponse.success(ExpensePage(items: [_expense('1'), _expense('2')], hasMore: true)));
      when(_getExpenses(repository, offset: 2)).thenAnswer((_) async =>
          ApiResponse.success(ExpensePage(items: [_expense('3')], hasMore: false)));

      await provider.loadExpenses();
      expect(provider.hasMore, true);
      await provider.loadMore();

      expect(provider.expenses.map((e) => e.id), ['1', '2', '3']);
      expect(provider.hasMore, false);
      await provider.loadMore();
      verifyNever(_getExpenses(repository, offset: 3));
    });

    test('filters keep applying to later pages', () async {
      when(_getExpenses(repository)).thenAnswer((_) async =>
          ApiResponse.success(ExpensePage(items: [_expense('1')], hasMore: true)));

      await provider.applyFilters(status: 'pending', labelId: 'l1');
      await provider.loadMore();

      verify(repository.getExpenses(
        status: 'pending',
        labelId: 'l1',
        limit: ExpenseProvider.pageSize,
        offset: 1,
      )).called(1);
    });
  });

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

      when(_getExpenses(mockRepository))
          .thenAnswer((_) async => ApiResponse.success(
                ExpensePage(items: mockExpenses, hasMore: false),
              ));

      await provider.loadExpenses();

      expect(provider.expenses.length, 1);
      expect(provider.expenses[0].description, 'Test expense');
      expect(provider.isLoading, false);
      expect(provider.error, null);
    });

    test('loadExpenses sets error on failure', () async {
      when(_getExpenses(mockRepository))
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
