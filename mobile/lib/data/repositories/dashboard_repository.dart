import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../models/dashboard.dart';
import '../models/api_response.dart';
import '../../core/constants/app_constants.dart';

class DashboardRepository {
  final ApiClient _apiClient;
  
  DashboardRepository({ApiClient? apiClient}) 
      : _apiClient = apiClient ?? ApiClient();
  
  Future<ApiResponse<DashboardData>> getDashboardData() async {
    try {
      final response = await _apiClient.get(AppConstants.dashboardEndpoint);
      
      if (response.statusCode == 200) {
        final data = DashboardData.fromJson(response.data['data']);
        return ApiResponse.success(data);
      } else {
        return ApiResponse.error('Failed to load dashboard data');
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        return ApiResponse.error('Unauthorized');
      }
      return ApiResponse.error(e.message ?? 'Network error');
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
