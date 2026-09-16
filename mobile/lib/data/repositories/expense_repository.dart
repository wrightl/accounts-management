import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../models/expense.dart';
import '../models/api_response.dart';
import '../../core/constants/app_constants.dart';

class ExpenseRepository {
  final ApiClient _apiClient;
  
  ExpenseRepository({ApiClient? apiClient}) 
      : _apiClient = apiClient ?? ApiClient();
  
  Future<ApiResponse<List<Expense>>> getExpenses({
    String? status,
    int? limit,
    int? offset,
  }) async {
    try {
      final queryParams = <String, dynamic>{};
      if (status != null) queryParams['status'] = status;
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
        return ApiResponse.success(expenses);
      } else {
        return ApiResponse.error('Failed to load expenses');
      }
    } on DioException catch (e) {
      return ApiResponse.error(e.message ?? 'Network error');
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
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
  
  Future<ApiResponse<Expense>> createExpense(CreateExpenseRequest request) async {
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
      return ApiResponse.error(e.message ?? 'Network error');
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
      final path = AppConstants.uploadReceiptEndpoint.replaceAll(':id', expenseId);
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
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
  
  Future<ApiResponse<Expense>> approveExpense(
    String id, {
    String approvalType = 'recorded',
  }) async {
    try {
      final path = AppConstants.expenseApproveEndpoint.replaceAll(':id', id);
      final response = await _apiClient.post(
        path,
        data: {'approvalType': approvalType},
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
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
  
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
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
