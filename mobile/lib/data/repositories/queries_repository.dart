import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../api/api_errors.dart';
import '../models/api_response.dart';
import '../models/query.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';

class QueriesRepository {
  QueriesRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<ApiResponse<List<AccountantQuery>>> list() async {
    try {
      final response = await _apiClient.get(AppConstants.queriesEndpoint);
      return ApiResponse.success(
        asList(response.data['data'])
            .whereType<Map>()
            .map((e) => AccountantQuery.fromJson(asMap(e)))
            .toList(),
      );
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<QueryThread>> thread(String id) async {
    try {
      final response = await _apiClient.get('${AppConstants.queriesEndpoint}/$id');
      return ApiResponse.success(QueryThread.fromJson(asMap(response.data['data'])));
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<bool>> reply(String id, String body) async {
    try {
      await _apiClient.post('${AppConstants.queriesEndpoint}/$id/reply', data: {'body': body});
      return ApiResponse.success(true);
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
