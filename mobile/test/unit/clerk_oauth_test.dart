import 'package:ddapp_mobile/core/config/clerk_oauth.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ClerkOAuth.isCallback', () {
    test('accepts the native Clerk redirect scheme', () {
      expect(
        ClerkOAuth.isCallback(
          Uri.parse('com.clerk.flutter://callback?rotating_token_nonce=abc'),
        ),
        isTrue,
      );
    });

    test('accepts Flutter route names that carry the OAuth query', () {
      expect(
        ClerkOAuth.isCallbackRoute(
          '/?created_session_id=sess_123&rotating_token_nonce=abc',
        ),
        isTrue,
      );
    });

    test('ignores unrelated routes', () {
      expect(ClerkOAuth.isCallbackRoute('/expenses/capture'), isFalse);
      expect(ClerkOAuth.isCallback(Uri.parse('https://example.com/')), isFalse);
    });
  });
}
