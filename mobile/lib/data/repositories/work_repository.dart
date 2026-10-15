import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../api/api_errors.dart';
import '../models/api_response.dart';
import '../models/work.dart';
import '../../core/constants/app_constants.dart';

/// Deadlines, weekly close and AI bookkeeper: the routine work pages.
class WorkRepository {
  WorkRepository({ApiClient? apiClient}) : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<ApiResponse<T>> _get<T>(
    String path,
    T Function(Map<String, dynamic>) parse,
  ) async {
    try {
      final response = await _apiClient.get(path);
      return ApiResponse.success(parse(response.data['data']));
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<bool>> _post(String path, Map<String, dynamic>? body) async {
    try {
      await _apiClient.post(path, data: body);
      return ApiResponse.success(true);
    } on DioException catch (e) {
      return apiErrorFrom(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<DeadlinesPage>> getDeadlines() =>
      _get(AppConstants.deadlinesEndpoint, DeadlinesPage.fromJson);

  Future<ApiResponse<bool>> setDeadlineDone(Deadline deadline, bool done) =>
      _post(AppConstants.deadlinesEndpoint, {
        'kind': deadline.kind,
        'dueDate': deadline.dueDate,
        'done': done,
      });

  Future<ApiResponse<WeeklyClose>> getWeeklyClose() =>
      _get(AppConstants.closeEndpoint, WeeklyClose.fromJson);

  Future<ApiResponse<bool>> closeWeek() => _post(AppConstants.closeEndpoint, null);

  Future<ApiResponse<BookkeeperPage>> getBookkeeper() =>
      _get(AppConstants.bookkeeperEndpoint, BookkeeperPage.fromJson);

  Future<ApiResponse<bool>> findSuggestions() =>
      _post(AppConstants.bookkeeperEndpoint, {'action': 'find'});

  Future<ApiResponse<bool>> acceptCategories(List<String> ids) =>
      _post(AppConstants.bookkeeperEndpoint, {'action': 'accept_categories', 'ids': ids});

  Future<ApiResponse<bool>> dismissCategories(List<String> ids) =>
      _post(AppConstants.bookkeeperEndpoint, {'action': 'dismiss_categories', 'ids': ids});

  Future<ApiResponse<bool>> acceptReceiptMatch(String matchId, {bool useBankAmount = false}) =>
      _post(AppConstants.bookkeeperEndpoint, {
        'action': 'accept_receipt',
        'matchId': matchId,
        'useBankAmount': useBankAmount,
      });

  Future<ApiResponse<bool>> dismissReceiptMatch(String matchId) =>
      _post(AppConstants.bookkeeperEndpoint, {'action': 'dismiss_receipt', 'matchId': matchId});
}
