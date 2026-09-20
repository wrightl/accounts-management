import 'package:flutter_test/flutter_test.dart';
import 'package:ddapp_mobile/core/config/app_env.dart';
import 'package:ddapp_mobile/core/constants/app_constants.dart';

void main() {
  tearDown(AppEnv.reset);

  group('AppEnv.parse', () {
    test('reads KEY=VALUE pairs and ignores comments', () {
      const content = '''
# comment
API_BASE_URL=http://localhost:3001
EMPTY=
export CURRENCY=GBP
QUOTED="http://example.com"
''';

      expect(AppEnv.parse(content), {
        'API_BASE_URL': 'http://localhost:3001',
        'EMPTY': '',
        'CURRENCY': 'GBP',
        'QUOTED': 'http://example.com',
      });
    });
  });

  group('AppConstants.apiBaseUrl', () {
    test('falls back to local Next.js port when no env is set', () {
      expect(AppConstants.apiBaseUrl, 'http://localhost:3001');
    });

    test('uses values loaded from a dotenv file', () {
      AppEnv.debugMerge({'API_BASE_URL': 'http://10.0.2.2:3001'});
      expect(AppConstants.apiBaseUrl, 'http://10.0.2.2:3001');
    });

    test('reads Clerk publishable key from dotenv', () {
      AppEnv.debugMerge({
        'CLERK_PUBLISHABLE_KEY': 'pk_test_example',
      });
      expect(AppConstants.clerkPublishableKey, 'pk_test_example');
    });
  });
}
