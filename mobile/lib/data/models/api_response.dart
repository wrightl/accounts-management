class ApiResponse<T> {
  final bool success;
  final T? data;
  final String? error;
  final String? message;
  final String? code;

  ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.message,
    this.code,
  });

  factory ApiResponse.success(T data, {String? message}) {
    return ApiResponse(
      success: true,
      data: data,
      message: message,
    );
  }

  factory ApiResponse.error(String error, {String? code}) {
    return ApiResponse(
      success: false,
      error: error,
      code: code,
    );
  }

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic json)? fromJsonT,
  ) {
    return ApiResponse(
      success: json['success'] ?? json['ok'] ?? false,
      data: fromJsonT != null && json['data'] != null
          ? fromJsonT(json['data'])
          : json['data'] as T?,
      error: json['error'],
      message: json['message'],
      code: json['code'] as String?,
    );
  }

  bool get isBillingBlocked =>
      code == 'trial_expired' ||
      code == 'plan_read_only' ||
      code == 'plan_limit_reached' ||
      code == 'feature_not_on_plan';
}
