import 'package:dio/dio.dart';
import '../models/api_response.dart';

/// [ApiResponse.code] when the request never reached the server.
const offlineErrorCode = 'offline';

/// The server's error message for a failed request. Field errors say what to
/// fix, so they win over the generic summary.
ApiResponse<T> apiErrorFrom<T>(DioException e) {
  // No response at all: no signal, or the server can't be reached.
  if (e.response == null && e.type != DioExceptionType.cancel) {
    return ApiResponse.error(
      "You're offline, or Alfa can't be reached.",
      code: offlineErrorCode,
    );
  }
  final data = e.response?.data;
  if (data is Map) {
    final code = data['code']?.toString();
    final fieldErrors = data['fieldErrors'];
    if (fieldErrors is Map && fieldErrors.isNotEmpty) {
      return ApiResponse.error(
        fieldErrors.values.map((v) => v.toString()).join('\n'),
        code: code,
      );
    }
    final error = data['error']?.toString();
    if (error != null && error.isNotEmpty) {
      return ApiResponse.error(error, code: code);
    }
  }
  return ApiResponse.error(e.message ?? 'Network error');
}
