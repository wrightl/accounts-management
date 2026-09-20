import 'package:dio/dio.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';
import '../api/api_client.dart';
import '../models/api_response.dart';
import '../models/books.dart';

class BooksRepository {
  BooksRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<ApiResponse<BooksPage>> getPage(String resource) async {
    try {
      final response = await _apiClient.get(
        AppConstants.recordsEndpoint,
        queryParameters: {'resource': resource},
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
