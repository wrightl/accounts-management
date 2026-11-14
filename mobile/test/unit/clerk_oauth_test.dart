import 'package:clerk_auth/clerk_auth.dart';
import 'package:alfa/core/config/clerk_oauth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

@GenerateMocks([Auth, SignIn])
import 'clerk_oauth_test.mocks.dart';

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

  group('ClerkOAuth.onlyOnce', () {
    // A cold start hands the launch link over twice; its nonce is single use.
    test('passes each link once and drops nulls', () async {
      final a = Uri.parse(
        'com.clerk.flutter://callback?rotating_token_nonce=a',
      );
      final b = Uri.parse(
        'com.clerk.flutter://callback?rotating_token_nonce=b',
      );

      final links = await ClerkOAuth.onlyOnce(
        Stream.fromIterable([null, a, a, b, a]),
      ).toList();

      expect(links, [a, b]);
    });
  });

  group('ClerkOAuth.complete', () {
    final callback = Uri.parse(
      'com.clerk.flutter://callback?created_session_id=sess_1&rotating_token_nonce=abc',
    );
    late MockAuth auth;

    setUp(() {
      auth = MockAuth();
      when(auth.isSignedIn).thenReturn(false);
      when(auth.signIn).thenReturn(MockSignIn());
      when(auth.signUp).thenReturn(null);
      when(auth.completeOAuthSignIn(token: anyNamed('token')))
          .thenAnswer((_) async {});
      when(auth.refreshClient()).thenAnswer((_) async {});
      when(auth.transfer()).thenAnswer((_) async {});
    });

    // The sign-in's verification may already read verified by now; the nonce
    // must be swapped regardless, so the test never stubs the verification.
    test('swaps the nonce for a session while signed out', () async {
      await ClerkOAuth.complete(auth, callback);

      verify(auth.completeOAuthSignIn(token: 'abc')).called(1);
      verify(auth.transfer()).called(1);
      verifyNever(auth.refreshClient());
    });

    test('refreshes the client when there is no sign-in to finish', () async {
      when(auth.signIn).thenReturn(null);

      await ClerkOAuth.complete(auth, callback);

      verifyNever(auth.completeOAuthSignIn(token: anyNamed('token')));
      verify(auth.refreshClient()).called(1);
    });

    test('does nothing once signed in', () async {
      when(auth.isSignedIn).thenReturn(true);

      await ClerkOAuth.complete(auth, callback);

      verifyNever(auth.completeOAuthSignIn(token: anyNamed('token')));
      verifyNever(auth.refreshClient());
    });

    test('reports a failed swap instead of throwing', () async {
      final error = ClerkError.clientAppError(message: 'expired');
      when(auth.completeOAuthSignIn(token: anyNamed('token'))).thenThrow(error);

      await ClerkOAuth.complete(auth, callback);

      verify(auth.handleError(error)).called(1);
    });
  });
}
