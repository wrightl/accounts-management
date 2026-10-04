import 'package:dio/dio.dart';
import '../api/api_client.dart';
import '../models/api_response.dart';
import '../models/notification.dart';
import '../../core/constants/app_constants.dart';

ApiResponse<T> _dioError<T>(DioException e) {
  final data = e.response?.data;
  if (data is Map) {
    final error = data['error']?.toString();
    if (error != null && error.isNotEmpty) {
      return ApiResponse.error(error, code: data['code']?.toString());
    }
  }
  return ApiResponse.error(e.message ?? 'Network error');
}

class NotificationRepository {
  final ApiClient _apiClient;

  NotificationRepository({ApiClient? apiClient})
      : _apiClient = apiClient ?? ApiClient();

  Future<ApiResponse<({List<AppNotification> items, int unreadCount})>>
      list({String filter = 'all', int limit = 50}) async {
    try {
      final response = await _apiClient.get(
        AppConstants.notificationsEndpoint,
        queryParameters: {'filter': filter, 'limit': limit},
      );
      if (response.statusCode != 200) {
        return ApiResponse.error('Failed to load notifications');
      }
      final data = response.data['data'] as Map<String, dynamic>;
      final items = (data['notifications'] as List)
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList();
      final unread = data['unreadCount'] as int? ?? 0;
      return ApiResponse.success((items: items, unreadCount: unread));
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<int>> unreadCount() async {
    try {
      final response =
          await _apiClient.get(AppConstants.notificationsUnreadEndpoint);
      if (response.statusCode != 200) {
        return ApiResponse.error('Failed to load unread count');
      }
      final data = response.data['data'] as Map<String, dynamic>;
      return ApiResponse.success(data['unreadCount'] as int? ?? 0);
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<bool>> markRead(String id) async {
    return _action({'action': 'mark_read', 'id': id});
  }

  Future<ApiResponse<bool>> markAllRead() async {
    return _action({'action': 'mark_all_read'});
  }

  Future<ApiResponse<bool>> delete(String id) async {
    return _action({'action': 'delete', 'id': id});
  }

  Future<ApiResponse<bool>> _action(Map<String, dynamic> body) async {
    try {
      final response = await _apiClient.post(
        AppConstants.notificationsActionsEndpoint,
        data: body,
      );
      if (response.statusCode == 200) {
        return ApiResponse.success(true);
      }
      return ApiResponse.error('Action failed');
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<
      ApiResponse<
          ({
            List<NotificationEventDef> catalog,
            Map<String, NotificationChannels> effective,
            bool canManageCompany,
          })>> prefs() async {
    try {
      final response =
          await _apiClient.get(AppConstants.notificationsPrefsEndpoint);
      if (response.statusCode != 200) {
        return ApiResponse.error('Failed to load preferences');
      }
      final data = response.data['data'] as Map<String, dynamic>;
      final catalog = (data['catalog'] as List)
          .map((e) => NotificationEventDef.fromJson(e as Map<String, dynamic>))
          .toList();
      final effectiveRaw = data['effective'] as Map<String, dynamic>? ?? {};
      final effective = <String, NotificationChannels>{};
      for (final entry in effectiveRaw.entries) {
        effective[entry.key] = NotificationChannels.fromJson(
          entry.value as Map<String, dynamic>,
        );
      }
      return ApiResponse.success((
        catalog: catalog,
        effective: effective,
        canManageCompany: data['canManageCompany'] as bool? ?? false,
      ));
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<bool>> savePrefs({
    required String scope,
    required Map<String, NotificationChannels> matrix,
  }) async {
    try {
      final body = <String, dynamic>{
        'scope': scope,
        'matrix': {
          for (final e in matrix.entries) e.key: e.value.toJson(),
        },
      };
      final response = await _apiClient.put(
        AppConstants.notificationsPrefsEndpoint,
        data: body,
      );
      if (response.statusCode == 200) {
        return ApiResponse.success(true);
      }
      return ApiResponse.error('Failed to save preferences');
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  Future<ApiResponse<bool>> registerPushToken(
    String token, {
    String platform = 'fcm',
  }) async {
    try {
      final response = await _apiClient.post(
        AppConstants.notificationsPushTokenEndpoint,
        data: {'token': token, 'platform': platform},
      );
      if (response.statusCode == 200) {
        return ApiResponse.success(true);
      }
      return ApiResponse.error('Failed to register push token');
    } on DioException catch (e) {
      return _dioError(e);
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
  }
}
