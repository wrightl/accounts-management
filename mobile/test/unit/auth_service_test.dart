import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:ddapp_mobile/data/repositories/auth_service.dart';
import 'package:ddapp_mobile/data/api/api_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

@GenerateMocks([ApiClient, FlutterSecureStorage])
import 'auth_service_test.mocks.dart';

void main() {
  group('AuthService', () {
    late MockApiClient mockApiClient;
    late MockFlutterSecureStorage mockStorage;
    late AuthService authService;

    setUp(() {
      mockApiClient = MockApiClient();
      mockStorage = MockFlutterSecureStorage();
      authService = AuthService(
        apiClient: mockApiClient,
        storage: mockStorage,
      );
    });

    test('isAuthenticated returns true when token exists', () async {
      when(mockStorage.read(key: 'auth_token'))
          .thenAnswer((_) async => 'test_token');

      final result = await authService.isAuthenticated();
      expect(result, true);
    });

    test('isAuthenticated returns false when token does not exist', () async {
      when(mockStorage.read(key: 'auth_token'))
          .thenAnswer((_) async => null);

      final result = await authService.isAuthenticated();
      expect(result, false);
    });

    test('setToken stores token in secure storage', () async {
      await authService.setToken('new_token');
      
      verify(mockStorage.write(key: 'auth_token', value: 'new_token'))
          .called(1);
    });

    test('logout deletes all stored data', () async {
      await authService.logout();
      
      verify(mockStorage.deleteAll()).called(1);
    });
  });
}
