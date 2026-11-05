import 'package:dio/dio.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';
import '../api/api_client.dart';
import '../api/api_errors.dart';
import '../models/api_response.dart';
import '../models/books.dart';

class BooksRepository {
  BooksRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  static const pageSize = 50;

  Future<ApiResponse<bool>> _post(String path, Map<String, dynamic> body) async {
    try {
      await _apiClient.post(path, data: body);
      return ApiResponse.success(true);
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// Money received against an invoice, as Record payment on the web. The
  /// server records a repeat of the same [clientRequestId] only once.
  Future<ApiResponse<bool>> recordPayment(
    String invoiceId, {
    required int amountPence,
    required DateTime receivedAt,
    required String clientRequestId,
    String? reference,
  }) =>
      _post('${AppConstants.invoicesEndpoint}/$invoiceId/payments', {
        'amountPence': amountPence,
        'receivedAt': receivedAt.toIso8601String().split('T').first,
        'clientRequestId': clientRequestId,
        if (reference != null && reference.isNotEmpty) 'reference': reference,
      });

  Future<ApiResponse<bool>> markReimbursementPaid(String runId) =>
      _post('${AppConstants.reimbursementsEndpoint}/$runId/paid', const {});

  Future<ApiResponse<BooksPage>> getPage(String resource, {int offset = 0}) async {
    try {
      final response = await _apiClient.get(
        AppConstants.recordsEndpoint,
        queryParameters: {
          'resource': resource,
          'limit': pageSize,
          'offset': offset,
        },
      );
      if (response.statusCode == 200 && response.data is Map) {
        final body = asMap(response.data);
        final data = body['data'];
        if (data is Map) {
          return ApiResponse.success(BooksPage.fromJson(asMap(data)));
        }
      }
      return ApiResponse.error('Failed to load $resource');
    } on DioException catch (e) {
      final payload = e.response?.data;
      if (payload is Map && payload['error'] is String) {
        return ApiResponse.error(payload['error'] as String);
      }
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
