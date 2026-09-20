import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:dio/dio.dart';
import '../../core/constants/app_constants.dart';
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
    try {
      final response = await _apiClient.post(AppConstants.authValidateEndpoint);
      
      if (response.statusCode == 200) {
        final user = User.fromJson(response.data['user']);
        await setUserData(
          userId: user.id,
          companyId: user.companyId ?? '',
          email: user.email,
        );
        return ApiResponse.success(user);
      } else {
        return ApiResponse.error(_responseError(response.data, 'Invalid token'));
      }
    } on DioException catch (e) {
      return ApiResponse.error(_dioError(e, 'Network error'));
    } catch (e) {
      return ApiResponse.error('Unexpected error: $e');
    }
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
