import 'dart:typed_data';

import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../api/api_errors.dart';
import '../models/expense.dart';
import '../models/api_response.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';

class ExpenseRepository {
  final ApiClient _apiClient;

  ExpenseRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  Future<ApiResponse<ExpensePage>> getExpenses({
    String? status,
    String? labelId,
    int? limit,
    int? offset,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null) queryParams['status'] = status;
      if (labelId != null) queryParams['label'] = labelId;
      if (limit != null) queryParams['limit'] = limit;
      if (offset != null) queryParams['offset'] = offset;

      final response = await _apiClient.get(
        AppConstants.expensesEndpoint,
        queryParameters: queryParams,
      );

      if (response.statusCode == 200) {
        final expenses = (response.data['data'] as List)
            .map((json) => Expense.fromJson(json))
            .toList();
        return ApiResponse.success(
          ExpensePage(items: expenses, hasMore: response.data['hasMore'] == true),
        );
      } else {
        return ApiResponse.error('Failed to load expenses');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// A receipt file, for the viewer. The same authorised route the web uses.
  Future<ApiResponse<ReceiptFile>> downloadReceipt(ExpenseReceipt receipt) async {
    try {
      final response = await _apiClient.getBytes(
        receipt.url ?? '/api/receipts/${receipt.id}',
      );
      final bytes = response.data;
      if (response.statusCode == 200 && bytes != null) {
        return ApiResponse.success(
          ReceiptFile(
            filename: receipt.filename,
            contentType: response.headers.value('content-type') ?? '',
            bytes: Uint8List.fromList(bytes),
          ),
        );
      }
      return ApiResponse.error('Could not load the receipt');
    } on DioException catch (e) {
      return ApiResponse.error(
        e.response?.statusCode == 404
            ? 'This receipt file is no longer available'
            : (e.message ?? 'Could not load the receipt'),
      );
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<({List<ExpenseLabel> labels, List<String> colors})>>
      getLabels() async {
    try {
      final response = await _apiClient.get(AppConstants.labelsEndpoint);
      final data = asMap(response.data['data']);
      return ApiResponse.success((
        labels: asList(data['labels'])
            .whereType<Map>()
            .map((e) => ExpenseLabel.fromJson(asMap(e)))
            .toList(),
        colors: asList(data['colors']).map(asString).toList(),
      ));
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<String>> createLabel(String name, String color) async {
    try {
      final response = await _apiClient.post(
        AppConstants.labelsEndpoint,
        data: {'name': name, 'color': color},
      );
      return ApiResponse.success(asString(asMap(response.data['data'])['id']));
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// Replace the expense's labels and/or note; null leaves that part alone.
  Future<ApiResponse<Expense>> annotateExpense(
    String id, {
    List<String>? labelIds,
    String? note,
    bool setNote = false,
  }) async {
    try {
      final response = await _apiClient.post(
        AppConstants.expenseAnnotationsEndpoint.replaceAll(':id', id),
        data: {
          'labelIds': ?labelIds,
          if (setNote) 'note': note,
        },
      );
      return ApiResponse.success(Expense.fromJson(asMap(response.data['data'])));
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<Expense>> getExpense(String id) async {
    try {
      final path = AppConstants.expenseEndpoint.replaceAll(':id', id);
      final response = await _apiClient.get(path);

      if (response.statusCode == 200) {
        final expense = Expense.fromJson(response.data['data']);
        return ApiResponse.success(expense);
      } else {
        return ApiResponse.error('Failed to load expense');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<Expense>> createExpense(
    CreateExpenseRequest request,
  ) async {
    try {
      final response = await _apiClient.post(
        AppConstants.expensesEndpoint,
        data: request.toJson(),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        final expense = Expense.fromJson(response.data['data']);
        return ApiResponse.success(expense);
      } else {
        return ApiResponse.error('Failed to create expense');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<String>> uploadReceipt(
    String expenseId,
    String filePath, {
    Function(int, int)? onProgress,
  }) async {
    try {
      final path =
          AppConstants.uploadReceiptEndpoint.replaceAll(':id', expenseId);
      final response = await _apiClient.uploadFile(
        path,
        filePath,
        onSendProgress: onProgress != null
            ? (sent, total) => onProgress(sent, total)
            : null,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return ApiResponse.success(
          response.data['receiptId'] ?? 'success',
          message: 'Receipt uploaded successfully',
        );
      } else {
        return ApiResponse.error('Failed to upload receipt');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// Read description, amount, date and category from a receipt photo.
  Future<ApiResponse<ReceiptExtraction>> extractReceipt(String filePath) async {
    try {
      final response = await _apiClient.uploadFile(
        AppConstants.expenseExtractEndpoint,
        filePath,
      );
      return ApiResponse.success(
        ReceiptExtraction.fromJson(response.data['data']),
      );
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<ExpenseOptions>> getOptions() async {
    try {
      final response =
          await _apiClient.get(AppConstants.expenseOptionsEndpoint);
      if (response.statusCode == 200) {
        return ApiResponse.success(
          ExpenseOptions.fromJson(response.data['data']),
        );
      }
      return ApiResponse.error('Failed to load expense options');
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<Expense>> approveExpense(
    String id, {
    required String approvalType,
    String? paidByUserId,
  }) async {
    try {
      final path = AppConstants.expenseApproveEndpoint.replaceAll(':id', id);
      final response = await _apiClient.post(
        path,
        data: {'approvalType': approvalType, 'paidByUserId': paidByUserId},
      );

      if (response.statusCode == 200) {
        final expense = Expense.fromJson(response.data['data']);
        return ApiResponse.success(
          expense,
          message: 'Expense approved successfully',
        );
      } else {
        return ApiResponse.error('Failed to approve expense');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// Reject discards the pending expense, as on the web.
  Future<ApiResponse<Expense>> rejectExpense(
    String id, {
    String? reason,
  }) async {
    try {
      final path = AppConstants.expenseRejectEndpoint.replaceAll(':id', id);
      final response = await _apiClient.post(
        path,
        data: {'reason': reason},
      );

      if (response.statusCode == 200) {
        final expense = Expense.fromJson(response.data['data']);
        return ApiResponse.success(
          expense,
          message: 'Expense rejected',
        );
      } else {
        return ApiResponse.error('Failed to reject expense');
      }
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
