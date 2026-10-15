import 'package:ddapp_mobile/data/models/api_response.dart';
import 'package:ddapp_mobile/data/models/user.dart';
import 'package:ddapp_mobile/data/repositories/auth_service.dart';
import 'package:ddapp_mobile/features/auth/auth_provider.dart';

class _FakeAuthService extends AuthService {
  _FakeAuthService(this.json);

  final Map<String, dynamic> json;

  @override
  Future<ApiResponse<User>> validateToken() async =>
      ApiResponse.success(User.fromJson(json));
}

/// An [AuthProvider] signed in as a user with these permissions and menu.
Future<AuthProvider> signedIn({
  List<String> permissions = const ['accounts:read', 'accounts:write'],
  List<String>? menuFeatures,
  String name = 'Lee Wright',
}) async {
  final auth = AuthProvider(
    authService: _FakeAuthService({
      'id': 'u1',
      'clerkUserId': 'user_1',
      'role': 'admin',
      'name': name,
      'email': 'lee@example.com',
      'permissions': permissions,
      'menuFeatures': menuFeatures,
    }),
  );
  await auth.validateToken();
  return auth;
}
