import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../../core/constants/app_constants.dart';
import '../../core/utils/json.dart';
import '../api/api_client.dart';
import '../models/user.dart';
import '../models/api_response.dart';

class AuthService {
  final ApiClient _apiClient;
  final FlutterSecureStorage _storage;
  
  AuthService({
    ApiClient? apiClient,
    FlutterSecureStorage? storage,
  })  : _apiClient = apiClient ?? ApiClient(),
        _storage = storage ?? const FlutterSecureStorage();
  
  Future<bool> isAuthenticated() async {
    final token = await _storage.read(key: AppConstants.keyAuthToken);
    return token != null;
  }
  
  Future<String?> getToken() async {
    return await _storage.read(key: AppConstants.keyAuthToken);
  }
  
  Future<void> setToken(String token) async {
    await _storage.write(key: AppConstants.keyAuthToken, value: token);
  }
  
  Future<void> setUserData({
    required String userId,
    required String companyId,
    required String email,
  }) async {
    await Future.wait([
      _storage.write(key: AppConstants.keyUserId, value: userId),
      _storage.write(key: AppConstants.keyCompanyId, value: companyId),
      _storage.write(key: AppConstants.keyUserEmail, value: email),
    ]);
  }
  
  Future<Map<String, String?>> getUserData() async {
    final results = await Future.wait([
      _storage.read(key: AppConstants.keyUserId),
      _storage.read(key: AppConstants.keyCompanyId),
      _storage.read(key: AppConstants.keyUserEmail),
    ]);
    
    return {
      'userId': results[0],
      'companyId': results[1],
      'email': results[2],
    };
  }
  
  Future<ApiResponse<User>> validateToken() async {
    Response<dynamic>? response;
    try {
      response = await _apiClient.post(AppConstants.authValidateEndpoint);

      if (response.statusCode == 200) {
        final userJson = _stringKeyMap(
          response.data is Map ? response.data['user'] : null,
        );
        if (userJson['id'] == null) {
          debugPrint(
            'validateToken: missing user '
            'status=${response.statusCode} body=${response.data}',
          );
          return ApiResponse.error('Could not read your account.');
        }
        final user = User.fromJson(userJson);
        try {
          await setUserData(
            userId: user.id,
            companyId: user.companyId ?? '',
            email: user.email,
          );
        } catch (e, stack) {
          // The live session token comes from Clerk, not this cache.
          debugPrint(
            'validateToken: failed to cache user locally: $e\n$stack',
          );
        }
        return ApiResponse.success(user);
      }

      debugPrint(
        'validateToken failed: status=${response.statusCode} '
        'body=${response.data}',
      );
      return ApiResponse.error(_responseError(response.data, 'Invalid token'));
    } on DioException catch (e, stack) {
      debugPrint(
        'validateToken failed: $e\n$stack\n'
        'status=${e.response?.statusCode} body=${e.response?.data}',
      );
      return ApiResponse.error(_dioError(e, 'Network error'));
    } catch (e, stack) {
      debugPrint('validateToken failed: $e\n$stack');
      if (response != null) {
        debugPrint(
          'validate status=${response.statusCode} body=${response.data}',
        );
      }
      return ApiResponse.error('Unexpected error: $e');
    }
  }

  /// Nested JSON maps from Dio are not always `Map<String, dynamic>`.
  Map<String, dynamic> _stringKeyMap(dynamic value) {
    final map = asMap(value);
    return map.map((key, nested) {
      if (nested is Map) return MapEntry(key, _stringKeyMap(nested));
      if (nested is List) {
        return MapEntry(
          key,
          nested
              .map((item) => item is Map ? _stringKeyMap(item) : item)
              .toList(),
        );
      }
      return MapEntry(key, nested);
    });
  }

  String _dioError(DioException error, String fallback) {
    return _responseError(error.response?.data, error.message ?? fallback);
  }

  String _responseError(dynamic data, String fallback) {
    if (data is Map && data['error'] is String) {
      return data['error'] as String;
    }
    return fallback;
  }
  
  Future<void> logout() async {
    await _storage.deleteAll();
  }
}
