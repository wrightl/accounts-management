import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import '../../../shared/widgets/product_lockup.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 24),
              const ProductLockup(),
              const SizedBox(height: 8),
              Text(
                'Sign in with the same Clerk account you use on the web.',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              const Expanded(
                child: SingleChildScrollView(
                  child: ClerkAuthentication(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
