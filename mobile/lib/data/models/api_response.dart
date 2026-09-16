class ApiResponse<T> {
  final bool success;
  final T? data;
  final String? error;
  final String? message;
  
  ApiResponse({
    required this.success,
    this.data,
    this.error,
    this.message,
  });
  
  factory ApiResponse.success(T data, {String? message}) {
    return ApiResponse(
      success: true,
      data: data,
      message: message,
    );
  }
  
  factory ApiResponse.error(String error) {
    return ApiResponse(
      success: false,
      error: error,
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
    );
  }
}
