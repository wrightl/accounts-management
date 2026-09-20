import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../models/dashboard.dart';
import '../models/api_response.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';

class DashboardRepository {
  DashboardRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<ApiResponse<DashboardData>> getDashboardData({
    String period = 'this-month',
  }) async {
    try {
      final response = await _apiClient.get(
        AppConstants.dashboardEndpoint,
        queryParameters: {'period': period},
      );

      if (response.statusCode == 200 && response.data is Map) {
        final body = asMap(response.data);
        final data = body['data'];
        if (data is Map) {
          return ApiResponse.success(DashboardData.fromJson(asMap(data)));
        }
        return ApiResponse.error('Failed to load dashboard data');
      }
      return ApiResponse.error('Failed to load dashboard data');
    } on DioException catch (e) {
      final payload = e.response?.data;
      if (payload is Map && payload['error'] is String) {
        return ApiResponse.error(payload['error'] as String);
      }
      if (e.response?.statusCode == 401) {
        return ApiResponse.error('Unauthorized');
      }
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
