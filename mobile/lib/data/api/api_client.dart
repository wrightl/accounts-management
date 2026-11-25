import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/constants/app_constants.dart';
import 'hmrc_device_details.dart';

class ApiClient {
  static Future<String?> Function()? sessionTokenProvider;

  /// Answers every request without a network, for the store screenshots
  /// (`integration_test/store_screenshots_test.dart`). Null in the app.
  static HttpClientAdapter? adapterOverride;

  late final Dio _dio;
  final FlutterSecureStorage _storage;
  late final HmrcDeviceDetails _deviceDetails = HmrcDeviceDetails(_storage);
  
  ApiClient({FlutterSecureStorage? storage}) 
      : _storage = storage ?? const FlutterSecureStorage() {
    _dio = Dio(
      BaseOptions(
        baseUrl: AppConstants.apiBaseUrl,
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );
    if (adapterOverride != null) _dio.httpClientAdapter = adapterOverride!;

    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final liveToken = await sessionTokenProvider?.call();
          final token = (liveToken != null && liveToken.isNotEmpty)
              ? liveToken
              : await _storage.read(key: AppConstants.keyAuthToken);
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          // Device details for HMRC's fraud prevention headers, used only
          // when the request ends in a call to HMRC.
          try {
            final device = await _deviceDetails.headerValue();
            if (device != null) options.headers[HmrcDeviceDetails.headerName] = device;
          } catch (_) {
            // Never block a request on these details.
          }
          return handler.next(options);
        },
        onError: (error, handler) async {
          if (error.response?.statusCode == 401) {
            await _storage.delete(key: AppConstants.keyAuthToken);
          }
          return handler.next(error);
        },
      ),
    );
  }
  
  Future<Response> get(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return await _dio.get(
      path,
      queryParameters: queryParameters,
      options: options,
    );
  }
  
  /// A file the server streams back, e.g. a receipt, as raw bytes.
  Future<Response<List<int>>> getBytes(String path) {
    return _dio.get<List<int>>(
      path,
      options: Options(responseType: ResponseType.bytes),
    );
  }

  Future<Response> post(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return await _dio.post(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }
  
  Future<Response> put(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return await _dio.put(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }
  
  Future<Response> delete(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
  }) async {
    return await _dio.delete(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
    );
  }
  
  Future<Response> uploadFile(
    String path,
    String filePath, {
    Map<String, dynamic>? data,
    ProgressCallback? onSendProgress,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
      ...?data,
    });
    
    return await _dio.post(
      path,
      data: formData,
      onSendProgress: onSendProgress,
    );
  }
}
