import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'core/config/app_env.dart';
import 'core/config/clerk_oauth.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'data/api/api_client.dart';
import 'features/auth/auth_provider.dart';
import 'features/auth/screens/login_screen.dart';
import 'features/books/books_provider.dart';
import 'features/dashboard/dashboard_provider.dart';
import 'features/expenses/expense_provider.dart';
import 'features/expenses/screens/expense_capture_screen.dart';
import 'shared/widgets/home_screen.dart';
import 'shared/widgets/product_lockup.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await AppEnv.load();
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    final publishableKey = AppConstants.clerkPublishableKey;
    if (publishableKey.isEmpty) {
      return MaterialApp(
        title: AppConstants.appName,
        theme: AppTheme.lightTheme,
        debugShowCheckedModeBanner: false,
        home: const MissingClerkKeyScreen(),
      );
    }

    return ClerkAuth(
      config: ClerkAuthConfig(
        publishableKey: publishableKey,
        redirectionGenerator: ClerkOAuth.redirectFor,
        deepLinkStream: ClerkOAuth.deepLinkStream(),
        // iOS Simulator has no hardware security keys; passkeys fail there.
        supportsHardwareSecurityKeys: !kDebugMode,
      ),
      child: MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => DashboardProvider()),
          ChangeNotifierProvider(create: (_) => ExpenseProvider()),
          ChangeNotifierProvider(create: (_) => BooksProvider()),
        ],
        child: MaterialApp(
          title: AppConstants.appName,
          theme: AppTheme.lightTheme,
          debugShowCheckedModeBanner: false,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en')],
          builder: (context, child) => ClerkErrorListener(
            child: child ?? const SizedBox.shrink(),
          ),
          home: const AuthGate(),
          onGenerateRoute: (settings) {
            if (ClerkOAuth.isCallbackRoute(settings.name)) {
              return MaterialPageRoute<void>(
                settings: const RouteSettings(name: '/'),
                builder: (_) => const AuthGate(),
              );
            }
            return null;
          },
          onUnknownRoute: (settings) {
            return MaterialPageRoute<void>(
              settings: const RouteSettings(name: '/'),
              builder: (_) => const AuthGate(),
            );
          },
          routes: {
            '/expenses/capture': (context) => const ExpenseCaptureScreen(),
          },
        ),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return ClerkAuthBuilder(
      signedInBuilder: (context, authState) => const SignedInShell(),
      signedOutBuilder: (context, authState) => const LoginScreen(),
    );
  }
}

class SignedInShell extends StatefulWidget {
  const SignedInShell({super.key});

  @override
  State<SignedInShell> createState() => _SignedInShellState();
}

class _SignedInShellState extends State<SignedInShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bindSession());
  }

  Future<void> _bindSession() async {
    final clerkAuth = ClerkAuth.of(context, listen: false);
    ApiClient.sessionTokenProvider = () async {
      if (!clerkAuth.isSignedIn) return null;
      final token = await clerkAuth.sessionToken();
      return token.jwt;
    };

    if (!mounted) return;
    await context.read<AuthProvider>().syncWithBackend();
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();

    if (authProvider.isLoading && authProvider.user == null) {
      return const _LoadingScaffold();
    }

    if (authProvider.user == null) {
      return _AuthErrorScaffold(
        message: authProvider.error ?? 'Could not load your account.',
        onRetry: _bindSession,
      );
    }

    return const HomeScreen();
  }
}

class _LoadingScaffold extends StatelessWidget {
  const _LoadingScaffold();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const ProductLockup(),
            const SizedBox(height: 48),
            const CircularProgressIndicator(),
          ],
        ),
      ),
    );
  }
}

class _AuthErrorScaffold extends StatelessWidget {
  const _AuthErrorScaffold({
    required this.message,
    required this.onRetry,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Icon(
                Icons.error_outline,
                size: 64,
                color: Theme.of(context).colorScheme.error,
              ),
              const SizedBox(height: 16),
              Text(
                message,
                style: Theme.of(context).textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'If you have not finished onboarding, complete it in the web app first.',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: onRetry,
                child: const Text('Retry'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () async {
                  await ClerkAuth.of(context, listen: false).signOut();
                  if (context.mounted) {
                    await context.read<AuthProvider>().logout();
                  }
                },
                child: const Text('Sign out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MissingClerkKeyScreen extends StatelessWidget {
  const MissingClerkKeyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: Text(
              'Set CLERK_PUBLISHABLE_KEY in mobile/.env.development '
              '(same value as NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).',
              style: Theme.of(context).textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
          ),
        ),
      ),
    );
  }
}
